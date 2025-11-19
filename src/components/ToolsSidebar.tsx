/**
 * Tools Sidebar - Main sidebar with tabs for all tools
 *
 * Features:
 * - YouTube Video Extractor
 * - SpaceMail Password Manager
 * - cPanel CRUD Operations (Create/Update/Delete)
 */

import { useState, useEffect, RefObject } from 'react';
import {
  X,
  Youtube,
  Mail,
  Server,
  RefreshCw,
  Copy,
  Check,
  Key,
  UserPlus,
  UserMinus,
  Loader2,
  ChevronDown,
  ChevronRight,
  Download,
  Shield,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { WebViewRef } from '../types';
import SpaceMailSidebar from './SpaceMailSidebar';

interface ToolsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  webviewRef: RefObject<WebViewRef>;
  currentURL: string;
}

type TabType = 'youtube' | 'spacemail' | 'cpanel';

interface YouTubeVideo {
  index: number;
  title: string;
  href: string;
  duration: string | null;
  channel: string | null;
}

interface PasswordEntry {
  email: string;
  password: string;
  timestamp: string;
  status: 'success' | 'failed';
}

interface OperationLog {
  id: number;
  action: 'create' | 'update' | 'delete';
  target: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  timestamp: Date;
}

export default function ToolsSidebar({
  isOpen,
  onClose,
  webviewRef,
  currentURL,
}: ToolsSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('youtube');

  // YouTube state
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [isExtractingVideos, setIsExtractingVideos] = useState(false);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // SpaceMail state - removed (now using SpaceMailSidebar component)

  // cPanel state
  const [cpanelAction, setCpanelAction] = useState<'create' | 'update' | 'delete'>('create');
  const [cpanelInput, setCpanelInput] = useState('');
  const [isProcessingCpanel, setIsProcessingCpanel] = useState(false);
  const [cpanelPasswords, setCpanelPasswords] = useState<PasswordEntry[]>([]);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [logIdCounter, setLogIdCounter] = useState(0);

  // Helper to add operation log
  const addOperationLog = (action: 'create' | 'update' | 'delete', target: string, status: 'success' | 'error' | 'warning', message: string) => {
    setLogIdCounter(prev => prev + 1);
    const newLog: OperationLog = {
      id: logIdCounter + 1,
      action,
      target,
      status,
      message,
      timestamp: new Date(),
    };
    setOperationLogs(prev => [newLog, ...prev].slice(0, 50)); // Keep last 50 logs
  };

  // Auto-detect tab based on URL
  useEffect(() => {
    if (!currentURL) return;
    if (currentURL.includes('youtube.com')) {
      setActiveTab('youtube');
    } else if (currentURL.includes('spacemail') || currentURL.includes('spaceship')) {
      setActiveTab('spacemail');
    } else if (currentURL.includes('cpanel') || currentURL.includes(':2083')) {
      setActiveTab('cpanel');
    }
  }, [currentURL]);

  // ==================== YouTube Functions ====================
  const handleExtractVideos = async () => {
    setIsExtractingVideos(true);
    setVideos([]);
    setSelectedVideoIndex(null);

    try {
      const webview = webviewRef.current;
      if (!webview) {
        alert('Webview not found');
        return;
      }

      const result = await webview.executeJavaScript(`
        (function() {
          const videos = [];
          const containers = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer');
          let index = 0;

          containers.forEach((container) => {
            const titleEl = container.querySelector('#video-title');
            const title = titleEl?.textContent?.trim();
            const href = titleEl?.closest('a')?.href || container.querySelector('a#thumbnail')?.href;
            const durationEl = container.querySelector('.ytd-thumbnail-overlay-time-status-renderer');
            const duration = durationEl?.textContent?.trim() || null;
            const channelEl = container.querySelector('ytd-channel-name a, .ytd-channel-name');
            const channel = channelEl?.textContent?.trim() || null;

            if (title && href && !container.closest('ytd-rich-shelf-renderer')) {
              index++;
              videos.push({ index, title, href, duration, channel });
            }
          });

          return videos;
        })()
      `);

      setVideos(result || []);
      console.log(`[YouTube] Extracted ${result?.length || 0} videos`);
    } catch (error) {
      console.error('YouTube extraction failed:', error);
      alert('Failed to extract videos. Make sure you are on YouTube.');
    } finally {
      setIsExtractingVideos(false);
    }
  };

  const handleHighlightVideo = async (index: number) => {
    setSelectedVideoIndex(index);
    try {
      const webview = webviewRef.current;
      if (!webview) return;

      await webview.executeJavaScript(`
        (function() {
          document.querySelectorAll('[data-yt-highlight]').forEach(el => {
            el.style.outline = '';
            el.removeAttribute('data-yt-highlight');
          });

          const containers = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer');
          let count = 0;
          for (const container of containers) {
            const titleEl = container.querySelector('#video-title');
            if (titleEl && !container.closest('ytd-rich-shelf-renderer')) {
              count++;
              if (count === ${index}) {
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                container.style.outline = '4px solid #f59e0b';
                container.setAttribute('data-yt-highlight', 'true');
                break;
              }
            }
          }
        })()
      `);
    } catch (error) {
      console.error('Failed to highlight video:', error);
    }
  };

  const handleCopyVideoLink = (index: number, href: string) => {
    navigator.clipboard.writeText(href);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // ==================== SpaceMail Functions ====================
  // SpaceMail now uses dedicated SpaceMailSidebar component with full functionality

  // ==================== cPanel Functions ====================
  // Note: Logs are now automatically saved to database via IPC handlers
  // They can be viewed in Settings > Activity Logs

  // Format and validate email username input
  const formatNameToEmail = (input: string): string => {
    // If already contains @, extract username part only
    if (input.includes('@')) {
      return input.split('@')[0].toLowerCase().trim();
    }

    // Convert "Pawan Ojha" -> "pawan.ojha"
    return input
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '.')          // Replace spaces with dots
      .replace(/\.{2,}/g, '.')        // Replace multiple dots with single dot
      .replace(/[^a-z0-9._-]/g, '')   // Remove invalid characters
      .replace(/^\.+|\.+$/g, '');     // Remove leading/trailing dots
  };

  // Check if email account exists
  const checkEmailExists = async (emailUser: string): Promise<{ exists: boolean; data?: any; error?: string }> => {
    try {
      const response = await (window as any).ipcRenderer?.invoke('cpanel:check-email', emailUser);
      return response;
    } catch (error: any) {
      return { exists: false, error: error.message };
    }
  };

  const generatePassword = (): string => {
    const length = 16;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()-_=+[]{}';
    const allChars = uppercase + lowercase + numbers + special;

    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  const handleCpanelCreate = async () => {
    if (!cpanelInput.trim()) return;

    setIsProcessingCpanel(true);
    const lines = cpanelInput.split('\n').map(l => l.trim()).filter(l => l);

    for (const line of lines) {
      const formatted = formatNameToEmail(line);
      if (!formatted) continue;

      try {
        const response = await (window as any).ipcRenderer?.invoke('cpanel:create-account', formatted);

        if (response?.success) {
          setCpanelPasswords(prev => [...prev, {
            email: response.email,
            password: response.password,
            timestamp: new Date().toISOString(),
            status: 'success'
          }]);
          addOperationLog('create', response.email, 'success', 'Account created successfully');
        } else if (response?.error?.includes('already exists')) {
          addOperationLog('create', formatted, 'warning', 'Account already exists');
        } else {
          addOperationLog('create', formatted, 'error', response?.message || 'Failed to create account');
        }
      } catch (error: any) {
        console.error('[cPanel Create]', error);
        addOperationLog('create', formatted, 'error', error.message || 'Operation failed');
      }

      if (lines.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsProcessingCpanel(false);
    setCpanelInput('');
  };

  const handleCpanelUpdate = async () => {
    if (!cpanelInput.trim()) return;

    setIsProcessingCpanel(true);
    const lines = cpanelInput.split('\n').map(l => l.trim()).filter(l => l);

    for (const line of lines) {
      const formatted = formatNameToEmail(line);
      if (!formatted) continue;

      try {
        const response = await (window as any).ipcRenderer?.invoke('cpanel:update-password', formatted);

        if (response?.success) {
          setCpanelPasswords(prev => [...prev, {
            email: response.email,
            password: response.password,
            timestamp: new Date().toISOString(),
            status: 'success'
          }]);
          addOperationLog('update', response.email, 'success', 'Password updated successfully');
        } else if (response?.error?.includes('not found')) {
          addOperationLog('update', formatted, 'warning', 'Account not found');
        } else {
          addOperationLog('update', formatted, 'error', response?.message || 'Failed to update password');
        }
      } catch (error: any) {
        console.error('[cPanel Update]', error);
        addOperationLog('update', formatted, 'error', error.message || 'Operation failed');
      }

      if (lines.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsProcessingCpanel(false);
    setCpanelInput('');
  };

  const handleCpanelDelete = async () => {
    if (!cpanelInput.trim()) return;

    setIsProcessingCpanel(true);
    const lines = cpanelInput.split('\n').map(l => l.trim()).filter(l => l);

    for (const line of lines) {
      const formatted = formatNameToEmail(line);
      if (!formatted) continue;

      try {
        const response = await (window as any).ipcRenderer?.invoke('cpanel:delete-account', formatted);

        if (response?.success) {
          addOperationLog('delete', formatted, 'success', 'Account deleted successfully');
        } else if (response?.error?.includes('not found')) {
          addOperationLog('delete', formatted, 'warning', 'Account not found');
        } else {
          addOperationLog('delete', formatted, 'error', response?.message || 'Failed to delete account');
        }
      } catch (error: any) {
        console.error('[cPanel Delete]', error);
        addOperationLog('delete', formatted, 'error', error.message || 'Operation failed');
      }

      if (lines.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsProcessingCpanel(false);
    setCpanelInput('');
  };

  const handleDownloadCpanelPasswords = () => {
    if (cpanelPasswords.length === 0) return;

    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      entries: cpanelPasswords,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cpanel_passwords_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!isOpen) return null;

  return (
    <div
      className="w-80 flex flex-col text-gray-300"
      style={{ backgroundColor: '#1a1a18', borderLeft: '1px solid #3c3c3c', height: '100%' }}
    >
      {/* Premium Minimal Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: '#232321', borderBottom: '1px solid #3c3c3c' }}>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
          <h3 className="font-medium text-white/90 text-xs tracking-[0.2em] uppercase">Tools</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-gray-500 hover:text-white/80 hover:bg-[#3c3c3c] transition-colors duration-200"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Clean Minimal Tabs */}
      <div className="px-3 py-3" style={{ backgroundColor: '#1f1f1d' }}>
        <div className="flex rounded-lg p-1" style={{ backgroundColor: '#2a2a28' }}>
          <button
            onClick={() => setActiveTab('youtube')}
            className={`group flex-1 relative flex items-center justify-center gap-2 px-3 py-2 rounded-md font-medium transition-all duration-200 ${
              activeTab === 'youtube'
                ? 'bg-orange-500/20 text-orange-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#3c3c3c]'
            }`}
          >
            <Youtube className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">YouTube</span>
          </button>

          <button
            onClick={() => setActiveTab('spacemail')}
            className={`group flex-1 relative flex items-center justify-center gap-2 px-3 py-2 rounded-md font-medium transition-all duration-200 ${
              activeTab === 'spacemail'
                ? 'bg-orange-500/20 text-orange-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#3c3c3c]'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">Mail</span>
          </button>

          <button
            onClick={() => setActiveTab('cpanel')}
            className={`group flex-1 relative flex items-center justify-center gap-2 px-3 py-2 rounded-md font-medium transition-all duration-200 ${
              activeTab === 'cpanel'
                ? 'bg-orange-500/20 text-orange-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#3c3c3c]'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">cPanel</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* YouTube Tab */}
        {activeTab === 'youtube' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3">
              <button
                onClick={handleExtractVideos}
                disabled={isExtractingVideos}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] disabled:bg-white/[0.04] disabled:text-gray-500 text-white/90 text-xs font-medium transition-colors duration-200"
              >
                {isExtractingVideos ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Youtube className="w-3.5 h-3.5" />
                    Extract Videos
                  </>
                )}
              </button>
              {videos.length > 0 && (
                <p className="text-[10px] text-gray-500 mt-2 text-center font-medium">
                  {videos.length} videos found
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-1.5">
              {videos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
                    <Youtube className="w-5 h-5 text-gray-600" />
                  </div>
                  <p className="text-gray-500 text-xs font-medium">No videos extracted</p>
                  <p className="text-gray-600 text-[10px] mt-1">Navigate to YouTube and extract</p>
                </div>
              ) : (
                videos.map((video) => (
                  <div
                    key={video.index}
                    className={`group p-3 rounded-lg bg-white/[0.02] border transition-all duration-200 cursor-pointer ${
                      selectedVideoIndex === video.index
                        ? 'border-white/20 bg-white/[0.05]'
                        : 'border-transparent hover:border-white/10 hover:bg-white/[0.04]'
                    }`}
                    onClick={() => handleHighlightVideo(video.index)}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-[10px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded font-mono shrink-0">
                        {video.index}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-white/90 font-medium line-clamp-2 leading-relaxed">{video.title}</p>
                        {video.channel && (
                          <p className="text-[10px] text-gray-500 truncate mt-1">{video.channel}</p>
                        )}
                        {video.duration && (
                          <p className="text-[10px] text-gray-600 mt-0.5">{video.duration}</p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyVideoLink(video.index, video.href);
                        }}
                        className="p-1.5 rounded-md hover:bg-white/10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      >
                        {copiedIndex === video.index ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SpaceMail Tab */}
        {activeTab === 'spacemail' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <SpaceMailSidebar isOpen={true} onClose={() => {}} embedded={true} />
          </div>
        )}

        {/* cPanel Tab */}
        {activeTab === 'cpanel' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Buttons */}
            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setCpanelAction('create')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-[10px] font-medium transition-all duration-200 ${
                    cpanelAction === 'create'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] border border-transparent'
                  }`}
                >
                  <UserPlus className="w-3 h-3" />
                  Create
                </button>
                <button
                  onClick={() => setCpanelAction('update')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-[10px] font-medium transition-all duration-200 ${
                    cpanelAction === 'update'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      : 'bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] border border-transparent'
                  }`}
                >
                  <Key className="w-3 h-3" />
                  Update
                </button>
                <button
                  onClick={() => setCpanelAction('delete')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-[10px] font-medium transition-all duration-200 ${
                    cpanelAction === 'delete'
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      : 'bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] border border-transparent'
                  }`}
                >
                  <UserMinus className="w-3 h-3" />
                  Delete
                </button>
              </div>

              <textarea
                value={cpanelInput}
                onChange={(e) => setCpanelInput(e.target.value)}
                placeholder="Enter email or name (one per line)"
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.06] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] resize-none font-mono transition-all duration-200 cpanel-input-scroll"
                disabled={isProcessingCpanel}
              />

              <button
                onClick={() => {
                  if (cpanelAction === 'create') handleCpanelCreate();
                  else if (cpanelAction === 'update') handleCpanelUpdate();
                  else handleCpanelDelete();
                }}
                disabled={isProcessingCpanel || !cpanelInput.trim()}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white/90 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 ${
                  cpanelAction === 'create'
                    ? 'bg-emerald-600/80 hover:bg-emerald-600'
                    : cpanelAction === 'update'
                    ? 'bg-amber-600/80 hover:bg-amber-600'
                    : 'bg-rose-600/80 hover:bg-rose-600'
                }`}
              >
                {isProcessingCpanel ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Processing...
                  </>
                ) : cpanelAction === 'create' ? (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    Create Account
                  </>
                ) : cpanelAction === 'update' ? (
                  <>
                    <Key className="w-3.5 h-3.5" />
                    Reset Password
                  </>
                ) : (
                  <>
                    <UserMinus className="w-3.5 h-3.5" />
                    Delete Account
                  </>
                )}
              </button>
            </div>

            {/* Mini Activity Log */}
            {operationLogs.length > 0 && (
              <div className="px-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-orange-400" />
                    <span className="text-[9px] font-medium text-gray-500 uppercase tracking-wider">Recent Activity</span>
                  </div>
                  <button
                    onClick={() => setOperationLogs([])}
                    className="text-[9px] text-gray-600 hover:text-gray-400"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                  {operationLogs.slice(0, 10).map((log) => (
                    <div
                      key={log.id}
                      className={`flex items-start gap-2 p-2 rounded-md text-[10px] ${
                        log.status === 'success'
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : log.status === 'warning'
                          ? 'bg-amber-500/10 border border-amber-500/20'
                          : 'bg-rose-500/10 border border-rose-500/20'
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : log.status === 'warning' ? (
                          <AlertCircle className="w-3 h-3 text-amber-400" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                            log.action === 'create'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : log.action === 'update'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {log.action}
                          </span>
                          <span className="text-gray-500 text-[8px]">
                            {log.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-gray-300 font-mono truncate">{log.target}</div>
                        <div className={`text-[9px] mt-0.5 ${
                          log.status === 'success'
                            ? 'text-emerald-400'
                            : log.status === 'warning'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}>
                          {log.message}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Password List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
              {cpanelPasswords.length === 0 && operationLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
                    <Server className="w-5 h-5 text-gray-600" />
                  </div>
                  <p className="text-gray-500 text-xs font-medium">No credentials yet</p>
                  <p className="text-gray-600 text-[10px] mt-1">
                    Create or update accounts to see results
                  </p>
                </div>
              ) : cpanelPasswords.length > 0 && (
                <div className="space-y-2">
                  {/* Download Button */}
                  <button
                    onClick={handleDownloadCpanelPasswords}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-white/80 text-[11px] font-medium transition-colors duration-200 mb-3"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export {cpanelPasswords.length} credential{cpanelPasswords.length !== 1 ? 's' : ''}
                  </button>

                  {/* Password Cards */}
                  {cpanelPasswords.map((entry, idx) => (
                    <div
                      key={idx}
                      className="group p-3 rounded-lg bg-white/[0.02] border border-transparent hover:border-white/10 transition-all duration-200 space-y-2"
                    >
                      {/* Email */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[9px] text-gray-600 font-medium uppercase tracking-wider mb-1">Email</div>
                          <div className="text-[11px] text-gray-300 font-mono truncate">{entry.email}</div>
                        </div>
                        <button
                          onClick={() => copyToClipboard(entry.email)}
                          className="p-1.5 rounded-md hover:bg-white/10 text-gray-500 hover:text-white/80 transition-colors duration-200 opacity-0 group-hover:opacity-100"
                          title="Copy email"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Password */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[9px] text-gray-600 font-medium uppercase tracking-wider mb-1">Password</div>
                          <div className="text-[11px] text-gray-300 font-mono truncate">{entry.password}</div>
                        </div>
                        <button
                          onClick={() => copyToClipboard(entry.password)}
                          className="p-1.5 rounded-md hover:bg-white/10 text-gray-500 hover:text-white/80 transition-colors duration-200 opacity-0 group-hover:opacity-100"
                          title="Copy password"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Timestamp */}
                      <div className="text-[9px] text-gray-600 font-mono pt-2 border-t border-white/[0.04]">
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar,
        .cpanel-input-scroll::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track,
        .cpanel-input-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb,
        .cpanel-input-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover,
        .cpanel-input-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
