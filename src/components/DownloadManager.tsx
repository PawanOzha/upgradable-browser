import { useState, useEffect } from 'react';
import { X, Download, FileJson, Trash2, FolderOpen } from 'lucide-react';

interface DownloadItem {
  id: string;
  filename: string;
  size: string;
  timestamp: number;
  progress: number;
  status: 'downloading' | 'completed' | 'failed';
}

interface DownloadManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DownloadManager({ isOpen, onClose }: DownloadManagerProps) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  // Load downloads from localStorage
  useEffect(() => {
    if (isOpen) {
      loadDownloads();
    }
  }, [isOpen]);

  const loadDownloads = () => {
    try {
      const stored = localStorage.getItem('downloadHistory');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter downloads from last 12 hours
        const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
        const filtered = parsed.filter((d: DownloadItem) => d.timestamp > twelveHoursAgo);
        setDownloads(filtered);
        // Save filtered list back
        localStorage.setItem('downloadHistory', JSON.stringify(filtered));
      }
    } catch (error) {
      console.error('Failed to load downloads:', error);
    }
  };

  const handleClearAll = () => {
    setDownloads([]);
    localStorage.removeItem('downloadHistory');
  };

  const handleRemove = (id: string) => {
    const updated = downloads.filter(d => d.id !== id);
    setDownloads(updated);
    localStorage.setItem('downloadHistory', JSON.stringify(updated));
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-[600px] max-h-[600px] flex flex-col rounded-xl border shadow-2xl"
        style={{
          backgroundColor: '#232321',
          borderColor: '#4c4c4c',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#3c3c3c' }}>
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-blue-500" />
            <div>
              <h3 className="text-lg font-semibold text-white">Downloads</h3>
              <p className="text-xs text-gray-400">Last 12 hours</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {downloads.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white hover:bg-[#3c3c3c] transition-colors"
              >
                Clear All
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#3c3c3c]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Downloads List */}
        <div className="flex-1 overflow-auto p-4">
          {downloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Download className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-sm">No downloads yet</p>
              <p className="text-xs text-gray-500 mt-1">Downloads will appear here for 12 hours</p>
            </div>
          ) : (
            <div className="space-y-2">
              {downloads.map((download) => (
                <div
                  key={download.id}
                  className="p-4 rounded-lg border"
                  style={{
                    backgroundColor: '#1b1b1a',
                    borderColor: '#3c3c3c',
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* File Icon */}
                    <div className="flex-shrink-0">
                      <FileJson className="w-10 h-10 text-blue-500" />
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{download.filename}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {download.size} • {formatTime(download.timestamp)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemove(download.id)}
                          className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-[#3c3c3c]"
                          title="Remove from history"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Progress Bar (if downloading) */}
                      {download.status === 'downloading' && (
                        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${download.progress}%` }}
                          />
                        </div>
                      )}

                      {/* Status */}
                      <div className="flex items-center gap-2">
                        {download.status === 'completed' && (
                          <>
                            <span className="text-xs text-green-400">✓ Complete</span>
                            <button
                              className="text-xs text-blue-400 hover:underline"
                              onClick={() => {
                                // Open downloads folder
                                if ((window as any).electronAPI) {
                                  (window as any).electronAPI.openDownloadsFolder();
                                }
                              }}
                            >
                              Show in folder
                            </button>
                          </>
                        )}
                        {download.status === 'downloading' && (
                          <span className="text-xs text-blue-400">↓ Downloading... {download.progress}%</span>
                        )}
                        {download.status === 'failed' && (
                          <span className="text-xs text-red-400">✗ Failed</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t text-center" style={{ borderColor: '#3c3c3c' }}>
          <p className="text-xs text-gray-500">
            Downloads are automatically cleared after 12 hours
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper function to add download to history (call this from SpaceMailSidebar)
export function addDownloadToHistory(filename: string, size: string) {
  try {
    const stored = localStorage.getItem('downloadHistory');
    const downloads = stored ? JSON.parse(stored) : [];

    const newDownload: DownloadItem = {
      id: Date.now().toString(),
      filename,
      size,
      timestamp: Date.now(),
      progress: 100,
      status: 'completed'
    };

    downloads.unshift(newDownload);
    localStorage.setItem('downloadHistory', JSON.stringify(downloads));
  } catch (error) {
    console.error('Failed to save download:', error);
  }
}
