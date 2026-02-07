import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { generateSecret, verify, generateURI } from 'otplib';
import QRCode from 'qrcode';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// --- Multer Configuration for Avatar Upload ---
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = 'uploads/avatars';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const authReq = req as AuthenticatedRequest;
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${authReq.user.id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  },
});

// Middleware to ensure user is authenticated
router.use(authenticateToken);

// GET /api/profile
router.get('/', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const user = db
      .prepare(
        'SELECT id, username, avatar_url, two_factor_enabled, created_at FROM users WHERE id = ?'
      )
      .get(authReq.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ ...(user as any), currentJti: authReq.user.jti });
  } catch {
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// POST /api/profile/avatar/upload
router.post(
  '/avatar/upload',
  authenticateToken,
  upload.single('avatar'),
  (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      // Convert backslashes to forward slashes for URL
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, authReq.user.id);

      res.json({ message: 'Avatar uploaded successfully', avatarUrl });
    } catch (error: unknown) {
      const err = error as Error;
      res.status(500).json({ message: err.message || 'Failed to upload avatar' });
    }
  }
);

// PUT /api/profile/password
router.put('/password', async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  const authReq = req as AuthenticatedRequest;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new passwords are required' });
  }

  try {
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(authReq.user.id) as any;

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(
      hashedNewPassword,
      authReq.user.id
    );

    // Security: Terminate all active sessions
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(authReq.user.id);

    res.json({ message: 'Password updated successfully. Please log in again.' });
  } catch {
    res.status(500).json({ message: 'Failed to update password' });
  }
});

// PUT /api/profile/avatar
router.put('/avatar', (req: Request, res: Response) => {
  const { avatarUrl } = req.body as { avatarUrl: string };
  const authReq = req as AuthenticatedRequest;
  try {
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, authReq.user.id);
    res.json({ message: 'Avatar updated successfully', avatarUrl });
  } catch {
    res.status(500).json({ message: 'Failed to update avatar' });
  }
});

// GET /api/profile/sessions
router.get('/sessions', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const sessions = db
      .prepare('SELECT * FROM user_sessions WHERE user_id = ? ORDER BY last_active DESC')
      .all(authReq.user.id);
    res.json(sessions);
  } catch {
    res.status(500).json({ message: 'Failed to fetch sessions' });
  }
});

// DELETE /api/profile/sessions
router.delete('/sessions', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    // Terminate all sessions EXCEPT the current one
    db.prepare('DELETE FROM user_sessions WHERE user_id = ? AND token_id != ?').run(
      authReq.user.id,
      authReq.user.jti
    );
    res.json({ message: 'All other sessions terminated' });
  } catch {
    res.status(500).json({ message: 'Failed to terminate sessions' });
  }
});

// DELETE /api/profile/sessions/:tokenId
router.delete('/sessions/:tokenId', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    db.prepare('DELETE FROM user_sessions WHERE user_id = ? AND token_id = ?').run(
      authReq.user.id,
      req.params.tokenId as string
    );
    res.json({ message: 'Session terminated' });
  } catch {
    res.status(500).json({ message: 'Failed to terminate session' });
  }
});

// --- 2FA Routes ---

// POST /api/profile/2fa/setup
router.post('/2fa/setup', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const user = db
      .prepare('SELECT username, two_factor_enabled FROM users WHERE id = ?')
      .get(authReq.user.id) as any;
    if (user.two_factor_enabled) {
      return res.status(400).json({ message: '2FA is already enabled' });
    }

    const secret = generateSecret();
    const otpauth = generateURI({
      issuer: 'Quatrix Panel',
      label: user.username,
      secret,
    });
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    // Temporarily store secret in user record (not enabled yet)
    db.prepare('UPDATE users SET two_factor_secret = ? WHERE id = ?').run(secret, authReq.user.id);

    res.json({ secret, qrCodeUrl });
  } catch {
    res.status(500).json({ message: 'Failed to setup 2FA' });
  }
});

// POST /api/profile/2fa/verify
router.post('/2fa/verify', async (req: Request, res: Response) => {
  const { code } = req.body as { code: string };
  const authReq = req as AuthenticatedRequest;
  if (!code) return res.status(400).json({ message: 'Verification code is required' });

  try {
    const user = db
      .prepare('SELECT two_factor_secret FROM users WHERE id = ?')
      .get(authReq.user.id) as any;

    const isValid = verify({
      token: code,
      secret: user.two_factor_secret,
    });

    if (!isValid) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    db.prepare('UPDATE users SET two_factor_enabled = 1 WHERE id = ?').run(authReq.user.id);
    res.json({ message: '2FA enabled successfully' });
  } catch {
    res.status(500).json({ message: 'Verification failed' });
  }
});

// POST /api/profile/2fa/disable
router.post('/2fa/disable', async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const authReq = req as AuthenticatedRequest;
  if (!password) return res.status(400).json({ message: 'Password is required' });

  try {
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(authReq.user.id) as any;
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    db.prepare(
      'UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?'
    ).run(authReq.user.id);
    res.json({ message: '2FA disabled successfully' });
  } catch {
    res.status(500).json({ message: 'Failed to disable 2FA' });
  }
});

export default router;
