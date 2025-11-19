import { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import TabBar from './components/TabBar';
import NavigationBar from './components/NavigationBar';
import WebView from './components/WebView';
import AISidebar from './components/AISidebar-new';
import SettingsModal from './components/SettingsModal';
import BookmarksBar from './components/BookmarksBar';
import { UpdateNotification } from './components/UpdateNotification';
import Toast from './components/Toast';
import { WebViewRef } from './types';
import { useTaskStore } from './store/taskStore';

// Interface for notification data from Python watcher
interface NotificationData {
  content: string;
  matchedKeywords: string[];
  title?: string;
  timestamp?: string;
}

const HOME_URL = 'https://duckduckgo.com';

export default function ModernBrowser() {
  const { tabs, activeTabId, updateTab, freezeTab, unfreezeTab } = useTaskStore();
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [zoomFactor, setZoomFactor] = useState<number>(0.75);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarksVersion, setBookmarksVersion] = useState(0);
  const [isAgentBarOpen, setIsAgentBarOpen] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  // Notification Toast state
  const [activeNotification, setActiveNotification] = useState<NotificationData | null>(null);

  // Helper: run JS in webview safely
  const runInWebview = async (code: string) => {
    try {
      if (!webviewRef.current) return null;
      return await webviewRef.current.executeJavaScript(code);
    } catch {
      return null;
    }
  };

  // Commented out - not needed for minimal AI bar
  /*
  const captureTemplate = async () => {
    const tpl = await runInWebview(`
      (function() {
        const normText = (n) => (n.innerText || n.textContent || '').replace(/\\s+/g, ' ').trim();
        const isVisible = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const shortPath = (el, maxUp = 10) => {
          if (!el) return null;
          if (el.id) return '#' + CSS.escape(el.id);
          const testId = el.getAttribute && el.getAttribute('data-testid');
          if (testId) return '[data-testid=\"' + testId + '\']';
          const aria = el.getAttribute && el.getAttribute('aria-label');
          if (aria) return el.tagName.toLowerCase() + '[aria-label=\"' + aria + '\"]';
          const p = []; let cur = el; let guard = 0;
          while (cur && cur.nodeType === 1 && guard++ < maxUp) {
            let i = 0, sib = cur;
            while (sib.previousElementSibling) { i++; sib = sib.previousElementSibling; }
            p.unshift(cur.tagName.toLowerCase() + ':nth-child(' + (i + 1) + ')');
            cur = cur.parentElement;
          }
          return p.join('>');
        };
        const findByText = (root, sel, text, exact = true) => {
          const list = root.querySelectorAll(sel);
          const needle = text.toLowerCase().trim();
          for (const el of list) {
            const t = normText(el).toLowerCase();
            if (!isVisible(el)) continue;
            if (exact ? t === needle : t.includes(needle)) return el;
          }
          return null;
        };

        const candidates = Array.from(document.querySelectorAll('section,div,article'));
        const cards = [];
        const seenDomains = new Set();
        for (const el of candidates) {
          const t = normText(el).toLowerCase();
          if (!t.includes('mailboxes used')) continue;
          const m = t.match(/\\bfor\\s+([a-z0-9.-]+\\.[a-z]{2,})\\b/);
          if (!m) continue;
          const domain = m[1];
          if (seenDomains.has(domain)) continue;
          seenDomains.add(domain);
          let anchor = null;
          const inner = el.querySelectorAll('h1,h2,h3,div,span,p');
          for (const n of inner) {
            const nt = normText(n).toLowerCase();
            if (nt.includes('for ' + domain) && isVisible(n)) { anchor = n; break; }
          }
          cards.push({ domain, cardSelector: shortPath(el), anchorSelector: shortPath(anchor || el) });
        }

        const mailboxRows = [];
        for (const { domain, cardSelector } of cards) {
          const card = document.querySelector(cardSelector);
          if (!card) continue;
          const rows = Array.from(card.querySelectorAll('div,li,tr')).filter(n => {
            const tx = normText(n).toLowerCase();
            return /@/.test(tx) && isVisible(n) && tx.includes(domain);
          });
          for (const row of rows) {
            const btns = Array.from(row.querySelectorAll('button'));
            const menuBtn = btns.find(b => {
              const aria = (b.getAttribute('aria-label')||'').toLowerCase();
              const hasSvg = !!(b.querySelector && b.querySelector('svg'));
              return /menu|more/.test(aria) || hasSvg;
            }) || null;
            const loginBtn = findByText(row, 'a,button,div,span', 'login', false);
            mailboxRows.push({
              domain,
              emailText: (normText(row).match(/[^\s]+@[^\s]+/) || [null])[0],
              rowSelector: shortPath(row),
              menuSelector: menuBtn ? shortPath(menuBtn) : null,
              loginSelector: loginBtn ? shortPath(loginBtn) : null
            });
          }
        }

        const drawerTemplate = {
          resetPasswordTriggerText: 'Reset password',
          drawerPanelSelectorGuess: 'aside,div[role=\"dialog\"]',
          newPasswordInputGuess: 'input[type=\"password\"],input[autocomplete*=\"new\" i]',
          saveButtonText: 'save'
        };

        return { domains: cards, mailboxes: mailboxRows, drawerTemplate };
      })();
    `);
    if (tpl) {
      try { await navigator.clipboard.writeText(JSON.stringify(tpl, null, 2)); } catch(e){}
      console.log('Extracted template:', tpl);
      alert('Template captured to clipboard. Paste it into your notes.');
    } else {
      alert('Could not capture template. Make sure the page is loaded and visible.');
    }
  };
  // Start/Stop domains traversal (no changes, only navigation+highlight)
  const toggleTraversal = async () => {
    if (!isTraversalActive) {
      // Inject a scanner tailored for Spaceship mail dashboard domain cards
      const total = await runInWebview(`
        (function() {
          // Helper to build a short unique path for stable selection
          function pathOf(el){
            let p=[], cur=el; let guard=0;
            while (cur && cur.nodeType===1 && guard++<12) {
              let i=0, sib=cur;
              while (sib.previousElementSibling){ i++; sib=sib.previousElementSibling; }
              p.unshift(cur.tagName.toLowerCase()+':nth-child('+(i+1)+')');
              cur=cur.parentElement;
            }
            return p.join('>');
          }

          // Heuristic: a domain card contains text like "for <domain>" AND "mailboxes used"
          const cards = Array.from(document.querySelectorAll('section,div,article'))
            .filter(el => {
              const t = (el.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase();
              if (!t.includes('mailboxes used')) return false;
              // Match "for <domain.tld>"
              const m = t.match(/\\bfor\\s+([a-z0-9.-]+\\.[a-z]{2,})\\b/);
              return !!m;
            })
            // prefer larger blocks to avoid tiny inner matches
            .sort((a,b)=> b.getBoundingClientRect().height - a.getBoundingClientRect().height);

          // Deduplicate by domain string
          const seen = new Set();
          window.__agenticDomains = [];
          for (const card of cards) {
            const t = (card.innerText||'').toLowerCase();
            const m = t.match(/\\bfor\\s+([a-z0-9.-]+\\.[a-z]{2,})\\b/);
            if (!m) continue;
            const domain = m[1];
            if (seen.has(domain)) continue;
            seen.add(domain);

            // Try to find a visible heading inside this card to anchor highlight
            let anchor = Array.from(card.querySelectorAll('h1,h2,h3,div,span,p'))
              .find(n => (n.innerText||'').toLowerCase().includes('for '));
            if (!anchor) anchor = card;

            window.__agenticDomains.push({
              domain,
              cardPath: pathOf(card),
              anchorPath: pathOf(anchor)
            });
          }

          // Prepare highlight layer
          const old = document.getElementById('agentic-domain-highlight');
          if (old) old.remove();
          const box = document.createElement('div');
          box.id = 'agentic-domain-highlight';
          box.style.position='fixed';
          box.style.border='2px solid #22c55e';
          box.style.borderRadius='8px';
          box.style.boxShadow='0 0 14px rgba(34,197,94,0.9)';
          box.style.pointerEvents='none';
          box.style.zIndex='2147483647';
          document.body.appendChild(box);

          window.__agenticHighlight = function(idx){
            const list = window.__agenticDomains||[];
            if (!list[idx]) return list.length;
            const sel = list[idx].anchorPath;
            const el = document.querySelector(sel);
            if (!el) return list.length;
            el.scrollIntoView({behavior:'smooth', block:'center'});
            const r = el.getBoundingClientRect();
            const b = document.getElementById('agentic-domain-highlight');
            if (b) {
              const pad = 10;
              b.style.left = (Math.max(0, r.left-pad))+'px';
              b.style.top = (Math.max(0, r.top-pad))+'px';
              b.style.width = (r.width+pad*2)+'px';
              b.style.height = (r.height+pad*2)+'px';
            }
            return list.length;
          };

          return (window.__agenticDomains||[]).length;
        })()
      `);
      setTraversalTotal(Number(total)||0);
      setTraversalIndex(0);
      setIsTraversalActive(true);
      await runInWebview(`window.__agenticHighlight && window.__agenticHighlight(0);`);
    } else {
      // Remove highlight and cleanup
      await runInWebview(`(function(){ const b=document.getElementById('agentic-domain-highlight'); if (b) b.remove(); delete window.__agenticDomains; delete window.__agenticHighlight; })()`);
      setIsTraversalActive(false);
      setTraversalIndex(0);
      setTraversalTotal(0);
    }
  };

  const traversalPrev = async () => {
    if (!isTraversalActive || traversalTotal<=0) return;
    const next = (traversalIndex - 1 + traversalTotal) % traversalTotal;
    setTraversalIndex(next);
    await runInWebview(`window.__agenticHighlight && window.__agenticHighlight(${next});`);
  };

  const traversalNext = async () => {
    if (!isTraversalActive || traversalTotal<=0) return;
    const next = (traversalIndex + 1) % traversalTotal;
    setTraversalIndex(next);
    await runInWebview(`window.__agenticHighlight && window.__agenticHighlight(${next});`);
  };
  */

  const [pageContent, setPageContent] = useState('');

  const webviewRef = useRef<WebViewRef>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const currentURL = activeTab?.url || 'about:blank';
  const pageTitle = activeTab?.title || 'New Tab';

  // Freeze inactive tabs for performance
  useEffect(() => {
    tabs.forEach((tab) => {
      if (tab.id !== activeTabId && !tab.isFrozen) {
        freezeTab(tab.id);
      } else if (tab.id === activeTabId && tab.isFrozen) {
        unfreezeTab(tab.id);
      }
    });
  }, [activeTabId, tabs, freezeTab, unfreezeTab]);

  const handleNavigate = (url: string) => {
    if (activeTabId) {
      updateTab(activeTabId, { url });
    }
  };

  const handleLoadStart = () => {
    if (activeTabId) {
      // Don't do anything for frozen tabs
      const tab = tabs.find(t => t.id === activeTabId);
      if (!tab?.isFrozen) {
        // Store current state before loading
        updateTab(activeTabId, {
          metadata: {
            ...tab?.metadata,
            lastVisited: Date.now()
          }
        });
      }
    }
  };

  const handleLoadStop = () => {
    // Only extract page content when the AI sidebar is open (on-demand)
    if (activeTabId && aiSidebarOpen) {
      extractPageContent();
    }
  };

  const handleTitleUpdate = (title: string) => {
    if (activeTabId) {
      updateTab(activeTabId, { title });
    }
  };

  const handleURLUpdate = (url: string) => {
    if (activeTabId && url !== currentURL) {
      updateTab(activeTabId, { url });
    }
  };

  const handleNavigationStateChange = (canGoBack: boolean, canGoForward: boolean) => {
    if (activeTabId) {
      updateTab(activeTabId, {
        metadata: {
          ...activeTab?.metadata,
          canGoBack,
          canGoForward,
        },
      });
    }
  };

  const handleZoomChange = (factor: number) => {
    const clamped = Math.max(0.5, Math.min(3.0, factor));
    // Set app UI zoom (renderer)
    (window as any).appZoom?.set?.(clamped);
    // Set active webview zoom
    webviewRef.current?.setZoomFactor(clamped);
    setZoomFactor(clamped);
  };

  // Apply default zoom on mount
  useEffect(() => {
    (window as any).appZoom?.set?.(0.75);
    webviewRef.current?.setZoomFactor(0.75);
  }, []);

  // Handle shortcut reload from main (Ctrl+R / Ctrl+Shift+R)
  useEffect(() => {
    const handler = (_evt: any, payload: { hard?: boolean }) => {
      if (payload?.hard) {
        webviewRef.current?.reloadIgnoringCache?.();
      } else {
        webviewRef.current?.reload();
      }
    };
    (window as any).ipcRenderer?.on('shortcut-reload', handler);
    return () => {
      (window as any).ipcRenderer?.off?.('shortcut-reload', handler as any);
    };
  }, []);

  // Listen for OS-level notifications from Python watcher
  useEffect(() => {
    const handler = (_evt: any, data: NotificationData) => {
      console.log('[App] Received OS notification:', data);
      setActiveNotification(data);
    };
    (window as any).ipcRenderer?.on('windows-notification-detected', handler);
    return () => {
      (window as any).ipcRenderer?.off?.('windows-notification-detected', handler as any);
    };
  }, []);

  // Handle notification action (from Toast button)
  const handleNotificationAction = (action: string, data: any) => {
    console.log('[App] Notification action:', action, data);
    // TODO: Integrate with cPanel operations based on action
    // For now, just log the action
    if (action === 'create' && data.email) {
      console.log('[App] Create account for:', data.email);
      // Could auto-fill cPanel sidebar, open it, etc.
    } else if (action === 'reset' && data.email) {
      console.log('[App] Reset password for:', data.email);
    } else if (action === 'delete' && data.email) {
      console.log('[App] Delete account for:', data.email);
    }
  };

  // Check bookmark status when URL changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await (window as any).bookmarks?.getAll?.();
      if (mounted && list?.success) {
        const found = (list.bookmarks || []).some((b: any) => b.url === currentURL);
        setIsBookmarked(found);
      }
    })();
    return () => { mounted = false; };
  }, [currentURL]);

  const handleToggleBookmark = async () => {
    try {
      if (!currentURL || currentURL === 'about:blank') return;
      if (isBookmarked) {
        const res = await (window as any).bookmarks?.remove?.(currentURL);
        if (res?.success) {
          setIsBookmarked(false);
          setBookmarksVersion(v => v + 1);
        }
      } else {
        const res = await (window as any).bookmarks?.add?.(pageTitle || currentURL, currentURL);
        if (res?.success) {
          setIsBookmarked(true);
          // Ask to pin to bookmarks bar
          if (window.confirm('Pin this site to the bookmarks bar?')) {
            await (window as any).bookmarks?.setPinned?.(currentURL, true);
            setBookmarksVersion(v => v + 1);
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const extractPageContent = async (showHighlight = false) => {
    try {
      if (webviewRef.current) {
        // If showing highlight, inject visual feedback
        if (showHighlight) {
          await webviewRef.current.executeJavaScript(`
            (function() {
              // Remove any existing highlight
              const existing = document.getElementById('ai-reading-overlay');
              if (existing) existing.remove();

              // Create highlight overlay
              const overlay = document.createElement('div');
              overlay.id = 'ai-reading-overlay';
              overlay.style.cssText = \`
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(180deg,
                  rgba(255, 235, 59, 0.15) 0%,
                  rgba(255, 235, 59, 0.05) 50%,
                  rgba(255, 235, 59, 0.15) 100%);
                pointer-events: none;
                z-index: 999999;
                animation: aiScanAnimation 2s ease-in-out;
              \`;

              // Add keyframe animation
              const style = document.createElement('style');
              style.textContent = \`
                @keyframes aiScanAnimation {
                  0% {
                    background-position: 0% 0%;
                    opacity: 0;
                  }
                  10% { opacity: 1; }
                  90% { opacity: 1; }
                  100% {
                    background-position: 0% 100%;
                    opacity: 0;
                  }
                }
              \`;
              document.head.appendChild(style);
              document.body.appendChild(overlay);

              // Remove after animation
              setTimeout(() => {
                overlay.remove();
                style.remove();
              }, 2000);
            })()
          `);
        }

        const content = await webviewRef.current.executeJavaScript(`
          (function() {
            // Remove script and style tags
            const clone = document.body.cloneNode(true);
            const scripts = clone.querySelectorAll('script, style, noscript');
            scripts.forEach(el => el.remove());

            // Get visible text content
            return clone.innerText || clone.textContent || '';
          })()
        `);
        // Sanitize extracted content to prevent XSS
        const sanitizedContent = DOMPurify.sanitize(content || '', {
          ALLOWED_TAGS: [],  // Strip all HTML, keep only text
          KEEP_CONTENT: true
        });
        setPageContent(sanitizedContent);
        return sanitizedContent;
      }
    } catch (error) {
      console.error('Failed to extract page content:', error);
      setPageContent('');
    }
    return '';
  };

  const handleBack = () => {
    webviewRef.current?.goBack();
  };

  const handleForward = () => {
    webviewRef.current?.goForward();
  };

  const handleRefresh = () => {
    webviewRef.current?.reload();
  };

  const handleHome = () => {
    handleNavigate(HOME_URL);
  };

  return (
    <>
      <style>{`
        /* Custom Scrollbar Styles */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4a4a48;
          border-radius: 4px;
          transition: background 0.2s ease;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #5a5a58;
        }

        .custom-scrollbar::-webkit-scrollbar-corner {
          background: transparent;
        }

        .custom-scrollbar {
          scroll-behavior: smooth;
          scrollbar-width: thin;
          scrollbar-color: #4a4a48 transparent;
        }

        .browser-tab {
          position: relative;
          transition: background-color 0.15s ease;
        }

        .browser-tab:hover {
          background-color: #3c3c3c !important;
        }

        .browser-tab::after {
          content: '';
          position: absolute;
          right: 0;
          top: 8px;
          bottom: 8px;
          width: 1px;
          background: #3c3c3c;
        }

        .browser-tab:last-child::after {
          display: none;
        }

        .drag-region {
          -webkit-app-region: drag;
        }

        .no-drag {
          -webkit-app-region: no-drag;
        }

        /* WebView container */
        webview {
          display: inline-flex;
          width: 100%;
          height: 100%;
        }
      `}</style>

      <div className="h-screen w-full flex flex-col overflow-hidden" style={{ backgroundColor: '#141413' }}>
        {/* Browser Chrome */}
        <div style={{ backgroundColor: '#232321', borderBottom: '1px solid #3c3c3c' }}>
          {/* Tab Bar */}
          <TabBar />
          {/* Bookmarks Bar (no layout shift, fixed height) */}
          <BookmarksBar version={bookmarksVersion} onNavigate={handleNavigate} />

          {/* Navigation Bar */}
          <NavigationBar
            url={currentURL}
            canGoBack={activeTab?.metadata?.canGoBack || false}
            canGoForward={activeTab?.metadata?.canGoForward || false}
            isLoading={false}
            aiSidebarOpen={aiSidebarOpen}
            zoom={zoomFactor}
            onNavigate={handleNavigate}
            onBack={handleBack}
            onForward={handleForward}
            onRefresh={handleRefresh}
            onHome={handleHome}
            onZoomChange={handleZoomChange}
            onToggleBookmark={handleToggleBookmark}
            isBookmarked={isBookmarked}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isAgentBarOpen={isAgentBarOpen}
            onToggleAgentBar={() => setIsAgentBarOpen((v) => !v)}
            isAgentRunning={isAgentRunning}
            onToggleAI={() => setAiSidebarOpen(!aiSidebarOpen)}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Web Content - Only render active tab's webview */}
          <div className="flex-1 overflow-hidden relative" style={{ backgroundColor: '#1f1f1f' }}>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className="absolute inset-0"
                style={{
                  display: tab.id === activeTabId ? 'block' : 'none',
                  visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                }}
              >
                {/* Only render webview for active tab to save resources */}
                {tab.id === activeTabId && (
                  <WebView
                    ref={webviewRef}
                    url={tab.url}
                    onLoadStart={handleLoadStart}
                    onLoadStop={handleLoadStop}
                    onTitleUpdate={handleTitleUpdate}
                    onURLUpdate={handleURLUpdate}
                    onNavigationStateChange={handleNavigationStateChange}
                  />
                )}
                {/* Show placeholder for frozen tabs */}
                {tab.isFrozen && tab.id !== activeTabId && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#1f1f1f] text-gray-500">
                    <div className="text-center">
                      <div className="text-sm mb-2">Tab frozen to save resources</div>
                      <div className="text-xs text-gray-600">Will resume when you switch back</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* AI Sidebar */}
          <AISidebar
            isOpen={aiSidebarOpen}
            onClose={() => setAiSidebarOpen(false)}
            pageTitle={pageTitle}
            pageContent={pageContent}
            currentURL={currentURL}
            onExtractContent={() => extractPageContent(true)}
            webviewRef={webviewRef}
          />
        </div>
      </div>

      {/* Settings Modal (Bookmarks first) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onNavigate={(url) => handleNavigate(url)}
      />

      {/* Agent Bar - temporarily disabled
      {isAgentBarOpen && (
        <AgentBar
          isRunning={isAgentRunning}
          onToggleRun={(prompt: string) => {
            if (isAgentRunning) {
              setIsAgentRunning(false);
            } else {
              if (!prompt) return;
              setIsAgentRunning(true);
              console.log('Agent prompt:', prompt);
            }
          }}
          aiSidebarOpen={aiSidebarOpen}
        />
      )}
      */}

      {/* Auto-Update Notification */}
      <UpdateNotification />
    </>
  );
}
