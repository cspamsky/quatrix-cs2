import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.use(authenticateToken);

// GET /api/logs/activity (Global Activity Logs)
router.get('/activity/recent', (_req: Request, res: Response) => {
  const limit = parseInt((_req.query.limit || '15').toString());
  try {
    const logs = db
      .prepare(
        `
            SELECT * FROM activity_logs 
            ORDER BY created_at DESC 
            LIMIT ?
        `
      )
      .all(limit);
    res.json(logs);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Fetch activity logs error:', err.message);
    res.status(500).json({ message: 'Failed to fetch activity logs' });
  }
});

// GET /api/logs/:serverId
router.get('/:serverId', (req: Request, res: Response) => {
  const { serverId } = req.params;
  const { limit = 50, offset = 0 } = req.query as { limit?: string; offset?: string };
  const authReq = req as AuthenticatedRequest;

  try {
    // Verify server belongs to user (for security)
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(serverId as string, authReq.user.id);
    if (!server) {
      return res.status(403).json({ message: 'Access denied or server not found' });
    }

    const logs = db
      .prepare(
        `
            SELECT * FROM join_logs 
            WHERE server_id = ? 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `
      )
      .all(serverId as string, parseInt(limit.toString()), parseInt(offset.toString()));

    res.json(logs);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Fetch join logs error:', err.message);
    res.status(500).json({ message: 'Failed to fetch join logs' });
  }
});

export default router;
