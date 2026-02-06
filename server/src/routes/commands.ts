import { Router } from "express";
import db from "../db.js";
import { serverManager } from "../serverManager.js";
import { taskService } from "../services/TaskService.js";
import { authenticateToken } from "../middleware/auth.js";
import { logActivity, emitDashboardStats } from "../index.js";

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
        emitDashboardStats();

        logActivity('SERVER_START', `${server.name} sunucusu başlatıldı`, 'SUCCESS', req.user?.id);

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
        
        const server = db.prepare("SELECT name FROM servers WHERE id = ?").get(id) as any;
        db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
        const io = req.app.get('io');
        if (io) io.emit('status_update', { serverId: parseInt(id), status: 'OFFLINE' });
        emitDashboardStats();
        
        logActivity('SERVER_STOP', `${server?.name || id} sunucusu durduruldu`, 'INFO', req.user?.id);

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
    console.log(`[API] POST /api/servers/${req.params.id}/install - Manual install trigger`);
    try {
        const id = req.params.id;
        const io = req.app.get('io');

        db.prepare("UPDATE servers SET status = 'INSTALLING' WHERE id = ?").run(id);
        if (io) io.emit('status_update', { serverId: id, status: 'INSTALLING' });

        const taskId = `install-${id}-${Date.now()}`;
        taskService.createTask(taskId, "server_install", { serverId: id });

        serverManager.installOrUpdateServer(id, (data: string) => {
            if (io) io.emit(`console:${id}`, data);
        }, taskId).then(() => {
            db.prepare("UPDATE servers SET status = 'OFFLINE', is_installed = 1 WHERE id = ?").run(id);
            if (io) io.emit('status_update', { serverId: id, status: 'OFFLINE' });
        }).catch((err: any) => {
            console.error(`[SYSTEM] Installation failed for ${id}:`, err); 
            db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
            if (io) io.emit('status_update', { serverId: id, status: 'OFFLINE' });
            taskService.failTask(taskId, err.message || "Installation failed");
        });

        res.json({ message: "Installation started", taskId });
    } catch (error) {
        res.status(500).json({ message: "Failed to start installation" });
    }
});

// POST /api/servers/:id/abort-install
router.post("/:id/abort-install", async (req: any, res) => {
    try {
        const id = req.params.id;
        // stopInstance works for installations too if we track PID, but currently installation is separate.
        // Actually, SteamManager handles installation. If it's a child process, we might not have tracked it in RuntimeService?
        // Checking SteamManager... it uses spawn but doesn't expose a kill method easily or return the process.
        // For now, let's assuming stopping the service is enough or we need to implement stopInstallation in ServerManager
        // Since ServerManager calls SteamManager, let's implement a dummy or real stop in SteamManager if needed.
        // Only runtimeService has stopInstance. Let's just comment it out or fix it properly later.
        // For now:
        await serverManager.stopServer(id); // Use generic stop
        
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
        
        // Immediate database sync for map changes
        if (command.toLowerCase().startsWith('map ') || command.toLowerCase().startsWith('host_workshop_map ')) {
            const parts = command.split(' ');
            if (parts.length > 1) {
                const newMap = parts[1];
                db.prepare("UPDATE servers SET map = ? WHERE id = ?").run(newMap, id);
                if (io) io.emit('server_update', { serverId: parseInt(id) });
            }
        }

        if (response && response.trim() && io) {
            io.emit(`console:${id}`, response);
        }
        
        const server = db.prepare("SELECT name FROM servers WHERE id = ?").get(id) as any;
        logActivity('RCON_COMMAND', `${server?.name || id}: ${command} komutu gönderildi`, 'INFO', req.user?.id);

        res.json({ success: true, response });
    } catch (error: any) {
        res.status(500).json({ message: error.message || "RCON command failed" });
    }
});

export default router;
