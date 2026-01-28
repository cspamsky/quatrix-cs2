import { Router } from "express";
import db from "../db.js";
import { authenticateToken } from "../middleware/auth.js";
import { serverManager } from "../serverManager.js";
import path from "path";
import fs from "fs";

const router = Router();

router.use(authenticateToken);

const MAP_CFG_DIR = "game/csgo/cfg/maps_cfg";

// GET /api/maps/config/:serverId/:mapName
router.get("/config/:serverId/:mapName", async (req: any, res) => {
    const { serverId, mapName } = req.params;
    try {
        const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(serverId, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const filePath = `${MAP_CFG_DIR}/${mapName}.cfg`;
        try {
            const content = await serverManager.readFile(serverId, filePath);
            res.json({ content });
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return res.json({ content: "" });
            }
            throw error;
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to fetch map config" });
    }
});

// POST /api/maps/config/:serverId/:mapName
router.post("/config/:serverId/:mapName", async (req: any, res) => {
    const { serverId, mapName } = req.params;
    const { content } = req.body;

    try {
        const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(serverId, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        // Mutlak yol üzerinden klasör kontrolü ve oluşturma
        const serverDir = serverManager.getFilePath(serverId, "");
        const cfgDirPath = path.join(serverDir, "game/csgo/cfg/maps_cfg");

        if (!fs.existsSync(cfgDirPath)) {
            console.log(`Creating directory: ${cfgDirPath}`);
            fs.mkdirSync(cfgDirPath, { recursive: true, mode: 0o755 });
        }

        const relativeFilePath = "game/csgo/cfg/maps_cfg/" + mapName + ".cfg";
        await serverManager.writeFile(serverId, relativeFilePath, content);
        
        res.json({ success: true, message: "Map configuration saved" });
    } catch (error: any) {
        console.error("Map config save error:", error);
        res.status(500).json({ message: error.message || "Failed to save map config" });
    }
});

// GET /api/maps/workshop - Get all saved workshop maps
router.get("/workshop", (req, res) => {
    try {
        const maps = db.prepare("SELECT * FROM workshop_maps ORDER BY created_at DESC").all();
        res.json(maps);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch workshop maps" });
    }
});

// POST /api/maps/workshop - Add a new workshop map
router.post("/workshop", async (req, res) => {
    const { workshop_id } = req.body;
    
    if (!workshop_id) {
        return res.status(400).json({ message: "Workshop ID is required" });
    }

    try {
        const { registerWorkshopMap } = await import("../utils/workshop.js");
        const details = await registerWorkshopMap(workshop_id);
        
        res.status(201).json({ 
            message: "Workshop map added successfully",
            details
        });
    } catch (error) {
        console.error("Add workshop map error:", error);
        res.status(500).json({ message: "Failed to add workshop map" });
    }
});

// DELETE /api/maps/workshop/:id - Remove a workshop map
router.delete("/workshop/:id", (req, res) => {
    try {
        db.prepare("DELETE FROM workshop_maps WHERE id = ?").run(req.params.id);
        res.json({ message: "Workshop map removed" });
    } catch (error) {
        res.status(500).json({ message: "Failed to remove workshop map" });
    }
});

export default router;

