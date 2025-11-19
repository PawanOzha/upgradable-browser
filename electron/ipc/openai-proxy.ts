/**
 * Secure OpenAI API Proxy (Main Process Only)
 *
 * SECURITY: API keys are NEVER exposed to renderer process
 * All API calls go through IPC to main process
 */

import { ipcMain } from 'electron';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL_NAME = 'gpt-4o-mini';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
}

/**
 * Get OpenAI API key from environment (MAIN PROCESS ONLY)
 */
function getOpenAIKey(): string {
  const key = process.env.VITE_OPENAI_API_KEY;

  if (!key || key === 'your_openai_api_key_here') {
    throw new Error('OpenAI API key not configured');
  }

  return key;
}

/**
 * Make secure API call to OpenAI (MAIN PROCESS ONLY)
 */
async function makeOpenAIRequest(request: OpenAIRequest): Promise<any> {
  const apiKey = getOpenAIKey();

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: request.messages,
      stream: false, // Non-streaming for IPC simplicity
      temperature: request.temperature || 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { message: response.statusText }
    }));
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  return await response.json();
}

/**
 * Make streaming OpenAI request (MAIN PROCESS ONLY)
 */
async function makeOpenAIStreamRequest(
  request: OpenAIRequest,
  onChunk: (chunk: string) => void
): Promise<string> {
  const apiKey = getOpenAIKey();

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: request.messages,
      stream: true,
      temperature: request.temperature || 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { message: response.statusText }
    }));
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim());

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            onChunk(content);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }

  return fullResponse;
}

/**
 * Initialize secure OpenAI IPC handlers
 */
export function initOpenAIProxy() {
  // Check if API key is available
  ipcMain.handle('openai:check-key', async () => {
    try {
      const key = getOpenAIKey();
      return { available: true };
    } catch {
      return { available: false };
    }
  });

  // Non-streaming chat completion
  ipcMain.handle('openai:chat', async (event, request: OpenAIRequest) => {
    try {
      const response = await makeOpenAIRequest(request);
      return {
        success: true,
        content: response.choices?.[0]?.message?.content || '',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'OpenAI API call failed',
      };
    }
  });

  // Streaming chat completion
  ipcMain.handle('openai:chat-stream', async (event, request: OpenAIRequest, channelId: string) => {
    try {
      const fullResponse = await makeOpenAIStreamRequest(request, (chunk) => {
        // Send chunks back to renderer via channel
        event.sender.send(`openai:stream:${channelId}`, { chunk });
      });

      // Send completion signal
      event.sender.send(`openai:stream:${channelId}`, { done: true, fullResponse });

      return {
        success: true,
        fullResponse,
      };
    } catch (error: any) {
      event.sender.send(`openai:stream:${channelId}`, {
        error: error.message || 'Stream failed'
      });

      return {
        success: false,
        error: error.message || 'OpenAI streaming failed',
      };
    }
  });

  console.log('[OpenAI Proxy] Secure IPC handlers initialized');
}
