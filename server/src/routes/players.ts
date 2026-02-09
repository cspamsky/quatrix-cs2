import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db.js';
import { serverManager } from '../serverManager.js';
import { authenticateToken } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.use(authenticateToken);

// GET /api/servers/:id/players
router.get('/:id/players', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const players = await serverManager.getPlayers(id as string);
    res.json(players);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message || 'Failed to fetch players' });
  }
});

// POST /api/servers/:id/players/:userId/kick
router.post('/:id/players/:userId/kick', async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;
    const { reason }: { reason?: string } = req.body;
    const cmd = `kickid ${userId} "${reason || 'Kicked by administrator'}"`;
    await serverManager.sendCommand(id as string, cmd);
    res.json({ success: true, message: `Player ${userId} kicked` });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message || 'Failed to kick player' });
  }
});

// POST /api/servers/:id/players/:userId/ban
router.post('/:id/players/:userId/ban', async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;
    const { duration, reason, playerName, steamId, ipAddress } = req.body as {
      duration: string | number;
      reason?: string;
      playerName?: string;
      steamId: string;
      ipAddress?: string;
    };
    const authReq = req as AuthenticatedRequest;

    // 1. Send Triple-Layer Ban Protection
    const durationMinutes = parseInt(duration.toString()) || 0;
    const banReason = reason || 'Banned by admin';

    if (!steamId || steamId === 'Hidden/Pending') {
      return res.status(400).json({ message: 'Steam ID required for ban' });
    }

    try {
      console.log(`[BAN DEBUG] EXECUTING MASTER BAN for ${playerName}`);

      // 1. Core Ban Command (SimpleAdmin)
      // css_ban will handle both the ban enforcement and MySQL database recording
      await serverManager.sendCommand(
        id as string,
        `css_ban #${userId} ${durationMinutes} "${banReason}"`
      );

      // 2. Engine Level Backup (Native)
      // This ensures the player is banned even if the plugin has issues
      await serverManager.sendCommand(id as string, `banid ${durationMinutes} ${steamId}`);
      await serverManager.sendCommand(id as string, `writeid`);

      // 3. Force Immediate Kick (Safety fallback)
      await serverManager.sendCommand(id as string, `kickid ${userId} "${banReason}"`);
    } catch (rconError) {
      console.error('[BAN ERROR] RCON failure:', rconError);
    }

    res.json({ success: true, message: `Player banned via SimpleAdmin` });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message || 'Failed to ban player' });
  }
});

export default router;
