import { ipcRenderer, contextBridge } from 'electron';

// ==================== SECURITY: Allowed IPC Channels (Whitelist) ====================
const ALLOWED_SEND_CHANNELS = [
  'window-minimize',
  'window-maximize',
  'window-close',
] as const;

const ALLOWED_INVOKE_CHANNELS = [
  'db:save-sequence',
  'db:load-sequence',
  'db:get-all-sequences',
  'db:delete-sequence',
  'webview:search',
  'webview:find',
  'webview:click',
  'webview:scroll',
  'cpanel:check-email',
  'cpanel:create-account',
  'cpanel:update-password',
  'cpanel:delete-account',
] as const;

const ALLOWED_ON_CHANNELS = [
  'main-process-message',
] as const;

type AllowedSendChannel = typeof ALLOWED_SEND_CHANNELS[number];
type AllowedInvokeChannel = typeof ALLOWED_INVOKE_CHANNELS[number];
type AllowedOnChannel = typeof ALLOWED_ON_CHANNELS[number];

// ==================== SECURITY: Type-Safe IPC Wrappers ====================
interface SafeIpcRenderer {
  send(channel: AllowedSendChannel): void;
  invoke(channel: AllowedInvokeChannel, ...args: any[]): Promise<any>;
  on(channel: AllowedOnChannel, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void): void;
  off(channel: AllowedOnChannel, listener: (...args: any[]) => void): void;
}

/**
 * Validates that a channel is allowed for send operations
 */
function validateSendChannel(channel: string): channel is AllowedSendChannel {
  return (ALLOWED_SEND_CHANNELS as readonly string[]).includes(channel);
}

/**
 * Validates that a channel is allowed for invoke operations
 */
function validateInvokeChannel(channel: string): channel is AllowedInvokeChannel {
  return (ALLOWED_INVOKE_CHANNELS as readonly string[]).includes(channel);
}

/**
 * Validates that a channel is allowed for on/off operations
 */
function validateOnChannel(channel: string): channel is AllowedOnChannel {
  return (ALLOWED_ON_CHANNELS as readonly string[]).includes(channel);
}

// ==================== SECURITY: Restricted IPC API ====================
const safeIpcRenderer: SafeIpcRenderer = {
  send(channel: AllowedSendChannel): void {
    if (!validateSendChannel(channel)) {
      throw new Error(`IPC send channel not allowed: ${channel}`);
    }
    ipcRenderer.send(channel);
  },

  async invoke(channel: AllowedInvokeChannel, ...args: any[]): Promise<any> {
    if (!validateInvokeChannel(channel)) {
      throw new Error(`IPC invoke channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  on(channel: AllowedOnChannel, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void): void {
    if (!validateOnChannel(channel)) {
      throw new Error(`IPC on channel not allowed: ${channel}`);
    }
    ipcRenderer.on(channel, listener);
  },

  off(channel: AllowedOnChannel, listener: (...args: any[]) => void): void {
    if (!validateOnChannel(channel)) {
      throw new Error(`IPC off channel not allowed: ${channel}`);
    }
    ipcRenderer.off(channel, listener);
  },
};

// ==================== SECURITY: Expose Limited API to Renderer ====================
contextBridge.exposeInMainWorld('ipcRenderer', safeIpcRenderer);

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => safeIpcRenderer.send('window-minimize'),
  maximize: () => safeIpcRenderer.send('window-maximize'),
  close: () => safeIpcRenderer.send('window-close'),
});

// ==================== SECURITY: Type-Safe Database API ====================
interface SequenceData {
  id?: number;
  name: string;
  tasks: any[];
  created_at?: string;
  updated_at?: string;
}

interface DatabaseAPI {
  saveSequence(name: string, tasks: any[]): Promise<{ success: boolean; id?: number; error?: string }>;
  loadSequence(name: string): Promise<{ success: boolean; sequence?: SequenceData; error?: string }>;
  getAllSequences(): Promise<{ success: boolean; sequences?: any[]; error?: string }>;
  deleteSequence(name: string): Promise<{ success: boolean; changes?: number; error?: string }>;
}

contextBridge.exposeInMainWorld('database', {
  saveSequence: (name: string, tasks: any[]) => {
    // Client-side validation before sending to main
    if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
      return Promise.resolve({ success: false, error: 'Invalid name' });
    }
    if (!Array.isArray(tasks) || tasks.length > 100) {
      return Promise.resolve({ success: false, error: 'Invalid tasks array' });
    }
    return safeIpcRenderer.invoke('db:save-sequence', name, tasks);
  },

  loadSequence: (name: string) => {
    if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
      return Promise.resolve({ success: false, error: 'Invalid name' });
    }
    return safeIpcRenderer.invoke('db:load-sequence', name);
  },

  getAllSequences: () => {
    return safeIpcRenderer.invoke('db:get-all-sequences');
  },

  deleteSequence: (name: string) => {
    if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
      return Promise.resolve({ success: false, error: 'Invalid name' });
    }
    return safeIpcRenderer.invoke('db:delete-sequence', name);
  },
} satisfies DatabaseAPI);

// ==================== SECURITY: Safe Webview API (No Arbitrary Code Execution) ====================
interface WebviewAPI {
  search(query: string): Promise<{ success: boolean; url?: string; error?: string }>;
  find(selector: string): Promise<{ success: boolean; text?: string; findNext?: boolean; error?: string }>;
  click(selector: string): Promise<{ success: boolean; selector?: string; error?: string }>;
  scroll(y: number): Promise<{ success: boolean; y?: number; error?: string }>;
}

contextBridge.exposeInMainWorld('webviewAPI', {
  search: (query: string) => {
    if (typeof query !== 'string' || query.length === 0 || query.length > 500) {
      return Promise.resolve({ success: false, error: 'Invalid query' });
    }
    return safeIpcRenderer.invoke('webview:search', query);
  },

  find: (selector: string) => {
    if (typeof selector !== 'string' || selector.length === 0 || selector.length > 200) {
      return Promise.resolve({ success: false, error: 'Invalid selector' });
    }
    return safeIpcRenderer.invoke('webview:find', selector);
  },

  click: (selector: string) => {
    if (typeof selector !== 'string' || selector.length === 0 || selector.length > 200) {
      return Promise.resolve({ success: false, error: 'Invalid selector' });
    }
    // Additional client-side check for dangerous patterns
    if (/javascript:|onerror=|onload=|<script/i.test(selector)) {
      return Promise.resolve({ success: false, error: 'Invalid selector' });
    }
    return safeIpcRenderer.invoke('webview:click', selector);
  },

  scroll: (y: number) => {
    if (typeof y !== 'number' || isNaN(y)) {
      return Promise.resolve({ success: false, error: 'Invalid y coordinate' });
    }
    return safeIpcRenderer.invoke('webview:scroll', y);
  },
} satisfies WebviewAPI);

// ==================== SECURITY: Expose Safe Utilities ====================
contextBridge.exposeInMainWorld('securityUtils', {
  /**
   * Sanitize HTML string to prevent XSS
   * NOTE: This is a basic sanitizer. For production, integrate DOMPurify
   */
  sanitizeHTML: (html: string): string => {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  },

  /**
   * Validate URL before navigation
   */
  isValidURL: (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'https:' || urlObj.protocol === 'http:';
    } catch {
      return false;
    }
  },

  /**
   * Get app version (for security audits)
   */
  getVersion: () => {
    return '1.0.0'; // Replace with actual version from package.json
  },
});

// ==================== SECURITY: Freeze Prototypes ====================
// Note: Freezing prototypes can break React and other libraries
// Only enable if absolutely necessary for your threat model
// Object.freeze(Object.prototype);
// Object.freeze(Array.prototype);
// Object.freeze(String.prototype);
// Object.freeze(Number.prototype);

console.log('✅ Secure preload initialized with restricted IPC API');
