import { Router } from "express";
import { serverManager } from "../serverManager.js";
import { authenticateToken } from "../middleware/auth.js";
import db from "../db.js";
import { fileSystemService } from "../services/FileSystemService.js";
import path from "path";
import fs from "fs";

const router = Router();

router.use(authenticateToken);

const ADMINS_FILE_PATH = "addons/counterstrikesharp/configs/admins.json";
// Ensure all path parts are lowercase for Linux consistency

// GET /api/servers/:id/admins
router.get("/:id/admins", async (req: any, res) => {
    const { id } = req.params;
    try {
        // Validation: verify server ownership
        const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const serverPath = fileSystemService.getInstancePath(id);
        const csgoPath = path.join(serverPath, "game", "csgo");
        const filePath = path.join(csgoPath, ADMINS_FILE_PATH);
        
        // 1. Read from JSON file (primary source)
        let jsonAdmins: any = {};
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            jsonAdmins = JSON.parse(content);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                console.error('[ADMINS] Error reading JSON:', error.message);
            }
        }

        // 2. Read from MariaDB (secondary source, for sync verification)
        try {
            const { databaseManager } = await import('../services/DatabaseManager.js');
            
            if (await databaseManager.isAvailable()) {
                const creds = await databaseManager.getDatabaseCredentials(id);
                
                if (creds) {
                    const mysql = await import('mysql2/promise');
                    const connection = await mysql.createConnection({
                        host: creds.host,
                        port: creds.port,
                        user: creds.user,
                        password: creds.password,
                        database: creds.database
                    });

                    try {
                        const [rows] = await connection.execute(
                            'SELECT * FROM sa_admins WHERE server_id = ?',
                            [id]
                        );

                        // Merge MariaDB admins into JSON format (if not already present)
                        for (const row of rows as any[]) {
                            // Check if this Steam ID already exists in JSON (by checking identity field)
                            const existsInJson = Object.values(jsonAdmins).some(
                                (admin: any) => admin.identity === row.player_steamid.toString()
                            );
                            
                            if (!existsInJson) {
                                // Add admin with name as key (to match JSON format)
                                jsonAdmins[row.player_name] = {
                                    identity: row.player_steamid.toString(),
                                    flags: row.flags?.split(',') || ['@css/root'],
                                    immunity: row.immunity || 100
                                };
                            }
                        }
                    } finally {
                        await connection.end();
                    }
                }
            }
        } catch (dbError: any) {
            console.error('[ADMINS] Failed to read from MariaDB:', dbError.message);
            // Continue with JSON data only
        }

        res.json(jsonAdmins);
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to fetch admins" });
    }
});

// POST /api/servers/:id/admins
router.post("/:id/admins", async (req: any, res) => {
    const { id } = req.params;
    const admins = req.body; // Expecting the full admins object

    try {
        // Validation: verify server ownership
        const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const serverPath = fileSystemService.getInstancePath(id);
        const csgoPath = path.join(serverPath, "game", "csgo");
        const filePath = path.join(csgoPath, ADMINS_FILE_PATH);
        
        // 1. Write to JSON file (for CounterStrikeSharp)
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, JSON.stringify(admins, null, 4));
        
        // 2. Sync to MariaDB (for CS2-SimpleAdmin)
        try {
            const { databaseManager } = await import('../services/DatabaseManager.js');
            
            if (await databaseManager.isAvailable()) {
                const creds = await databaseManager.getDatabaseCredentials(id);
                
                if (creds) {
                    const mysql = await import('mysql2/promise');
                    const connection = await mysql.createConnection({
                        host: creds.host,
                        port: creds.port,
                        user: creds.user,
                        password: creds.password,
                        database: creds.database
                    });

                    try {
                        // Clear existing admins for this server (optional, or use REPLACE INTO)
                        await connection.execute('DELETE FROM sa_admins WHERE server_id = ?', [id]);

                        // Insert each admin into sa_admins table
                        for (const [adminName, adminData] of Object.entries(admins)) {
                            const admin = adminData as any;
                            
                            // Extract Steam ID from identity field
                            const steamId = admin.identity || adminName;
                            
                            // Skip if Steam ID is invalid
                            if (!/^\d{17}$/.test(steamId)) {
                                console.warn(`[ADMINS] Skipping invalid Steam ID for ${adminName}: ${steamId}`);
                                continue;
                            }
                            
                            await connection.execute(`
                                INSERT INTO sa_admins (
                                    player_steamid, 
                                    player_name, 
                                    flags, 
                                    immunity, 
                                    server_id,
                                    created
                                ) VALUES (?, ?, ?, ?, ?, NOW())
                            `, [
                                steamId,
                                adminName,
                                admin.flags?.join(',') || '@css/root',
                                admin.immunity || 100,
                                id
                            ]);
                        }

                        console.log(`[ADMINS] Synced ${Object.keys(admins).length} admins to MariaDB for server ${id}`);
                    } finally {
                        await connection.end();
                    }
                }
            }
        } catch (dbError: any) {
            console.error('[ADMINS] Failed to sync to MariaDB:', dbError.message);
            // Continue anyway - JSON file is the primary source
        }
        
        // 3. Reload admins in-game if server is running
        if (serverManager.isServerRunning(id)) {
            await serverManager.sendCommand(id, "css_reloadadmins");
        }

        res.json({ success: true, message: "Admins updated successfully" });
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to update admins" });
    }
});

export default router;
