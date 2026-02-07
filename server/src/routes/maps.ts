import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { fileSystemService } from '../services/FileSystemService.js';
import path from 'path';
import fs from 'fs';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.use(authenticateToken);

const MAP_CFG_DIR = 'cfg/maps_cfg';

// GET /api/maps/config/:serverId/:mapName
router.get('/config/:serverId/:mapName', async (req: Request, res: Response) => {
  const { serverId, mapName } = req.params;

  if (!mapName || mapName.includes('..') || mapName.includes('/') || mapName.includes('\\')) {
    return res.status(400).json({ message: 'Invalid map name' });
  }

  const authReq = req as AuthenticatedRequest;
  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(serverId as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const serverPath = fileSystemService.getInstancePath(serverId as string);
    const mapsCfgDir = path.join(serverPath, 'game/csgo', MAP_CFG_DIR);
    const fullPath = path.resolve(mapsCfgDir, `${mapName}.cfg`);

    if (!fullPath.startsWith(path.resolve(mapsCfgDir))) {
      return res.status(403).json({ message: 'Invalid map path' });
    }

    try {
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      res.json({ content });
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        return res.json({ content: '' });
      }
      throw error;
    }
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message || 'Failed to fetch map config' });
  }
});

// POST /api/maps/config/:serverId/:mapName
router.post('/config/:serverId/:mapName', async (req: Request, res: Response) => {
  const { serverId, mapName } = req.params; // mapName will be the internal name provided by frontend
  if (!mapName || mapName.includes('..') || mapName.includes('/') || mapName.includes('\\')) {
    return res.status(400).json({ message: 'Invalid map name' });
  }

  const { content } = req.body as { content: string };
  const authReq = req as AuthenticatedRequest;

  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(serverId as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    // Ensure directory exists
    const serverPath = fileSystemService.getInstancePath(serverId as string);
    const cfgDirPath = path.join(serverPath, 'game/csgo', MAP_CFG_DIR);

    if (!fs.existsSync(cfgDirPath)) {
      fs.mkdirSync(cfgDirPath, { recursive: true, mode: 0o755 });
    }

    const fullPath = path.resolve(cfgDirPath, `${mapName}.cfg`);

    if (!fullPath.startsWith(path.resolve(cfgDirPath))) {
      return res.status(403).json({ message: 'Invalid map path' });
    }

    await fs.promises.writeFile(fullPath, content);

    res.json({ success: true, message: `Configuration saved for ${mapName}` });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Map config save error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to save map config' });
  }
});

// GET /api/maps/workshop - Get all saved workshop maps
router.get('/workshop', (_req: Request, res: Response) => {
  try {
    const maps = db.prepare('SELECT * FROM workshop_maps ORDER BY created_at DESC').all();
    res.json(maps);
  } catch {
    res.status(500).json({ message: 'Failed to fetch workshop maps' });
  }
});

// POST /api/maps/workshop - Add a new workshop map
router.post('/workshop', async (req: Request, res: Response) => {
  const { workshop_id, map_file } = req.body as { workshop_id: string; map_file?: string };

  if (!workshop_id) {
    return res.status(400).json({ message: 'Workshop ID is required' });
  }

  try {
    const { registerWorkshopMap } = await import('../utils/workshop.js');
    const details = await registerWorkshopMap(workshop_id, map_file);

    res.status(201).json({
      message: 'Workshop map added successfully',
      details,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Add workshop map error:', err.message);
    res.status(500).json({ message: 'Failed to add workshop map' });
  }
});

// DELETE /api/maps/workshop/:id - Remove a workshop map
router.delete('/workshop/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM workshop_maps WHERE id = ?').run(req.params.id as string);
    res.json({ message: 'Workshop map removed' });
  } catch {
    res.status(500).json({ message: 'Failed to remove workshop map' });
  }
});

// POST /api/maps/workshop/:serverId - Set active workshop map for server
router.post('/workshop/:serverId', async (req: Request, res: Response) => {
  const { serverId } = req.params;
  const { workshop_id } = req.body as { workshop_id: string };
  const authReq = req as AuthenticatedRequest;

  if (!workshop_id) {
    return res.status(400).json({ message: 'Workshop ID is required' });
  }

  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(serverId as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    // Update server's active map to the workshop ID
    db.prepare('UPDATE servers SET map = ? WHERE id = ?').run(workshop_id, serverId as string);

    res.json({ success: true, message: `Active workshop map set to ${workshop_id}` });
  } catch {
    res.status(500).json({ message: 'Failed to set active workshop map' });
  }
});

export default router;
