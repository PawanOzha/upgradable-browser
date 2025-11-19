import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { WebViewRef } from '../types';

interface WebViewProps {
  url: string;
  onLoadStart?: () => void;
  onLoadStop?: () => void;
  onTitleUpdate?: (title: string) => void;
  onURLUpdate?: (url: string) => void;
  onNavigationStateChange?: (canGoBack: boolean, canGoForward: boolean) => void;
}

const WebView = forwardRef<WebViewRef, WebViewProps>(({
  url,
  onLoadStart,
  onLoadStop,
  onTitleUpdate,
  onURLUpdate,
  onNavigationStateChange,
}, ref) => {
  const webviewRef = useRef<any>(null);
  const isReadyRef = useRef(false);
  const loadedURLRef = useRef<string>('');
  const pendingZoomRef = useRef<number | null>(null);

  // Use refs for callbacks to avoid re-registering listeners
  const callbacksRef = useRef({ onLoadStart, onLoadStop, onTitleUpdate, onURLUpdate, onNavigationStateChange });
  useEffect(() => {
    callbacksRef.current = { onLoadStart, onLoadStop, onTitleUpdate, onURLUpdate, onNavigationStateChange };
  });

  useImperativeHandle(ref, () => ({
    canGoBack: () => webviewRef.current?.canGoBack() || false,
    canGoForward: () => webviewRef.current?.canGoForward() || false,
    goBack: () => webviewRef.current?.goBack(),
    goForward: () => webviewRef.current?.goForward(),
    reload: () => webviewRef.current?.reload(),
    reloadIgnoringCache: () => (webviewRef.current as any)?.reloadIgnoringCache?.(),
    loadURL: (newUrl: string) => {
      if (webviewRef.current && isReadyRef.current) {
        loadedURLRef.current = newUrl;
        webviewRef.current.loadURL(newUrl);
      }
    },
    setZoomFactor: (factor: number) => {
      const clamped = Math.max(0.5, Math.min(3.0, factor));
      pendingZoomRef.current = clamped;
      if (isReadyRef.current && webviewRef.current && typeof (webviewRef.current as any).setZoomFactor === 'function') {
        (webviewRef.current as any).setZoomFactor(clamped);
        pendingZoomRef.current = null;
      }
    },
    stop: () => webviewRef.current?.stop(),
    getURL: () => webviewRef.current?.getURL() || '',
    getTitle: () => webviewRef.current?.getTitle() || 'New Tab',
    executeJavaScript: async (code: string) => {
      if (webviewRef.current) {
        return await webviewRef.current.executeJavaScript(code);
      }
      return null;
    },
    findInPage: (text: string, options = {}) => {
      if (webviewRef.current) {
        return webviewRef.current.findInPage(text, options);
      }
      return 0;
    },
    stopFindInPage: (action: 'clearSelection' | 'keepSelection' | 'activateSelection') => {
      if (webviewRef.current) {
        webviewRef.current.stopFindInPage(action);
      }
    },
  }));

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDomReady = () => {
      isReadyRef.current = true;
      // Only load URL if it's different from what we've loaded and not blank
      if (url && url !== 'about:blank' && url !== loadedURLRef.current) {
        loadedURLRef.current = url;
        webview.loadURL(url);
      }
      // Apply pending zoom after ready
      if (pendingZoomRef.current != null && typeof (webview as any).setZoomFactor === 'function') {
        (webview as any).setZoomFactor(pendingZoomRef.current);
        pendingZoomRef.current = null;
      }
    };

    const handleLoadStart = () => {
      callbacksRef.current.onLoadStart?.();
    };

    const handleLoadStop = () => {
      callbacksRef.current.onLoadStop?.();
      if (callbacksRef.current.onTitleUpdate) {
        callbacksRef.current.onTitleUpdate(webview.getTitle());
      }
      if (callbacksRef.current.onURLUpdate) {
        callbacksRef.current.onURLUpdate(webview.getURL());
      }
      if (callbacksRef.current.onNavigationStateChange) {
        callbacksRef.current.onNavigationStateChange(webview.canGoBack(), webview.canGoForward());
      }

      // Inject custom scrollbar CSS for dark theme
      webview.executeJavaScript(`
        (function() {
          const styleId = 'custom-browser-scrollbar';
          if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = \`
              /* Custom scrollbar for all elements */
              * {
                scrollbar-width: thin;
                scrollbar-color: #4a4a48 transparent;
              }

              *::-webkit-scrollbar {
                width: 12px;
                height: 12px;
              }

              *::-webkit-scrollbar-track {
                background: transparent;
              }

              *::-webkit-scrollbar-thumb {
                background: #4a4a48;
                border-radius: 6px;
                border: 3px solid transparent;
                background-clip: padding-box;
                transition: background 0.2s ease;
              }

              *::-webkit-scrollbar-thumb:hover {
                background: #5a5a58;
                border: 3px solid transparent;
                background-clip: padding-box;
              }

              *::-webkit-scrollbar-corner {
                background: transparent;
              }
            \`;
            document.head.appendChild(style);
          }
        })()
      `).catch(() => {
        // Ignore errors (e.g., CSP restrictions)
      });
    };

    const handleTitleUpdate = (e: any) => {
      callbacksRef.current.onTitleUpdate?.(e.title);
    };

    const handleURLUpdate = (e: any) => {
      // CRITICAL: Update loadedURLRef when webview navigates (e.g., redirects)
      // This prevents the useEffect from reloading when App updates currentURL
      loadedURLRef.current = e.url;
      callbacksRef.current.onURLUpdate?.(e.url);
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleLoadStart);
    webview.addEventListener('did-stop-loading', handleLoadStop);
    webview.addEventListener('page-title-updated', handleTitleUpdate);
    webview.addEventListener('did-navigate', handleURLUpdate);
    webview.addEventListener('did-navigate-in-page', handleURLUpdate);

    return () => {
      // Cleanup listeners on unmount
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-start-loading', handleLoadStart);
      webview.removeEventListener('did-stop-loading', handleLoadStop);
      webview.removeEventListener('page-title-updated', handleTitleUpdate);
      webview.removeEventListener('did-navigate', handleURLUpdate);
      webview.removeEventListener('did-navigate-in-page', handleURLUpdate);
    };
  }, []); // Empty deps - only run once on mount

  // Separate effect to handle URL changes after initial mount
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !isReadyRef.current) return;

    // Only load if URL is different from what we last loaded
    if (url && url !== loadedURLRef.current) {
      loadedURLRef.current = url;
      webview.loadURL(url);
    }
  }, [url]);

  return (
    <webview
      ref={webviewRef}
      src="about:blank"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
      }}
    />
  );
});

WebView.displayName = 'WebView';

export default WebView;
