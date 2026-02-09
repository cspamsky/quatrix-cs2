import express, { type Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { verify } from 'otplib';
import db from '../db.js';
import { rateLimiter } from '../rateLimiter.js';

interface DbUser {
  id: number;
  username: string;
  password: string;
  avatar_url?: string | null;
  two_factor_enabled?: number;
  two_factor_secret?: string;
  permissions: string; // JSON string in DB
}

interface JwtPayload {
  id: number;
  username: string;
  permissions: string[];
  jti?: string;
  pending_2fa?: boolean;
}

const router: Router = express.Router();

const authLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per window
  message: 'Too many login/register attempts, please try again later',
});

router.post('/register', authLimiter, async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'Server configuration error' });
  }
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const permissions = userCount.count === 0 ? ['*'] : [];

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db
      .prepare('INSERT INTO users (username, password) VALUES (?, ?)')
      .run(username, hashedPassword);

    const tokenId = Math.random().toString(36).substring(7);
    const token = jwt.sign(
      { id: result.lastInsertRowid, username, permissions, jti: tokenId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Record Session
    db.prepare(
      `
      INSERT INTO user_sessions (user_id, token_id, device_info, ip_address) 
      VALUES (?, ?, ?, ?)
    `
    ).run(
      result.lastInsertRowid,
      tokenId,
      req.headers['user-agent'] || 'Unknown',
      req.ip || '127.0.0.1'
    );

    // Also set permissions string in DB for this new user
    db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(
      JSON.stringify(permissions),
      result.lastInsertRowid
    );

    res.status(201).json({
      token,
      user: { id: result.lastInsertRowid, username, permissions, avatar_url: null },
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message: string };
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'Username or email already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'Server configuration error' });
  }
  const { identity, password } = req.body;
  if (!identity || !password) {
    return res.status(400).json({ message: 'Missing credentials' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(identity) as
      | DbUser
      | undefined;

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const permissions = JSON.parse(user.permissions || '[]');

    // Check 2FA
    if (user.two_factor_enabled) {
      // Return a temporary token
      const tempToken = jwt.sign(
        { id: user.id, username: user.username, permissions, pending_2fa: true },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        require_2fa: true,
        temp_token: tempToken,
      });
    }

    const tokenId = Math.random().toString(36).substring(7);
    const token = jwt.sign(
      { id: user.id, username: user.username, permissions, jti: tokenId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Record Session
    db.prepare(
      `
      INSERT INTO user_sessions (user_id, token_id, device_info, ip_address) 
      VALUES (?, ?, ?, ?)
    `
    ).run(user.id, tokenId, req.headers['user-agent'] || 'Unknown', req.ip || '127.0.0.1');

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        permissions,
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Login failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post('/login/2fa', authLimiter, async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'Server configuration error' });
  }
  const { temp_token, code } = req.body;
  if (!temp_token || !code) {
    return res.status(400).json({ message: 'Missing 2FA data' });
  }

  try {
    const payload = jwt.verify(temp_token, process.env.JWT_SECRET) as JwtPayload;
    if (!payload.pending_2fa) {
      return res.status(401).json({ message: 'Invalid temporary token' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) as
      | DbUser
      | undefined;
    if (!user) return res.status(404).json({ message: 'User no longer exists' });
    if (!user.two_factor_secret) {
      return res.status(500).json({ message: '2FA not properly configured' });
    }

    const isValid = verify({
      token: code,
      secret: user.two_factor_secret,
    });

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid 2FA code' });
    }

    const permissions = JSON.parse(user.permissions || '[]');
    const tokenId = Math.random().toString(36).substring(7);
    const token = jwt.sign(
      { id: user.id, username: user.username, permissions, jti: tokenId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Record Session
    db.prepare(
      `
      INSERT INTO user_sessions (user_id, token_id, device_info, ip_address) 
      VALUES (?, ?, ?, ?)
    `
    ).run(user.id, tokenId, req.headers['user-agent'] || 'Unknown', req.ip || '127.0.0.1');

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        permissions,
        avatar_url: user.avatar_url,
      },
    });
  } catch {
    res.status(401).json({ message: 'Invalid or expired session' });
  }
});

export default router;
