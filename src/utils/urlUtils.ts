/**
 * Validates if a string is a valid URL
 */
export function isValidURL(text: string): boolean {
  // Check for common URL patterns
  const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
  const localhostPattern = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/;

  // Check if it starts with http:// or https://
  if (text.startsWith('http://') || text.startsWith('https://')) {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  }

  // Check if it's localhost
  if (localhostPattern.test(text)) {
    return true;
  }

  // Check if it looks like a domain
  if (urlPattern.test(text)) {
    return true;
  }

  return false;
}

/**
 * Converts user input to a valid URL or search query
 */
export function processInput(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    return 'about:blank';
  }

  // Check if it's already a valid URL with protocol
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Check if it's localhost
  if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
    return `http://${trimmed}`;
  }

  // Check if it's a valid domain (has a dot and no spaces)
  if (isValidURL(trimmed) && !trimmed.includes(' ')) {
    return `https://${trimmed}`;
  }

  // Otherwise, treat it as a search query
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

/**
 * Extracts a clean domain from URL for display
 */
export function getDisplayURL(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + urlObj.pathname + urlObj.search;
  } catch {
    return url;
  }
}

/**
 * Checks if URL is secure (HTTPS)
 */
export function isSecureURL(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('file://') || url.startsWith('about:');
}
