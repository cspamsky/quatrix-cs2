import mysql from 'mysql2/promise';
import path from 'path';
import fs from 'fs';
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
      `[DB] Initializing MySQL Manager with user: ${this.config.user} on ${this.config.host}:${this.config.port}`
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
      console.error('[DB] MySQL Connection failed:', err.message);
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
    const dbPass = existing?.password || Math.random().toString(36).slice(-12);

    try {
      console.log(`[DB] Ensuring database ${dbName} exists for server ${id}...`);

      // 2. Create Database if not exists
      await this.pool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);

      // 3. Create User/Grant (using a robust approach)
      // Note: In MariaDB/MySQL 5.7+, IDENTIFIED BY for existing user might require different syntax
      // but CREATE USER IF NOT EXISTS ... IDENTIFIED BY works for creating.
      try {
        await this.pool.query(
          `CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPass}'`
        );
      } catch {
        // If user exists but host differs or other issue, we try to force password reset if possible
        await this.pool
          .query(`SET PASSWORD FOR '${dbUser}'@'%' = PASSWORD('${dbPass}')`)
          .catch(() => {});
      }

      await this.pool.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
      await this.pool.query(`FLUSH PRIVILEGES`);

      const creds = {
        host: this.config.host,
        port: this.config.port,
        database: dbName,
        user: dbUser,
        password: dbPass,
        autoSync: true, // default new provisioned ones to autoSync
      };

      await this.saveCredentials(id, creds);
      return creds;
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`[DB] Failed to provision database for server ${id}:`, err.message);
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
      console.log(`[DB] Creating custom database ${creds.database} for server ${id}...`);

      // Create Database
      await this.pool.query(`CREATE DATABASE IF NOT EXISTS \`${creds.database}\``);

      // Create User and Grant Privileges
      // We use 'localhost' for better security if it's a local panel
      await this.pool.query(
        `CREATE USER IF NOT EXISTS '${creds.user}'@'%' IDENTIFIED BY '${creds.password}'`
      );
      await this.pool.query(
        `GRANT ALL PRIVILEGES ON \`${creds.database}\`.* TO '${creds.user}'@'%'`
      );
      await this.pool.query(`FLUSH PRIVILEGES`);

      await this.saveCredentials(id, creds);
      return creds;
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`[DB] Failed to create custom database for server ${id}:`, err.message);
      throw err;
    }
  }

  /**
   * Executes a raw SQL query against the local master database.
   * Careful: This should only be used by admins and is highly sensitive.
   */
  async executeQuery(query: string) {
    if (!this.pool) throw new Error('MySQL service is not available.');
    try {
      const [rows] = await this.pool.query(query);
      return rows;
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`SQL Error: ${err.message}`);
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
      console.log(`[DB] Dropping database ${dbName} and user ${dbUser}...`);
      await this.pool.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      await this.pool.query(`DROP USER IF EXISTS '${dbUser}'@'%'`);

      const all = await this.loadAllCredentials();
      if (all[id]) {
        delete all[id];
        await fs.promises.writeFile(this.credsFile, JSON.stringify(all, null, 2));
      }

      console.log(`[DB] Database ${dbName} cleaned up for server ${id}.`);
    } catch (error: unknown) {
      const err = error as Error;
      console.warn(`[DB] Failed to drop database for server ${id} (Non-critical):`, err.message);
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
