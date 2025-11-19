import { spawn, ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface NotificationMatch {
  content: string;
  matchedKeywords: string[];
  timestamp: string;
  sender?: string;
}

export class PythonNotificationListener {
  private pythonProcess: ChildProcess | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isRunning: boolean = false;
  private seenNotifications: Set<string> = new Set();

  constructor(window: BrowserWindow) {
    this.mainWindow = window;
  }

  // Send notification to renderer process
  private notifyRenderer(match: NotificationMatch) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('windows-notification-detected', match);
      console.log('[PythonListener] ✅ Keywords detected:', match.matchedKeywords.join(', '));
      console.log('[PythonListener] 📧 Content:', match.content.substring(0, 100));
    }
  }

  // Start listening to Windows notifications via Python
  start() {
    if (this.isRunning) {
      console.log('[PythonListener] Already running');
      return;
    }

    console.log('[PythonListener] 🚀 Starting Python notification listener...');
    this.isRunning = true;

    // Path to Python script
    const scriptPath = path.join(__dirname, '..', '..', 'Python_notify_Watcher', 'Gojo_Workers', 'app.py');
    const venvPath = path.join(__dirname, '..', '..', 'Python_notify_Watcher', 'venv', 'Scripts', 'python.exe');

    console.log('[PythonListener] 📂 Script path:', scriptPath);
    console.log('[PythonListener] 🐍 Python path:', venvPath);

    // Spawn Python process with venv (unbuffered for real-time output)
    this.pythonProcess = spawn(venvPath, ['-u', scriptPath], {
      cwd: path.join(__dirname, '..', '..', 'Python_notify_Watcher', 'Gojo_Workers'),
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let buffer = '';
    let currentNotification: Partial<NotificationMatch> = {};

    // Handle output
    this.pythonProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();

        if (line === 'LISTENER_STARTED') {
          console.log('[PythonListener] ✅ Python listener started successfully');
          continue;
        }

        if (line === 'READY') {
          console.log('[PythonListener] 📡 Ready to receive notifications');
          continue;
        }

        if (line.startsWith('ERROR:')) {
          console.error('[PythonListener]', line);
          continue;
        }

        if (line === 'NOTIFICATION_START') {
          currentNotification = {};
          continue;
        }

        if (line.startsWith('SENDER:')) {
          currentNotification.sender = line.substring(7);
        } else if (line.startsWith('CONTENT:')) {
          currentNotification.content = line.substring(8);
        } else if (line.startsWith('KEYWORDS:')) {
          const keywordsStr = line.substring(9);
          currentNotification.matchedKeywords = keywordsStr ? keywordsStr.split(',') : [];
        } else if (line.startsWith('TIMESTAMP:')) {
          currentNotification.timestamp = line.substring(10);
        }

        if (line === 'NOTIFICATION_END') {
          // Process complete notification
          if (currentNotification.content && currentNotification.matchedKeywords && currentNotification.matchedKeywords.length > 0) {
            const notificationKey = `${currentNotification.sender}|${currentNotification.content}`;

            // Prevent duplicates
            if (!this.seenNotifications.has(notificationKey)) {
              this.seenNotifications.add(notificationKey);

              const match: NotificationMatch = {
                content: currentNotification.content!,
                matchedKeywords: currentNotification.matchedKeywords!,
                timestamp: currentNotification.timestamp || new Date().toISOString(),
                sender: currentNotification.sender,
              };

              console.log('[PythonListener] 🎯 Match found!');
              console.log('[PythonListener] 📱 Sender:', currentNotification.sender);
              console.log('[PythonListener] 🔑 Keywords:', currentNotification.matchedKeywords!.join(', '));

              this.notifyRenderer(match);

              // Clean old seen notifications
              if (this.seenNotifications.size > 50) {
                const values = Array.from(this.seenNotifications);
                this.seenNotifications = new Set(values.slice(-25));
              }
            }
          }

          currentNotification = {};
        }
      }

      buffer = lines[lines.length - 1];
    });

    // Handle errors
    this.pythonProcess.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      if (error.trim()) {
        console.error('[PythonListener] ❌ Python stderr:', error);
      }
    });

    // Log when Python process starts
    console.log('[PythonListener] 🐍 Python process spawned with PID:', this.pythonProcess.pid);

    this.pythonProcess.on('close', (code) => {
      console.log('[PythonListener] Process exited with code:', code);
      this.isRunning = false;

      // Auto-restart if crashed
      if (code !== 0 && code !== null) {
        console.log('[PythonListener] Restarting in 5 seconds...');
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.start();
          }
        }, 5000);
      }
    });

    console.log('[PythonListener] 📡 Waiting for notifications...');
  }

  // Stop listening
  stop() {
    if (this.pythonProcess) {
      console.log('[PythonListener] 🛑 Stopping Python notification listener...');
      this.pythonProcess.kill();
      this.pythonProcess = null;
      this.isRunning = false;
    }
  }

  // Check if running
  getStatus(): boolean {
    return this.isRunning;
  }
}
