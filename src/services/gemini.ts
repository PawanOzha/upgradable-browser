/**
 * Google Gemini API Service
 */

const MODEL_NAME = 'gemini-1.5-flash'; // Fast and efficient model

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/**
 * Check if Google API key is configured
 */
export function hasGeminiKey(): boolean {
  return !!import.meta.env.VITE_GOOGLE_API_KEY &&
         import.meta.env.VITE_GOOGLE_API_KEY !== 'your_google_api_key_here';
}

/**
 * Convert conversation history to Gemini format
 */
function convertToGeminiMessages(
  systemPrompt: string,
  conversationHistory: { role: string; content: string }[]
): GeminiMessage[] {
  const messages: GeminiMessage[] = [];

  // Add system prompt as first user message
  if (systemPrompt) {
    messages.push({
      role: 'user',
      parts: [{ text: systemPrompt }],
    });
    messages.push({
      role: 'model',
      parts: [{ text: 'Understood. I will follow these instructions.' }],
    });
  }

  // Convert conversation history
  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  return messages;
}

/**
 * Send a message to Gemini and get response
 */
export async function sendMessage(
  conversationHistory: { role: string; content: string }[],
  systemPrompt: string,
  onStream?: (chunk: string) => void
): Promise<string> {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;

  if (!apiKey || apiKey === 'your_google_api_key_here') {
    throw new Error('Google API key not configured. Please add your API key to .env.local');
  }

  const messages = convertToGeminiMessages(systemPrompt, conversationHistory);

  // Separate the last message as the current prompt
  const lastMessage = messages.pop();
  const history = messages;

  const endpoint = onStream
    ? `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:streamGenerateContent?key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: lastMessage ? [...history, lastMessage] : history,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
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
          try {
            const json = JSON.parse(line);
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              fullResponse += text;
              onStream(text);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      return fullResponse;
    }

    // Handle non-streaming response
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    console.error('Gemini API call failed:', error);
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

  const conversationHistory = [
    {
      role: 'user',
      content: `Please summarize this web page:\n\nTitle: ${pageTitle}\n\nContent:\n${pageContent.slice(0, 6000)}\n\nProvide a brief, helpful summary in 2-3 sentences.`,
    },
  ];

  return sendMessage(conversationHistory, systemPrompt, onStream);
}

/**
 * General chat with context
 */
export async function chat(
  userMessage: string,
  conversationHistory: { role: string; content: string }[],
  pageContext?: { title?: string; content?: string },
  onStream?: (chunk: string) => void
): Promise<string> {
  const systemPrompt = pageContext
    ? `You are a helpful AI assistant integrated into a web browser. The user is currently viewing: "${pageContext.title}". Help them with their questions and tasks.`
    : 'You are a helpful AI assistant integrated into a web browser. Help users with their browsing and questions.';

  const messages = [
    ...conversationHistory,
    {
      role: 'user',
      content: userMessage,
    },
  ];

  return sendMessage(messages, systemPrompt, onStream);
}
