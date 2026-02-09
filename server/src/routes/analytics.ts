import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/analytics
// Query params: range=24h (default), 7d, 30d
router.get('/', authenticateToken, (req: Request, res: Response) => {
  try {
    const { range } = req.query;
    let timeFilter = '-24 hours';

    if (range === '7d') {
      timeFilter = '-7 days';
    } else if (range === '30d') {
      timeFilter = '-30 days';
    }

    // SQLite data retrieval with time filter
    const stats = db
      .prepare(
        `
      SELECT 
        cpu, 
        ram, 
        net_in, 
        net_out, 
        disk_read, 
        disk_write, 
        timestamp 
      FROM system_analytics 
      WHERE timestamp >= datetime('now', ?)
      ORDER BY timestamp ASC
    `
      )
      .all(timeFilter);

    res.json(stats);
  } catch (error) {
    console.error('[AnalyticsRoute] Error fetching stats:', error);
    res.status(500).json({ message: 'Failed to fetch analytics data' });
  }
});

export default router;
