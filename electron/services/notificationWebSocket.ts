import { BrowserWindow } from 'electron';
import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8765';
const SECURE_TOKEN = 'gojo-secure-notification-2025';
const RECONNECT_DELAY = 5000; // 5 seconds

export class NotificationWebSocketClient {
  private ws: WebSocket | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isRunning: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(window: BrowserWindow) {
    this.mainWindow = window;
  }

  // Start WebSocket connection
  start() {
    if (this.isRunning) {
      console.log('[NotificationWS] Already running');
      return;
    }

    this.isRunning = true;
    this.connect();
  }

  // Connect to WebSocket server
  private connect() {
    console.log('[NotificationWS] 🔌 Connecting to Python notification watcher...');
    console.log('[NotificationWS] 📡 URL:', WS_URL);

    this.ws = new WebSocket(WS_URL);

    // Connection opened
    this.ws.on('open', () => {
      console.log('[NotificationWS] ✅ Connected to notification watcher');

      // Send authentication token
      const authMessage = JSON.stringify({
        token: SECURE_TOKEN
      });

      this.ws?.send(authMessage);
    });

    // Handle incoming messages
    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());

        console.log('[NotificationWS] 📨 Received:', message.type);

        switch (message.type) {
          case 'connected':
            console.log('[NotificationWS] 🎉', message.message);
            console.log('[NotificationWS] 🔑 Watching keywords:', message.keywords);
            break;

          case 'notification':
            console.log('[NotificationWS] 🔔 Notification from:', message.sender);
            console.log('[NotificationWS] 📋 Content:', message.content.substring(0, 100));
            console.log('[NotificationWS] 🏷️ Keywords:', message.keywords);

            // Send to renderer process
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('windows-notification-detected', {
                content: message.content,
                matchedKeywords: message.keywords,
                title: message.sender,
                timestamp: message.timestamp
              });
            }
            break;

          case 'pong':
            // Heartbeat response
            break;

          case 'error':
            console.error('[NotificationWS] ❌ Server error:', message.message);
            break;

          default:
            console.log('[NotificationWS] Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('[NotificationWS] ❌ Error parsing message:', error);
      }
    });

    // Handle errors
    this.ws.on('error', (error: Error) => {
      console.error('[NotificationWS] ❌ WebSocket error:', error.message);
    });

    // Handle connection close
    this.ws.on('close', (code: number, reason: Buffer) => {
      console.log('[NotificationWS] 🔌 Connection closed:', code, reason.toString());

      // Attempt to reconnect if still running
      if (this.isRunning) {
        console.log(`[NotificationWS] 🔄 Reconnecting in ${RECONNECT_DELAY/1000}s...`);
        this.reconnectTimeout = setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.connect();
          }
        }, RECONNECT_DELAY);
      }
    });

    // Send periodic ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Every 30 seconds
  }

  // Stop WebSocket connection
  stop() {
    console.log('[NotificationWS] 🛑 Stopping WebSocket client...');
    this.isRunning = false;

    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close WebSocket connection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Check if running
  getStatus(): boolean {
    return this.isRunning && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
