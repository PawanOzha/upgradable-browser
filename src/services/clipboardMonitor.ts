// Clipboard Monitor - Detects keywords in clipboard content

const KEYWORDS = [
  'email',
  'create',
  'remove',
  'delete',
  'change password',
  'change',
  'password',
  'spacemail',
  'webmail',
  'mail',
  'dear team',
  'new joiner',
  'please create',
  'create account',
  'reset password',
  'update password',
];

export interface ClipboardMatch {
  content: string;
  matchedKeywords: string[];
  timestamp: Date;
}

type ClipboardCallback = (match: ClipboardMatch) => void;

class ClipboardMonitorService {
  private lastClipboard: string = '';
  private intervalId: number | null = null;
  private callbacks: ClipboardCallback[] = [];
  private isMonitoring: boolean = false;

  // Check if text contains any keyword
  private containsKeyword(text: string): string[] {
    const lowerText = text.toLowerCase();
    return KEYWORDS.filter(keyword =>
      lowerText.includes(keyword.toLowerCase())
    );
  }

  // Start monitoring clipboard
  start() {
    if (this.isMonitoring) {
      console.log('[ClipboardMonitor] Already monitoring');
      return;
    }

    console.log('[ClipboardMonitor] Started monitoring clipboard');
    this.isMonitoring = true;

    // Check clipboard every 1 second
    this.intervalId = window.setInterval(async () => {
      try {
        // Read clipboard using Clipboard API
        const text = await navigator.clipboard.readText();

        // Only process if clipboard content changed
        if (text && text !== this.lastClipboard) {
          this.lastClipboard = text;

          // Check for keywords
          const matchedKeywords = this.containsKeyword(text);

          if (matchedKeywords.length > 0) {
            const match: ClipboardMatch = {
              content: text,
              matchedKeywords,
              timestamp: new Date(),
            };

            console.log('[ClipboardMonitor] Keywords detected:', matchedKeywords);

            // Notify all callbacks
            this.callbacks.forEach(callback => callback(match));
          }
        }
      } catch (error) {
        // Clipboard read permission denied or not available
        // This is expected when clipboard access is not granted
      }
    }, 1000);
  }

  // Stop monitoring clipboard
  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isMonitoring = false;
      console.log('[ClipboardMonitor] Stopped monitoring');
    }
  }

  // Subscribe to clipboard matches
  subscribe(callback: ClipboardCallback) {
    this.callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  // Get monitoring status
  isActive(): boolean {
    return this.isMonitoring;
  }
}

// Singleton instance
export const clipboardMonitor = new ClipboardMonitorService();
