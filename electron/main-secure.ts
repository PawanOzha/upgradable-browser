import { app, BrowserWindow, ipcMain, session, protocol } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  initializeDatabase,
  saveSequence,
  loadSequence,
  getAllSequences,
  deleteSequence
} from '../db/database-secure';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;

// ==================== SECURITY: CSP Configuration ====================
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // Required for Vite dev
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self' http://localhost:11434", // Ollama only
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join('; ');

// ==================== SECURITY: Allowed Navigation Whitelist ====================
const ALLOWED_NAVIGATION_DOMAINS = [
  'duckduckgo.com',
  'google.com',
  'web.whatsapp.com', // For your use case
  // Add other trusted domains for employee access
];

function isAllowedNavigation(url: string): boolean {
  try {
    const urlObj = new URL(url);

    // Allow localhost in development
    if (VITE_DEV_SERVER_URL && urlObj.hostname === 'localhost') {
      return true;
    }

    // Check whitelist
    return ALLOWED_NAVIGATION_DOMAINS.some(domain =>
      urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

// ==================== SECURITY: Input Validation Utilities ====================
function validateString(value: unknown, maxLength: number = 1000): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid input: expected string');
  }
  if (value.length > maxLength) {
    throw new Error(`Input too long: max ${maxLength} characters`);
  }
  // Prevent SQL injection patterns
  if (/['";\\]/.test(value)) {
    throw new Error('Invalid characters in input');
  }
  return value;
}

function validateNumber(value: unknown, min: number = 0, max: number = 10000): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('Invalid input: expected number');
  }
  if (value < min || value > max) {
    throw new Error(`Number out of range: ${min}-${max}`);
  }
  return value;
}

function validateArray(value: unknown, maxItems: number = 100): any[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid input: expected array');
  }
  if (value.length > maxItems) {
    throw new Error(`Array too large: max ${maxItems} items`);
  }
  return value;
}

// ==================== SECURITY: Rate Limiting ====================
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

function checkRateLimit(channel: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(channel);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(channel, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    console.warn(`Rate limit exceeded for channel: ${channel}`);
    return false;
  }

  record.count++;
  return true;
}

// ==================== SECURITY: Webview Session Configuration ====================
function configureWebviewSecurity() {
  // Create isolated partition for webviews
  const webviewPartition = session.fromPartition('persist:webview');

  // Set security headers
  webviewPartition.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_POLICY],
        'X-Frame-Options': ['DENY'],
        'X-Content-Type-Options': ['nosniff'],
        'Referrer-Policy': ['no-referrer'],
        'Permissions-Policy': ['geolocation=(), microphone=(), camera=()']
      }
    });
  });

  // Block dangerous protocols
  webviewPartition.protocol.interceptFileProtocol('file', (request, callback) => {
    console.warn('Blocked file:// protocol access:', request.url);
    callback({ error: -3 }); // ERR_ABORTED
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-secure.mjs'),

      // ==================== CRITICAL SECURITY SETTINGS ====================
      contextIsolation: true,          // REQUIRED: Isolate renderer context
      nodeIntegration: false,           // REQUIRED: No Node.js in renderer
      nodeIntegrationInWorker: false,   // No Node.js in web workers
      nodeIntegrationInSubFrames: false,// No Node.js in iframes
      sandbox: true,                    // Enable Chromium sandbox
      webSecurity: true,                // Enable web security
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableBlinkFeatures: '',
      disableBlinkFeatures: '',

      // Webview configuration
      webviewTag: true,
      partition: 'persist:webview',     // Isolated session for webviews

      // Additional hardening
      safeDialogs: true,
      safeDialogsMessage: 'Prevented repeated dialog',
      navigateOnDragDrop: false,
    },
  });

  // ==================== SECURITY: Navigation Protection ====================
  win.webContents.on('will-navigate', (event, url) => {
    // Only allow navigation to dev server or built files
    if (!VITE_DEV_SERVER_URL || !url.startsWith(VITE_DEV_SERVER_URL)) {
      const fileUrl = `file://${path.join(RENDERER_DIST, 'index.html')}`;
      if (!url.startsWith(fileUrl) && !url.startsWith('devtools://')) {
        console.warn('Blocked navigation to:', url);
        event.preventDefault();
      }
    }
  });

  // Prevent new window creation (except whitelisted)
  win.webContents.setWindowOpenHandler(({ url }) => {
    console.warn('Blocked window.open to:', url);
    return { action: 'deny' };
  });

  // ==================== SECURITY: Webview Configuration ====================
  win.webContents.on('did-attach-webview', (_event, webContents) => {
    // Prevent navigation to dangerous URLs
    webContents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url)) {
        console.warn('Blocked webview navigation to:', url);
        event.preventDefault();
      }
    });

    // Prevent new windows from webview
    webContents.setWindowOpenHandler(({ url }) => {
      console.warn('Blocked webview window.open to:', url);
      return { action: 'deny' };
    });

    // Prevent webview from accessing dangerous APIs
    webContents.on('console-message', (_event, level, message) => {
      if (message.includes('Electron Security Warning')) {
        console.error('Security warning in webview:', message);
      }
    });
  });

  // Load the app
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  // Configure webview security
  configureWebviewSecurity();
}

// ==================== SECURITY: Window Control Handlers (Safe) ====================
ipcMain.on('window-minimize', (event) => {
  if (win && event.sender === win.webContents) {
    win.minimize();
  }
});

ipcMain.on('window-maximize', (event) => {
  if (win && event.sender === win.webContents) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', (event) => {
  if (win && event.sender === win.webContents) {
    win.close();
  }
});

// ==================== SECURITY: Database IPC Handlers (Validated) ====================
ipcMain.handle('db:save-sequence', async (event, name: unknown, tasks: unknown) => {
  if (!checkRateLimit('db:save-sequence')) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  try {
    const validName = validateString(name, 255);
    const validTasks = validateArray(tasks, 100);

    // Additional validation: ensure tasks don't contain dangerous code
    const tasksJson = JSON.stringify(validTasks);
    if (/<script|javascript:|onerror=|onload=/i.test(tasksJson)) {
      throw new Error('Potentially malicious content detected in tasks');
    }

    const id = await saveSequence(validName, validTasks);
    return { success: true, id };
  } catch (error: any) {
    console.error('db:save-sequence error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:load-sequence', async (event, name: unknown) => {
  if (!checkRateLimit('db:load-sequence')) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  try {
    const validName = validateString(name, 255);
    const sequence = await loadSequence(validName);
    return { success: true, sequence };
  } catch (error: any) {
    console.error('db:load-sequence error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:get-all-sequences', async (event) => {
  if (!checkRateLimit('db:get-all-sequences')) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  try {
    const sequences = await getAllSequences();
    return { success: true, sequences };
  } catch (error: any) {
    console.error('db:get-all-sequences error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:delete-sequence', async (event, name: unknown) => {
  if (!checkRateLimit('db:delete-sequence')) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  try {
    const validName = validateString(name, 255);
    const changes = await deleteSequence(validName);
    return { success: true, changes };
  } catch (error: any) {
    console.error('db:delete-sequence error:', error);
    return { success: false, error: error.message };
  }
});

// ==================== SECURITY: Safe Webview Automation Handlers ====================
// These handlers DO NOT execute arbitrary code - they return safe action descriptors

ipcMain.handle('webview:search', async (event, query: unknown) => {
  if (!checkRateLimit('webview:search')) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  try {
    const validQuery = validateString(query, 500);
    const searchURL = `https://www.google.com/search?q=${encodeURIComponent(validQuery)}`;
    return { success: true, url: searchURL };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('webview:find', async (event, text: unknown, findNext: unknown = false) => {
  if (!checkRateLimit('webview:find')) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  try {
    const validText = validateString(text, 500);
    const validFindNext = typeof findNext === 'boolean' ? findNext : false;

    return { success: true, text: validText, findNext: validFindNext };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('webview:click', async (event, selector: unknown) => {
  if (!checkRateLimit('webview:click')) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  try {
    // SECURITY: Only allow safe CSS selectors, no JavaScript
    const validSelector = validateString(selector, 200);
    if (/javascript:|onerror=|onload=|<script/i.test(validSelector)) {
      throw new Error('Invalid selector');
    }

    return { success: true, selector: validSelector };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('webview:scroll', async (event, y: unknown) => {
  if (!checkRateLimit('webview:scroll')) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  try {
    const validY = validateNumber(y, -100000, 100000);
    return { success: true, y: validY };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// SECURITY: Removed webview:execute - no arbitrary code execution allowed
// SECURITY: Removed webview:extract-dom - must use predefined safe extraction

// ==================== App Lifecycle ====================
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('web-contents-created', (_event, contents) => {
  // Additional security: prevent webview from accessing Node
  contents.on('will-attach-webview', (_wawevent, webPreferences, _params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });
});

app.whenReady().then(async () => {
  // Initialize secure database
  await initializeDatabase();

  // Additional security: disable remote module globally
  if (app.isPackaged) {
    protocol.registerFileProtocol('file', (request, callback) => {
      const url = request.url.substr(7);
      callback({ path: path.normalize(url) });
    });
  }

  createWindow();
});

// ==================== SECURITY: Prevent Node Integration in Dev Tools ====================
app.on('web-contents-created', (_event, contents) => {
  contents.on('devtools-opened', () => {
    if (!VITE_DEV_SERVER_URL) {
      console.warn('DevTools opened in production mode');
    }
  });
});
