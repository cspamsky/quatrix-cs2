import { Router } from "express";
import db from "../db.js";
import { serverManager } from "../serverManager.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.use(authenticateToken);

// POST /api/servers/:id/start
router.post("/:id/start", async (req: any, res) => {
    try {
        const id = req.params.id;
        const server = db.prepare("SELECT * FROM servers WHERE id = ?").get(id) as any;
        if (!server) return res.status(404).json({ message: "Server not found" });

        const io = req.app.get('io');
        await serverManager.startServer(id, server, (data: string) => {
            if (io) io.emit(`console:${id}`, data);
        });

        db.prepare("UPDATE servers SET status = 'ONLINE' WHERE id = ?").run(id);
        if (io) io.emit('status_update', { serverId: parseInt(id), status: 'ONLINE' });

        res.json({ message: "Server starting..." });
    } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to start server" });
    }
});

// POST /api/servers/:id/stop
router.post("/:id/stop", async (req: any, res) => {
    try {
        const id = req.params.id;
        await serverManager.stopServer(id);
        
        db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
        const io = req.app.get('io');
        if (io) io.emit('status_update', { serverId: parseInt(id), status: 'OFFLINE' });
        
        res.json({ message: "Server stopping..." });
    } catch (error) {
        res.status(500).json({ message: "Failed to stop server" });
    }
});

// POST /api/servers/:id/restart
router.post("/:id/restart", async (req: any, res) => {
    const id = req.params.id;
    try {
      const server: any = db.prepare("SELECT * FROM servers WHERE id = ?").get(id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      const io = req.app.get('io');
      
      // Stop the server and update UI
      await serverManager.stopServer(id);
      db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
      if (io) io.emit('status_update', { serverId: parseInt(id), status: 'OFFLINE' });

      // Wait a moment for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Start the server and update UI
      await serverManager.startServer(id, server, (data: string) => {
        if (io) io.emit(`console:${id}`, data);
      });

      db.prepare("UPDATE servers SET status = 'ONLINE' WHERE id = ?").run(id);
      if (io) io.emit('status_update', { serverId: parseInt(id), status: 'ONLINE' });
      
      res.json({ message: "Server restarting..." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
});

// POST /api/servers/:id/install
router.post("/:id/install", async (req: any, res) => {
    try {
        const id = req.params.id;
        const io = req.app.get('io');

        db.prepare("UPDATE servers SET status = 'INSTALLING' WHERE id = ?").run(id);
        if (io) io.emit('status_update', { serverId: id, status: 'INSTALLING' });

        serverManager.installOrUpdateServer(id, (data: string) => {
            if (io) io.emit(`console:${id}`, data);
        }).then(() => {
            db.prepare("UPDATE servers SET status = 'OFFLINE', is_installed = 1 WHERE id = ?").run(id);
            if (io) io.emit('status_update', { serverId: id, status: 'OFFLINE' });
        }).catch((err) => {
            db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
            if (io) io.emit('status_update', { serverId: id, status: 'OFFLINE' });
        });

        res.json({ message: "Installation started" });
    } catch (error) {
        res.status(500).json({ message: "Failed to start installation" });
    }
});

// POST /api/servers/:id/abort-install
router.post("/:id/abort-install", async (req: any, res) => {
    try {
        const id = req.params.id;
        await serverManager.stopInstallation(id);
        
        db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
        const io = req.app.get('io');
        if (io) io.emit('status_update', { serverId: id, status: 'OFFLINE' });
        
        res.json({ message: "Installation aborted" });
    } catch (error) {
        res.status(500).json({ message: "Failed to abort installation" });
    }
});

// POST /api/servers/:id/rcon
router.post("/:id/rcon", async (req: any, res) => {
    try {
        const { command } = req.body;
        const id = req.params.id;
        if (!command) return res.status(400).json({ message: "Command is required" });
        
        const io = req.app.get('io');
        if (io) io.emit(`console:${id}`, `> ${command}`);

        const response = await serverManager.sendCommand(id, command);
        if (response && response.trim() && io) {
            io.emit(`console:${id}`, response);
        }
        
        res.json({ success: true, response });
    } catch (error: any) {
        res.status(500).json({ message: error.message || "RCON command failed" });
    }
});

export default router;
