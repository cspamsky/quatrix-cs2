import { Router } from "express";
import db from "../db.js";
import { authenticateToken } from "../middleware/auth.js";
import { databaseManager } from '../services/DatabaseManager.js';
import mysql from 'mysql2/promise';
import { serverManager } from '../serverManager.js';

const router = Router();

router.use(authenticateToken);

// GET /api/servers/:id/bans - Get ban history for a server
router.get("/:id/bans", async (req: any, res) => {
    try {
        const { id } = req.params;
        const { active_only } = req.query;

        if (!await databaseManager.isAvailable()) {
            return res.status(503).json({ message: "Database service unavailable" });
        }

        const creds = await databaseManager.getDatabaseCredentials(id);
        if (!creds) {
            return res.status(404).json({ message: "Server database not found" });
        }

        // Connect to the server's MariaDB database
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
                    b.id,
                    b.player_name,
                    b.player_steamid as steam_id,
                    b.player_ip as ip_address,
                    b.reason,
                    b.duration,
                    b.admin_name as banned_by,
                    b.created as banned_at,
                    b.ends as expires_at,
                    u.date as unbanned_at,
                    b.status as is_active
                FROM sa_bans b
                LEFT JOIN sa_unbans u ON b.unban_id = u.id
                WHERE 1=1
            `;
            
            if (active_only === 'true') {
                query += ` AND b.status = 'ACTIVE'`;
            }
            
            query += ` ORDER BY b.created DESC`;

            const [rows] = await connection.execute(query);
            
            if (!Array.isArray(rows)) {
                console.warn('[BANS] Query did not return an array as expected:', rows);
                return res.json([]);
            }

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
        console.error(`[BANS] Error fetching ban history for server ${req.params.id}:`, error);
        res.status(500).json({ 
            message: "Failed to fetch ban history", 
            error: error.message,
            code: error.code // Include MySQL error code if available
        });
    }
});

// POST /api/servers/:id/bans/:banId/unban - Unban a player
router.post("/:id/bans/:banId/unban", async (req: any, res) => {
    try {
        const { id, banId } = req.params;
        
        if (!await databaseManager.isAvailable()) {
            return res.status(503).json({ message: "Database service unavailable" });
        }

        const creds = await databaseManager.getDatabaseCredentials(id);
        if (!creds) {
            return res.status(404).json({ message: "Server database not found" });
        }

        // Connect to the server's MariaDB database
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

            // Update database (CS2-SimpleAdmin uses 'status' field and sa_unbans table)
            try {
                // 1. Insert into sa_unbans first
                const [result] = await connection.execute(
                    'INSERT INTO sa_unbans (ban_id, admin_id, reason, date) VALUES (?, ?, ?, NOW())',
                    [banId, 0, 'Unbanned via Web Panel'] // Using 0 (Console) as admin_id
                );
                const unbanId = (result as any).insertId;

                // 2. Update sa_bans with unban_id and status
                await connection.execute(`
                    UPDATE sa_bans 
                    SET status = 'UNBANNED', unban_id = ?
                    WHERE id = ?
                `, [unbanId, banId]);
            } catch (dbError: any) {
                console.warn('[UNBAN] Database compatibility fallback:', dbError.message);
                // Fallback for older schemas or missing sa_unbans
                await connection.execute(`
                    UPDATE sa_bans SET status = 'UNBANNED' WHERE id = ?
                `, [banId]);
            }

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
