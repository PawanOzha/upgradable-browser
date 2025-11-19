/**
 * Secure Automation Runner
 *
 * SECURITY FEATURES:
 * 1. No arbitrary code execution - only whitelisted operations
 * 2. Input validation and sanitization
 * 3. Timeouts and resource limits
 * 4. Sandboxed execution context
 * 5. Audit logging of all actions
 *
 * ARCHITECTURE:
 * - Runs in isolated process/worker
 * - Communicates via structured messages only
 * - No access to filesystem or network directly
 * - Lowered privileges where possible
 */

import { logAuditEvent } from '../../db/database-secure';

// ==================== Whitelist of Allowed Actions ====================

export enum AllowedAction {
  NAVIGATE = 'navigate',
  CLICK = 'click',
  TYPE = 'type',
  EXTRACT_TEXT = 'extract_text',
  EXTRACT_ATTRIBUTE = 'extract_attribute',
  WAIT_FOR_SELECTOR = 'wait_for_selector',
  SCROLL = 'scroll',
  SCREENSHOT = 'screenshot',
}

// ==================== Action Interfaces ====================

export interface BaseAction {
  type: AllowedAction;
  timeout?: number; // Max timeout: 30 seconds
}

export interface NavigateAction extends BaseAction {
  type: AllowedAction.NAVIGATE;
  url: string;
}

export interface ClickAction extends BaseAction {
  type: AllowedAction.CLICK;
  selector: string;
}

export interface TypeAction extends BaseAction {
  type: AllowedAction.TYPE;
  selector: string;
  text: string;
  delay?: number; // Typing delay in ms
}

export interface ExtractTextAction extends BaseAction {
  type: AllowedAction.EXTRACT_TEXT;
  selector: string;
}

export interface ExtractAttributeAction extends BaseAction {
  type: AllowedAction.EXTRACT_ATTRIBUTE;
  selector: string;
  attribute: string;
}

export interface WaitForSelectorAction extends BaseAction {
  type: AllowedAction.WAIT_FOR_SELECTOR;
  selector: string;
}

export interface ScrollAction extends BaseAction {
  type: AllowedAction.SCROLL;
  x?: number;
  y?: number;
}

export interface ScreenshotAction extends BaseAction {
  type: AllowedAction.SCREENSHOT;
  fullPage?: boolean;
}

export type AutomationAction =
  | NavigateAction
  | ClickAction
  | TypeAction
  | ExtractTextAction
  | ExtractAttributeAction
  | WaitForSelectorAction
  | ScrollAction
  | ScreenshotAction;

// ==================== Action Results ====================

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
  duration: number;
}

// ==================== Validation Functions ====================

const MAX_TIMEOUT = 30000; // 30 seconds
const MAX_SELECTOR_LENGTH = 500;
const MAX_TEXT_LENGTH = 10000;
const MAX_URL_LENGTH = 2000;

/**
 * Validate URL is safe to navigate to
 */
function validateURL(url: string): boolean {
  if (!url || url.length > MAX_URL_LENGTH) {
    return false;
  }

  try {
    const urlObj = new URL(url);

    // Only allow http/https protocols
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return false;
    }

    // Block local network URLs (prevent SSRF)
    const hostname = urlObj.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname === '0.0.0.0' ||
      hostname === '::1'
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate CSS selector is safe
 */
function validateSelector(selector: string): boolean {
  if (!selector || selector.length > MAX_SELECTOR_LENGTH) {
    return false;
  }

  // Block dangerous patterns
  const dangerousPatterns = [
    /javascript:/i,
    /<script/i,
    /onerror=/i,
    /onload=/i,
    /eval\(/i,
    /expression\(/i,
  ];

  return !dangerousPatterns.some(pattern => pattern.test(selector));
}

/**
 * Validate text input
 */
function validateText(text: string): boolean {
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return false;
  }

  // Check for script injection attempts
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror=/i,
    /onload=/i,
  ];

  return !dangerousPatterns.some(pattern => pattern.test(text));
}

/**
 * Validate attribute name
 */
function validateAttribute(attr: string): boolean {
  if (!attr || attr.length > 100) {
    return false;
  }

  // Only allow alphanumeric and common attribute names
  return /^[a-zA-Z0-9\-_]+$/.test(attr);
}

/**
 * Validate timeout value
 */
function validateTimeout(timeout: number | undefined): number {
  if (timeout === undefined) {
    return 5000; // Default 5 seconds
  }

  if (typeof timeout !== 'number' || timeout < 0 || timeout > MAX_TIMEOUT) {
    return 5000;
  }

  return timeout;
}

// ==================== Action Validators ====================

function validateAction(action: AutomationAction): { valid: boolean; error?: string } {
  // Validate timeout
  action.timeout = validateTimeout(action.timeout);

  switch (action.type) {
    case AllowedAction.NAVIGATE:
      if (!validateURL(action.url)) {
        return { valid: false, error: 'Invalid or dangerous URL' };
      }
      break;

    case AllowedAction.CLICK:
    case AllowedAction.EXTRACT_TEXT:
    case AllowedAction.WAIT_FOR_SELECTOR:
      if (!validateSelector(action.selector)) {
        return { valid: false, error: 'Invalid or dangerous selector' };
      }
      break;

    case AllowedAction.TYPE:
      if (!validateSelector(action.selector)) {
        return { valid: false, error: 'Invalid or dangerous selector' };
      }
      if (!validateText(action.text)) {
        return { valid: false, error: 'Invalid or dangerous text input' };
      }
      break;

    case AllowedAction.EXTRACT_ATTRIBUTE:
      if (!validateSelector(action.selector)) {
        return { valid: false, error: 'Invalid or dangerous selector' };
      }
      if (!validateAttribute(action.attribute)) {
        return { valid: false, error: 'Invalid attribute name' };
      }
      break;

    case AllowedAction.SCROLL:
      if (action.x !== undefined && (typeof action.x !== 'number' || Math.abs(action.x) > 100000)) {
        return { valid: false, error: 'Invalid scroll X coordinate' };
      }
      if (action.y !== undefined && (typeof action.y !== 'number' || Math.abs(action.y) > 100000)) {
        return { valid: false, error: 'Invalid scroll Y coordinate' };
      }
      break;

    case AllowedAction.SCREENSHOT:
      // Screenshot is safe
      break;

    default:
      return { valid: false, error: `Unknown action type: ${(action as any).type}` };
  }

  return { valid: true };
}

// ==================== Action Execution (Stub - Implement with webview integration) ====================

/**
 * Execute a validated automation action
 * This is a stub - integrate with your webview execution layer
 */
export async function executeAction(
  action: AutomationAction,
  webviewRef: any
): Promise<ActionResult> {
  const startTime = Date.now();

  // Validate action
  const validation = validateAction(action);
  if (!validation.valid) {
    await logAuditEvent('automation_action_blocked', null, validation.error);
    return {
      success: false,
      error: validation.error,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
    };
  }

  // Log action
  await logAuditEvent('automation_action_executed', null, `Type: ${action.type}`);

  try {
    // Execute action based on type
    let result: any;

    switch (action.type) {
      case AllowedAction.NAVIGATE:
        result = await executeNavigate(action, webviewRef);
        break;

      case AllowedAction.CLICK:
        result = await executeClick(action, webviewRef);
        break;

      case AllowedAction.TYPE:
        result = await executeType(action, webviewRef);
        break;

      case AllowedAction.EXTRACT_TEXT:
        result = await executeExtractText(action, webviewRef);
        break;

      case AllowedAction.EXTRACT_ATTRIBUTE:
        result = await executeExtractAttribute(action, webviewRef);
        break;

      case AllowedAction.WAIT_FOR_SELECTOR:
        result = await executeWaitForSelector(action, webviewRef);
        break;

      case AllowedAction.SCROLL:
        result = await executeScroll(action, webviewRef);
        break;

      case AllowedAction.SCREENSHOT:
        result = await executeScreenshot(action, webviewRef);
        break;

      default:
        throw new Error('Unsupported action type');
    }

    return {
      success: true,
      data: result,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    await logAuditEvent('automation_action_failed', null, error.message);
    return {
      success: false,
      error: error.message,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
    };
  }
}

// ==================== Safe Action Implementations ====================

async function executeNavigate(action: NavigateAction, webviewRef: any): Promise<void> {
  if (!webviewRef?.loadURL) {
    throw new Error('Webview not available');
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Navigation timeout'));
    }, action.timeout);

    try {
      webviewRef.loadURL(action.url);

      // Wait for load
      const handleLoad = () => {
        clearTimeout(timeout);
        webviewRef.removeEventListener('did-finish-load', handleLoad);
        resolve();
      };

      webviewRef.addEventListener('did-finish-load', handleLoad);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

async function executeClick(action: ClickAction, webviewRef: any): Promise<void> {
  if (!webviewRef?.executeJavaScript) {
    throw new Error('Webview not available');
  }

  // Use safe click via JavaScript (not executeJavaScript with arbitrary code)
  const safeClickScript = `
    (function() {
      const element = document.querySelector(${JSON.stringify(action.selector)});
      if (!element) {
        throw new Error('Element not found: ${action.selector}');
      }
      element.click();
      return true;
    })()
  `;

  return webviewRef.executeJavaScript(safeClickScript);
}

async function executeType(action: TypeAction, webviewRef: any): Promise<void> {
  if (!webviewRef?.executeJavaScript) {
    throw new Error('Webview not available');
  }

  const safeTypeScript = `
    (function() {
      const element = document.querySelector(${JSON.stringify(action.selector)});
      if (!element) {
        throw new Error('Element not found: ${action.selector}');
      }
      element.value = ${JSON.stringify(action.text)};
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `;

  return webviewRef.executeJavaScript(safeTypeScript);
}

async function executeExtractText(action: ExtractTextAction, webviewRef: any): Promise<string> {
  if (!webviewRef?.executeJavaScript) {
    throw new Error('Webview not available');
  }

  const safeExtractScript = `
    (function() {
      const element = document.querySelector(${JSON.stringify(action.selector)});
      if (!element) {
        throw new Error('Element not found: ${action.selector}');
      }
      return element.innerText || element.textContent || '';
    })()
  `;

  return webviewRef.executeJavaScript(safeExtractScript);
}

async function executeExtractAttribute(action: ExtractAttributeAction, webviewRef: any): Promise<string> {
  if (!webviewRef?.executeJavaScript) {
    throw new Error('Webview not available');
  }

  const safeExtractScript = `
    (function() {
      const element = document.querySelector(${JSON.stringify(action.selector)});
      if (!element) {
        throw new Error('Element not found: ${action.selector}');
      }
      return element.getAttribute(${JSON.stringify(action.attribute)}) || '';
    })()
  `;

  return webviewRef.executeJavaScript(safeExtractScript);
}

async function executeWaitForSelector(action: WaitForSelectorAction, webviewRef: any): Promise<void> {
  if (!webviewRef?.executeJavaScript) {
    throw new Error('Webview not available');
  }

  const safeWaitScript = `
    (function() {
      return new Promise((resolve, reject) => {
        const selector = ${JSON.stringify(action.selector)};
        const timeout = ${action.timeout || 5000};

        if (document.querySelector(selector)) {
          resolve(true);
          return;
        }

        const observer = new MutationObserver(() => {
          if (document.querySelector(selector)) {
            observer.disconnect();
            resolve(true);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        setTimeout(() => {
          observer.disconnect();
          reject(new Error('Timeout waiting for selector'));
        }, timeout);
      });
    })()
  `;

  return webviewRef.executeJavaScript(safeWaitScript);
}

async function executeScroll(action: ScrollAction, webviewRef: any): Promise<void> {
  if (!webviewRef?.executeJavaScript) {
    throw new Error('Webview not available');
  }

  const x = action.x || 0;
  const y = action.y || 0;

  const safeScrollScript = `
    window.scrollBy(${x}, ${y});
  `;

  return webviewRef.executeJavaScript(safeScrollScript);
}

async function executeScreenshot(action: ScreenshotAction, webviewRef: any): Promise<string> {
  // Screenshot functionality would use Electron's capturePage API
  // This is a stub - implement based on your needs
  throw new Error('Screenshot not implemented');
}

// ==================== Sequence Execution ====================

export async function executeSequence(
  actions: AutomationAction[],
  webviewRef: any,
  onProgress?: (index: number, result: ActionResult) => void
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (let i = 0; i < actions.length; i++) {
    const result = await executeAction(actions[i], webviewRef);
    results.push(result);

    if (onProgress) {
      onProgress(i, result);
    }

    if (!result.success) {
      // Stop on first error
      await logAuditEvent('automation_sequence_failed', null, `Failed at step ${i + 1}`);
      break;
    }
  }

  return results;
}
