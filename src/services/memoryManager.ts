/**
 * 7-Day Memory System
 * Local JSON-based memory storage with automatic expiration
 * Lifetime: 168 hours (7 days)
 */

export type MemoryType = 'task' | 'preference' | 'context';

export interface MemoryEntry {
  timestamp: number;
  type: MemoryType;
  key: string;
  value: any;
  expire: number; // seconds from timestamp
}

export interface Memory {
  entries: MemoryEntry[];
}

const SEVEN_DAYS_SECONDS = 168 * 60 * 60; // 7 days in seconds
const MAX_IMPORTANT_MEMORIES = 20; // Send only top 20 most important memories

class MemoryManager {
  private memory: Memory = { entries: [] };
  private storageKey = 'gojo_agent_memory';

  constructor() {
    this.loadMemory();
    this.cleanExpiredEntries();
  }

  /**
   * Load memory from localStorage
   */
  private loadMemory(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.memory = JSON.parse(stored);
      }
    } catch (error) {
      console.error('[MemoryManager] Failed to load memory:', error);
      this.memory = { entries: [] };
    }
  }

  /**
   * Save memory to localStorage
   */
  private saveMemory(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.memory));
    } catch (error) {
      console.error('[MemoryManager] Failed to save memory:', error);
    }
  }

  /**
   * Remove expired entries
   */
  private cleanExpiredEntries(): void {
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const before = this.memory.entries.length;

    this.memory.entries = this.memory.entries.filter((entry) => {
      const age = now - entry.timestamp;
      return age < entry.expire;
    });

    const after = this.memory.entries.length;
    if (before !== after) {
      console.log(`[MemoryManager] Cleaned ${before - after} expired entries`);
      this.saveMemory();
    }
  }

  /**
   * Write a new memory entry
   */
  write(type: MemoryType, key: string, value: any, expireSeconds: number = SEVEN_DAYS_SECONDS): void {
    const now = Math.floor(Date.now() / 1000);

    // Remove existing entry with same key
    this.memory.entries = this.memory.entries.filter((e) => e.key !== key);

    // Add new entry
    const entry: MemoryEntry = {
      timestamp: now,
      type,
      key,
      value,
      expire: expireSeconds,
    };

    this.memory.entries.push(entry);
    this.saveMemory();

    console.log(`[MemoryManager] Wrote memory: ${key} = ${JSON.stringify(value)}`);
  }

  /**
   * Read a memory entry by key
   */
  read(key: string): any | null {
    this.cleanExpiredEntries();

    const entry = this.memory.entries.find((e) => e.key === key);
    return entry ? entry.value : null;
  }

  /**
   * Read all memories of a specific type
   */
  readByType(type: MemoryType): MemoryEntry[] {
    this.cleanExpiredEntries();
    return this.memory.entries.filter((e) => e.type === type);
  }

  /**
   * Delete a memory entry by key
   */
  delete(key: string): void {
    this.memory.entries = this.memory.entries.filter((e) => e.key !== key);
    this.saveMemory();
    console.log(`[MemoryManager] Deleted memory: ${key}`);
  }

  /**
   * Clear all memory entries
   */
  clearAll(): void {
    this.memory = { entries: [] };
    this.saveMemory();
    console.log('[MemoryManager] Cleared all memory');
  }

  /**
   * Get compressed memory summary for AI prompts
   * Returns the most important memories (sorted by recency and type priority)
   */
  getCompressedSummary(): string {
    this.cleanExpiredEntries();

    if (this.memory.entries.length === 0) {
      return '';
    }

    // Sort by type priority and recency
    const typePriority: Record<MemoryType, number> = {
      task: 3,
      preference: 2,
      context: 1,
    };

    const sorted = [...this.memory.entries].sort((a, b) => {
      // First by type priority
      const priorityDiff = typePriority[b.type] - typePriority[a.type];
      if (priorityDiff !== 0) return priorityDiff;
      // Then by recency
      return b.timestamp - a.timestamp;
    });

    // Take top N important memories
    const important = sorted.slice(0, MAX_IMPORTANT_MEMORIES);

    // Build compressed summary
    const lines: string[] = [];
    for (const entry of important) {
      const value = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
      lines.push(`${entry.key}: ${value}`);
    }

    return lines.join('\n');
  }

  /**
   * Get formatted memory for AI system prompt
   */
  getMemoryForPrompt(): string {
    const summary = this.getCompressedSummary();
    if (!summary) {
      return '';
    }

    return `<memory>\n${summary}\n</memory>`;
  }

  /**
   * Suggested memories to write based on common patterns
   */
  writeWorkspaceUsed(workspace: string): void {
    this.write('context', 'recent_workspace', workspace);
  }

  writeDomainAccessed(domain: string): void {
    this.write('context', 'last_domain_accessed', domain);
  }

  writeEmailAccessed(email: string): void {
    const emails = this.read('previous_emails_accessed') || [];
    if (!emails.includes(email)) {
      emails.push(email);
      // Keep only last 10 emails
      if (emails.length > 10) emails.shift();
    }
    this.write('context', 'previous_emails_accessed', emails);
  }

  writePageVisited(page: string): void {
    this.write('context', 'last_visited_page', page);
  }

  writePreference(key: string, value: any): void {
    this.write('preference', key, value);
  }

  writeTaskCompleted(task: string): void {
    this.write('task', `completed_${Date.now()}`, task, 86400); // 24 hours
  }

  /**
   * Get statistics about memory usage
   */
  getStats(): {
    total: number;
    byType: Record<MemoryType, number>;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  } {
    this.cleanExpiredEntries();

    const byType: Record<MemoryType, number> = {
      task: 0,
      preference: 0,
      context: 0,
    };

    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (const entry of this.memory.entries) {
      byType[entry.type]++;

      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
      if (newestTimestamp === null || entry.timestamp > newestTimestamp) {
        newestTimestamp = entry.timestamp;
      }
    }

    return {
      total: this.memory.entries.length,
      byType,
      oldestTimestamp,
      newestTimestamp,
    };
  }
}

// Singleton instance
export const memoryManager = new MemoryManager();
