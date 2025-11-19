import { useState, useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';

interface FindBarProps {
  webview: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function FindBar({ webview, isOpen, onClose }: FindBarProps) {
  const [searchText, setSearchText] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Find text in page
  const findInPage = (text: string, forward: boolean = true) => {
    if (!webview) return;

    try {
      // Stop previous search
      webview.stopFindInPage('clearSelection');

      if (!text || !text.trim()) {
        // Clear highlights when text is empty
        setCurrentMatch(0);
        setTotalMatches(0);
        return;
      }

      // Start new search
      webview.findInPage(text, { forward, findNext: false });

      // Get match count using executeJavaScript
      setTimeout(async () => {
        try {
          const searchTextEscaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const result = await webview.executeJavaScript(`
            (function() {
              const searchText = ${JSON.stringify(text)};
              const body = document.body.innerText || document.body.textContent || '';
              const regex = new RegExp(${JSON.stringify(searchTextEscaped)}, 'gi');
              const matches = body.match(regex);
              return matches ? matches.length : 0;
            })()
          `);
          setTotalMatches(result || 0);
          setCurrentMatch(result > 0 ? 1 : 0);
        } catch (e) {
          console.error('Find count error:', e);
        }
      }, 50); // Faster response
    } catch (e) {
      console.error('Find error:', e);
    }
  };

  // Navigate to next match
  const findNext = () => {
    if (!webview || !searchText) return;
    try {
      webview.findInPage(searchText, { forward: true, findNext: true });
      if (currentMatch < totalMatches) {
        setCurrentMatch(currentMatch + 1);
      } else {
        setCurrentMatch(1);
      }
    } catch (e) {
      console.error('Find next error:', e);
    }
  };

  // Navigate to previous match
  const findPrevious = () => {
    if (!webview || !searchText) return;
    try {
      webview.findInPage(searchText, { forward: false, findNext: true });
      if (currentMatch > 1) {
        setCurrentMatch(currentMatch - 1);
      } else {
        setCurrentMatch(totalMatches);
      }
    } catch (e) {
      console.error('Find previous error:', e);
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setSearchText(text);
    findInPage(text);
  };

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  // Handle close
  const handleClose = () => {
    if (webview) {
      webview.stopFindInPage('clearSelection');
    }
    setSearchText('');
    setCurrentMatch(0);
    setTotalMatches(0);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-[10000] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-2xl"
      style={{
        top: '72px', // Aligned below navigation bar
        right: '16px',
        backgroundColor: '#232321', // Match app background
        border: '1px solid #3c3c3c', // Match app border
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Search Input */}
      <input
        ref={inputRef}
        type="text"
        value={searchText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Find in page..."
        className="bg-transparent text-gray-200 text-sm outline-none placeholder-gray-500"
        style={{
          width: '220px',
          border: 'none',
          padding: '2px 0',
        }}
      />

      {/* Match Counter */}
      {searchText && (
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {totalMatches > 0 ? `${currentMatch}/${totalMatches}` : 'No matches'}
        </span>
      )}

      {/* Navigation Buttons */}
      <button
        onClick={findPrevious}
        disabled={totalMatches === 0}
        className="p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'transparent',
          color: '#9ca3af',
        }}
        onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#3c3c3c')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp className="w-4 h-4" />
      </button>

      <button
        onClick={findNext}
        disabled={totalMatches === 0}
        className="p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'transparent',
          color: '#9ca3af',
        }}
        onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#3c3c3c')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title="Next match (Enter)"
      >
        <ChevronDown className="w-4 h-4" />
      </button>

      {/* Close Button */}
      <button
        onClick={handleClose}
        className="p-1.5 rounded transition-colors ml-1"
        style={{
          backgroundColor: 'transparent',
          color: '#9ca3af',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3c3c3c')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title="Close (Esc)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
