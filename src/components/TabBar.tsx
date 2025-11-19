import { Plus, X, Minus } from 'lucide-react';
import { useTaskStore } from '../store/taskStore';

export default function TabBar() {
  const { tabs, activeTabId, addTab, removeTab, switchTab } = useTaskStore();

  const handleAddTab = () => {
    addTab('about:blank');
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    removeTab(tabId);
  };

  const handleMinimize = () => {
    (window as any).windowControls?.minimize();
  };

  const handleClose = () => {
    (window as any).windowControls?.close();
  };

  const truncateTitle = (title: string, maxLength = 20) => {
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  };

  // Calculate tab width based on number of tabs (Chrome-like behavior)
  const getTabWidth = () => {
    const tabCount = tabs.length;
    const maxWidth = 240; // Maximum tab width
    const minWidth = 120; // Minimum tab width before scrolling
    // Reserve space for: drag region (8px) + plus button (10px) + spacer (40px) + controls (88px) = 146px
    const reservedSpace = 146;
    const availableWidth = window.innerWidth - reservedSpace;

    const calculatedWidth = Math.floor(availableWidth / tabCount);
    return Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
  };

  const tabWidth = getTabWidth();

  return (
    <div className="flex items-center bg-[#1f1f1f] border-b border-[#3c3c3c] overflow-hidden">
      {/* Draggable Title Bar Region */}
      <div className="drag-region flex-shrink-0 h-10 w-3" />

      {/* Add Tab Button - Fixed at left with spacing */}
      <div className="flex items-center justify-center h-10 px-2 no-drag">
        <button
          onClick={handleAddTab}
          className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-200 hover:bg-[#3c3c3c] rounded-lg transition-all"
          style={{ backgroundColor: '#2d2d2b' }}
          title="New Tab (Ctrl+T)"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Small spacer */}
      <div className="w-1" />

      {/* Tabs Container */}
      <div className="flex items-center overflow-x-auto no-drag" style={{ scrollbarWidth: 'none', maxWidth: `calc(100% - 146px)` }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`
              group relative flex items-center gap-2 px-3 py-2 cursor-pointer
              border-r border-[#3c3c3c] no-drag transition-all duration-150
              ${
                tab.isActive
                  ? 'bg-[#2d2d2b] text-gray-100'
                  : 'bg-[#1f1f1f] text-gray-400 hover:bg-[#252525]'
              }
            `}
            style={{
              flex: `0 0 ${tabWidth}px`,
              width: `${tabWidth}px`,
              minWidth: '120px',
              maxWidth: '240px'
            }}
          >
            {/* Tab Title */}
            <div className="flex-1 overflow-hidden min-w-0">
              <div className="text-xs font-medium truncate">
                {truncateTitle(tab.title, 18)}
              </div>
              <div className="text-[10px] text-gray-500 truncate">
                {tab.url !== 'about:blank' && tab.url.startsWith('http') ? (
                  (() => {
                    try {
                      return new URL(tab.url).hostname;
                    } catch {
                      return '';
                    }
                  })()
                ) : (
                  '\u00A0' // Non-breaking space to maintain height
                )}
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={(e) => handleCloseTab(e, tab.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-[#3c3c3c] transition-all"
            >
              <X className="w-3 h-3" />
            </button>

            {/* Active Tab Indicator */}
            {tab.isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}

            {/* Frozen Indicator */}
            {tab.isFrozen && (
              <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-yellow-500" />
            )}
          </div>
        ))}
      </div>

      {/* Draggable spacer */}
      <div className="drag-region flex-1 h-10" />

      {/* Window Controls */}
      <div className="flex items-center shrink-0 no-drag">
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-11 h-10 text-gray-400 hover:text-gray-200 transition-colors group"
          title="Minimize"
        >
          <div className="p-2 rounded-lg group-hover:bg-[#3c3c3c] transition-all">
            <Minus className="w-3.5 h-3.5" />
          </div>
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-11 h-10 text-gray-400 hover:text-white transition-colors group"
          title="Close"
        >
          <div className="p-2 rounded-lg group-hover:bg-red-600 transition-all">
            <X className="w-3.5 h-3.5" />
          </div>
        </button>
      </div>
    </div>
  );
}
