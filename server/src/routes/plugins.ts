import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import db from '../db.js';
import { serverManager } from '../serverManager.js';
import { authenticateToken } from '../middleware/auth.js';
import { type PluginId } from '../config/plugins.js';

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { AuthenticatedRequest } from '../types/index.js';
import { taskService } from '../services/TaskService.js';

const router = Router();
router.use(authenticateToken);

// Configure multer for ZIP uploads
const upload = multer({
  dest: 'data/temp/uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.zip', '.rar', '.gz', '.tar'].includes(ext) || file.originalname.endsWith('.tar.gz')) {
      cb(null, true);
    } else {
      cb(new Error('Supported formats: .zip, .rar, .tar.gz'));
    }
  },
});

// Ensure upload dir exists
if (!fs.existsSync('data/temp/uploads/')) {
  fs.mkdirSync('data/temp/uploads/', { recursive: true });
}

// GET /api/servers/plugins/registry
router.get('/plugins/registry', async (_req: Request, res: Response) => {
  const registry = await serverManager.getPluginRegistry();
  res.json(registry);
});

// GET /api/servers/:id/plugins/status
router.get('/:id/plugins/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const status = await serverManager.getPluginStatus(id as string);
    res.json(status);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// GET /api/servers/:id/plugins/updates
router.get('/:id/plugins/updates', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const updates = await serverManager.checkAllPluginUpdates(id as string);
    res.json(updates);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// GET /api/servers/:id/plugins/:plugin/configs
router.get('/:id/plugins/:plugin/configs', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const plugin = req.params.plugin as string;
  const authReq = req as AuthenticatedRequest;

  // SECURITY: Validate plugin/pluginId format
  if (!plugin || !/^[a-zA-Z0-9\-_]+$/.test(plugin)) {
    return res.status(400).json({ message: 'Invalid plugin ID format' });
  }

  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const configs = await serverManager.getPluginConfigFiles(
      id as string,
      plugin as any as PluginId
    );

    // Transform string array to objects for the frontend
    const configObjects = configs.map((fullPath) => ({
      name: path.basename(fullPath),
      path: fullPath,
    }));

    res.json(configObjects);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// POST /api/servers/:id/plugins/:plugin/configs
router.post('/:id/plugins/:plugin/configs', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const plugin = req.params.plugin as string;
  const { filePath, content } = (req.body || {}) as { filePath: string; content: string };
  const authReq = req as AuthenticatedRequest;

  // SECURITY: Validate plugin/pluginId format
  if (!plugin || !/^[a-zA-Z0-9\-_]+$/.test(plugin)) {
    return res.status(400).json({ message: 'Invalid plugin ID format' });
  }

  if (!filePath || content === undefined) {
    return res.status(400).json({ message: 'File path and content are required' });
  }

  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    await serverManager.savePluginConfigFile(
      id as string,
      plugin as any as PluginId,
      filePath,
      content
    );
    res.json({ message: 'Configuration saved successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// Generic Plugin Action (Install/Uninstall/Update)
router.post('/:id/plugins/:plugin/:action', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const plugin = req.params.plugin as string;
  const action = req.params.action as string;
  // SECURITY: Validate plugin format
  if (!plugin || !/^[a-zA-Z0-9\-_]+$/.test(plugin)) {
    return res.status(400).json({ message: 'Invalid plugin ID format' });
  }

  try {
    const { taskId: providedTaskId } = (req.body || {}) as { taskId?: string };
    const authReq = req as AuthenticatedRequest;
    console.log(`[PLUGIN DEBUG] Requested ${action} for ${plugin} on server ${id}`);
    console.log(`[PLUGIN DEBUG] User from token:`, authReq.user?.id);

    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id, authReq.user.id);

    if (!server) {
      console.warn(`[PLUGIN DEBUG] Server ${id} not found or not owned by user ${authReq.user.id}`);
      return res.status(404).json({ message: 'Server not found' });
    }

    const registry = await serverManager.getPluginRegistry();
    const pluginId = plugin as any as PluginId;

    if (!registry[pluginId]) {
      console.warn(`[PLUGIN DEBUG] Plugin ${pluginId} not found in registry`);
      return res.status(400).json({ message: 'Invalid plugin' });
    }

    if (serverManager.isServerRunning(id)) {
      return res.status(400).json({
        message: 'ERR_SERVER_RUNNING',
      });
    }

    const taskId = providedTaskId || `plugin_${action}_${plugin}_${Date.now()}`;
    const pluginName = registry[pluginId]?.name || plugin;

    if (!providedTaskId) {
      taskService.createTask(taskId, `plugin_${action}`, {
        pluginId: plugin,
        serverId: id,
        pluginName,
      });
    }

    if (action === 'install') {
      await serverManager.installPlugin(id, pluginId, taskId);
    } else if (action === 'uninstall') {
      await serverManager.uninstallPlugin(id, pluginId, taskId);
    } else if (action === 'update') {
      await serverManager.updatePlugin(id, pluginId, taskId);
    }

    res.json({ message: `Plugin ${action} started`, taskId });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Plugin action failed:', action, err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/servers/plugins/pool/upload
router.post(
  '/plugins/pool/upload',
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('pluginZip')(req, res, (err) => {
      if (err) {
        console.error('[POOL] Multer Error:', err.message);
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const { pluginId } = (req.body || {}) as { pluginId?: string };

    if (!req.file) {
      return res.status(400).json({ message: 'No ZIP file uploaded' });
    }

    try {
      await serverManager.pluginManager.uploadToPool(
        pluginId || 'unknown',
        req.file.path,
        req.file.originalname
      );
      res.json({ message: 'Plugin uploaded and processed successfully' });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[POOL] Upload error:', err.message);
      res.status(500).json({ message: err.message });
    }
  }
);

// DELETE /api/servers/plugins/pool/:pluginId
router.delete('/plugins/pool/:pluginId', async (req: Request, res: Response) => {
  const pluginId = req.params.pluginId as string;

  // Validate pluginId format before processing
  if (!pluginId || typeof pluginId !== 'string' || !/^[a-zA-Z0-9\-_]+$/.test(pluginId)) {
    return res.status(400).json({ message: 'Invalid plugin ID format' });
  }

  try {
    await serverManager.pluginManager.deleteFromPool(pluginId as string);
    res.json({ message: 'Plugin removed from pool' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

export default router;
