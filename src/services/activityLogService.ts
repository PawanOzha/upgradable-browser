// Activity Log Service - Logs all operations to database

declare global {
  interface Window {
    ipc: {
      invoke(channel: string, ...args: any[]): Promise<any>;
    };
  }
}

export interface ActivityLog {
  id?: number;
  action_type: string;
  service: string;
  target?: string;
  details?: string;
  status: string;
  timestamp?: string;
}

/**
 * Add activity log entry
 */
export async function addActivityLog(
  actionType: string,
  service: string,
  status: string,
  target?: string,
  details?: string
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const result = await window.ipc.invoke(
      'activityLog:add',
      actionType,
      service,
      status,
      target,
      details
    );
    return result;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to add activity log',
    };
  }
}

/**
 * Get all activity logs
 */
export async function getActivityLogs(): Promise<{
  success: boolean;
  logs?: ActivityLog[];
  error?: string;
}> {
  try {
    const result = await window.ipc.invoke('activityLog:getAll');
    return result;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to get activity logs',
    };
  }
}

/**
 * Clear all activity logs
 */
export async function clearActivityLogs(): Promise<{
  success: boolean;
  changes?: number;
  error?: string;
}> {
  try {
    const result = await window.ipc.invoke('activityLog:clear');
    return result;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to clear activity logs',
    };
  }
}
