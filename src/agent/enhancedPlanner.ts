import { AIProvider } from '../services/aiProvider';
import { PageContext } from './types';
import { chat as aiChat } from '../services/aiProvider';
import { listTools } from './toolRegistry';

export interface EnhancedActionStep {
  step: number;
  tool: string;
  args: Record<string, any>;
  description: string;
  rationale: string;
  expectedResult: string;
  successCriteria?: string;
  confidence: number; // 0-1 confidence score
  alternatives?: Array<{ tool: string; args: Record<string, any> }>;
}

export interface EnhancedPlan {
  goal: string;
  strategy: string;
  steps: EnhancedActionStep[];
  totalSteps: number;
  estimatedDifficulty: 'easy' | 'medium' | 'hard';
  riskFactors: string[];
  contingencyPlans: Array<{ condition: string; alternativeSteps: EnhancedActionStep[] }>;
}

/**
 * Enhanced Planning Engine with Perfect Tool Selection
 * Uses GPT-4o Mini for intelligent planning and tool choice
 */
export class EnhancedPlanner {
  constructor(private provider: AIProvider) {}

  /**
   * Generate a perfect execution plan with optimal tool selection
   */
  async generatePerfectPlan(
    goal: string,
    pageContext: PageContext
  ): Promise<EnhancedPlan> {
    const tools = listTools();
    const toolDescriptions = this.buildDetailedToolDescriptions(tools);

    const prompt = `You are an expert web automation strategist powered by GPT-4o Mini. Your task is to create a PERFECT execution plan by choosing the OPTIMAL tools for each step.

🎯 GOAL: ${goal}

📄 CURRENT PAGE:
- URL: ${pageContext.url || 'blank page'}
- Title: ${pageContext.title || 'Unknown'}

🛠️ AVAILABLE TOOLS (${tools.length} tools):
${toolDescriptions}

📋 PLANNING PRINCIPLES:

1. **Choose the RIGHT tool for each step**:
   - For navigation → use 'navigate' or 'smart_search'
   - For finding elements → use 'find_text' or 'detect_interactive'
   - For clicking → use 'click_text' or 'smart_click'
   - For typing → use 'type_text' or 'smart_fill'
   - For analysis → use 'extract_links' or 'extract_search_results'

2. **Keep it SIMPLE and DIRECT**:
   - Minimum steps necessary
   - No unnecessary analysis steps
   - Use smart tools when available

3. **Be SPECIFIC with arguments**:
   - Full URLs (https://...)
   - Exact text to find/click
   - Clear input values

4. **Consider the CONTEXT**:
   - Current page state
   - What's already loaded
   - User's intent

🎯 GOAL PATTERN RECOGNITION:

"search for X" → smart_search tool
"open X" or "go to X" → navigate tool with URL
"click X" → click_text or smart_click
"find X" → find_text
"fill X" → type_text or smart_fill
"extract X" → extract_links or extract_search_results

📊 EXAMPLES:

Goal: "search for python tutorials"
Perfect Plan:
{
  "strategy": "Use smart search to navigate to search engine and search",
  "steps": [
    {
      "step": 1,
      "tool": "smart_search",
      "args": {"query": "python tutorials", "searchEngine": "duckduckgo"},
      "description": "Search for python tutorials on DuckDuckGo",
      "rationale": "smart_search automatically navigates to search engine and searches",
      "expectedResult": "Search results page with python tutorial links",
      "confidence": 0.95
    }
  ],
  "estimatedDifficulty": "easy",
  "riskFactors": []
}

Goal: "open youtube and search for gojo"
Perfect Plan:
{
  "strategy": "Navigate to YouTube then use its search",
  "steps": [
    {
      "step": 1,
      "tool": "navigate",
      "args": {"url": "https://youtube.com"},
      "description": "Navigate to YouTube homepage",
      "rationale": "Direct navigation is fastest for known sites",
      "expectedResult": "YouTube homepage loaded",
      "confidence": 0.95
    },
    {
      "step": 2,
      "tool": "smart_click",
      "args": {"target": "search box", "strategy": "semantic"},
      "description": "Click on YouTube search box",
      "rationale": "smart_click can find search box by purpose",
      "expectedResult": "Search box focused",
      "confidence": 0.90
    },
    {
      "step": 3,
      "tool": "type_text",
      "args": {"text": "gojo", "selector": "input[name='search_query']"},
      "description": "Type 'gojo' in search box",
      "rationale": "type_text enters the search term",
      "expectedResult": "Search term entered",
      "confidence": 0.95
    },
    {
      "step": 4,
      "tool": "press_enter",
      "args": {},
      "description": "Submit search",
      "rationale": "press_enter triggers the search",
      "expectedResult": "Search results displayed",
      "confidence": 0.95
    }
  ],
  "estimatedDifficulty": "medium",
  "riskFactors": ["YouTube layout changes", "Search box detection"]
}

🎯 NOW CREATE THE PERFECT PLAN:

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "strategy": "brief strategy description",
  "steps": [
    {
      "step": 1,
      "tool": "tool_name",
      "args": {"arg1": "value1"},
      "description": "what this step does",
      "rationale": "why this tool is optimal",
      "expectedResult": "what will happen",
      "confidence": 0.85
    }
  ],
  "estimatedDifficulty": "easy|medium|hard",
  "riskFactors": ["risk 1", "risk 2"]
}`;

    try {
      const response = await aiChat(
        this.provider,
        '',
        [
          {
            role: 'system',
            content: 'You are an expert web automation strategist. Respond ONLY with valid JSON.'
          },
          { role: 'user', content: prompt }
        ],
        pageContext
      );

      return this.parsePlanResponse(response, goal);
    } catch (error) {
      console.error('Enhanced planning error:', error);
      return this.generateSmartFallback(goal, pageContext);
    }
  }

  /**
   * Build detailed tool descriptions for the AI
   */
  private buildDetailedToolDescriptions(tools: any[]): string {
    const descriptions = tools.map(tool => {
      const params = tool.parameters?.properties || {};
      const paramList = Object.entries(params)
        .map(([key, val]: [string, any]) => `${key}: ${val.description || val.type}`)
        .join(', ');

      return `
📌 ${tool.name}
   Description: ${tool.description}
   Parameters: ${paramList || 'none'}
   Best for: ${this.getBestUseCase(tool.name)}`;
    }).join('\n');

    return descriptions;
  }

  /**
   * Get best use case for each tool
   */
  private getBestUseCase(toolName: string): string {
    const useCases: Record<string, string> = {
      'navigate': 'Opening URLs, going to specific websites',
      'smart_search': 'Searching the web (automatically handles search engine)',
      'find_text': 'Locating text on current page',
      'click_text': 'Clicking links/buttons with known text',
      'smart_click': 'Intelligently clicking elements by purpose/role',
      'type_text': 'Entering text in input fields',
      'press_enter': 'Submitting forms or searches',
      'scroll': 'Moving page view up/down',
      'wait_ms': 'Waiting for page loads',
      'extract_links': 'Getting all links from page',
      'smart_fill': 'Auto-filling forms intelligently',
      'detect_interactive': 'Finding all clickable elements',
      'extract_search_results': 'Getting search result data',
      'click_search_result': 'Clicking specific search results'
    };

    return useCases[toolName] || 'General purpose tool';
  }

  /**
   * Parse AI response into plan
   */
  private parsePlanResponse(response: string, goal: string): EnhancedPlan {
    try {
      // Remove markdown code blocks if present
      let cleaned = response.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/,'');
      }

      // Find JSON object
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) {
        throw new Error('No JSON found in response');
      }

      const jsonStr = cleaned.slice(start, end + 1);
      const parsed = JSON.parse(jsonStr);

      return {
        goal,
        strategy: parsed.strategy || 'Execute steps sequentially',
        steps: parsed.steps || [],
        totalSteps: parsed.steps?.length || 0,
        estimatedDifficulty: parsed.estimatedDifficulty || 'medium',
        riskFactors: parsed.riskFactors || [],
        contingencyPlans: parsed.contingencyPlans || []
      };
    } catch (error) {
      console.error('Plan parsing error:', error);
      return this.generateSmartFallback(goal, { url: '', title: '' });
    }
  }

  /**
   * Generate smart fallback plan based on goal patterns
   */
  private generateSmartFallback(goal: string, pageContext: PageContext): EnhancedPlan {
    const goalLower = goal.toLowerCase();

    // Pattern: "search for X"
    if (goalLower.includes('search for') || goalLower.startsWith('search ')) {
      const query = goal.replace(/^search\s+(for\s+)?/i, '').trim();
      return {
        goal,
        strategy: 'Use smart search to find information',
        steps: [
          {
            step: 1,
            tool: 'smart_search',
            args: { query, searchEngine: 'duckduckgo' },
            description: `Search for "${query}"`,
            rationale: 'smart_search handles navigation and searching',
            expectedResult: 'Search results displayed',
            confidence: 0.90
          }
        ],
        totalSteps: 1,
        estimatedDifficulty: 'easy',
        riskFactors: [],
        contingencyPlans: []
      };
    }

    // Pattern: "open X" or "go to X"
    const navKeywords = ['open', 'go to', 'navigate to', 'visit'];
    const hasNav = navKeywords.some(kw => goalLower.includes(kw));

    if (hasNav) {
      const siteMap: Record<string, string> = {
        'youtube': 'https://youtube.com',
        'google': 'https://google.com',
        'github': 'https://github.com',
        'twitter': 'https://twitter.com',
        'facebook': 'https://facebook.com',
        'reddit': 'https://reddit.com',
        'amazon': 'https://amazon.com'
      };

      for (const [site, url] of Object.entries(siteMap)) {
        if (goalLower.includes(site)) {
          return {
            goal,
            strategy: `Navigate directly to ${site}`,
            steps: [
              {
                step: 1,
                tool: 'navigate',
                args: { url },
                description: `Open ${site}`,
                rationale: 'Direct navigation to known URL',
                expectedResult: `${site} homepage loaded`,
                confidence: 0.95
              }
            ],
            totalSteps: 1,
            estimatedDifficulty: 'easy',
            riskFactors: [],
            contingencyPlans: []
          };
        }
      }
    }

    // Default: basic sequential plan
    return {
      goal,
      strategy: 'Analyze page then proceed',
      steps: [
        {
          step: 1,
          tool: 'detect_interactive',
          args: {},
          description: 'Scan page for interactive elements',
          rationale: 'Understand what actions are available',
          expectedResult: 'List of interactive elements',
          confidence: 0.70
        }
      ],
      totalSteps: 1,
      estimatedDifficulty: 'medium',
      riskFactors: ['Unclear goal', 'May need additional steps'],
      contingencyPlans: []
    };
  }
}
