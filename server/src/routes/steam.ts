import { Router } from 'express';
import type { Request, Response } from 'express';
import { getPlayerAvatars } from '../utils/steamApi.js';
import { z } from 'zod';

const router = Router();

// Validation schema
const AvatarRequestSchema = z.object({
  steamIds: z.string().transform((s) =>
    s
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  ),
});

/**
 * GET /api/steam/avatars?steamIds=id1,id2,id3
 * Returns a map of SteamID -> AvatarURL
 */
router.get('/avatars', async (req: Request, res: Response) => {
  try {
    const { steamIds } = AvatarRequestSchema.parse(req.query);

    if (steamIds.length === 0) {
      return res.json({});
    }

    if (steamIds.length > 100) {
      return res.status(400).json({ error: 'Too many Steam IDs requested (max 100)' });
    }

    const avatars = await getPlayerAvatars(steamIds);
    // Convert Map to Object for JSON response
    const avatarObj = Object.fromEntries(avatars);

    res.json(avatarObj);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[API] Failed to fetch avatars:', err.message);
    res.status(400).json({ error: 'Invalid request' });
  }
});

export default router;
