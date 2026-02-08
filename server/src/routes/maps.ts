import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { mapManager } from '../services/MapManager.js';
import { taskService } from '../services/TaskService.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.use(authenticateToken);

// GET /api/maps/config/:serverId/:mapName
router.get('/config/:serverId/:mapName', async (req: Request, res: Response) => {
  const { serverId, mapName } = req.params;
  const authReq = req as AuthenticatedRequest;

  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(serverId as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const content = await mapManager.getMapConfig(serverId as string, mapName as string);
    res.json({ content });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message || 'Failed to fetch map config' });
  }
});

// POST /api/maps/config/:serverId/:mapName
router.post('/config/:serverId/:mapName', async (req: Request, res: Response) => {
  const { serverId, mapName } = req.params;
  const { content } = req.body as { content: string };
  const authReq = req as AuthenticatedRequest;

  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(serverId as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    await mapManager.saveMapConfig(serverId as string, mapName as string, content);
    res.json({ success: true, message: `Configuration saved for ${mapName}` });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Map config save error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to save map config' });
  }
});

// GET /api/maps/workshop - Get all saved workshop maps
router.get('/workshop', async (_req: Request, res: Response) => {
  try {
    const maps = await mapManager.getWorkshopMaps();
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
    const taskId = `workshop_add_${workshop_id}_${Date.now()}`;
    taskService.createTask(taskId, 'workshop_add', { workshopId: workshop_id });

    const details = await mapManager.addWorkshopMap(workshop_id, map_file, taskId);
    if (!details) throw new Error('Failed to register workshop map');

    res.status(201).json({
      message: 'Workshop map added successfully',
      details,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Add workshop map error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to add workshop map' });
  }
});

// DELETE /api/maps/workshop/:id - Remove a workshop map
router.delete('/workshop/:id', async (req: Request, res: Response) => {
  try {
    await mapManager.deleteWorkshopMap(req.params.id as string);
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

    await mapManager.setActiveMap(serverId as string, workshop_id);
    res.json({ success: true, message: `Active workshop map set to ${workshop_id}` });
  } catch {
    res.status(500).json({ message: 'Failed to set active workshop map' });
  }
});

export default router;
