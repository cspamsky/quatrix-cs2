import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db.js';
import { serverManager } from '../serverManager.js';
import { taskService } from '../services/TaskService.js';
import { authenticateToken } from '../middleware/auth.js';
import { logActivity, emitDashboardStats } from '../index.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.use(authenticateToken);

// POST /api/servers/:id/start
router.post('/:id/start', async (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id as string) as any;
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const io = req.app.get('io');
    await serverManager.startServer(id as string, server, (data: string) => {
      if (io) io.emit(`console:${id}`, data);
    });

    db.prepare("UPDATE servers SET status = 'ONLINE' WHERE id = ?").run(id as string);
    if (io) io.emit('status_update', { serverId: parseInt(id as string), status: 'ONLINE' });
    emitDashboardStats();

    logActivity('SERVER_START', `${server.name} sunucusu başlatıldı`, 'SUCCESS', authReq.user.id);

    res.json({ message: 'Server starting...' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message || 'Failed to start server' });
  }
});

// POST /api/servers/:id/stop
router.post('/:id/stop', async (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  try {
    await serverManager.stopServer(id as string);

    const server = db.prepare('SELECT name FROM servers WHERE id = ?').get(id as string) as any;
    db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id as string);
    const io = req.app.get('io');
    if (io) io.emit('status_update', { serverId: parseInt(id as string), status: 'OFFLINE' });
    emitDashboardStats();

    logActivity(
      'SERVER_STOP',
      `${server?.name || id} sunucusu durduruldu`,
      'INFO',
      authReq.user.id
    );

    res.json({ message: 'Server stopping...' });
  } catch {
    res.status(500).json({ message: 'Failed to stop server' });
  }
});

// POST /api/servers/:id/restart
router.post('/:id/restart', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const server: any = db.prepare('SELECT * FROM servers WHERE id = ?').get(id as string);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const io = req.app.get('io');

    // Stop the server and update UI
    await serverManager.stopServer(id as string);
    db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id as string);
    if (io) io.emit('status_update', { serverId: parseInt(id as string), status: 'OFFLINE' });

    // Wait a moment for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start the server and update UI
    await serverManager.startServer(id as string, server, (data: string) => {
      if (io) io.emit(`console:${id}`, data);
    });

    db.prepare("UPDATE servers SET status = 'ONLINE' WHERE id = ?").run(id as string);
    if (io) io.emit('status_update', { serverId: parseInt(id as string), status: 'ONLINE' });

    res.json({ message: 'Server restarting...' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// POST /api/servers/:id/install
router.post('/:id/install', async (req: Request, res: Response) => {
  const { id } = req.params;
  console.log(`[API] POST /api/servers/${id}/install - Manual install trigger`);
  try {
    const io = req.app.get('io');

    db.prepare("UPDATE servers SET status = 'INSTALLING' WHERE id = ?").run(id as string);
    if (io) io.emit('status_update', { serverId: id, status: 'INSTALLING' });

    const taskId = `install-${id}-${Date.now()}`;
    taskService.createTask(taskId, 'server_install', { serverId: id as string });

    serverManager
      .installOrUpdateServer(
        id as string,
        (data: string) => {
          if (io) io.emit(`console:${id}`, data);
        },
        taskId
      )
      .then(() => {
        db.prepare("UPDATE servers SET status = 'OFFLINE', is_installed = 1 WHERE id = ?").run(
          id as string
        );
        if (io) io.emit('status_update', { serverId: id, status: 'OFFLINE' });
      })
      .catch((err: any) => {
        console.error(`[SYSTEM] Installation failed for ${id}:`, err);
        db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id as string);
        if (io) io.emit('status_update', { serverId: id, status: 'OFFLINE' });
        taskService.failTask(taskId, err.message || 'Installation failed');
      });

    res.json({ message: 'Installation started', taskId });
  } catch {
    res.status(500).json({ message: 'Failed to start installation' });
  }
});

// POST /api/servers/:id/abort-install
router.post('/:id/abort-install', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await serverManager.stopServer(id as string); // Use generic stop

    db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id as string);
    const io = req.app.get('io');
    if (io) io.emit('status_update', { serverId: id, status: 'OFFLINE' });

    res.json({ message: 'Installation aborted' });
  } catch {
    res.status(500).json({ message: 'Failed to abort installation' });
  }
});

// POST /api/servers/:id/rcon
router.post('/:id/rcon', async (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  try {
    const { command } = req.body as { command?: string };
    if (!command) return res.status(400).json({ message: 'Command is required' });

    const io = req.app.get('io');
    if (io) io.emit(`console:${id}`, `> ${command}`);

    const response = await serverManager.sendCommand(id as string, command);

    // Immediate database sync for map changes
    if (
      command.toLowerCase().startsWith('map ') ||
      command.toLowerCase().startsWith('host_workshop_map ')
    ) {
      const parts = command.split(' ');
      if (parts.length > 1) {
        const newMap = parts[1];
        db.prepare('UPDATE servers SET map = ? WHERE id = ?').run(newMap, id as string);
        if (io) io.emit('server_update', { serverId: parseInt(id as string) });
      }
    }

    if (response && response.trim() && io) {
      io.emit(`console:${id}`, response);
    }

    const server = db.prepare('SELECT name FROM servers WHERE id = ?').get(id as string) as any;
    logActivity(
      'RCON_COMMAND',
      `${server?.name || id}: ${command} komutu gönderildi`,
      'INFO',
      authReq.user.id
    );

    res.json({ success: true, response });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message || 'RCON command failed' });
  }
});

export default router;
