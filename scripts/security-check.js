/**
 * Security Verification Script
 * Run this to verify all security measures are in place
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('🔒 SECURITY AUDIT - Configuration Verification\n');
console.log('='.repeat(60));

let errors = 0;
let warnings = 0;

// ==================== Check 1: Dependencies ====================
console.log('\n📦 Checking Dependencies...\n');

function checkDependency(name, critical = true) {
  try {
    require.resolve(name);
    console.log(`✅ ${name} installed`);
    return true;
  } catch {
    if (critical) {
      console.error(`❌ ${name} NOT installed (CRITICAL)`);
      errors++;
    } else {
      console.warn(`⚠️  ${name} NOT installed (recommended)`);
      warnings++;
    }
    return false;
  }
}

checkDependency('keytar', true);
checkDependency('dompurify', true);
checkDependency('better-sqlite3', true);

// ==================== Check 2: File Structure ====================
console.log('\n📁 Checking Secure Files...\n');

function checkFileExists(filePath, name) {
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${name} exists`);
    return true;
  } else {
    console.error(`❌ ${name} NOT found at: ${filePath}`);
    errors++;
    return false;
  }
}

checkFileExists('electron/main-secure.ts', 'main-secure.ts');
checkFileExists('electron/preload-secure.ts', 'preload-secure.ts');
checkFileExists('src/security/secrets.ts', 'secrets.ts');
checkFileExists('db/database-secure.ts', 'database-secure.ts');
checkFileExists('src/automation/runner-secure.ts', 'runner-secure.ts');
checkFileExists('src/services/ollama-secure.ts', 'ollama-secure.ts');

// ==================== Check 3: Main Process Security ====================
console.log('\n🔐 Checking Main Process Security...\n');

if (fs.existsSync('electron/main.ts')) {
  const mainContent = fs.readFileSync('electron/main.ts', 'utf8');

  // Check sandbox
  if (mainContent.includes('sandbox: true')) {
    console.log('✅ Sandbox enabled');
  } else {
    console.error('❌ Sandbox NOT enabled - webview vulnerable!');
    errors++;
  }

  // Check contextIsolation
  if (mainContent.includes('contextIsolation: true')) {
    console.log('✅ Context isolation enabled');
  } else {
    console.error('❌ Context isolation NOT enabled!');
    errors++;
  }

  // Check nodeIntegration
  if (mainContent.includes('nodeIntegration: false')) {
    console.log('✅ Node integration disabled');
  } else {
    console.error('❌ Node integration NOT disabled!');
    errors++;
  }

  // Check secure database import
  if (mainContent.includes('database-secure')) {
    console.log('✅ Using secure database module');
  } else {
    console.error('❌ Using INSECURE database module!');
    errors++;
  }

  // Check CSP
  if (mainContent.includes('Content-Security-Policy')) {
    console.log('✅ CSP configured');
  } else {
    console.warn('⚠️  CSP not configured');
    warnings++;
  }
}

// ==================== Check 4: Preload Security ====================
console.log('\n🔗 Checking Preload Security...\n');

if (fs.existsSync('electron/preload.ts')) {
  const preloadContent = fs.readFileSync('electron/preload.ts', 'utf8');

  // Check channel whitelist
  if (preloadContent.includes('ALLOWED_INVOKE_CHANNELS') ||
      preloadContent.includes('ALLOWED_SEND_CHANNELS')) {
    console.log('✅ IPC channel whitelist implemented');
  } else {
    console.error('❌ IPC channels NOT whitelisted!');
    errors++;
  }

  // Check no direct ipcRenderer exposure
  if (!preloadContent.match(/exposeInMainWorld\(['"]ipcRenderer['"]\s*,\s*ipcRenderer\)/)) {
    console.log('✅ ipcRenderer not directly exposed');
  } else {
    console.error('❌ ipcRenderer directly exposed (insecure)!');
    errors++;
  }

  // Check contextBridge usage
  if (preloadContent.includes('contextBridge')) {
    console.log('✅ Using contextBridge');
  } else {
    console.error('❌ NOT using contextBridge!');
    errors++;
  }
}

// ==================== Check 5: Database Security ====================
console.log('\n💾 Checking Database Security...\n');

const userDataPath = process.env.APPDATA ||
                     process.env.HOME + '/Library/Application Support' ||
                     process.env.HOME + '/.config';
const dbPath = path.join(userDataPath, 'agentic-browser', 'secure.db');

if (fs.existsSync(dbPath)) {
  console.log('✅ Secure database initialized');

  // Check if it's actually encrypted
  const Database = require('better-sqlite3');
  try {
    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

    const sequencesTable = tables.find(t => t.name === 'sequences');
    if (sequencesTable) {
      const columns = db.pragma('table_info(sequences)');
      const hasEncryption = columns.some(col =>
        col.name === 'encrypted_data' || col.name === 'iv' || col.name === 'auth_tag'
      );

      if (hasEncryption) {
        console.log('✅ Database uses encryption schema');
      } else {
        console.error('❌ Database NOT using encryption schema!');
        errors++;
      }
    }
    db.close();
  } catch (error) {
    console.warn('⚠️  Could not verify database schema:', error.message);
    warnings++;
  }
} else {
  console.warn('⚠️  Secure database not yet initialized (will be created on first run)');
}

// Check for old insecure database
const oldDbPath = path.join(userDataPath, 'agentic-browser', 'sequences.db');
if (fs.existsSync(oldDbPath)) {
  console.warn('⚠️  Old insecure database still exists - migrate and delete it!');
  warnings++;
}

// ==================== Check 6: Ollama Security ====================
console.log('\n🤖 Checking Ollama Security...\n');

// Check if Ollama service file uses secure implementation
if (fs.existsSync('src/services/ollama.ts')) {
  const ollamaContent = fs.readFileSync('src/services/ollama.ts', 'utf8');

  if (ollamaContent.includes('sanitizeInput') || ollamaContent.includes('sanitizePageContent')) {
    console.log('✅ Ollama uses input sanitization');
  } else {
    console.error('❌ Ollama NOT using input sanitization!');
    errors++;
  }

  if (ollamaContent.includes('127.0.0.1') || ollamaContent.includes('localhost')) {
    console.log('✅ Ollama configured for localhost');
  } else {
    console.warn('⚠️  Ollama might be exposed to network');
    warnings++;
  }

  if (ollamaContent.includes('checkRateLimit') || ollamaContent.includes('rate')) {
    console.log('✅ Ollama rate limiting implemented');
  } else {
    console.warn('⚠️  Ollama rate limiting not found');
    warnings++;
  }
}

// ==================== Check 7: Removed Dangerous Functions ====================
console.log('\n⛔ Checking for Dangerous Patterns...\n');

function scanForDangerous(filePath, pattern, description) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  if (content.match(pattern)) {
    console.error(`❌ ${description} found in ${filePath}`);
    errors++;
  } else {
    console.log(`✅ ${description} not found`);
  }
}

scanForDangerous('electron/main.ts', /webview:execute/, 'webview:execute handler');
scanForDangerous('electron/preload.ts', /\.invoke\([^)]/, 'Unrestricted invoke');
scanForDangerous('src', /eval\(/, 'eval() usage');

// ==================== Check 8: Package.json Security ====================
console.log('\n📋 Checking package.json...\n');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (packageJson.dependencies['keytar']) {
  console.log('✅ keytar in dependencies');
} else {
  console.error('❌ keytar NOT in dependencies');
  errors++;
}

if (packageJson.dependencies['dompurify']) {
  console.log('✅ dompurify in dependencies');
} else {
  console.error('❌ dompurify NOT in dependencies');
  errors++;
}

// ==================== Final Report ====================
console.log('\n' + '='.repeat(60));
console.log('\n📊 SECURITY AUDIT SUMMARY\n');

console.log(`Errors: ${errors} ❌`);
console.log(`Warnings: ${warnings} ⚠️`);

if (errors === 0 && warnings === 0) {
  console.log('\n✅ ALL SECURITY CHECKS PASSED!\n');
  console.log('Your application is configured securely.');
  process.exit(0);
} else if (errors === 0) {
  console.log('\n⚠️  WARNINGS FOUND\n');
  console.log('Application is secure but has minor issues to address.');
  process.exit(0);
} else {
  console.log('\n❌ CRITICAL SECURITY ISSUES FOUND!\n');
  console.log('DO NOT deploy to production until all errors are fixed.');
  console.log('\nReview SECURITY_AUDIT_REPORT.md for detailed remediation steps.');
  process.exit(1);
}
