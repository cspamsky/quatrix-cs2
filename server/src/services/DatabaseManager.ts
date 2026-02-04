import mysql from 'mysql2/promise';
import path from 'path';
import fs from 'fs';

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
        port: 3306
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
            port: cleanPort
        };

        console.log(`[DB] Initializing MySQL Manager with user: ${this.config.user} on ${this.config.host}:${this.config.port}`);

        try {
            this.pool = mysql.createPool({
                host: this.config.host,
                user: this.config.user,
                password: this.config.password,
                port: this.config.port,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });
            
            // Check connection
            await this.pool.getConnection();
            console.log("[DB] MySQL Manager connected successfully.");
        } catch (error: any) {
            console.error("[DB] MySQL Connection failed:", error.message);
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
        if (!this.pool) throw new Error("MySQL service is not available.");

        const id = serverId.toString();
        
        // Check if already exists in local storage
        const existing = await this.getDatabaseCredentials(id);
        if (existing) return existing;

        const dbName = `quatrix_srv_${id}`;
        const dbUser = `quatrix_u_${id}`;
        const dbPass = Math.random().toString(36).slice(-12);

        try {
            console.log(`[DB] Provisioning database ${dbName} for server ${id}...`);
            
            // Create Database
            await this.pool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
            
            // Create User and Grant Privileges
            await this.pool.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPass}'`);
            await this.pool.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
            await this.pool.query(`FLUSH PRIVILEGES`);

            const creds = {
                host: this.config.host,
                port: this.config.port,
                database: dbName,
                user: dbUser,
                password: dbPass
            };

            await this.saveCredentials(id, creds);
            return creds;
        } catch (error: any) {
            console.error(`[DB] Failed to provision database for server ${id}:`, error.message);
            throw error;
        }
    }

    async getDatabaseCredentials(serverId: string | number) {
        const id = serverId.toString();
        const all = await this.loadAllCredentials();
        return all[id] || null;
    }

    public async loadAllCredentials(): Promise<Record<string, any>> {
        try {
            if (!fs.existsSync(this.credsFile)) return {};
            const data = await fs.promises.readFile(this.credsFile, 'utf-8');
            return JSON.parse(data);
        } catch {
            return {};
        }
    }

    async saveCredentials(serverId: string, creds: any) {
        const all = await this.loadAllCredentials();
        all[serverId] = creds;
        const dir = path.dirname(this.credsFile);
        if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(this.credsFile, JSON.stringify(all, null, 2));
    }

    /**
     * Creates a database and user with custom credentials provided by the user.
     */
    async createCustomDatabase(serverId: string | number, creds: any) {
        if (!this.pool) throw new Error("MySQL service is not available.");
        const id = serverId.toString();
        
        try {
            console.log(`[DB] Creating custom database ${creds.database} for server ${id}...`);
            
            // Create Database
            await this.pool.query(`CREATE DATABASE IF NOT EXISTS \`${creds.database}\``);
            
            // Create User and Grant Privileges
            // We use 'localhost' for better security if it's a local panel
            await this.pool.query(`CREATE USER IF NOT EXISTS '${creds.user}'@'%' IDENTIFIED BY '${creds.password}'`);
            await this.pool.query(`GRANT ALL PRIVILEGES ON \`${creds.database}\`.* TO '${creds.user}'@'%'`);
            await this.pool.query(`FLUSH PRIVILEGES`);

            await this.saveCredentials(id, creds);
            return creds;
        } catch (error: any) {
            console.error(`[DB] Failed to create custom database for server ${id}:`, error.message);
            throw error;
        }
    }

    /**
     * Executes a raw SQL query against the local master database.
     * Careful: This should only be used by admins and is highly sensitive.
     */
    async executeQuery(query: string) {
        if (!this.pool) throw new Error("MySQL service is not available.");
        try {
            const [rows] = await this.pool.query(query);
            return rows;
        } catch (error: any) {
            throw new Error(`SQL Error: ${error.message}`);
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
        } catch (error: any) {
            console.warn(`[DB] Failed to drop database for server ${id} (Non-critical):`, error.message);
        }
    }

    /**
     * Gets statistics for a specific database (size in MB and table count).
     */
    async getDatabaseStats(serverId: string | number) {
        if (!this.pool) return { size: 0, tables: 0 };
        
        const dbName = `quatrix_srv_${serverId}`;
        try {
            const [rows]: any = await this.pool.query(`
                SELECT 
                    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb,
                    COUNT(*) AS table_count
                FROM information_schema.tables 
                WHERE table_schema = ?
            `, [dbName]);

            return {
                size: rows[0]?.size_mb || 0,
                tables: rows[0]?.table_count || 0
            };
        } catch (error) {
            return { size: 0, tables: 0 };
        }
    }
}

export const databaseManager = new DatabaseManager();
