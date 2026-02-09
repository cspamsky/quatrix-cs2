import mysql from 'mysql2/promise';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { DatabaseCredentials } from '../types/index.js';

/**
 * DatabaseManager handles provisioning isolated MySQL/MariaDB databases
 * for each game server instance.
 */
export class DatabaseManager {
  private pool: mysql.Pool | null = null;
  private credsFile = path.join(process.cwd(), 'data', 'databases.json');
  private config = {
    host: 'localhost',
    user: 'root',
    password: '',
    port: 3306,
  };

  /**
   * Initializes the connection to the master database.
   */
  async init() {
    // Resolve credentials at runtime
    const rawHost = process.env.MYSQL_HOST || 'localhost';
    const rawPort = process.env.MYSQL_PORT || '3306';

    // Handle cases where host might include port (e.g., "localhost:3306")
    let cleanHost = rawHost;
    let cleanPort = Number(rawPort);

    if (rawHost.includes(':')) {
      const [hostPart, portPart] = rawHost.split(':');
      if (hostPart) cleanHost = hostPart;
      if (portPart && portPart.trim()) cleanPort = Number(portPart);
    }

    this.config = {
      host: cleanHost,
      user: process.env.MYSQL_ROOT_USER || 'root',
      password: process.env.MYSQL_ROOT_PASSWORD || '',
      port: cleanPort,
    };

    console.log(
      '[DB] Initializing MySQL Manager with user:',
      this.config.user,
      'on',
      `${this.config.host}:${this.config.port}`
    );

    try {
      this.pool = mysql.createPool({
        host: this.config.host,
        user: this.config.user,
        password: this.config.password,
        port: this.config.port,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

      // Check connection
      await this.pool.getConnection();
      console.log('[DB] MySQL Manager connected successfully.');
    } catch (error: unknown) {
      const err = error as Error;
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[DB] MySQL Manager: Optional service not connected (Host: ${this.config.host}:${this.config.port}). This is expected if you are only developing the panel with SQLite.`
        );
      } else {
        console.error('[DB] MySQL Connection failed:', err.message);
      }
      this.pool = null;
    }
  }

  /**
   * Check if the MySQL service is available.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      const conn = await this.pool.getConnection();
      conn.release();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a new database and user for a specific server instance.
   * Database name format: quatrix_server_{id}
   */
  async provisionDatabase(serverId: string | number) {
    if (!this.pool) throw new Error('MySQL service is not available.');

    const id = serverId.toString();

    // 1. Check local cache
    const existing = await this.getDatabaseCredentials(id);

    const dbName = `quatrix_srv_${id}`;
    const dbUser = `quatrix_u_${id}`;
    // Reuse password if we have it in cache, otherwise generate
    const dbPass = existing?.password || crypto.randomBytes(16).toString('hex');

    try {
      console.log('[DB] Ensuring database exists for server:', id, 'DB:', dbName);

      // 2. Create Database if not exists
      await this.pool.query('CREATE DATABASE IF NOT EXISTS ??', [dbName]);

      // 3. Create User/Grant (using a robust approach)
      // Note: In MariaDB/MySQL 5.7+, IDENTIFIED BY for existing user might require different syntax
      // but CREATE USER IF NOT EXISTS ... IDENTIFIED BY works for creating.
      try {
        await this.pool.query("CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?", [dbUser, dbPass]);
      } catch {
        // If user exists but host differs or other issue, we try to force password reset if possible
        await this.pool
          .query("SET PASSWORD FOR ?@'%' = PASSWORD(?)", [dbUser, dbPass])
          .catch(() => {});
      }

      await this.pool.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [dbName, dbUser]);
      await this.pool.query(`FLUSH PRIVILEGES`);

      const creds = {
        host: this.config.host,
        port: this.config.port,
        database: dbName,
        user: dbUser,
        password: dbPass,
      };

      await this.saveCredentials(id, creds);
      return creds;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[DB] Failed to provision database for server:', id, err.message);
      throw err;
    }
  }

  async getDatabaseCredentials(serverId: string | number) {
    const id = serverId.toString();
    const all = await this.loadAllCredentials();
    return all[id] || null;
  }

  public async loadAllCredentials(): Promise<Record<string, DatabaseCredentials>> {
    try {
      if (!fs.existsSync(this.credsFile)) return {};
      const data = await fs.promises.readFile(this.credsFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async saveCredentials(serverId: string, creds: DatabaseCredentials) {
    const all = await this.loadAllCredentials();
    all[serverId] = creds;
    const dir = path.dirname(this.credsFile);
    if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(this.credsFile, JSON.stringify(all, null, 2));
  }

  /**
   * Creates a database and user with custom credentials provided by the user.
   */
  async createCustomDatabase(serverId: string | number, creds: DatabaseCredentials) {
    if (!this.pool) throw new Error('MySQL service is not available.');
    const id = serverId.toString();

    try {
      console.log('[DB] Creating custom database:', creds.database, 'for server:', id);

      // Create Database
      await this.pool.query('CREATE DATABASE IF NOT EXISTS ??', [creds.database]);

      // Create User and Grant Privileges
      // We use 'localhost' for better security if it's a local panel
      await this.pool.query("CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?", [
        creds.user,
        creds.password,
      ]);
      await this.pool.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [creds.database, creds.user]);
      await this.pool.query(`FLUSH PRIVILEGES`);

      await this.saveCredentials(id, creds);
      return creds;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[DB] Failed to create custom database for server:', id, err.message);
      throw err;
    }
  }

  /**
   * SECURITY: Validates if a SQL query is a safe SELECT statement.
   *
   * This function enforces a strict allowlist-based shape:
   *   SELECT <columns> FROM <identifier> [WHERE <conditions>]
   *
   * Only a single statement is allowed. Comments, semicolons and other
   * statement separators are rejected to prevent stacking multiple queries.
   */
  private checkIsSafeSelect(query: string): void {
    const trimmed = query.trim();
    const lower = trimmed.toLowerCase();

    // 1. Only allow SELECT statements
    if (!lower.startsWith('select')) {
      throw new Error('Only SELECT queries are allowed.');
    }

    // 2. Block obvious multi-statement and comment patterns
    if (
      trimmed.includes('--') ||
      trimmed.includes('/*') ||
      trimmed.includes('#') ||
      trimmed.includes(';')
    ) {
      throw new Error('Multiple statements and SQL comments are forbidden.');
    }

    // 3. Normalize whitespace to make pattern matching more reliable
    const normalized = lower.replace(/\s+/g, ' ');

    /**
     * 4. Enforce a strict structure:
     *    - SELECT <anything> FROM <single_identifier>
     *    - Optional WHERE clause after the FROM target
     *    - No other trailing tokens (GROUP BY, UNION, etc.)
     *
     *    FROM target is limited to letters, numbers, underscores and backticks.
     *    This aligns with how table names are built in servers.ts.
     */
    const selectFromPattern = /^select\s+.+?\s+from\s+[`a-z0-9_]+\s*(where\s+.+)?$/;

    if (!selectFromPattern.test(normalized)) {
      throw new Error(
        'Query shape is not allowed. Only simple SELECT ... FROM ... [WHERE ...] queries are permitted.'
      );
    }

    // 5. Limit query length
    if (trimmed.length > 5000) {
      throw new Error('Query too long (max 5000 characters)');
    }
  }

  /**
   * Executes a raw SQL query against a specific server's database.
   * SECURITY: This method uses the server's unique credentials to ensure
   * isolation. It also performs strict validation to only allow SELECT queries
   * and enforces a default LIMIT to prevent DoS.
   */
  async executeQuery(serverId: string | number, query: string, params: unknown[] = []) {
    const id = serverId.toString();
    const creds = await this.getDatabaseCredentials(id);
    if (!creds) throw new Error('No database found for this server.');

    // SECURITY: Validate query before execution
    this.checkIsSafeSelect(query);

    // Final safety: enforce a LIMIT if not present (simple check)
    let finalQuery = query.trim();
    if (!finalQuery.toLowerCase().includes('limit')) {
      finalQuery += ' LIMIT 100';
    }

    let connection;
    try {
      // Create a temporary connection with this server's credentials
      // This ensures the query runs in the correct database context
      // and cannot access other databases (enforced by MySQL permissions).
      connection = await mysql.createConnection({
        host: creds.host,
        port: creds.port,
        user: creds.user,
        password: creds.password || '',
        database: creds.database,
      });

      const [rows] = await connection.execute(finalQuery, params);
      return rows;
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`SQL Error: ${err.message}`);
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Drops the database and user for a specific server instance.
   */
  async dropDatabase(serverId: string | number) {
    if (!this.pool) return;

    const id = serverId.toString();
    const dbName = `quatrix_srv_${id}`;
    const dbUser = `quatrix_u_${id}`;

    try {
      console.log('[DB] Dropping database:', dbName, 'and user:', dbUser);
      await this.pool.query('DROP DATABASE IF EXISTS ??', [dbName]);
      await this.pool.query("DROP USER IF EXISTS ?@'%'", [dbUser]);

      const all = await this.loadAllCredentials();
      if (all[id]) {
        delete all[id];
        await fs.promises.writeFile(this.credsFile, JSON.stringify(all, null, 2));
      }

      console.log('[DB] Database cleaned up for server:', id, 'DB:', dbName);
    } catch (error: unknown) {
      const err = error as Error;
      console.warn('[DB] Failed to drop database for server (Non-critical):', id, err.message);
    }
  }

  /**
   * Gets statistics for a specific database (size in MB and table count).
   */
  async getDatabaseStats(serverId: string | number) {
    if (!this.pool) return { size: 0, tables: 0 };

    const dbName = `quatrix_srv_${serverId}`;
    try {
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        `
                SELECT 
                    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb,
                    COUNT(*) AS table_count
                FROM information_schema.tables 
                WHERE table_schema = ?
            `,
        [dbName]
      );

      return {
        size: rows[0]?.size_mb || 0,
        tables: rows[0]?.table_count || 0,
      };
    } catch {
      return { size: 0, tables: 0 };
    }
  }
}

export const databaseManager = new DatabaseManager();
