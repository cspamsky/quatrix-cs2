import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db.js';
import { serverManager } from '../serverManager.js';
import { authenticateToken } from '../middleware/auth.js';
import si from 'systeminformation';
import type { AuthenticatedRequest, Settings } from '../types/index.js';

const router = Router();

// Cache for public IP - Passed from index.ts or handled locally
let cachedPublicIp = '127.0.0.1';
const fetchPublicIp = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = (await response.json()) as { ip: string };
    cachedPublicIp = data.ip;
  } catch {
    console.warn('Could not fetch public IP in route, using default.');
  }
};
fetchPublicIp();

router.use(authenticateToken);

// GET /api/settings
router.get('/settings', (req: Request, res: Response) => {
  try {
    const settings = db.prepare('SELECT * FROM settings').all() as Array<{
      key: string;
      value: string;
    }>;
    const settingsObj = settings.reduce((acc: Settings, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
    res.json(settingsObj);
  } catch {
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

// GET /api/stats - Global dashboard stats (Optimized with SQL aggregation)
router.get('/stats', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    // Single SQL query with aggregation - offloads work to SQLite engine
    const stats = db
      .prepare(
        `
            SELECT 
                COUNT(*) as totalServers,
                COALESCE(SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END), 0) as activeServers,
                COALESCE(SUM(current_players), 0) as totalPlayers
            FROM servers 
            WHERE user_id = ?
        `
      )
      .get(authReq.user.id) as {
      totalServers: number;
      activeServers: number;
      totalPlayers: number;
    };

    res.json(stats);
  } catch {
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

// PUT /api/settings
router.put('/settings', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

    const transaction = db.transaction((items: Record<string, string>) => {
      for (const [key, value] of Object.entries(items)) {
        stmt.run(key, value);
      }
    });

    transaction(updates);

    // Refresh manager settings to pick up changes
    serverManager.refreshSettings();

    res.json({ message: 'Settings updated successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Settings update error:', err);
    res.status(500).json({ message: 'Failed to update settings', error: err.message });
  }
});

// GET /api/system/health
router.get('/system/health', async (req: Request, res: Response) => {
  try {
    const health = await serverManager.getSystemHealth();
    res.json(health);
  } catch {
    res.status(500).json({ message: 'Failed to fetch system health' });
  }
});

// POST /api/system/health/repair
router.post('/system/health/repair', async (req: Request, res: Response) => {
  try {
    const result = await serverManager.repairSystemHealth();
    res.json(result);
  } catch {
    res.status(500).json({ message: 'Failed to perform system repair' });
  }
});

// GET /api/system-info
router.get('/system-info', async (req: Request, res: Response) => {
  try {
    const [os, mem, cpu] = await Promise.all([si.osInfo(), si.mem(), si.cpu()]);

    res.json({
      os: `${os.distro} ${os.release}`,
      arch: os.arch,
      hostname: os.hostname,
      publicIp: cachedPublicIp,
      cpuModel: `${cpu.manufacturer} ${cpu.brand}`,
      totalMemory: Math.round(mem.total / 1024 / 1024), // MB
    });
  } catch {
    res.status(500).json({ message: 'Failed to fetch system info' });
  }
});

// POST /api/settings/steamcmd/download
router.post('/settings/steamcmd/download', async (req: Request, res: Response) => {
  try {
    const { path: steamPath } = req.body;
    if (!steamPath) return res.status(400).json({ message: 'Path is required' });

    // Update DB
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'steamcmd_path',
      steamPath
    );

    // Refresh manager settings to pick up new path
    serverManager.refreshSettings();

    // Simple validation or trigger download
    const success = await serverManager.ensureSteamCMD();
    if (success) {
      res.json({ message: 'SteamCMD is ready' });
    } else {
      res.status(500).json({ message: 'SteamCMD download/verification failed' });
    }
  } catch {
    res.status(500).json({ message: 'Failed to process SteamCMD download' });
  }
});

export default router;
