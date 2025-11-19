/**
 * Anthropic API Service (Claude models)
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_NAME = 'claude-3-5-haiku-20241022'; // Fast and efficient model
const API_VERSION = '2023-06-01';

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Check if Anthropic API key is configured
 */
export function hasAnthropicKey(): boolean {
  return !!import.meta.env.VITE_ANTHROPIC_API_KEY &&
         import.meta.env.VITE_ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here';
}

/**
 * Send a message to Anthropic and get response
 */
export async function sendMessage(
  messages: AnthropicMessage[],
  systemPrompt: string,
  onStream?: (chunk: string) => void
): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    throw new Error('Anthropic API key not configured. Please add your API key to .env.local');
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        stream: !!onStream,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }

    // Handle streaming response
    if (onStream && response.body) {
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

            try {
              const json = JSON.parse(data);

              // Handle content_block_delta events
              if (json.type === 'content_block_delta' && json.delta?.text) {
                fullResponse += json.delta.text;
                onStream(json.delta.text);
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      return fullResponse;
    }

    // Handle non-streaming response
    const data = await response.json();
    return data.content?.[0]?.text || '';
  } catch (error) {
    console.error('Anthropic API call failed:', error);
    throw error;
  }
}

/**
 * Summarize page content
 */
export async function summarizePage(
  pageContent: string,
  pageTitle: string,
  onStream?: (chunk: string) => void
): Promise<string> {
  const systemPrompt = 'You are a helpful AI assistant integrated into a web browser. Your role is to help users understand web pages quickly and efficiently. Provide concise, accurate summaries.';

  const messages: AnthropicMessage[] = [
    {
      role: 'user',
      content: `Please summarize this web page:\n\nTitle: ${pageTitle}\n\nContent:\n${pageContent.slice(0, 6000)}\n\nProvide a brief, helpful summary in 2-3 sentences.`,
    },
  ];

  return sendMessage(messages, systemPrompt, onStream);
}

/**
 * General chat with context
 */
export async function chat(
  userMessage: string,
  conversationHistory: AnthropicMessage[],
  pageContext?: { title?: string; content?: string },
  onStream?: (chunk: string) => void
): Promise<string> {
  const systemPrompt = pageContext
    ? `You are a helpful AI assistant integrated into a web browser. The user is currently viewing: "${pageContext.title}". Help them with their questions and tasks.`
    : 'You are a helpful AI assistant integrated into a web browser. Help users with their browsing and questions.';

  const messages: AnthropicMessage[] = [
    ...conversationHistory,
    {
      role: 'user',
      content: userMessage,
    },
  ];

  return sendMessage(messages, systemPrompt, onStream);
}
