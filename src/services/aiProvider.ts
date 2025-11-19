/**
 * Unified AI Provider Manager
 * Routes requests to the appropriate AI service based on the selected provider
 */

import * as ollama from './ollama';
import * as openai from './openai';
import * as anthropic from './anthropic';
import * as gemini from './gemini';

export type AIProvider = 'ollama' | 'openai' | 'anthropic' | 'gemini';

export interface AIProviderInfo {
  id: AIProvider;
  name: string;
  description: string;
  available: boolean;
  commands: string[];
}

/**
 * Get information about all AI providers
 */
export function getProviders(): AIProviderInfo[] {
  return [
    {
      id: 'ollama',
      name: 'Phi3 (Local)',
      description: 'Local Ollama model - fast and private',
      available: true, // Always available if Ollama is running
      commands: ['/ai:ollama', '/ai:phi3', '/ai:local'],
    },
    {
      id: 'openai',
      name: 'GPT-4o Mini',
      description: 'OpenAI\'s fast and efficient model',
      available: openai.hasOpenAIKey(),
      commands: ['/ai:openai', '/ai:gpt', '/ai:chatgpt'],
    },
    {
      id: 'anthropic',
      name: 'Claude 3.5 Haiku',
      description: 'Anthropic\'s fast and capable model',
      available: anthropic.hasAnthropicKey(),
      commands: ['/ai:anthropic', '/ai:claude'],
    },
    {
      id: 'gemini',
      name: 'Gemini 1.5 Flash',
      description: 'Google\'s fast multimodal model',
      available: gemini.hasGeminiKey(),
      commands: ['/ai:gemini', '/ai:google'],
    },
  ];
}

/**
 * Detect AI provider from command
 */
export function detectProviderFromCommand(message: string): AIProvider | null {
  const lowerMessage = message.toLowerCase();
  const providers = getProviders();

  for (const provider of providers) {
    for (const command of provider.commands) {
      if (lowerMessage.startsWith(command)) {
        return provider.id;
      }
    }
  }

  return null;
}

/**
 * Get the default AI provider
 */
export function getDefaultProvider(): AIProvider {
  const defaultProvider = import.meta.env.VITE_DEFAULT_AI_PROVIDER as AIProvider;
  if (defaultProvider && ['ollama', 'openai', 'anthropic', 'gemini'].includes(defaultProvider)) {
    return defaultProvider;
  }
  return 'ollama';
}

/**
 * Summarize page content using the selected provider
 */
export async function summarizePage(
  provider: AIProvider,
  pageContent: string,
  pageTitle: string,
  onStream?: (chunk: string) => void
): Promise<string> {
  switch (provider) {
    case 'ollama':
      return ollama.summarizePage(pageContent, pageTitle, onStream);

    case 'openai':
      return openai.summarizePage(pageContent, pageTitle, onStream);

    case 'anthropic':
      return anthropic.summarizePage(pageContent, pageTitle, onStream);

    case 'gemini':
      return gemini.summarizePage(pageContent, pageTitle, onStream);

    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * Chat with the selected provider
 */
export async function chat(
  provider: AIProvider,
  userMessage: string,
  conversationHistory: any[],
  pageContext?: { title?: string; content?: string },
  onStream?: (chunk: string) => void
): Promise<string> {
  // Convert conversation history to appropriate format
  const history = conversationHistory.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  switch (provider) {
    case 'ollama':
      return ollama.chat(userMessage, history, pageContext, onStream);

    case 'openai':
      return openai.chat(userMessage, history, pageContext, onStream);

    case 'anthropic': {
      // Anthropic doesn't use 'system' role in conversation history
      const anthropicHistory = history.filter(msg => msg.role !== 'system');
      return anthropic.chat(userMessage, anthropicHistory, pageContext, onStream);
    }

    case 'gemini':
      return gemini.chat(userMessage, history, pageContext, onStream);

    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: AIProvider): string {
  const info = getProviders().find(p => p.id === provider);
  return info?.name || provider;
}

/**
 * Check if a provider is available
 */
export function isProviderAvailable(provider: AIProvider): boolean {
  const info = getProviders().find(p => p.id === provider);
  return info?.available || false;
}
