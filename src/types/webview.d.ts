// TypeScript declarations for Electron webview tag
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<WebViewHTMLAttributes, HTMLElement>;
  }

  interface WebViewHTMLAttributes {
    ref?: React.Ref<any>;
    src?: string;
    autosize?: string;
    nodeintegration?: string;
    nodeintegrationinsubframes?: string;
    plugins?: string;
    preload?: string;
    httpreferrer?: string;
    useragent?: string;
    disablewebsecurity?: string;
    partition?: string;
    allowpopups?: string;
    webpreferences?: string;
    enableblinkfeatures?: string;
    disableblinkfeatures?: string;
    style?: React.CSSProperties;
    className?: string;
  }
}

// Extend Window interface for our custom APIs
interface Window {
  windowControls?: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  ipcRenderer?: {
    on: (channel: string, listener: (...args: any[]) => void) => void;
    off: (channel: string, ...args: any[]) => void;
    send: (channel: string, ...args: any[]) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
  };
}
