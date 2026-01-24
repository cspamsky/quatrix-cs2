import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db: DatabaseType = new Database(path.join(__dirname, '../database.sqlite'));

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration to remove fullname and email columns if they exist
try {
  const tableInfo = db.pragma('table_info(users)') as any[];
  const hasFullname = tableInfo.some(col => col.name === 'fullname');
  const hasEmail = tableInfo.some(col => col.name === 'email');

  if (hasFullname || hasEmail) {
    console.log("Migrating users table to remove fullname and email...");
    
    db.exec('BEGIN TRANSACTION');
    
    // 1. Create new table with desired schema
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Copy data
    db.exec(`
      INSERT INTO users_new (id, username, password, created_at)
      SELECT id, username, password, created_at FROM users
    `);

    // 3. Drop old table
    db.exec('DROP TABLE users');

    // 4. Rename new table
    db.exec('ALTER TABLE users_new RENAME TO users');

    db.exec('COMMIT');
    console.log("Migration complete.");
  }
} catch (error) {
  console.error("Migration failed:", error);
  if (db.inTransaction) db.exec('ROLLBACK');
}

// Create servers table
db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    map TEXT DEFAULT 'de_dust2',
    max_players INTEGER DEFAULT 10,
    port INTEGER UNIQUE NOT NULL,
    rcon_password TEXT,
    status TEXT DEFAULT 'OFFLINE',
    current_players INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create index on user_id for faster lookups
db.exec(`CREATE INDEX IF NOT EXISTS idx_servers_user_id ON servers(user_id)`);

// Add new columns if they don't exist (migrations)
try {
  db.exec(`ALTER TABLE servers ADD COLUMN password TEXT`);
} catch (error) {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN vac_enabled INTEGER DEFAULT 0`);
} catch (error) {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN gslt_token TEXT`);
} catch (error) {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN steam_api_key TEXT`);
} catch (error) {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN is_installed INTEGER DEFAULT 0`);
} catch (error) {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN pid INTEGER`);
} catch (error) {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN game_type INTEGER DEFAULT 0`);
} catch (error) {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN game_mode INTEGER DEFAULT 0`);
} catch (error) {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN tickrate INTEGER DEFAULT 128`);
} catch (error) {
  // Column already exists
}

// Create settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS player_identities (
    name TEXT,
    steam_id TEXT,
    avatar_url TEXT,
    first_seen DATETIME,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (name)
  )
`);

// migrations for player_identities
try {
  db.exec(`ALTER TABLE player_identities ADD COLUMN avatar_url TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE player_identities ADD COLUMN first_seen DATETIME`);
} catch (e) {}

// Initialize default settings if they don't exist
const initializeSetting = (key: string, defaultValue: string) => {
  const existing = db.prepare("SELECT * FROM settings WHERE key = ?").get(key);
  if (!existing) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, defaultValue);
  }
};

const defaultDataDir = path.join(__dirname, '../data');
initializeSetting('steamcmd_path', path.join(defaultDataDir, 'steamcmd/steamcmd.sh'));
initializeSetting('install_dir', path.join(defaultDataDir, 'instances'));
initializeSetting('auto_plugin_updates', 'false');

// Create server_plugins table to track installed versions
db.exec(`
  CREATE TABLE IF NOT EXISTS server_plugins (
    server_id INTEGER NOT NULL,
    plugin_id TEXT NOT NULL,
    version TEXT,
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (server_id, plugin_id),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  )
`);

// Create workshop_maps table
db.exec(`
  CREATE TABLE IF NOT EXISTS workshop_maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workshop_id TEXT UNIQUE NOT NULL,
    name TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Add map_file column for matching by filename
try {
  db.exec(`ALTER TABLE workshop_maps ADD COLUMN map_file TEXT`);
} catch (e) {
  // Column already exists
}

export default db;
