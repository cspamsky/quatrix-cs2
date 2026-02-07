import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// Middleware for this router
router.use(authenticateToken);

// GET /api/chat/:serverId
router.get('/:serverId', (req: Request, res: Response) => {
  const { serverId } = req.params;
  const { limit = 50, offset = 0 } = req.query as { limit?: string; offset?: string };
  const authReq = req as AuthenticatedRequest;

  try {
    // Verify server belongs to user (optional but recommended for security)
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(serverId as string, authReq.user.id);
    if (!server) {
      return res.status(403).json({ message: 'Access denied or server not found' });
    }

    const logs = db
      .prepare(
        `
            SELECT * FROM chat_logs 
            WHERE server_id = ? 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `
      )
      .all(serverId as string, parseInt(limit.toString()), parseInt(offset.toString()));

    res.json(logs);
  } catch (error) {
    console.error('Fetch chat logs error:', error);
    res.status(500).json({ message: 'Failed to fetch chat logs' });
  }
});

export default router;
