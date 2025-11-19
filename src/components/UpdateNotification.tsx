import { useState, useEffect } from 'react';
import { Download, RefreshCw, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    autoUpdate: {
      check(): Promise<{ success: boolean; updateInfo?: any; error?: string }>;
      download(): Promise<{ success: boolean; error?: string }>;
      install(): Promise<{ success: boolean; error?: string }>;
      onStatus(callback: (status: any) => void): () => void;
      getVersion(): Promise<{ version: string }>;
    };
  }
}

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  error?: string;
  releaseNotes?: string;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

export function UpdateNotification() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Get current version
    if (window.autoUpdate) {
      window.autoUpdate.getVersion().then(({ version }) => {
        setCurrentVersion(version);
      });

      // Listen for update status changes
      const cleanup = window.autoUpdate.onStatus((status: UpdateStatus) => {
        setUpdateStatus(status);

        // Show notification when update is available or downloaded
        if (status.status === 'available' || status.status === 'downloaded' || status.status === 'downloading') {
          setIsVisible(true);
          setIsDismissed(false);
        }
      });

      return cleanup;
    }
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.autoUpdate) return;
    setUpdateStatus({ status: 'checking' });
    setIsVisible(true);
    await window.autoUpdate.check();
  };

  const handleDownload = async () => {
    if (!window.autoUpdate) return;
    await window.autoUpdate.download();
  };

  const handleInstall = async () => {
    if (!window.autoUpdate) return;
    await window.autoUpdate.install();
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Don't render if no autoUpdate API (development mode)
  if (!window.autoUpdate) {
    return null;
  }

  // Don't show if dismissed and not downloading/downloaded
  if (isDismissed && updateStatus?.status !== 'downloading' && updateStatus?.status !== 'downloaded') {
    return null;
  }

  // Don't show if not visible
  if (!isVisible && updateStatus?.status !== 'available' && updateStatus?.status !== 'downloaded') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      {/* Update Available Notification */}
      {updateStatus?.status === 'available' && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-2xl p-4 text-white animate-slide-up">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              <span className="font-semibold">Update Available</span>
            </div>
            <button
              onClick={handleDismiss}
              className="text-white/70 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm mb-3 text-white/90">
            Version {updateStatus.version} is available. You're currently on v{currentVersion}.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 bg-white text-blue-600 font-medium py-2 px-4 rounded-md hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Now
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-white/80 hover:text-white transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Downloading Progress */}
      {updateStatus?.status === 'downloading' && (
        <div className="bg-gradient-to-r from-yellow-600 to-orange-600 rounded-lg shadow-2xl p-4 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-semibold">Downloading Update...</span>
          </div>
          <div className="mb-2">
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="bg-white rounded-full h-2 transition-all duration-300"
                style={{ width: `${updateStatus.percent || 0}%` }}
              />
            </div>
          </div>
          <div className="flex justify-between text-xs text-white/80">
            <span>{updateStatus.percent || 0}%</span>
            {updateStatus.bytesPerSecond && (
              <span>{formatBytes(updateStatus.bytesPerSecond)}/s</span>
            )}
          </div>
        </div>
      )}

      {/* Update Downloaded - Ready to Install */}
      {updateStatus?.status === 'downloaded' && (
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg shadow-2xl p-4 text-white animate-slide-up">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">Update Ready!</span>
            </div>
            <button
              onClick={handleDismiss}
              className="text-white/70 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm mb-3 text-white/90">
            Version {updateStatus.version} has been downloaded. Restart to apply the update.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleInstall}
              className="flex-1 bg-white text-green-600 font-medium py-2 px-4 rounded-md hover:bg-green-50 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Restart & Update
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-white/80 hover:text-white transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {updateStatus?.status === 'error' && (
        <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-lg shadow-2xl p-4 text-white animate-slide-up">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span className="font-semibold">Update Error</span>
            </div>
            <button
              onClick={handleDismiss}
              className="text-white/70 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm mb-3 text-white/90">
            {updateStatus.error || 'Failed to check for updates'}
          </p>
          <button
            onClick={handleCheckForUpdates}
            className="w-full bg-white text-red-600 font-medium py-2 px-4 rounded-md hover:bg-red-50 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Checking State */}
      {updateStatus?.status === 'checking' && (
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 rounded-lg shadow-2xl p-4 text-white">
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-medium">Checking for updates...</span>
          </div>
        </div>
      )}

      {/* No Update Available */}
      {updateStatus?.status === 'not-available' && isVisible && (
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 rounded-lg shadow-2xl p-4 text-white animate-slide-up">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="font-medium">You're up to date!</span>
            </div>
            <button
              onClick={() => setIsVisible(false)}
              className="text-white/70 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-white/70 mt-1">
            Version {currentVersion}
          </p>
        </div>
      )}
    </div>
  );
}
