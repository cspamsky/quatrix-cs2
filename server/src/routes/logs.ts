import { Router } from "express";
import db from "../db.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.use(authenticateToken);

// GET /api/logs/activity (Global Activity Logs)
router.get("/activity/recent", (req: any, res) => {
    const limit = parseInt(req.query.limit?.toString() || "15");
    try {
        const logs = db.prepare(`
            SELECT * FROM activity_logs 
            ORDER BY created_at DESC 
            LIMIT ?
        `).all(limit);
        res.json(logs);
    } catch (error) {
        console.error("Fetch activity logs error:", error);
        res.status(500).json({ message: "Failed to fetch activity logs" });
    }
});

// GET /api/logs/:serverId
router.get("/:serverId", (req: any, res) => {
    const { serverId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    try {
        // Verify server belongs to user (for security)
        const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(serverId, req.user.id);
        if (!server) {
            return res.status(403).json({ message: "Access denied or server not found" });
        }

        const logs = db.prepare(`
            SELECT * FROM join_logs 
            WHERE server_id = ? 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `).all(serverId, parseInt(limit.toString()), parseInt(offset.toString()));

        res.json(logs);
    } catch (error) {
        console.error("Fetch join logs error:", error);
        res.status(500).json({ message: "Failed to fetch join logs" });
    }
});

export default router;
