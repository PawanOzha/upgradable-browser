import { AgentTool, ToolSchema } from './types';

const registry = new Map<string, AgentTool>();

export function registerTool(tool: AgentTool) {
  registry.set(tool.name, tool);
}

export function getTool(name: string): AgentTool | undefined {
  return registry.get(name);
}

export function listTools(): AgentTool[] {
  return Array.from(registry.values());
}

export function listToolSchemas(): ToolSchema[] {
  return listTools().map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}


