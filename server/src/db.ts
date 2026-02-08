import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// quatrix/server/src/db.ts -> quatrix/
const projectRoot = path.resolve(__dirname, '../../');
const defaultDataDir = path.join(projectRoot, 'data');
const defaultInstallDir = path.join(defaultDataDir, 'instances');

// Ensure database directory exists before creating Database instance
if (!fs.existsSync(defaultDataDir)) {
  fs.mkdirSync(defaultDataDir, { recursive: true });
}

const dbPath = path.join(defaultDataDir, 'database.sqlite');
const db: DatabaseType = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration to add profile columns if they don't exist
try {
  db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
  db.exec(`ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0`);
  db.exec(`ALTER TABLE users ADD COLUMN two_factor_secret TEXT`);
  console.log('Migration: Added profile columns to users table.');
} catch {
  // Columns already exist
}

// Create user_sessions table
db.exec(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_id TEXT UNIQUE NOT NULL, -- Short ID or hash of the JWT
    device_info TEXT,
    ip_address TEXT,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Migration to remove fullname and email columns if they exist
try {
  const tableInfo = db.pragma('table_info(users)') as { name: string }[];
  const hasFullname = tableInfo.some((col) => col.name === 'fullname');
  const hasEmail = tableInfo.some((col) => col.name === 'email');

  if (hasFullname || hasEmail) {
    console.log('Migrating users table to remove fullname and email...');

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
    console.log('Migration complete.');
  }
} catch (error) {
  console.error('Migration failed:', error);
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
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN vac_enabled INTEGER DEFAULT 0`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN gslt_token TEXT`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN steam_api_key TEXT`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN is_installed INTEGER DEFAULT 0`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN pid INTEGER`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN game_type INTEGER DEFAULT 0`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN game_mode INTEGER DEFAULT 0`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN tickrate INTEGER DEFAULT 128`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN auto_start INTEGER DEFAULT 0`);
} catch {
  /* ignore */
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN game_alias TEXT`);
} catch {
  /* ignore */
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN hibernate INTEGER DEFAULT 1`);
} catch {
  /* ignore */
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN validate_files INTEGER DEFAULT 0`);
} catch {
  /* ignore */
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN additional_args TEXT`);
} catch {
  /* ignore */
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN region INTEGER DEFAULT 3`);
} catch {
  /* ignore */
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN auto_update INTEGER DEFAULT 0`);
} catch {
  /* ignore */
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN cpu_priority INTEGER DEFAULT 0`);
} catch {
  /* ignore */
}

try {
  db.exec(`ALTER TABLE servers ADD COLUMN ram_limit INTEGER DEFAULT 0`);
} catch {
  /* ignore */
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
} catch {
  /* ignore */
}
try {
  db.exec(`ALTER TABLE player_identities ADD COLUMN first_seen DATETIME`);
} catch {
  /* ignore */
}

// Initialize default settings if they don't exist
const initializeSetting = (key: string, defaultValue: string) => {
  const existing = db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, defaultValue);
  }
};

// Redundant declarations removed as they are moved to the top
const steamCmdExe = 'steamcmd.sh';

const steamCmdPath = path.join(defaultDataDir, 'steamcmd', steamCmdExe);

// Ensure paths are correct for the CURRENT environment, always.
db.prepare("UPDATE settings SET value = ? WHERE key = 'steamcmd_path'").run(steamCmdPath);
db.prepare("UPDATE settings SET value = ? WHERE key = 'install_dir'").run(defaultInstallDir);

initializeSetting('steamcmd_path', steamCmdPath);
initializeSetting('install_dir', defaultInstallDir);
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
} catch {
  // Column already exists
}

// Create ban_history table
db.exec(`
  CREATE TABLE IF NOT EXISTS ban_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    steam_id TEXT,
    ip_address TEXT,
    reason TEXT,
    duration INTEGER DEFAULT 0,
    banned_by TEXT,
    banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    unbanned_at DATETIME,
    unbanned_by TEXT,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  )
`);

// Create index for faster ban lookups
db.exec(`CREATE INDEX IF NOT EXISTS idx_ban_history_server_id ON ban_history(server_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ban_history_steam_id ON ban_history(steam_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ban_history_active ON ban_history(is_active)`);

// Create chat_logs table
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    steam_id TEXT,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'say', -- say or say_team
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  )
`);

// Create index for chat logs
db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_logs_server_id ON chat_logs(server_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at)`);

// Create join_logs table
db.exec(`
  CREATE TABLE IF NOT EXISTS join_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    steam_id TEXT,
    event_type TEXT NOT NULL, -- 'join' or 'leave'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  )
`);

// Create index for join logs
db.exec(`CREATE INDEX IF NOT EXISTS idx_join_logs_server_id ON join_logs(server_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_join_logs_created_at ON join_logs(created_at)`);

// Create activity_logs table for administrative events
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL, -- 'SERVER_START', 'PLUGIN_INSTALL', etc.
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'INFO', -- 'INFO', 'WARNING', 'ERROR', 'SUCCESS'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at)`);

// Create plugin_metadata_cache table for faster discovery
db.exec(`
  CREATE TABLE IF NOT EXISTS plugin_metadata_cache (
    plugin_id TEXT PRIMARY KEY,
    name TEXT,
    category TEXT,
    description TEXT,
    folder_name TEXT,
    version TEXT,
    is_custom INTEGER DEFAULT 0,
    last_scanned DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export default db;
