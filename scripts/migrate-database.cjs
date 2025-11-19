/**
 * Database Migration Script
 * Migrates plaintext sequences to encrypted format
 *
 * Run once: node scripts/migrate-database.cjs
 */

const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('🔄 DATABASE MIGRATION TOOL\n');
console.log('This will migrate your plaintext database to encrypted format.');
console.log('='.repeat(60) + '\n');

// Note: This is a standalone script, not using the full Electron app
// For actual migration, you'll need to run this through Electron
// or manually specify the database path

function migrateDatabase() {
  try {
    // Get user data path (you may need to adjust this based on your OS)
    const userDataPath = process.env.APPDATA ||
                         (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');

    const appDataPath = path.join(userDataPath, 'agentic-browser');
    const oldDbPath = path.join(appDataPath, 'sequences.db');
    const newDbPath = path.join(appDataPath, 'secure.db');

    console.log('📁 Database paths:');
    console.log(`   Old: ${oldDbPath}`);
    console.log(`   New: ${newDbPath}\n`);

    // Check if old database exists
    if (!fs.existsSync(oldDbPath)) {
      console.log('✅ No old database found. Nothing to migrate.');
      console.log('   Your database will be created encrypted on first use.');
      return;
    }

    console.log('📊 Found old database. Checking structure...\n');

    // Open old database
    const oldDb = new Database(oldDbPath, { readonly: true });

    // Check if it has the old schema
    const tables = oldDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sequences'").all();

    if (tables.length === 0) {
      console.log('⚠️  Old database has no sequences table. Nothing to migrate.');
      oldDb.close();
      return;
    }

    // Check if it's already encrypted
    const columns = oldDb.pragma('table_info(sequences)');
    const hasEncryption = columns.some(col => col.name === 'encrypted_data');

    if (hasEncryption) {
      console.log('✅ Database is already encrypted. No migration needed.');
      oldDb.close();
      return;
    }

    // Get all sequences
    const sequences = oldDb.prepare('SELECT * FROM sequences').all();
    oldDb.close();

    if (sequences.length === 0) {
      console.log('ℹ️  No sequences found in old database.');
      return;
    }

    console.log(`📦 Found ${sequences.length} sequence(s) to migrate:\n`);

    sequences.forEach((seq, idx) => {
      console.log(`   ${idx + 1}. ${seq.name} (${seq.tasks ? JSON.parse(seq.tasks).length : 0} tasks)`);
    });

    console.log('\n⚠️  IMPORTANT: Migration requires the secure Electron app running.');
    console.log('   This script shows what would be migrated.\n');

    console.log('📝 To complete migration:\n');
    console.log('   1. Start your Electron app with the secure database');
    console.log('   2. The app will automatically use encrypted storage');
    console.log('   3. Re-save your sequences through the app UI\n');

    console.log('🔒 Manual migration option:\n');
    console.log('   If you have sensitive data in the old DB:');
    console.log('   1. Export sequences from old app');
    console.log('   2. Start new secure app');
    console.log('   3. Import sequences (they will be encrypted)\n');

    console.log(`📋 Sequences to re-save:`);
    sequences.forEach((seq) => {
      try {
        const tasks = JSON.parse(seq.tasks);
        console.log(`\n   Sequence: ${seq.name}`);
        console.log(`   Tasks: ${tasks.length}`);
        console.log(`   Created: ${seq.created_at}`);
      } catch (e) {
        console.log(`\n   Sequence: ${seq.name} (parsing error)`);
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Migration plan generated.');
    console.log('   Your old database is safe and unchanged.');
    console.log('\n💡 Recommendation:');
    console.log('   1. Keep old DB as backup until migration verified');
    console.log('   2. Use new secure app for all new data');
    console.log('   3. Re-create sequences in new app');
    console.log('   4. After verification, delete old DB\n');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.error('\n   Please check:');
    console.error('   - Database file exists and is readable');
    console.error('   - You have necessary permissions');
    console.error('   - Database is not corrupted\n');
    process.exit(1);
  }
}

// Run migration
migrateDatabase();
