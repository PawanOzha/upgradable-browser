export interface ToolResult {
  success: boolean;
  output?: any;
  error?: string;
}

export interface PageContext {
  title?: string;
  content?: string;
  url?: string;
}

export interface ToolContext {
  log: (line: string) => void;
  webview: import('../types').WebViewRef;
  page: PageContext;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema for args
  execute: (ctx: ToolContext, args: any) => Promise<ToolResult>;
}

export interface AgentRunOptions {
  provider: import('../services/aiProvider').AIProvider;
  prompt: string;
  webview: import('../types').WebViewRef;
  page: PageContext;
  maxSteps?: number;
  onLog?: (line: string) => void;
}

export interface AgentRunResult {
  finalText: string;
  steps: Array<{ tool?: string; args?: any; result?: ToolResult; thought?: string }>;
}

export type ToolSchema = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
};


