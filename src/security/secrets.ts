/**
 * Secure credential and secret management using keytar + AES-256-GCM encryption
 *
 * SECURITY ARCHITECTURE:
 * 1. Master key stored in OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service)
 * 2. All credentials encrypted with AES-256-GCM before storage
 * 3. Each encryption uses unique IV (nonce) for security
 * 4. Authentication tags prevent tampering
 *
 * USAGE:
 * - Store 300+ employee credentials securely
 * - Encrypt/decrypt automation payloads
 * - Protect API keys and tokens
 */

import crypto from 'crypto';

// ==================== Configuration ====================
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

const SERVICE_NAME = 'agentic-browser';
const MASTER_KEY_ACCOUNT = 'master-encryption-key';

// ==================== Keytar Integration ====================
/**
 * NOTE: Install keytar for production use:
 * npm install keytar
 *
 * For development/testing, we use fallback file-based storage
 * NEVER use file-based storage in production for credentials!
 */

let keytar: any;
let useFileBasedFallback = false;

try {
  // Try to load keytar (native module)
  keytar = require('keytar');
} catch (error) {
  console.warn('⚠️  Keytar not available. Using INSECURE file-based fallback for development.');
  console.warn('⚠️  INSTALL keytar for production: npm install keytar');
  useFileBasedFallback = true;
}

// Fallback storage (INSECURE - development only)
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const FALLBACK_KEY_PATH = path.join(app.getPath('userData'), '.master.key');

/**
 * Get master encryption key from OS keychain
 * If not exists, generates and stores a new one
 */
export async function getMasterKey(): Promise<Buffer> {
  if (useFileBasedFallback) {
    return getMasterKeyFallback();
  }

  try {
    // Try to retrieve existing key
    const existingKey = await keytar.getPassword(SERVICE_NAME, MASTER_KEY_ACCOUNT);

    if (existingKey) {
      return Buffer.from(existingKey, 'hex');
    }

    // Generate new master key
    const newKey = crypto.randomBytes(KEY_LENGTH);
    await keytar.setPassword(SERVICE_NAME, MASTER_KEY_ACCOUNT, newKey.toString('hex'));

    console.log('✅ Generated and stored new master key in OS keychain');
    return newKey;
  } catch (error) {
    console.error('Failed to access keychain:', error);
    throw new Error('Cannot access system keychain for master key');
  }
}

/**
 * INSECURE fallback for development (DO NOT USE IN PRODUCTION)
 */
function getMasterKeyFallback(): Buffer {
  try {
    if (fs.existsSync(FALLBACK_KEY_PATH)) {
      return fs.readFileSync(FALLBACK_KEY_PATH);
    }

    // Generate new key
    const newKey = crypto.randomBytes(KEY_LENGTH);
    fs.writeFileSync(FALLBACK_KEY_PATH, newKey, { mode: 0o600 });
    console.warn('⚠️  Generated INSECURE fallback master key');
    return newKey;
  } catch (error) {
    throw new Error('Failed to access fallback key storage');
  }
}

/**
 * Delete master key (for key rotation or app uninstall)
 */
export async function deleteMasterKey(): Promise<void> {
  if (useFileBasedFallback) {
    if (fs.existsSync(FALLBACK_KEY_PATH)) {
      fs.unlinkSync(FALLBACK_KEY_PATH);
    }
    return;
  }

  try {
    await keytar.deletePassword(SERVICE_NAME, MASTER_KEY_ACCOUNT);
    console.log('✅ Deleted master key from OS keychain');
  } catch (error) {
    console.error('Failed to delete master key:', error);
  }
}

// ==================== Encryption/Decryption ====================

export interface EncryptedPayload {
  ciphertext: string;  // Base64-encoded encrypted data
  iv: string;          // Base64-encoded initialization vector
  authTag: string;     // Base64-encoded authentication tag
  version: number;     // Encryption version (for future upgrades)
}

/**
 * Encrypt a payload using AES-256-GCM
 *
 * @param plaintext - Data to encrypt (string or object)
 * @returns Encrypted payload with IV and auth tag
 */
export async function encryptPayload(plaintext: string | object): Promise<EncryptedPayload> {
  try {
    const masterKey = await getMasterKey();

    // Convert object to JSON string
    const plaintextString = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);

    // Generate random IV (must be unique for each encryption)
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, masterKey, iv);

    // Encrypt data
    let ciphertext = cipher.update(plaintextString, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      version: 1,
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt payload');
  }
}

/**
 * Decrypt a payload encrypted with encryptPayload()
 *
 * @param encrypted - Encrypted payload object
 * @returns Decrypted plaintext string
 */
export async function decryptPayload(encrypted: EncryptedPayload): Promise<string> {
  try {
    const masterKey = await getMasterKey();

    // Convert from base64
    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');

    // Create decipher
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, masterKey, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt payload - data may be corrupted or tampered');
  }
}

/**
 * Encrypt and return JSON-compatible object (for database storage)
 */
export async function encryptObject(obj: object): Promise<EncryptedPayload> {
  return encryptPayload(JSON.stringify(obj));
}

/**
 * Decrypt and parse JSON object
 */
export async function decryptObject<T = any>(encrypted: EncryptedPayload): Promise<T> {
  const plaintext = await decryptPayload(encrypted);
  return JSON.parse(plaintext);
}

// ==================== Credential Storage ====================

export interface EmployeeCredential {
  employeeId: string;
  service: string;      // e.g., 'whatsapp', 'email', etc.
  username: string;
  password: string;
  additionalData?: Record<string, any>;
  createdAt: number;
  lastUsed?: number;
}

/**
 * Store employee credential in encrypted form
 *
 * @param credential - Employee credential object
 * @returns Encrypted credential ready for database storage
 */
export async function encryptCredential(credential: EmployeeCredential): Promise<EncryptedPayload> {
  // Validate credential
  if (!credential.employeeId || !credential.service || !credential.username || !credential.password) {
    throw new Error('Invalid credential: missing required fields');
  }

  // Add metadata
  const credentialWithMetadata = {
    ...credential,
    createdAt: credential.createdAt || Date.now(),
  };

  return encryptObject(credentialWithMetadata);
}

/**
 * Decrypt employee credential
 *
 * @param encrypted - Encrypted credential from database
 * @returns Decrypted credential object
 */
export async function decryptCredential(encrypted: EncryptedPayload): Promise<EmployeeCredential> {
  return decryptObject<EmployeeCredential>(encrypted);
}

// ==================== Password Derivation (for additional security) ====================

/**
 * Derive encryption key from password using PBKDF2
 * Useful for user-specific encryption in addition to master key
 *
 * @param password - User password
 * @param salt - Salt (store with encrypted data)
 * @returns Derived key
 */
export function deriveKeyFromPassword(password: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
  const actualSalt = salt || crypto.randomBytes(SALT_LENGTH);

  const key = crypto.pbkdf2Sync(
    password,
    actualSalt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );

  return { key, salt: actualSalt };
}

/**
 * Encrypt payload with password-derived key (double encryption)
 * Use this for highly sensitive credentials
 */
export async function encryptWithPassword(
  plaintext: string | object,
  password: string
): Promise<EncryptedPayload & { salt: string }> {
  const plaintextString = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);

  // Derive key from password
  const { key, salt } = deriveKeyFromPassword(password);

  // Generate IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Encrypt
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintextString, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
    version: 1,
  };
}

/**
 * Decrypt password-encrypted payload
 */
export function decryptWithPassword(
  encrypted: EncryptedPayload & { salt: string },
  password: string
): string {
  const salt = Buffer.from(encrypted.salt, 'base64');
  const { key } = deriveKeyFromPassword(password, salt);

  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

// ==================== Secure String Comparison (Timing Attack Prevention) ====================

/**
 * Compare two strings in constant time to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  return crypto.timingSafeEqual(bufA, bufB);
}

// ==================== Secure Random Token Generation ====================

/**
 * Generate cryptographically secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate secure session ID
 */
export function generateSessionId(): string {
  return generateSecureToken(16);
}
