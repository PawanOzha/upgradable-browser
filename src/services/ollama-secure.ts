/**
 * Secure Ollama Integration
 *
 * SECURITY FEATURES:
 * 1. Localhost-only connections (no 0.0.0.0 binding)
 * 2. Request validation and sanitization
 * 3. Response size limits
 * 4. Timeout enforcement
 * 5. Prompt injection prevention
 * 6. No credential exposure to AI model
 * 7. Rate limiting
 * 8. Audit logging
 *
 * THREAT MODEL:
 * - Treat Ollama as untrusted local service
 * - Never send credentials or secrets to Ollama
 * - Validate all responses before using
 * - Prevent prompt injection attacks
 */

import { logAuditEvent } from '../../db/database-secure';

// ==================== Configuration ====================

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434'; // Localhost only, not 0.0.0.0
const MODEL_NAME = 'phi3';
const MAX_REQUEST_SIZE = 50000; // 50KB max input
const MAX_RESPONSE_SIZE = 100000; // 100KB max output
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_CONTEXT_LENGTH = 4000; // Limit context window

// Rate limiting
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20;

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// ==================== Types ====================

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

export interface SafeOllamaOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

// ==================== Security Utilities ====================

/**
 * Check rate limit for Ollama requests
 */
function checkRateLimit(userId: string = 'default'): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(userId);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    console.warn(`Ollama rate limit exceeded for user: ${userId}`);
    return false;
  }

  record.count++;
  return true;
}

/**
 * Sanitize input to prevent prompt injection
 */
function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input');
  }

  // Limit length
  if (input.length > MAX_REQUEST_SIZE) {
    throw new Error('Input too large');
  }

  // Remove potential injection patterns
  let sanitized = input;

  // Remove system-level instruction injection attempts
  const dangerousPatterns = [
    /ignore\s+previous\s+instructions/gi,
    /disregard\s+all\s+prior/gi,
    /new\s+instructions:/gi,
    /system:\s*/gi,
    /\[SYSTEM\]/gi,
    /\/system/gi,
  ];

  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '[FILTERED]');
  }

  return sanitized;
}

/**
 * Sanitize page content before sending to Ollama
 * CRITICAL: Never send credentials or sensitive data
 */
function sanitizePageContent(content: string): string {
  if (!content) {
    return '';
  }

  // Limit content length
  let sanitized = content.slice(0, MAX_CONTEXT_LENGTH);

  // Remove potential credential patterns
  const credentialPatterns = [
    /password\s*[:=]\s*[^\s]+/gi,
    /api[_-]?key\s*[:=]\s*[^\s]+/gi,
    /token\s*[:=]\s*[^\s]+/gi,
    /secret\s*[:=]\s*[^\s]+/gi,
    /authorization:\s*[^\s]+/gi,
    /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,
  ];

  for (const pattern of credentialPatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Remove email addresses (might be employee emails)
  sanitized = sanitized.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]');

  // Remove phone numbers
  sanitized = sanitized.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');

  return sanitized;
}

/**
 * Validate response from Ollama
 */
function validateResponse(response: any): boolean {
  if (!response || typeof response !== 'object') {
    return false;
  }

  if (!response.message || typeof response.message.content !== 'string') {
    return false;
  }

  if (response.message.content.length > MAX_RESPONSE_SIZE) {
    console.warn('Ollama response too large, truncating');
    response.message.content = response.message.content.slice(0, MAX_RESPONSE_SIZE);
  }

  return true;
}

// ==================== Ollama Health Check ====================

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const isHealthy = response.ok;
    await logAuditEvent('ollama_health_check', null, `Status: ${isHealthy ? 'OK' : 'FAILED'}`);

    return isHealthy;
  } catch (error) {
    console.error('Ollama health check failed:', error);
    await logAuditEvent('ollama_health_check', null, 'FAILED');
    return false;
  }
}

/**
 * Verify Ollama is only listening on localhost
 */
export async function verifyLocalhostOnly(): Promise<boolean> {
  try {
    // Try to connect via 0.0.0.0 (should fail)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    try {
      await fetch('http://0.0.0.0:11434/api/tags', {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // If we get here, Ollama is exposed on 0.0.0.0 (BAD!)
      console.error('⚠️ SECURITY WARNING: Ollama is exposed on 0.0.0.0!');
      await logAuditEvent('security_violation', null, 'Ollama exposed on 0.0.0.0');
      return false;
    } catch (error) {
      // Connection refused is expected (good)
      clearTimeout(timeout);
      return true;
    }
  } catch (error) {
    return true;
  }
}

// ==================== Secure Ollama API ====================

/**
 * Send message to Ollama with security controls
 */
export async function sendMessageSecure(
  messages: OllamaMessage[],
  options: SafeOllamaOptions = {},
  onStream?: (chunk: string) => void
): Promise<string> {
  // Check rate limit
  if (!checkRateLimit()) {
    throw new Error('Rate limit exceeded. Please wait before making more requests.');
  }

  // Validate and sanitize messages
  const sanitizedMessages = messages.map(msg => ({
    role: msg.role,
    content: sanitizeInput(msg.content),
  }));

  // Add system prompt for safety
  const systemMessage: OllamaMessage = {
    role: 'system',
    content: options.systemPrompt ||
      'You are a helpful AI assistant. Never output harmful content, credentials, or private information.',
  };

  const allMessages = [systemMessage, ...sanitizedMessages];

  await logAuditEvent('ollama_request', null, `Messages: ${messages.length}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: allMessages,
        stream: !!onStream,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 500,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    // Handle streaming response
    if (onStream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let totalSize = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        totalSize += chunk.length;

        // Enforce size limit
        if (totalSize > MAX_RESPONSE_SIZE) {
          reader.cancel();
          throw new Error('Response too large');
        }

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

      await logAuditEvent('ollama_response', null, `Size: ${fullResponse.length}`);
      return fullResponse;
    }

    // Handle non-streaming response
    const data: OllamaResponse = await response.json();

    if (!validateResponse(data)) {
      throw new Error('Invalid response from Ollama');
    }

    await logAuditEvent('ollama_response', null, `Size: ${data.message.content.length}`);
    return data.message?.content || '';
  } catch (error: any) {
    console.error('Ollama API call failed:', error);
    await logAuditEvent('ollama_error', null, error.message);
    throw error;
  }
}

// ==================== Safe High-Level Functions ====================

/**
 * Summarize page content (with credential filtering)
 */
export async function summarizePageSecure(
  pageContent: string,
  pageTitle: string,
  onStream?: (chunk: string) => void
): Promise<string> {
  const sanitizedContent = sanitizePageContent(pageContent);

  const messages: OllamaMessage[] = [
    {
      role: 'user',
      content: `Please summarize this web page:\n\nTitle: ${pageTitle}\n\nContent:\n${sanitizedContent}\n\nProvide a brief, helpful summary in 2-3 sentences.`,
    },
  ];

  return sendMessageSecure(messages, { maxTokens: 200 }, onStream);
}

/**
 * Answer question about page (with credential filtering)
 */
export async function answerQuestionSecure(
  question: string,
  pageContent: string,
  pageTitle: string,
  onStream?: (chunk: string) => void
): Promise<string> {
  const sanitizedQuestion = sanitizeInput(question);
  const sanitizedContent = sanitizePageContent(pageContent);

  const messages: OllamaMessage[] = [
    {
      role: 'user',
      content: `Current page: ${pageTitle}\n\nPage content:\n${sanitizedContent}\n\nUser question: ${sanitizedQuestion}\n\nPlease provide a helpful answer based on the page content.`,
    },
  ];

  return sendMessageSecure(messages, { maxTokens: 300 }, onStream);
}

/**
 * General chat (no page context, more secure)
 */
export async function chatSecure(
  userMessage: string,
  conversationHistory: OllamaMessage[],
  onStream?: (chunk: string) => void
): Promise<string> {
  const sanitizedMessage = sanitizeInput(userMessage);

  // Limit conversation history to prevent context overflow
  const recentHistory = conversationHistory.slice(-5);

  const messages: OllamaMessage[] = [
    ...recentHistory,
    {
      role: 'user',
      content: sanitizedMessage,
    },
  ];

  return sendMessageSecure(
    messages,
    {
      systemPrompt: 'You are a helpful AI assistant integrated into a web browser. Help users with their browsing and questions. Never output credentials, passwords, or sensitive information.',
    },
    onStream
  );
}

// ==================== Security Monitoring ====================

/**
 * Get Ollama usage statistics for security monitoring
 */
export async function getUsageStats(): Promise<{
  requestsThisMinute: number;
  rateLimitStatus: string;
}> {
  const now = Date.now();
  let totalRequests = 0;

  for (const [_userId, record] of rateLimitMap.entries()) {
    if (now <= record.resetTime) {
      totalRequests += record.count;
    }
  }

  return {
    requestsThisMinute: totalRequests,
    rateLimitStatus: totalRequests >= RATE_LIMIT_MAX_REQUESTS ? 'LIMITED' : 'OK',
  };
}

/**
 * Clear rate limits (admin function)
 */
export function clearRateLimits(): void {
  rateLimitMap.clear();
  console.log('Rate limits cleared');
}
