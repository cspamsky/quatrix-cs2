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

// GET /api/servers/:id/admins
router.get("/:id/admins", async (req: any, res) => {
    const { id } = req.params;
    try {
        // Validation: verify server ownership
        const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const serverPath = fileSystemService.getInstancePath(id);
        const filePath = path.join(serverPath, ADMINS_FILE_PATH);
        const content = await fs.promises.readFile(filePath, 'utf-8');
        res.json(JSON.parse(content));
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // If file doesn't exist, return empty object (SimpleAdmin format is usually {} with SteamIDs as keys)
            return res.json({});
        }
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
        const filePath = path.join(serverPath, ADMINS_FILE_PATH);
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, JSON.stringify(admins, null, 4));
        
        // Reload admins in-game if server is running
        if (serverManager.isServerRunning(id)) {
            await serverManager.sendCommand(id, "css_reloadadmins");
        }

        res.json({ success: true, message: "Admins updated successfully" });
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to update admins" });
    }
});

export default router;
