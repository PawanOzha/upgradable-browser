/**
 * Security Verification Script (CommonJS version)
 * Run this to verify all security measures are in place
 */

const fs = require('fs');
const path = require('path');

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
      console.error(`   Install with: npm install ${name}`);
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
    console.error('   Fix: Set sandbox: true in webPreferences');
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
    console.error('   Fix: Change import from "../db/database" to "../db/database-secure"');
    errors++;
  }

  // Check CSP
  if (mainContent.includes('Content-Security-Policy')) {
    console.log('✅ CSP configured');
  } else {
    console.warn('⚠️  CSP not configured');
    warnings++;
  }

  // Check rate limiting
  if (mainContent.includes('checkRateLimit')) {
    console.log('✅ Rate limiting implemented');
  } else {
    console.warn('⚠️  Rate limiting not found');
    warnings++;
  }

  // Check input validation
  if (mainContent.includes('validateString') || mainContent.includes('validateNumber')) {
    console.log('✅ Input validation implemented');
  } else {
    console.error('❌ Input validation NOT implemented');
    errors++;
  }
} else {
  console.error('❌ electron/main.ts NOT found!');
  errors++;
}

// ==================== Check 4: Preload Security ====================
console.log('\n🔗 Checking Preload Security...\n');

if (fs.existsSync('electron/preload.ts')) {
  const preloadContent = fs.readFileSync('electron/preload.ts', 'utf8');

  // Check channel whitelist
  if (preloadContent.includes('ALLOWED_INVOKE_CHANNELS') &&
      preloadContent.includes('ALLOWED_SEND_CHANNELS')) {
    console.log('✅ IPC channel whitelist implemented');
  } else {
    console.error('❌ IPC channels NOT whitelisted!');
    console.error('   Fix: Use preload-secure.ts with channel whitelist');
    errors++;
  }

  // Check no direct ipcRenderer exposure
  if (!preloadContent.match(/exposeInMainWorld\(['"]ipcRenderer['"]\s*,\s*ipcRenderer\)/)) {
    console.log('✅ ipcRenderer not directly exposed');
  } else {
    console.error('❌ ipcRenderer directly exposed (CRITICAL VULNERABILITY)!');
    errors++;
  }

  // Check contextBridge usage
  if (preloadContent.includes('contextBridge')) {
    console.log('✅ Using contextBridge');
  } else {
    console.error('❌ NOT using contextBridge!');
    errors++;
  }

  // Check for dangerous webview:execute handler
  if (preloadContent.includes('webview:execute') || preloadContent.includes('execute:')) {
    console.error('❌ Dangerous execute handler found!');
    console.error('   Fix: Remove webview:execute - use whitelisted actions only');
    errors++;
  } else {
    console.log('✅ No dangerous execute handlers');
  }
} else {
  console.error('❌ electron/preload.ts NOT found!');
  errors++;
}

// ==================== Check 5: Database Security ====================
console.log('\n💾 Checking Database Security...\n');

if (fs.existsSync('db/database-secure.ts')) {
  const dbContent = fs.readFileSync('db/database-secure.ts', 'utf8');

  if (dbContent.includes('encryptPayload') && dbContent.includes('decryptPayload')) {
    console.log('✅ Database uses encryption');
  } else {
    console.error('❌ Database NOT using encryption!');
    errors++;
  }

  if (dbContent.includes('logAuditEvent')) {
    console.log('✅ Audit logging implemented');
  } else {
    console.warn('⚠️  Audit logging not found');
    warnings++;
  }
} else {
  console.error('❌ database-secure.ts NOT found!');
  errors++;
}

// Check if old insecure database is still in use
if (fs.existsSync('electron/main.ts')) {
  const mainContent = fs.readFileSync('electron/main.ts', 'utf8');
  if (mainContent.includes("from '../db/database'") && !mainContent.includes('database-secure')) {
    console.error('❌ Still using OLD INSECURE database!');
    console.error('   Fix: Update import to database-secure');
    errors++;
  }
}

// ==================== Check 6: Ollama Security ====================
console.log('\n🤖 Checking Ollama Security...\n');

if (fs.existsSync('src/services/ollama-secure.ts')) {
  const ollamaContent = fs.readFileSync('src/services/ollama-secure.ts', 'utf8');

  if (ollamaContent.includes('sanitizeInput') && ollamaContent.includes('sanitizePageContent')) {
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

  if (ollamaContent.includes('checkRateLimit') || ollamaContent.includes('RATE_LIMIT')) {
    console.log('✅ Ollama rate limiting implemented');
  } else {
    console.warn('⚠️  Ollama rate limiting not found');
    warnings++;
  }

  if (ollamaContent.includes('credentialPatterns') || ollamaContent.includes('REDACTED')) {
    console.log('✅ Credential filtering implemented');
  } else {
    console.error('❌ Credential filtering NOT implemented!');
    errors++;
  }
} else {
  console.warn('⚠️  ollama-secure.ts not found');
  warnings++;
}

// ==================== Check 7: Secrets Management ====================
console.log('\n🔑 Checking Secrets Management...\n');

if (fs.existsSync('src/security/secrets.ts')) {
  const secretsContent = fs.readFileSync('src/security/secrets.ts', 'utf8');

  if (secretsContent.includes('keytar')) {
    console.log('✅ Keytar integration present');
  } else {
    console.warn('⚠️  Keytar integration not found');
    warnings++;
  }

  if (secretsContent.includes('aes-256-gcm')) {
    console.log('✅ AES-256-GCM encryption configured');
  } else {
    console.error('❌ Strong encryption NOT configured!');
    errors++;
  }

  if (secretsContent.includes('getMasterKey') && secretsContent.includes('encryptPayload')) {
    console.log('✅ Encryption functions present');
  } else {
    console.error('❌ Encryption functions missing!');
    errors++;
  }
} else {
  console.error('❌ secrets.ts NOT found!');
  errors++;
}

// ==================== Check 8: Package.json Security ====================
console.log('\n📋 Checking package.json...\n');

if (fs.existsSync('package.json')) {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  if (packageJson.dependencies && packageJson.dependencies['keytar']) {
    console.log('✅ keytar in dependencies');
  } else {
    console.error('❌ keytar NOT in dependencies');
    console.error('   Run: npm install keytar');
    errors++;
  }

  if (packageJson.dependencies && packageJson.dependencies['dompurify']) {
    console.log('✅ dompurify in dependencies');
  } else {
    console.error('❌ dompurify NOT in dependencies');
    console.error('   Run: npm install dompurify @types/dompurify');
    errors++;
  }
} else {
  console.error('❌ package.json NOT found!');
  errors++;
}

// ==================== Check 9: Removed Dangerous Patterns ====================
console.log('\n⛔ Checking for Dangerous Patterns...\n');

const filesToCheck = [
  'electron/main.ts',
  'electron/preload.ts',
  'src/App.tsx',
  'src/components/WebView.tsx'
];

let foundDangerous = false;

filesToCheck.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');

    // Check for eval
    if (content.match(/\beval\s*\(/)) {
      console.error(`❌ eval() found in ${file}`);
      errors++;
      foundDangerous = true;
    }

    // Check for Function constructor
    if (content.match(/new\s+Function\s*\(/)) {
      console.error(`❌ new Function() found in ${file}`);
      errors++;
      foundDangerous = true;
    }
  }
});

if (!foundDangerous) {
  console.log('✅ No eval() or new Function() found');
}

// ==================== Final Report ====================
console.log('\n' + '='.repeat(60));
console.log('\n📊 SECURITY AUDIT SUMMARY\n');

console.log(`Errors:   ${errors} ❌`);
console.log(`Warnings: ${warnings} ⚠️`);

if (errors === 0 && warnings === 0) {
  console.log('\n✅ ALL SECURITY CHECKS PASSED!\n');
  console.log('Your application is configured securely.');
  console.log('\n⚠️  IMPORTANT: Still required before production:');
  console.log('  - External security audit');
  console.log('  - Penetration testing');
  console.log('  - Employee security training');
  console.log('  - Monitoring and alerting setup');
  process.exit(0);
} else if (errors === 0) {
  console.log('\n⚠️  WARNINGS FOUND\n');
  console.log('Application is secure but has minor issues to address.');
  console.log('Review warnings above and fix when possible.');
  process.exit(0);
} else {
  console.log('\n❌ CRITICAL SECURITY ISSUES FOUND!\n');
  console.log('DO NOT deploy to production until all errors are fixed.');
  console.log('\nFixes required:');
  if (errors > 0) {
    console.log('\n1. Install missing dependencies:');
    console.log('   npm install keytar dompurify @types/dompurify');
    console.log('\n2. Replace insecure files:');
    console.log('   copy electron\\main-secure.ts electron\\main.ts /Y');
    console.log('   copy electron\\preload-secure.ts electron\\preload.ts /Y');
    console.log('\n3. Update imports to use secure modules');
    console.log('\n4. Rebuild: npm run build');
    console.log('\n5. Re-run this check: node scripts\\security-check.cjs');
  }
  console.log('\nReview SECURITY_AUDIT_REPORT.md for detailed remediation steps.');
  process.exit(1);
}
