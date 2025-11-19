export interface Tab {
  id: number;
  title: string;
  url: string;
  active: boolean;
  isLoading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface WebViewRef {
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  reloadIgnoringCache?: () => void;
  loadURL: (url: string) => void;
  setZoomFactor: (factor: number) => void;
  stop: () => void;
  getURL: () => string;
  getTitle: () => string;
  executeJavaScript: (code: string) => Promise<any>;
  findInPage: (text: string, options?: { forward?: boolean; findNext?: boolean }) => number;
  stopFindInPage: (action: 'clearSelection' | 'keepSelection' | 'activateSelection') => void;
}
