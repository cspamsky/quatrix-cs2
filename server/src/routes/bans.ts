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

        let query = `
            SELECT * FROM ban_history 
            WHERE server_id = ?
        `;
        
        if (active_only === 'true') {
            query += ` AND is_active = 1`;
        }
        
        query += ` ORDER BY banned_at DESC`;

        const bans = db.prepare(query).all(id);
        res.json(bans);
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to fetch ban history" });
    }
});

// POST /api/servers/:id/bans/:banId/unban - Unban a player
router.post("/:id/bans/:banId/unban", async (req: any, res) => {
    try {
        const { banId } = req.params;
        const { unbanned_by } = req.body;

        db.prepare(`
            UPDATE ban_history 
            SET is_active = 0, unbanned_at = CURRENT_TIMESTAMP, unbanned_by = ?
            WHERE id = ?
        `).run(unbanned_by || 'Admin', banId);

        res.json({ success: true, message: "Player unbanned successfully" });
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to unban player" });
    }
});

export default router;
