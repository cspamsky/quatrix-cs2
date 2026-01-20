import { Router } from "express";
import db from "../db.js";
import { serverManager } from "../serverManager.js";
import { authenticateToken } from "../middleware/auth.js";
import { pluginRegistry, type PluginId } from "../config/plugins.js";

const router = Router();

router.use(authenticateToken);

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

        if (action === 'install') {
            await serverManager.installPlugin(id, pluginId);
        } else if (action === 'uninstall') {
            await serverManager.uninstallPlugin(id, pluginId);
        } else if (action === 'update') {
            await serverManager.updatePlugin(id, pluginId);
        }

        res.json({ message: `${registry[pluginId].name} ${action}ed successfully` });
    } catch (error: any) {
        console.error(`Plugin ${action} error:`, error);
        res.status(500).json({ message: error.message });
    }
});

export default router;
