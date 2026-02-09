import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { logActivity } from '../index.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// Auth required for all endpoints
router.use(authenticateToken);

/**
 * GET /api/users
 * List all users (excluding passwords)
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT id, username, avatar_url, two_factor_enabled, permissions, created_at
      FROM users
      ORDER BY created_at DESC
    `
      )
      .all() as any[];

    // Parse permissions from JSON string
    const users = rows.map((u) => ({
      ...u,
      permissions: JSON.parse(u.permissions || '[]'),
    }));

    res.json(users);
  } catch (error) {
    console.error('[USERS] Fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

/**
 * PUT /api/users/:id/permissions
 * Updates a user's granular permissions
 */
router.put('/:id/permissions', authorize('users.manage'), (req: Request, res: Response) => {
  const { id } = req.params;
  const { permissions } = req.body;

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ message: 'Permissions must be an array' });
  }

  try {
    const authReq = req as AuthenticatedRequest;

    const result = db
      .prepare('UPDATE users SET permissions = ? WHERE id = ?')
      .run(JSON.stringify(permissions), id);

    if (result.changes === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    logActivity('USER_UPDATE', `User ID ${id} permissions updated`, 'SUCCESS', authReq.user.id);
    res.json({ message: 'User permissions updated successfully' });
  } catch (error) {
    console.error('[USERS] Permissions update error:', error);
    res.status(500).json({ message: 'Failed to update user permissions' });
  }
});

/**
 * DELETE /api/users/:id
 * Deletes user from system
 */
router.delete('/:id', authorize('users.manage'), (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const authReq = req as AuthenticatedRequest;
    // Prevent self-deletion
    if (authReq.user.id === parseInt(id as string)) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Clear user sessions
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);

    logActivity('USER_DELETE', `User ID ${id} was deleted`, 'WARNING', authReq.user.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('[USERS] Delete error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

export default router;
