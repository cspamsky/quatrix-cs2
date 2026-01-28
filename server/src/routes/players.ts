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
        
        // 1. Send the CSS addban command (confirmed working by user)
        const durationMinutes = parseInt(duration) || 0;
        const banReason = reason || 'No reason provided';
        
        let cmd = '';
        if (steamId && steamId !== 'Hidden/Pending') {
            cmd = `css_addban ${steamId} ${durationMinutes} "${banReason}"`;
        } else {
            cmd = `css_addban #${userId} ${durationMinutes} "${banReason}"`;
        }

        try {
            // A. SimpleAdmin Ban (for Database & Active Session)
            await serverManager.sendCommand(id, cmd);
            
            // B. CS2 Native Ban (for 100% Persistence across restarts)
            if (steamId && steamId !== 'Hidden/Pending') {
                await serverManager.sendCommand(id, `banid ${durationMinutes} ${steamId}`);
                await serverManager.sendCommand(id, `writeid`);
            }
        } catch (rconError) {
            console.error('[BAN] RCON command failed:', rconError);
        }
        
        // 2. Record in our web panel database for History page
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
            playerName || `User #${userId}`,
            steamId || null,
            ipAddress || null,
            banReason,
            durationMinutes,
            req.user?.username || 'Admin',
            expiresAt
        );
        
        res.json({ success: true, message: `Player banned via SimpleAdmin` });
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to ban player" });
    }
});

export default router;
