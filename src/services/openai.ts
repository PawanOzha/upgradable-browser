/**
 * OpenAI API Service (GPT models)
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL_NAME = 'gpt-4o-mini'; // Fast and cost-effective model

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Check if OpenAI API key is configured
 */
export function hasOpenAIKey(): boolean {
  return !!import.meta.env.VITE_OPENAI_API_KEY &&
         import.meta.env.VITE_OPENAI_API_KEY !== 'your_openai_api_key_here';
}

/**
 * Send a message to OpenAI and get response
 */
export async function sendMessage(
  messages: OpenAIMessage[],
  onStream?: (chunk: string) => void
): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('OpenAI API key not configured. Please add your API key to .env.local');
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages,
        stream: !!onStream,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
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
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                onStream(content);
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
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('OpenAI API call failed:', error);
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
 * General chat with context
 */
export async function chat(
  userMessage: string,
  conversationHistory: OpenAIMessage[],
  pageContext?: { title?: string; content?: string },
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
