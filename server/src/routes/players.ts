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
        
        // 1. Send Triple-Layer Ban Protection
        const durationMinutes = parseInt(duration) || 0;
        const banReason = reason || 'Banned by admin';
        
        if (!steamId || steamId === 'Hidden/Pending') {
            return res.status(400).json({ message: 'Steam ID required for ban' });
        }

        try {
            console.log(`[BAN DEBUG] EXECUTING MASTER BAN for ${playerName}`);

            // 1. Core Ban Commands
            // We send multiple formats to ensure SimpleAdmin catches it regardless of MultiServerMode
            await serverManager.sendCommand(id, `css_ban #${userId} ${durationMinutes} "${banReason}"`);
            await serverManager.sendCommand(id, `css_addban ${steamId} ${durationMinutes} "${banReason}"`);
            
            // 2. Engine Level (Native)
            await serverManager.sendCommand(id, `banid ${durationMinutes} ${steamId}`);
            await serverManager.sendCommand(id, `writeid`);

            // 3. Force Immediate Enforcement
            await serverManager.sendCommand(id, `kickid ${userId} "${banReason}"`);
            
        } catch (rconError) {
            console.error('[BAN ERROR] RCON failure:', rconError);
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
