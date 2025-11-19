/**
 * Secure database implementation with encryption
 *
 * SECURITY FEATURES:
 * 1. Application-layer encryption for all sensitive data
 * 2. Prepared statements to prevent SQL injection
 * 3. Input validation and sanitization
 * 4. Encrypted credential storage
 * 5. Audit logging for compliance
 *
 * DATABASE SCHEMA:
 * - sequences: Encrypted task sequences
 * - credentials: Encrypted employee credentials
 * - audit_log: Security event logging
 */

import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { encryptPayload, decryptPayload, EncryptedPayload } from '../src/security/secrets';

let db: Database.Database | null = null;

function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'secure.db');
    db = new Database(dbPath);

    // Enable WAL mode for better concurrent performance
    db.pragma('journal_mode = WAL');

    // Enable foreign keys
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// ==================== Database Initialization ====================

export async function initializeDatabase() {
  const database = getDatabase();
  const dbPath = path.join(app.getPath('userData'), 'secure.db');

  // Create sequences table (encrypted data)
  database.exec(`
    CREATE TABLE IF NOT EXISTS sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      encrypted_data TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create credentials table (encrypted employee credentials)
  database.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      service TEXT NOT NULL,
      encrypted_data TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used TIMESTAMP,
      UNIQUE(employee_id, service)
    )
  `);

  // Create audit log for security events
  database.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      user_id TEXT,
      details TEXT,
      ip_address TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for performance
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_credentials_employee
    ON credentials(employee_id);
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_credentials_service
    ON credentials(service);
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
    ON audit_log(timestamp);
  `);

  // Create bookmarks table (persistent)
  database.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log(`✅ Secure database initialized at: ${dbPath}`);
  await logAuditEvent('database_initialized', null, 'Database schema created');
}

// ==================== Audit Logging ====================

export interface AuditEvent {
  id: number;
  eventType: string;
  userId?: string | null;
  details?: string;
  ipAddress?: string;
  timestamp: string;
}

export async function logAuditEvent(
  eventType: string,
  userId: string | null = null,
  details?: string,
  ipAddress?: string
): Promise<void> {
  const database = getDatabase();

  const stmt = database.prepare(`
    INSERT INTO audit_log (event_type, user_id, details, ip_address)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(eventType, userId, details || null, ipAddress || null);
}

export async function getAuditLogs(limit: number = 100): Promise<AuditEvent[]> {
  const database = getDatabase();

  const stmt = database.prepare(`
    SELECT id, event_type, user_id, details, ip_address, timestamp
    FROM audit_log
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];

  // Map snake_case columns to camelCase interface
  return rows.map(row => ({
    id: row.id,
    eventType: row.event_type,
    userId: row.user_id,
    details: row.details,
    ipAddress: row.ip_address,
    timestamp: row.timestamp
  }));
}

// ==================== Sequence Management (Encrypted) ====================

export async function saveSequence(name: string, tasks: any[]): Promise<number> {
  const database = getDatabase();

  // Validate input
  if (!name || name.length === 0 || name.length > 255) {
    throw new Error('Invalid sequence name');
  }

  if (!Array.isArray(tasks) || tasks.length > 100) {
    throw new Error('Invalid tasks array');
  }

  // Encrypt tasks data
  const encrypted = await encryptPayload({ tasks });

  const stmt = database.prepare(`
    INSERT INTO sequences (name, encrypted_data, iv, auth_tag, version, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      encrypted_data = excluded.encrypted_data,
      iv = excluded.iv,
      auth_tag = excluded.auth_tag,
      version = excluded.version,
      updated_at = CURRENT_TIMESTAMP
  `);

  const result = stmt.run(
    name,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.authTag,
    encrypted.version
  );

  await logAuditEvent('sequence_saved', null, `Sequence: ${name}`);

  return result.lastInsertRowid as number;
}

export async function loadSequence(name: string): Promise<any | null> {
  const database = getDatabase();

  // Validate input
  if (!name || name.length === 0 || name.length > 255) {
    throw new Error('Invalid sequence name');
  }

  const stmt = database.prepare(`
    SELECT id, name, encrypted_data, iv, auth_tag, version, created_at, updated_at
    FROM sequences
    WHERE name = ?
  `);

  const row = stmt.get(name) as any;

  if (!row) {
    return null;
  }

  // Decrypt tasks data
  try {
    const encrypted: EncryptedPayload = {
      ciphertext: row.encrypted_data,
      iv: row.iv,
      authTag: row.auth_tag,
      version: row.version,
    };

    const decrypted = await decryptPayload(encrypted);
    const data = JSON.parse(decrypted);

    await logAuditEvent('sequence_loaded', null, `Sequence: ${name}`);

    return {
      id: row.id,
      name: row.name,
      tasks: data.tasks,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch (error) {
    console.error('Failed to decrypt sequence:', error);
    await logAuditEvent('sequence_decryption_failed', null, `Sequence: ${name}`);
    throw new Error('Failed to decrypt sequence data');
  }
}

export async function getAllSequences(): Promise<any[]> {
  const database = getDatabase();

  const stmt = database.prepare(`
    SELECT id, name, created_at, updated_at
    FROM sequences
    ORDER BY updated_at DESC
  `);

  await logAuditEvent('sequences_listed', null);

  return stmt.all();
}

export async function deleteSequence(name: string): Promise<number> {
  const database = getDatabase();

  // Validate input
  if (!name || name.length === 0 || name.length > 255) {
    throw new Error('Invalid sequence name');
  }

  const stmt = database.prepare('DELETE FROM sequences WHERE name = ?');
  const result = stmt.run(name);

  await logAuditEvent('sequence_deleted', null, `Sequence: ${name}`);

  return result.changes;
}

// ==================== Credential Management (Encrypted) ====================

export interface EmployeeCredential {
  employeeId: string;
  service: string;
  username: string;
  password: string;
  additionalData?: Record<string, any>;
}

/**
 * Save encrypted employee credential
 */
export async function saveCredential(credential: EmployeeCredential): Promise<number> {
  const database = getDatabase();

  // Validate input
  if (!credential.employeeId || !credential.service || !credential.username || !credential.password) {
    throw new Error('Invalid credential: missing required fields');
  }

  // Encrypt credential
  const encrypted = await encryptPayload({
    username: credential.username,
    password: credential.password,
    additionalData: credential.additionalData || {},
  });

  const stmt = database.prepare(`
    INSERT INTO credentials (employee_id, service, encrypted_data, iv, auth_tag, version)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_id, service) DO UPDATE SET
      encrypted_data = excluded.encrypted_data,
      iv = excluded.iv,
      auth_tag = excluded.auth_tag,
      version = excluded.version
  `);

  const result = stmt.run(
    credential.employeeId,
    credential.service,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.authTag,
    encrypted.version
  );

  await logAuditEvent(
    'credential_saved',
    credential.employeeId,
    `Service: ${credential.service}`
  );

  return result.lastInsertRowid as number;
}

/**
 * Load encrypted employee credential
 */
export async function loadCredential(
  employeeId: string,
  service: string
): Promise<EmployeeCredential | null> {
  const database = getDatabase();

  const stmt = database.prepare(`
    SELECT id, employee_id, service, encrypted_data, iv, auth_tag, version, created_at
    FROM credentials
    WHERE employee_id = ? AND service = ?
  `);

  const row = stmt.get(employeeId, service) as any;

  if (!row) {
    return null;
  }

  try {
    const encrypted: EncryptedPayload = {
      ciphertext: row.encrypted_data,
      iv: row.iv,
      authTag: row.auth_tag,
      version: row.version,
    };

    const decrypted = await decryptPayload(encrypted);
    const data = JSON.parse(decrypted);

    // Update last_used timestamp
    const updateStmt = database.prepare(`
      UPDATE credentials SET last_used = CURRENT_TIMESTAMP
      WHERE employee_id = ? AND service = ?
    `);
    updateStmt.run(employeeId, service);

    await logAuditEvent(
      'credential_accessed',
      employeeId,
      `Service: ${service}`
    );

    return {
      employeeId: row.employee_id,
      service: row.service,
      username: data.username,
      password: data.password,
      additionalData: data.additionalData || {},
    };
  } catch (error) {
    console.error('Failed to decrypt credential:', error);
    await logAuditEvent(
      'credential_decryption_failed',
      employeeId,
      `Service: ${service}`
    );
    throw new Error('Failed to decrypt credential');
  }
}

/**
 * Get all credentials for an employee (metadata only, no passwords)
 */
export async function getEmployeeCredentials(employeeId: string): Promise<any[]> {
  const database = getDatabase();

  const stmt = database.prepare(`
    SELECT id, employee_id, service, created_at, last_used
    FROM credentials
    WHERE employee_id = ?
    ORDER BY service
  `);

  return stmt.all(employeeId);
}

/**
 * Delete employee credential
 */
export async function deleteCredential(employeeId: string, service: string): Promise<number> {
  const database = getDatabase();

  const stmt = database.prepare(`
    DELETE FROM credentials
    WHERE employee_id = ? AND service = ?
  `);

  const result = stmt.run(employeeId, service);

  await logAuditEvent(
    'credential_deleted',
    employeeId,
    `Service: ${service}`
  );

  return result.changes;
}

/**
 * Batch import credentials (for initial setup)
 */
export async function batchImportCredentials(
  credentials: EmployeeCredential[]
): Promise<{ success: number; failed: number }> {
  const database = getDatabase();
  let success = 0;
  let failed = 0;

  // Use transaction for atomic batch insert
  const transaction = database.transaction((creds: EmployeeCredential[]) => {
    for (const cred of creds) {
      try {
        // This is synchronous in transaction context
        const encrypted = encryptPayload({
          username: cred.username,
          password: cred.password,
          additionalData: cred.additionalData || {},
        });

        // Note: We can't use async in transaction, so we need to refactor
        // For now, log that batch import needs special handling
        success++;
      } catch (error) {
        console.error('Failed to import credential:', error);
        failed++;
      }
    }
  });

  try {
    // Note: This needs async handling - see migration script below
    console.warn('Batch import should use migration script for async encryption');
    return { success: 0, failed: credentials.length };
  } catch (error) {
    console.error('Batch import failed:', error);
    return { success: 0, failed: credentials.length };
  }
}

// ==================== Database Migration Utilities ====================

/**
 * Check if database contains plaintext data that needs encryption
 */
export async function checkForPlaintextData(): Promise<boolean> {
  const database = getDatabase();

  // Check for old unencrypted sequences table
  const tableInfo = database.pragma("table_info('sequences')") as any[];
  const hasTasksColumn = tableInfo.some((col: any) => col.name === 'tasks');

  return hasTasksColumn;
}

/**
 * Migrate plaintext sequences to encrypted format
 */
export async function migratePlaintextSequences(): Promise<{ migrated: number; failed: number }> {
  const database = getDatabase();
  let migrated = 0;
  let failed = 0;

  try {
    // Check if old table exists
    const hasOldTable = (database.pragma("table_info('sequences')") as any[])
      .some((col: any) => col.name === 'tasks');

    if (!hasOldTable) {
      console.log('No plaintext sequences to migrate');
      return { migrated: 0, failed: 0 };
    }

    // Get all old sequences
    const oldSequences = database.prepare('SELECT * FROM sequences').all() as any[];

    console.log(`Migrating ${oldSequences.length} plaintext sequences...`);

    for (const seq of oldSequences) {
      try {
        const tasks = JSON.parse(seq.tasks);
        await saveSequence(seq.name, tasks);
        migrated++;
      } catch (error) {
        console.error(`Failed to migrate sequence ${seq.name}:`, error);
        failed++;
      }
    }

    await logAuditEvent('database_migration', null, `Migrated ${migrated} sequences`);

    console.log(`✅ Migration complete: ${migrated} migrated, ${failed} failed`);
  } catch (error) {
    console.error('Migration error:', error);
  }

  return { migrated, failed };
}

// ==================== Bookmarks (Persistent) ====================
export interface Bookmark {
  id?: number;
  title: string;
  url: string;
  pinned?: number;
  created_at?: string;
}

export function addBookmark(title: string, url: string): number {
  const database = getDatabase();
  if (!title || !url) {
    throw new Error('Invalid bookmark');
  }
  const stmt = database.prepare(`
    INSERT INTO bookmarks (title, url)
    VALUES (?, ?)
    ON CONFLICT(url) DO UPDATE SET
      title = excluded.title
  `);
  const result = stmt.run(title, url);
  return result.lastInsertRowid as number;
}

export function removeBookmark(url: string): number {
  const database = getDatabase();
  const stmt = database.prepare('DELETE FROM bookmarks WHERE url = ?');
  const result = stmt.run(url);
  return result.changes;
}

export function getAllBookmarks(): Bookmark[] {
  const database = getDatabase();
  const stmt = database.prepare('SELECT id, title, url, pinned, created_at FROM bookmarks ORDER BY created_at DESC');
  return stmt.all() as Bookmark[];
}

export function setBookmarkPinned(url: string, pinned: boolean): number {
  const database = getDatabase();
  const stmt = database.prepare('UPDATE bookmarks SET pinned = ? WHERE url = ?');
  const result = stmt.run(pinned ? 1 : 0, url);
  return result.changes;
}

export default getDatabase;
