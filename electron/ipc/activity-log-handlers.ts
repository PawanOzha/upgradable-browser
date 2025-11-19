import { ipcMain } from 'electron';
import { getAuditLogs } from '../../db/database-secure';
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

// Get database instance - uses same path as database-secure.ts
function getDatabase(): Database.Database {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'secure.db');

  const db = new Database(dbPath);

  // Ensure audit_log table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      user_id TEXT,
      details TEXT,
      ip_address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

export function registerActivityLogHandlers() {
  // Get all activity logs (from audit_log table)
  ipcMain.handle('activityLog:getAll', async () => {
    try {
      const logs = await getAuditLogs(1000); // Get last 1000 logs

      // Filter and transform audit logs to activity log format
      // Only show cPanel and SpaceMail operations
      const activityLogs = logs
        .filter(log => {
          const service = extractService(log.eventType);
          return service === 'cpanel' || service === 'spacemail';
        })
        .map(log => ({
          id: log.id,
          action_type: extractActionType(log.eventType),
          service: extractService(log.eventType),
          target: log.userId || undefined,
          details: log.details || undefined,
          status: extractStatus(log.eventType),
          timestamp: log.timestamp,
        }));

      return { success: true, logs: activityLogs };
    } catch (error: any) {
      console.error('[Activity Log] Get all error:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Add activity log (for SpaceMail and other services)
  ipcMain.handle('activityLog:add', async (event, actionType: string, service: string, status: string, target?: string, details?: string) => {
    try {
      const db = getDatabase();

      // Format event_type as "service:action:status" (e.g., "spacemail:update:success")
      const eventType = `${service}:${actionType}:${status}`;

      const stmt = db.prepare(`
        INSERT INTO audit_log (event_type, user_id, details, ip_address)
        VALUES (?, ?, ?, ?)
      `);

      const result = stmt.run(eventType, target || null, details || null, null);

      return { success: true, id: result.lastInsertRowid };
    } catch (error: any) {
      console.error('[Activity Log] Add error:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Clear all activity logs
  ipcMain.handle('activityLog:clear', async () => {
    try {
      const db = getDatabase();
      const stmt = db.prepare('DELETE FROM audit_log');
      const result = stmt.run();

      return { success: true, changes: result.changes };
    } catch (error: any) {
      console.error('[Activity Log] Clear error:', error.message);
      return { success: false, error: error.message };
    }
  });

  console.log('[Activity Log] IPC handlers registered');
}

// Helper functions to parse event_type
// Expected format: "cpanel:create:success" or "cpanel:update:error"
function extractService(eventType: string): string {
  const parts = eventType.split(':');
  return parts[0] || 'unknown';
}

function extractActionType(eventType: string): string {
  const parts = eventType.split(':');
  return parts[1] || 'unknown';
}

function extractStatus(eventType: string): string {
  const parts = eventType.split(':');
  return parts[2] || 'unknown';
}
