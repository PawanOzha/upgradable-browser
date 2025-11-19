import { useState, useEffect } from 'react';
import { X, Trash2, RefreshCw, Calendar, CheckCircle2, XCircle, Clock, Filter, ChevronDown } from 'lucide-react';
import * as activityLogService from '../services/activityLogService';
import type { ActivityLog } from '../services/activityLogService';

interface ActivityLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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

export default function ActivityLogsModal({ isOpen, onClose }: ActivityLogsModalProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [filterService, setFilterService] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadLogs();

      // Auto-refresh every 5 seconds while modal is open
      const interval = setInterval(() => {
        loadLogs();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const result = await activityLogService.getActivityLogs();
      if (result.success && result.logs) {
        setLogs(result.logs);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setIsLoading(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-5xl h-[85vh] rounded-2xl overflow-hidden shadow-2xl bg-[#fafafa] flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-gradient-to-br from-orange-400 to-orange-500 rounded-xl shadow-lg shadow-orange-500/25">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Activity Logs</h2>
                <p className="text-sm text-gray-500">Track all your operations</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadLogs}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleClearLogs}
                disabled={isClearing || logs.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-400"></div>
              <span className="text-sm font-medium text-gray-700">{filteredLogs.length} Total</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-600">{successCount} Success</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium text-red-600">{errorCount} Errors</span>
            </div>

            <div className="flex-1"></div>

            {/* Filters Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-600 text-sm font-medium transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filters
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Service:</span>
                <select
                  value={filterService}
                  onChange={(e) => setFilterService(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                >
                  <option value="all">All Services</option>
                  <option value="cpanel">cPanel</option>
                  <option value="spacemail">SpaceMail</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                >
                  <option value="all">All Status</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <button
                onClick={() => { setFilterService('all'); setFilterStatus('all'); }}
                className="text-xs text-orange-600 hover:text-orange-700 font-medium"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50 activity-logs-scroll">
          {isLoading && logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <RefreshCw className="w-10 h-10 text-orange-400 animate-spin mb-4" />
              <p className="text-gray-500 font-medium">Loading activity logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-4">
                <Calendar className="w-10 h-10 text-orange-400" />
              </div>
              <p className="text-gray-700 font-semibold text-lg mb-1">No Activity Yet</p>
              <p className="text-gray-500 text-sm">Your operations will appear here</p>
            </div>
          ) : (
            <div className="p-6 space-y-8">
              {Array.from(groupedLogs.entries()).map(([date, dateLogs]) => (
                <div key={date}>
                  {/* Date Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-1.5 bg-orange-100 rounded-lg">
                      <Calendar className="w-4 h-4 text-orange-500" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{date}</h3>
                    <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-600 text-xs font-semibold">
                      {dateLogs.length} {dateLogs.length === 1 ? 'entry' : 'entries'}
                    </span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                  </div>

                  {/* Logs Timeline */}
                  <div className="space-y-3 pl-2">
                    {dateLogs.map((log) => (
                      <div
                        key={log.id}
                        className="relative flex items-start gap-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                      >
                        {/* Status Indicator */}
                        <div className={`flex-shrink-0 p-2 rounded-lg ${
                          log.status === 'success'
                            ? 'bg-emerald-100'
                            : 'bg-red-100'
                        }`}>
                          {log.status === 'success' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600" />
                          )}
                        </div>

                        {/* Log Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            {/* Service Badge */}
                            <span
                              className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                                log.service === 'cpanel'
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {log.service}
                            </span>

                            {/* Action Badge */}
                            <span
                              className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                                log.action_type === 'create'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : log.action_type === 'delete'
                                  ? 'bg-red-100 text-red-700'
                                  : log.action_type === 'update' || log.action_type === 'password_change'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {log.action_type === 'password_change' ? 'Password Reset' : log.action_type}
                            </span>

                            {/* Status Badge */}
                            <span
                              className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                                log.status === 'success'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {log.status}
                            </span>
                          </div>

                          {/* Target */}
                          {log.target && (
                            <div className="text-sm font-medium text-gray-900 mb-1 font-mono bg-gray-50 px-3 py-1.5 rounded-lg inline-block">
                              {log.target}
                            </div>
                          )}

                          {/* Details */}
                          {log.details && (
                            <p className="text-sm text-gray-600 mt-1">{log.details}</p>
                          )}
                        </div>

                        {/* Time */}
                        <div className="flex-shrink-0 text-right">
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">
                              {log.timestamp && formatTime(log.timestamp)}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-medium">
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
        <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Auto-refreshing every 5 seconds
          </div>
          <div className="flex items-center gap-2">
            {isLoading && (
              <div className="flex items-center gap-2 text-orange-600">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs font-medium">Syncing...</span>
              </div>
            )}
          </div>
        </div>

        {/* Custom Scrollbar Styles */}
        <style>{`
          .activity-logs-scroll::-webkit-scrollbar {
            width: 10px;
          }
          .activity-logs-scroll::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 5px;
          }
          .activity-logs-scroll::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 5px;
            border: 2px solid #f1f5f9;
          }
          .activity-logs-scroll::-webkit-scrollbar-thumb:hover {
            background: #fb923c;
          }
        `}</style>
      </div>
    </div>
  );
}
