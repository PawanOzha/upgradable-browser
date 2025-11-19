import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

// Database will be stored in user data directory
// Initialize lazily to avoid issues during import
let db: Database.Database | null = null;

function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'sequences.db');
    db = new Database(dbPath);
  }
  return db;
}

// Initialize database schema
export function initializeDatabase() {
  const db = getDatabase();
  const dbPath = path.join(app.getPath('userData'), 'sequences.db');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      tasks TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log(`Database initialized at: ${dbPath}`);
}

// Save a new sequence or update existing one
export function saveSequence(name: string, tasks: any[]) {
  const db = getDatabase();
  const tasksJSON = JSON.stringify(tasks);

  const stmt = db.prepare(`
    INSERT INTO sequences (name, tasks, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      tasks = excluded.tasks,
      updated_at = CURRENT_TIMESTAMP
  `);

  const result = stmt.run(name, tasksJSON);
  return result.lastInsertRowid;
}

// Load a sequence by name
export function loadSequence(name: string) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM sequences WHERE name = ?');
  const row = stmt.get(name) as any;

  if (row) {
    return {
      id: row.id,
      name: row.name,
      tasks: JSON.parse(row.tasks),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
  return null;
}

// Get all saved sequences
export function getAllSequences() {
  const db = getDatabase();
  const stmt = db.prepare('SELECT id, name, created_at, updated_at FROM sequences ORDER BY updated_at DESC');
  return stmt.all();
}

// Delete a sequence
export function deleteSequence(name: string) {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM sequences WHERE name = ?');
  return stmt.run(name).changes;
}

// Get sequence by ID
export function getSequenceById(id: number) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM sequences WHERE id = ?');
  const row = stmt.get(id) as any;

  if (row) {
    return {
      id: row.id,
      name: row.name,
      tasks: JSON.parse(row.tasks),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
  return null;
}

export default getDatabase;
