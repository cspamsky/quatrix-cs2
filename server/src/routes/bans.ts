import { Router } from "express";
import db from "../db.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.use(authenticateToken);

// GET /api/servers/:id/bans - Get ban history for a server
router.get("/:id/bans", async (req: any, res) => {
    try {
        const { id } = req.params;
        const { active_only } = req.query;

        // Import DatabaseManager to access MariaDB
        const { databaseManager } = await import('../services/DatabaseManager.js');
        
        if (!await databaseManager.isAvailable()) {
            return res.status(503).json({ message: "Database service unavailable" });
        }

        const creds = await databaseManager.getDatabaseCredentials(id);
        if (!creds) {
            return res.status(404).json({ message: "Server database not found" });
        }

        // Connect to the server's MariaDB database
        const mysql = await import('mysql2/promise');
        const connection = await mysql.createConnection({
            host: creds.host,
            port: creds.port,
            user: creds.user,
            password: creds.password,
            database: creds.database
        });

        try {
            let query = `
                SELECT 
                    id,
                    player_name,
                    player_steamid as steam_id,
                    player_ip as ip_address,
                    reason,
                    duration,
                    admin_name as banned_by,
                    created as banned_at,
                    ends as expires_at,
                    RemovedOn as unbanned_at,
                    status as is_active
                FROM sa_bans
                WHERE 1=1
            `;
            
            if (active_only === 'true') {
                query += ` AND status = 'ACTIVE'`;
            }
            
            query += ` ORDER BY created DESC`;

            const [rows] = await connection.execute(query);
            
            // Transform data to match frontend expectations
            const bans = (rows as any[]).map(ban => ({
                ...ban,
                is_active: ban.is_active === 'ACTIVE' ? 1 : 0
            }));

            res.json(bans);
        } finally {
            await connection.end();
        }
    } catch (error: any) {
        console.error('[BANS] Error fetching ban history:', error);
        res.status(500).json({ message: error.message || "Failed to fetch ban history" });
    }
});

// POST /api/servers/:id/bans/:banId/unban - Unban a player
router.post("/:id/bans/:banId/unban", async (req: any, res) => {
    try {
        const { id, banId } = req.params;

        // Import DatabaseManager to access MariaDB
        const { databaseManager } = await import('../services/DatabaseManager.js');
        
        if (!await databaseManager.isAvailable()) {
            return res.status(503).json({ message: "Database service unavailable" });
        }

        const creds = await databaseManager.getDatabaseCredentials(id);
        if (!creds) {
            return res.status(404).json({ message: "Server database not found" });
        }

        // Connect to the server's MariaDB database
        const mysql = await import('mysql2/promise');
        const connection = await mysql.createConnection({
            host: creds.host,
            port: creds.port,
            user: creds.user,
            password: creds.password,
            database: creds.database
        });

        try {
            // Get ban info first
            const [rows] = await connection.execute(
                'SELECT * FROM sa_bans WHERE id = ?',
                [banId]
            );
            const ban = (rows as any[])[0];
            
            if (!ban) {
                return res.status(404).json({ message: 'Ban not found' });
            }

            // Execute css_unban command if Steam ID is available
            if (ban.player_steamid) {
                try {
                    const { serverManager } = await import('../serverManager.js');
                    await serverManager.sendCommand(id, `css_unban ${ban.player_steamid}`);
                } catch (error) {
                    console.error('[UNBAN] Failed to execute css_unban:', error);
                    // Continue anyway to update database
                }
            }

            // Update database (CS2-SimpleAdmin uses 'status' and 'RemovedOn' fields)
            await connection.execute(`
                UPDATE sa_bans 
                SET status = 'UNBANNED', RemovedOn = NOW()
                WHERE id = ?
            `, [banId]);

            res.json({ success: true, message: "Player unbanned successfully" });
        } finally {
            await connection.end();
        }
    } catch (error: any) {
        console.error('[UNBAN] Error:', error);
        res.status(500).json({ message: error.message || "Failed to unban player" });
    }
});

export default router;
