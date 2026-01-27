import { Router } from "express";
import db from "../db.js";
import { serverManager } from "../serverManager.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.use(authenticateToken);

// GET /api/servers/:id/players
router.get("/:id/players", async (req: any, res) => {
    try {
        const id = req.params.id;
        const players = await serverManager.getPlayers(id);
        res.json(players);
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to fetch players" });
    }
});

// POST /api/servers/:id/players/:userId/kick
router.post("/:id/players/:userId/kick", async (req: any, res) => {
    try {
        const { id, userId } = req.params;
        const { reason } = req.body;
        const cmd = `kickid ${userId} "${reason || 'Kicked by administrator'}"`;
        await serverManager.sendCommand(id, cmd);
        res.json({ success: true, message: `Player ${userId} kicked` });
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to kick player" });
    }
});

// POST /api/servers/:id/players/:userId/ban
router.post("/:id/players/:userId/ban", async (req: any, res) => {
    try {
        const { id, userId } = req.params;
        const { duration, reason, playerName, steamId, ipAddress } = req.body;
        
        const durationMinutes = parseInt(duration) || 0;
        const banReason = reason || 'Banned by admin';
        
        if (!steamId || steamId === 'Hidden/Pending') {
            return res.status(400).json({ message: 'Steam ID required for ban' });
        }
        
        // 1. Send RCON commands to the server
        try {
            // Ban the player currently in-game using their UserID
            await serverManager.sendCommand(id, `banid ${durationMinutes} ${userId}`);
            // Tell the server to write its current memory ban list to files
            await serverManager.sendCommand(id, `writeid`);
            // Also notify SimpleAdmin
            await serverManager.sendCommand(id, `css_addban ${steamId} ${durationMinutes} "${banReason}"`);
        } catch (rconError) {
            console.log('[BAN] RCON commands sent, some might have failed if player already left:', rconError);
        }

        // 2. FORCE PERSISTENCE: Manually write to banned_user.cfg
        try {
            const fs = await import('fs');
            const path = await import('path');
            // Get server instance directory (you'll need to make sure this path is correct for your setup)
            // Typically: D:\PROJE\quatrix\server\data\instances\{id}\game\csgo\cfg\banned_user.cfg
            // For VDS/Linux it's usually /root/quatrix/server/data/instances/...
            
            // We use the serverManager's logic to find the file
            const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as any;
            if (server) {
                const cfgPath = path.join(process.cwd(), 'data', 'instances', id.toString(), 'game', 'csgo', 'cfg', 'banned_user.cfg');
                const banLine = `banid ${durationMinutes} ${steamId}\n`;
                
                // Append to file (or create if not exists)
                fs.appendFileSync(cfgPath, banLine);
                console.log(`[BAN] Manually added ${steamId} to ${cfgPath}`);
            }
        } catch (fsError) {
            console.error('[BAN] Failed to manually write to banned_user.cfg:', fsError);
        }
        
        // 3. Record in our web panel database
        const expiresAt = durationMinutes > 0 
            ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
            : null;
        
        db.prepare(`
            INSERT INTO ban_history (
                server_id, player_name, steam_id, ip_address, reason, 
                duration, banned_by, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            playerName || `User`,
            steamId,
            ipAddress || null,
            banReason,
            durationMinutes,
            req.user?.username || 'Admin',
            expiresAt
        );
        
        res.json({ success: true, message: `Player banned successfully` });
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to ban player" });
    }
});

export default router;
