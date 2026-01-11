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
    fullname TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Add username column if it doesn't exist (migration for existing databases)
try {
  db.exec(`ALTER TABLE users ADD COLUMN username TEXT UNIQUE`);
} catch (error) {
  // Column already exists, ignore error
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

// Create settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

// Initialize default settings if they don't exist
const initializeSetting = (key: string, defaultValue: string) => {
  const existing = db.prepare("SELECT * FROM settings WHERE key = ?").get(key);
  if (!existing) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, defaultValue);
  }
};

const defaultDataDir = path.join(__dirname, '../data');
initializeSetting('steamcmd_path', path.join(defaultDataDir, 'steamcmd/steamcmd.exe'));
initializeSetting('install_dir', path.join(defaultDataDir, 'servers'));

export default db;
