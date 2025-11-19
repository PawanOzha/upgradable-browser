import { useEffect, useState } from 'react';
import { RefreshCw, Trash2, Calendar, CheckCircle2, XCircle, Clock, Filter, ChevronDown } from 'lucide-react';
import * as activityLogService from '../services/activityLogService';
import type { ActivityLog } from '../services/activityLogService';

interface BookmarkItem {
  id: number;
  title: string;
  url: string;
  created_at: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (url: string) => void;
}

type SettingsTab = 'bookmarks' | 'activity-logs';

// Group logs by date
function groupLogsByDate(logs: ActivityLog[]): Map<string, ActivityLog[]> {
  const grouped = new Map<string, ActivityLog[]>();

  logs.forEach(log => {
    if (!log.timestamp) return;

    const date = new Date(log.timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dateKey: string;
    if (date.toDateString() === today.toDateString()) {
      dateKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = 'Yesterday';
    } else {
      dateKey = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
      });
    }

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(log);
  });

  return grouped;
}

// Format time from timestamp
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Get relative time
function getRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatTime(timestamp);
}

export default function SettingsModal({ isOpen, onClose, onNavigate }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('bookmarks');
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Activity logs state
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [filterService, setFilterService] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await (window as any).bookmarks?.getAll?.();
      if (res?.success) {
        setBookmarks(res.bookmarks || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const result = await activityLogService.getActivityLogs();
      if (result.success && result.logs) {
        setLogs(result.logs);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleClearLogs = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to permanently delete all activity logs?\n\nThis action cannot be undone.'
    );

    if (!confirmed) return;

    setIsClearing(true);
    try {
      const result = await activityLogService.clearActivityLogs();
      if (result.success) {
        setLogs([]);
      } else if (result.error) {
        alert(`Failed to clear logs: ${result.error}`);
      }
    } catch (error: any) {
      console.error('Failed to clear logs:', error);
      alert(`Failed to clear logs: ${error.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      load();
      loadLogs();

      // Auto-refresh logs every 5 seconds
      const interval = setInterval(() => {
        if (activeTab === 'activity-logs') {
          loadLogs();
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [isOpen, activeTab]);

  const handleRemove = async (url: string) => {
    const res = await (window as any).bookmarks?.remove?.(url);
    if (res?.success) {
      setBookmarks(prev => prev.filter(b => b.url !== url));
    }
  };

  if (!isOpen) return null;

  // Apply filters
  const filteredLogs = logs.filter(log => {
    if (filterService !== 'all' && log.service !== filterService) return false;
    if (filterStatus !== 'all' && log.status !== filterStatus) return false;
    return true;
  });

  const groupedLogs = groupLogsByDate(filteredLogs);
  const successCount = filteredLogs.filter(l => l.status === 'success').length;
  const errorCount = filteredLogs.filter(l => l.status === 'error').length;

  return (
    <div className="fixed inset-0 z-[10000] flex" style={{ backgroundColor: '#141413' }}>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-4" style={{ backgroundColor: '#232321', borderBottom: '1px solid #3c3c3c' }}>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
          <div className="text-white/90 font-medium text-sm tracking-wide">Settings</div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white/80 text-sm font-medium transition-colors">Close</button>
      </div>

      {/* Body */}
      <div className="flex w-full pt-12">
        {/* Left nav (tabs) */}
        <div className="w-56 border-r p-4" style={{ borderColor: '#3c3c3c', backgroundColor: '#1a1a18' }}>
          <div className="text-[10px] uppercase text-gray-500 font-medium tracking-wider mb-3">Sections</div>
          <div className="space-y-1">
            <button
              onClick={() => setActiveTab('bookmarks')}
              className={`w-full text-left text-xs px-3 py-2.5 rounded-lg transition-all ${
                activeTab === 'bookmarks'
                  ? 'bg-orange-500/20 text-orange-400 font-semibold'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2a28]'
              }`}
            >
              Bookmarks
            </button>
            <button
              onClick={() => setActiveTab('activity-logs')}
              className={`w-full text-left text-xs px-3 py-2.5 rounded-lg transition-all ${
                activeTab === 'activity-logs'
                  ? 'bg-orange-500/20 text-orange-400 font-semibold'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2a28]'
              }`}
            >
              Activity Logs
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Bookmarks Tab */}
          {activeTab === 'bookmarks' && (
            <div className="p-6 overflow-auto" style={{ backgroundColor: '#1f1f1d' }}>
              <div className="text-white/90 font-medium text-sm mb-4">Bookmarks</div>
              {loading ? (
                <div className="text-gray-500 text-xs">Loading...</div>
              ) : bookmarks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#2a2a28' }}>
                    <Calendar className="w-5 h-5 text-gray-600" />
                  </div>
                  <p className="text-gray-500 text-xs font-medium">No bookmarks yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {bookmarks.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-lg hover:border-orange-500/30 transition-all" style={{ backgroundColor: '#2a2a28', border: '1px solid #3c3c3c' }}>
                      <div className="min-w-0 mr-3">
                        <div className="text-gray-200 text-xs font-medium truncate">{b.title}</div>
                        <div className="text-gray-600 text-[10px] truncate">{b.url}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { onNavigate(b.url); onClose(); }}
                          className="text-gray-400 text-[10px] px-2.5 py-1.5 rounded-md hover:bg-[#3c3c3c] transition-colors"
                          style={{ backgroundColor: '#1a1a18', border: '1px solid #3c3c3c' }}
                        >
                          Open
                        </button>
                        <button
                          onClick={() => handleRemove(b.url)}
                          className="text-rose-400 text-[10px] px-2.5 py-1.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activity Logs Tab */}
          {activeTab === 'activity-logs' && (
            <div className="flex flex-col h-full" style={{ backgroundColor: '#1f1f1d' }}>
              {/* Header */}
              <div className="px-6 py-4" style={{ backgroundColor: '#232321', borderBottom: '1px solid #3c3c3c' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/20 rounded-lg">
                      <Calendar className="w-4 h-4 text-orange-400" />
                    </div>
                    <div>
                      <h3 className="text-white/90 font-semibold text-sm">Activity Logs</h3>
                      <p className="text-gray-600 text-[10px]">Track all operations</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadLogs}
                      disabled={isLoadingLogs}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-[#3c3c3c] text-gray-400 hover:text-white/80 text-[10px] font-medium transition-colors disabled:opacity-50"
                      style={{ backgroundColor: '#2a2a28', border: '1px solid #3c3c3c' }}
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                    <button
                      onClick={handleClearLogs}
                      disabled={isClearing || logs.length === 0}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Stats Bar */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
                    <span className="text-[10px] font-medium text-gray-400">{filteredLogs.length} Total</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] font-medium text-emerald-500">{successCount} Success</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-3 h-3 text-rose-500" />
                    <span className="text-[10px] font-medium text-rose-500">{errorCount} Errors</span>
                  </div>

                  <div className="flex-1"></div>

                  {/* Filters Toggle */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-[10px] font-medium transition-colors"
                  >
                    <Filter className="w-3 h-3" />
                    Filters
                    <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Filters Panel */}
                {showFilters && (
                  <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid #3c3c3c' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-medium text-gray-500 uppercase tracking-wider">Service:</span>
                      <select
                        value={filterService}
                        onChange={(e) => setFilterService(e.target.value)}
                        className="px-2 py-1 rounded-md text-[10px] text-gray-300 focus:outline-none focus:border-orange-500/50"
                        style={{ backgroundColor: '#2a2a28', border: '1px solid #3c3c3c' }}
                      >
                        <option value="all">All</option>
                        <option value="cpanel">cPanel</option>
                        <option value="spacemail">SpaceMail</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-medium text-gray-500 uppercase tracking-wider">Status:</span>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-2 py-1 rounded-md text-[10px] text-gray-300 focus:outline-none focus:border-orange-500/50"
                        style={{ backgroundColor: '#2a2a28', border: '1px solid #3c3c3c' }}
                      >
                        <option value="all">All</option>
                        <option value="success">Success</option>
                        <option value="error">Error</option>
                      </select>
                    </div>
                    <button
                      onClick={() => { setFilterService('all'); setFilterStatus('all'); }}
                      className="text-[9px] text-orange-400 hover:text-orange-300 font-medium"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>

              {/* Logs Content */}
              <div className="flex-1 overflow-y-auto activity-logs-scroll p-4">
                {isLoadingLogs && logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <RefreshCw className="w-8 h-8 text-orange-400 animate-spin mb-3" />
                    <p className="text-gray-500 text-xs font-medium">Loading logs...</p>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
                      <Calendar className="w-8 h-8 text-orange-400/50" />
                    </div>
                    <p className="text-gray-400 text-sm font-medium mb-1">No Activity Yet</p>
                    <p className="text-gray-600 text-xs">Operations will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Array.from(groupedLogs.entries()).map(([date, dateLogs]) => (
                      <div key={date}>
                        {/* Date Header */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="p-1 bg-orange-500/20 rounded">
                            <Calendar className="w-3 h-3 text-orange-400" />
                          </div>
                          <h3 className="text-sm font-bold text-white/90">{date}</h3>
                          <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 text-[10px] font-semibold">
                            {dateLogs.length}
                          </span>
                          <div className="flex-1 h-px" style={{ backgroundColor: '#3c3c3c' }}></div>
                        </div>

                        {/* Logs */}
                        <div className="space-y-2 pl-1">
                          {dateLogs.map((log) => (
                            <div
                              key={log.id}
                              className="flex items-start gap-3 p-3 rounded-lg hover:border-orange-500/30 transition-all"
                              style={{ backgroundColor: '#2a2a28', border: '1px solid #3c3c3c' }}
                            >
                              {/* Status Icon */}
                              <div className={`flex-shrink-0 p-1.5 rounded-md ${
                                log.status === 'success'
                                  ? 'bg-emerald-500/15'
                                  : 'bg-rose-500/15'
                              }`}>
                                {log.status === 'success' ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-rose-500" />
                                )}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                  {/* Service Badge */}
                                  <span
                                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                      log.service === 'cpanel'
                                        ? 'bg-orange-500/15 text-orange-400'
                                        : 'bg-blue-500/15 text-blue-400'
                                    }`}
                                  >
                                    {log.service}
                                  </span>

                                  {/* Action Badge */}
                                  <span
                                    className={`px-2 py-0.5 rounded text-[9px] font-semibold ${
                                      log.action_type === 'create'
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : log.action_type === 'delete'
                                        ? 'bg-rose-500/15 text-rose-400'
                                        : log.action_type === 'update' || log.action_type === 'password_change'
                                        ? 'bg-amber-500/15 text-amber-400'
                                        : 'bg-gray-500/15 text-gray-400'
                                    }`}
                                  >
                                    {log.action_type === 'password_change' ? 'password' : log.action_type}
                                  </span>
                                </div>

                                {/* Target */}
                                {log.target && (
                                  <div className="text-[11px] font-medium text-gray-200 mb-1 font-mono bg-white/[0.03] px-2 py-1 rounded inline-block">
                                    {log.target}
                                  </div>
                                )}

                                {/* Details */}
                                {log.details && (
                                  <p className="text-[10px] text-gray-500 mt-1">{log.details}</p>
                                )}
                              </div>

                              {/* Time */}
                              <div className="flex-shrink-0 text-right">
                                <div className="flex items-center gap-1 text-gray-500">
                                  <Clock className="w-3 h-3" />
                                  <span className="text-[10px] font-medium">
                                    {log.timestamp && formatTime(log.timestamp)}
                                  </span>
                                </div>
                                <span className="text-[9px] text-gray-600">
                                  {log.timestamp && getRelativeTime(log.timestamp)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-2 flex items-center justify-between" style={{ backgroundColor: '#232321', borderTop: '1px solid #3c3c3c' }}>
                <span className="text-[9px] text-gray-600">Auto-refreshing every 5 seconds</span>
                {isLoadingLogs && (
                  <div className="flex items-center gap-1.5 text-orange-400">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span className="text-[9px] font-medium">Syncing...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .activity-logs-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .activity-logs-scroll::-webkit-scrollbar-track {
          background: #1a1a18;
        }
        .activity-logs-scroll::-webkit-scrollbar-thumb {
          background: #3c3c3c;
          border-radius: 3px;
        }
        .activity-logs-scroll::-webkit-scrollbar-thumb:hover {
          background: #f97316;
        }
      `}</style>
    </div>
  );
}
