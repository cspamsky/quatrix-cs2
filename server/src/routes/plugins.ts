import { Router } from "express";
import db from "../db.js";
import { serverManager } from "../serverManager.js";
import { authenticateToken } from "../middleware/auth.js";
import { pluginRegistry, type PluginId } from "../config/plugins.js";

import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();
router.use(authenticateToken);

// Configure multer for ZIP uploads
const upload = multer({ 
    dest: "data/temp/uploads/",
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.zip', '.rar', '.gz', '.tar'].includes(ext) || file.originalname.endsWith('.tar.gz')) {
            cb(null, true);
        } else {
            cb(new Error("Supported formats: .zip, .rar, .tar.gz"));
        }
    }
});

// Ensure upload dir exists
if (!fs.existsSync("data/temp/uploads/")) {
    fs.mkdirSync("data/temp/uploads/", { recursive: true });
}

// GET /api/servers/plugins/registry
router.get("/plugins/registry", async (req: any, res) => {
    const registry = await serverManager.getPluginRegistry();
    res.json(registry);
});

// GET /api/servers/:id/plugins/status
router.get("/:id/plugins/status", async (req: any, res) => {
    const { id } = req.params;
    try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const status = await serverManager.getPluginStatus(id);
        res.json(status);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/servers/:id/plugins/updates
router.get("/:id/plugins/updates", async (req: any, res) => {
    const { id } = req.params;
    try {
        const updates = await serverManager.checkAllPluginUpdates(id);
        res.json(updates);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/servers/:id/plugins/:plugin/configs
router.get("/:id/plugins/:plugin/configs", async (req: any, res) => {
    const { id, plugin } = req.params;
    try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const configs = await serverManager.getPluginConfigFiles(id, plugin);
        res.json(configs);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/servers/:id/plugins/:plugin/configs
router.post("/:id/plugins/:plugin/configs", async (req: any, res) => {
    const { id, plugin } = req.params;
    const { filePath, content } = req.body;

    if (!filePath || content === undefined) {
        return res.status(400).json({ message: "File path and content are required" });
    }

    try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        await serverManager.savePluginConfigFile(id, plugin as any, filePath, content);
        res.json({ message: "Configuration saved successfully" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// Generic Plugin Action (Install/Uninstall/Update)
router.post("/:id/plugins/:plugin/:action", async (req: any, res) => {
    const { id, plugin, action } = req.params;
    try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const registry = await serverManager.getPluginRegistry();
        const pluginId = plugin as PluginId;
        
        if (!registry[pluginId]) {
            return res.status(400).json({ message: "Invalid plugin" });
        }

        if (serverManager.isServerRunning(id)) {
            return res.status(400).json({ 
                message: "Cannot modify plugins while the server is running. Please stop the server first." 
            });
        }

        if (action === 'install') {
            await serverManager.installPlugin(id, plugin);
        } else if (action === 'uninstall') {
            await serverManager.uninstallPlugin(id, plugin);
        } else if (action === 'update') {
            await serverManager.updatePlugin(id, plugin);
        }

        res.json({ message: `${registry[plugin]?.name || plugin} ${action}ed successfully` });
    } catch (error: any) {
        console.error(`Plugin ${action} error:`, error);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/servers/plugins/pool/upload
router.post("/plugins/pool/upload", (req, res, next) => {
    upload.single('pluginZip')(req, res, (err) => {
        if (err) {
            console.error("[POOL] Multer Error:", err.message);
            return res.status(400).json({ message: err.message });
        }
        next();
    });
}, async (req: any, res) => {
    const { pluginId } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ message: "No ZIP file uploaded" });
    }

    try {
        await serverManager.pluginManager.uploadToPool(pluginId || "unknown", req.file.path, req.file.originalname);
        res.json({ message: "Plugin uploaded and processed successfully" });
    } catch (error: any) {
        console.error("[POOL] Upload error:", error);
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/servers/plugins/pool/:pluginId
router.delete("/plugins/pool/:pluginId", async (req, res) => {
    const { pluginId } = req.params;
    try {
        await serverManager.pluginManager.deleteFromPool(pluginId);
        res.json({ message: "Plugin removed from pool" });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
