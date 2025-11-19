/**
 * Ollama API Service for local AI integration
 */

const OLLAMA_BASE_URL = 'http://localhost:11434';
const MODEL_NAME = 'phi3';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

/**
 * Check if Ollama is running and accessible
 */
export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    return response.ok;
  } catch (error) {
    console.error('Ollama health check failed:', error);
    return false;
  }
}

/**
 * Send a message to Ollama and get response
 */
export async function sendMessage(
  messages: OllamaMessage[],
  onStream?: (chunk: string) => void
): Promise<string> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages,
        stream: !!onStream,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
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
            const json: OllamaResponse = JSON.parse(line);
            if (json.message?.content) {
              fullResponse += json.message.content;
              onStream(json.message.content);
            }
          } catch (e) {
            console.error('Failed to parse streaming chunk:', e);
          }
        }
      }

      return fullResponse;
    }

    // Handle non-streaming response
    const data: OllamaResponse = await response.json();
    return data.message?.content || '';
  } catch (error) {
    console.error('Ollama API call failed:', error);
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
  const messages: OllamaMessage[] = [
    {
      role: 'system',
      content: 'You are a helpful AI assistant integrated into a web browser. Your role is to help users understand web pages quickly and efficiently. Provide concise, accurate summaries.',
    },
    {
      role: 'user',
      content: `Please summarize this web page:\n\nTitle: ${pageTitle}\n\nContent:\n${pageContent.slice(0, 4000)}\n\nProvide a brief, helpful summary in 2-3 sentences.`,
    },
  ];

  return sendMessage(messages, onStream);
}

/**
 * Answer question about page content
 */
export async function answerQuestion(
  question: string,
  pageContent: string,
  pageTitle: string,
  onStream?: (chunk: string) => void
): Promise<string> {
  const messages: OllamaMessage[] = [
    {
      role: 'system',
      content: 'You are a helpful AI assistant integrated into a web browser. Answer user questions about the current page accurately and concisely.',
    },
    {
      role: 'user',
      content: `Current page: ${pageTitle}\n\nPage content:\n${pageContent.slice(0, 4000)}\n\nUser question: ${question}\n\nPlease provide a helpful answer based on the page content.`,
    },
  ];

  return sendMessage(messages, onStream);
}

/**
 * General chat with context
 */
export async function chat(
  userMessage: string,
  conversationHistory: OllamaMessage[],
  pageContext?: { title?: string; content?: string },
  onStream?: (chunk: string) => void
): Promise<string> {
  const messages: OllamaMessage[] = [
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
