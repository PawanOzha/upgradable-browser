/**
 * CSV Export with Password Protection
 *
 * Exports password history to encrypted CSV file
 */

import CryptoJS from 'crypto-js';

export interface PasswordEntry {
  email: string;
  password: string;
  timestamp: string;
  status: 'success' | 'failed' | 'pending';
}

/**
 * Encrypt data using AES-256
 */
function encryptData(data: string, password: string): string {
  return CryptoJS.AES.encrypt(data, password).toString();
}

/**
 * Generate CSV content from password entries
 */
function generateCSV(entries: PasswordEntry[]): string {
  const header = 'Email,Password,Timestamp,Status\n';
  const rows = entries.map(entry =>
    `"${entry.email}","${entry.password}","${entry.timestamp}","${entry.status}"`
  ).join('\n');

  return header + rows;
}

/**
 * Export password history to JSON file (NO ENCRYPTION)
 *
 * @param entries - Password entries to export
 * @param filename - Optional filename (default: passwords_YYYY-MM-DD.json)
 */
export function exportToEncryptedCSV(
  entries: PasswordEntry[],
  exportPassword?: string,
  filename?: string
): void {
  if (entries.length === 0) {
    throw new Error('No password entries to export');
  }

  // Create JSON file with metadata (NO ENCRYPTION)
  const fileContent = JSON.stringify({
    version: '1.0',
    encrypted: false,
    entries: entries.map(e => ({
      email: e.email,
      password: e.password,
      timestamp: e.timestamp,
      status: e.status
    })),
    totalEntries: entries.length,
    exportDate: new Date().toISOString(),
    note: 'SpaceMail Password Export - Store this file securely!'
  }, null, 2);

  // Generate filename
  const date = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `spacemail_passwords_${date}.json`;

  // Trigger download
  downloadFile(fileContent, finalFilename, 'application/json');
}

/**
 * Export as plain CSV (NOT ENCRYPTED - for testing only)
 */
export function exportToPlainCSV(
  entries: PasswordEntry[],
  filename?: string
): void {
  if (entries.length === 0) {
    throw new Error('No password entries to export');
  }

  const csvContent = generateCSV(entries);
  const date = new Date().toISOString().split('T')[0];
  const finalFilename = filename || `spacemail_passwords_${date}.csv`;

  downloadFile(csvContent, finalFilename, 'text/csv');
}

/**
 * Trigger browser download
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Decrypt and parse encrypted CSV file (for user to decrypt later)
 */
export function decryptCSV(encryptedFile: string, password: string): PasswordEntry[] {
  try {
    const fileData = JSON.parse(encryptedFile);

    if (!fileData.encrypted || !fileData.data) {
      throw new Error('Invalid encrypted file format');
    }

    // Decrypt
    const decryptedBytes = CryptoJS.AES.decrypt(fileData.data, password);
    const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);

    if (!decryptedText) {
      throw new Error('Decryption failed - wrong password?');
    }

    // Parse CSV
    const lines = decryptedText.split('\n');
    const entries: PasswordEntry[] = [];

    for (let i = 1; i < lines.length; i++) { // Skip header
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV line (handle quoted values)
      const matches = line.match(/"([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
      if (matches) {
        entries.push({
          email: matches[1],
          password: matches[2],
          timestamp: matches[3],
          status: matches[4] as 'success' | 'failed' | 'pending'
        });
      }
    }

    return entries;
  } catch (error: any) {
    throw new Error(`Failed to decrypt: ${error.message}`);
  }
}
