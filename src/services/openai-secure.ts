/**
 * Secure OpenAI API Service (Renderer Process)
 *
 * SECURITY: Uses IPC proxy - API key NEVER exposed to renderer
 * All requests go through Electron main process
 */

// Electron IPC interface
interface ElectronAPI {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, listener: any) => void;
  off: (channel: string, listener: any) => void;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Check if OpenAI IPC is available
 * Note: Falls back to fetch for non-Electron environments or webviews
 */
function isElectronAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.electron;
}

/**
 * Fallback to direct API call (for webviews or non-Electron contexts)
 * SECURITY: Only use this as absolute last resort, prefer Ollama instead
 */
async function fallbackToDirectAPI(
  messages: OpenAIMessage[],
  onStream?: (chunk: string) => void
): Promise<string> {
  // Import the old direct API as absolute fallback
  const { sendMessage: directSendMessage } = await import('./openai');
  return directSendMessage(messages, onStream);
}

/**
 * Check if OpenAI API key is configured (via IPC)
 */
export async function hasOpenAIKey(): Promise<boolean> {
  if (!isElectronAvailable()) {
    console.warn('[OpenAI Secure] Electron IPC not available');
    return false;
  }

  try {
    const result = await window.electron!.invoke('openai:check-key');
    return result.available;
  } catch (error) {
    console.error('[OpenAI Secure] Failed to check API key:', error);
    return false;
  }
}

/**
 * Send a message to OpenAI via secure IPC proxy
 * Falls back to direct API if IPC unavailable (webview context)
 */
export async function sendMessage(
  messages: OpenAIMessage[],
  onStream?: (chunk: string) => void
): Promise<string> {
  // If IPC not available (e.g., in webview), use direct API fallback
  if (!isElectronAvailable()) {
    console.warn('[OpenAI Secure] IPC not available, using direct API fallback');
    return fallbackToDirectAPI(messages, onStream);
  }

  try {
    if (onStream) {
      // Streaming mode
      const channelId = Math.random().toString(36).substring(7);

      return new Promise((resolve, reject) => {
        let fullResponse = '';

        // Listen for stream chunks
        const handleStream = (_event: any, data: any) => {
          if (data.error) {
            window.electron!.off(`openai:stream:${channelId}`, handleStream);
            reject(new Error(data.error));
            return;
          }

          if (data.chunk) {
            fullResponse += data.chunk;
            onStream(data.chunk);
          }

          if (data.done) {
            window.electron!.off(`openai:stream:${channelId}`, handleStream);
            resolve(data.fullResponse || fullResponse);
          }
        };

        window.electron!.on(`openai:stream:${channelId}`, handleStream);

        // Start streaming request
        window.electron!.invoke('openai:chat-stream', { messages }, channelId)
          .catch((error: Error) => {
            window.electron!.off(`openai:stream:${channelId}`, handleStream);
            reject(error);
          });
      });
    } else {
      // Non-streaming mode
      const result = await window.electron!.invoke('openai:chat', { messages });

      if (!result.success) {
        throw new Error(result.error || 'OpenAI request failed');
      }

      return result.content;
    }
  } catch (error: any) {
    console.error('[OpenAI Secure] Request failed:', error);
    throw new Error(error.message || 'OpenAI API call failed');
  }
}

/**
 * Summarize page content (secure)
 */
export async function summarizePage(
  pageContent: string,
  pageTitle: string,
  onStream?: (chunk: string) => void
): Promise<string> {
  const messages: OpenAIMessage[] = [
    {
      role: 'system',
      content: 'You are a helpful AI assistant integrated into a web browser. Your role is to help users understand web pages quickly and efficiently. Provide concise, accurate summaries.',
    },
    {
      role: 'user',
      content: `Please summarize this web page:\n\nTitle: ${pageTitle}\n\nContent:\n${pageContent.slice(0, 6000)}\n\nProvide a brief, helpful summary in 2-3 sentences.`,
    },
  ];

  return sendMessage(messages, onStream);
}

/**
 * General chat with context (secure)
 */
export async function chat(
  userMessage: string,
  conversationHistory: OpenAIMessage[],
  pageContext?: { title: string; content: string },
  onStream?: (chunk: string) => void
): Promise<string> {
  const messages: OpenAIMessage[] = [
    {
      role: 'system',
      content: pageContext
        ? `You are a helpful AI assistant integrated into a web browser. The user is currently viewing: "${pageContext.title}". Help them with their questions and tasks.`
        : 'You are a helpful AI assistant integrated into a web browser. Help users with their browsing and questions.',
    },
    ...conversationHistory,
    {
      role: 'user',
      content: userMessage,
    },
  ];

  return sendMessage(messages, onStream);
}
