import { chat as aiChat, AIProvider } from '../services/aiProvider';
import { AgentRunOptions, AgentRunResult, ToolContext } from './types';
import { listToolSchemas, getTool } from './toolRegistry';

function buildSystemPrompt(toolsJson: any): string {
  // Import GOJO prompt from config
  const { GOJO_AGENT_SYSTEM_PROMPT } = require('../config/aiPrompts');

  // Build tool list from actual registered tools
  const toolSchemas = listToolSchemas();
  const toolsList = toolSchemas.map(t => {
    return `- ${t.function.name}: ${t.function.description}`;
  }).join('\n');

  return [
    'You are GOJO, a focused web automation agent inside a browser.',
    '',
    'CRITICAL: You MUST respond with ONLY a valid JSON object. No other text before or after.',
    '',
    'When you need to act, respond with:',
    '{"action":"tool","tool":"<name>","args":{...},"thought":"<reason>"}',
    '',
    'When done, respond with:',
    '{"action":"final","text":"<result>"}',
    '',
    'RULES:',
    '1. Output ONLY JSON, nothing else',
    '2. Use double quotes for all strings',
    '3. One tool per response',
    '4. Keep thoughts under 10 words',
    '',
    '🔍 SPACEMAIL WORKFLOW (CRITICAL - Follow this EXACT sequence):',
    '',
    'When user says "change password for [email]":',
    '1. FIRST: {"action":"tool","tool":"open_spacemail_sidebar_ui","args":{},"thought":"open sidebar"}',
    '2. THEN: {"action":"tool","tool":"click_extract_button","args":{},"thought":"extract emails"}',
    '3. THEN: {"action":"tool","tool":"search_email_in_sidebar","args":{"email":"user@domain.com"},"thought":"find email"}',
    '4. FINALLY: {"action":"tool","tool":"click_mailbox_key","args":{"email":"user@domain.com"},"thought":"change password"}',
    '',
    'AVAILABLE TOOLS:',
    toolsList,
    '',
    'SPACEMAIL SIDEBAR TOOLS (USE THESE - THEY CLICK THE UI BUTTONS):',
    '- open_spacemail_sidebar_ui: Clicks Shield button to open sidebar (USE THIS FIRST!)',
    '- click_extract_button: Clicks Extract Domains button in sidebar',
    '- search_email_in_sidebar: Finds and highlights email in sidebar',
    '- click_mailbox_key: Clicks green key to change password (USE THIS LAST!)',
    '',
    'Remember: ONLY output valid JSON, nothing else!'
  ].join('\n');
}

function tryParseAction(content: string): { action: 'tool' | 'final'; tool?: string; args?: any; text?: string; thought?: string } | null {
  if (!content) return null;

  try {
    // Remove markdown code blocks if present
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/,'');
    }

    // Find JSON object - try to find properly balanced braces
    const start = cleaned.indexOf('{');
    if (start === -1) {
      console.log('No JSON found in response:', content);
      return null;
    }

    // Try to find the matching closing brace by counting
    let braceCount = 0;
    let end = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            end = i;
            break;
          }
        }
      }
    }

    if (end === -1) {
      console.log('Could not find matching closing brace');
      return null;
    }

    const jsonStr = cleaned.slice(start, end + 1);

    // Try to parse
    let json;
    try {
      json = JSON.parse(jsonStr);
    } catch (parseErr) {
      // If parse fails, try to fix common issues
      console.log('Initial parse failed, attempting fixes...');

      // Fix: Remove trailing text after last }
      let fixed = jsonStr.trim();

      // Fix: Handle extra quotes in args
      fixed = fixed.replace(/}"\s*,\s*"thought"/g, '},"thought"');

      try {
        json = JSON.parse(fixed);
      } catch (e2) {
        console.log('Parse error even after fixes:', e2, '\nJSON:', jsonStr);
        return null;
      }
    }

    // Validate structure
    if (!json || !json.action) {
      console.log('Missing action field:', json);
      return null;
    }

    if (json.action === 'tool') {
      if (!json.tool) {
        console.log('Missing tool field:', json);
        return null;
      }
      return json;
    }

    if (json.action === 'final') {
      return json;
    }

    console.log('Invalid action type:', json.action);
    return null;
  } catch (e) {
    console.log('Parse error:', e, '\nContent:', content);
    return null;
  }
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { provider, prompt, webview, page, maxSteps = 8, onLog } = options;
  const log = (line: string) => onLog?.(line);

  // Ensure web tools are registered by importing the module
  await import('./tools/webTools');
  await import('./tools/searchAgentTools');
  await import('./tools/spaceMailTools');
  await import('./tools/sidebarTools');  // SIMPLE UI button clicker tools!

  const tools = listToolSchemas();
  const system = buildSystemPrompt(tools);

  log(`🤖 AI Provider: ${provider}`);

  let transcript: string[] = [];
  const steps: AgentRunResult['steps'] = [];

  const ctx: ToolContext = { webview, page, log: (s) => log?.(s) };

  for (let step = 0; step < maxSteps; step++) {
    const messages = [
      { role: 'system' as const, content: system },
      ...transcript.map((c) => ({ role: 'assistant' as const, content: c })),
      { role: 'user' as const, content: `Goal: ${prompt}\n\nCurrent page: ${page.title || ''}\nURL: ${page.url || ''}\nWhat is your next action?` },
    ];

    let content = '';
    try {
      content = await aiChat(provider as AIProvider, '', messages as any, page);
    } catch (e: any) {
      log?.(`Model error: ${e?.message || e}`);
      break;
    }

    const action = tryParseAction(content || '');
    if (!action) {
      log?.('❌ Could not parse agent action.');
      log?.(`Response was: ${(content || '').substring(0, 200)}`);
      log?.('Tip: Make sure your AI provider is running and configured correctly.');
      break;
    }

    if (action.action === 'final') {
      return { finalText: String(action.text || '').trim(), steps };
    }

    // Tool execution
    const tool = action.tool && getTool(action.tool);
    if (!tool) {
      log?.(`Unknown tool: ${action.tool}`);
      break;
    }
    log?.(`→ ${tool.name} ${action.thought ? `— ${action.thought}` : ''}`);
    const result = await tool.execute(ctx, action.args || {});
    steps.push({ tool: tool.name, args: action.args, result, thought: action.thought });

    transcript.push(`TOOL(${tool.name}): ${JSON.stringify({ args: action.args, result })}`);

    if (!result.success) {
      log?.(`Tool failed: ${result.error}`);
      // continue loop; model can recover next step
    }
  }

  return { finalText: 'Stopped: step limit reached or error.', steps };
}


