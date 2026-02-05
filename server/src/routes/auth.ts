import express, { type Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { verify } from 'otplib';
import db from '../db.js';
import { rateLimiter } from '../rateLimiter.js';

const router: Router = express.Router();

const authLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per window
  message: "Too many login/register attempts, please try again later"
});

router.post("/register", authLimiter, async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "Server configuration error" });
  }
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(
      "INSERT INTO users (username, password) VALUES (?, ?)"
    ).run(username, hashedPassword);

    const tokenId = Math.random().toString(36).substring(7);
    const token = jwt.sign(
      { id: result.lastInsertRowid, username, jti: tokenId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Record Session
    db.prepare(`
      INSERT INTO user_sessions (user_id, token_id, device_info, ip_address) 
      VALUES (?, ?, ?, ?)
    `).run(result.lastInsertRowid, tokenId, req.headers['user-agent'] || 'Unknown', req.ip || '127.0.0.1');

    res.status(201).json({
      token,
      user: { id: result.lastInsertRowid, username, avatar_url: null }
    });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: "Username or email already exists" });
    }
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "Server configuration error" });
  }
  const { identity, password } = req.body;
  if (!identity || !password) {
    return res.status(400).json({ message: "Missing credentials" });
  }

  try {
    const user: any = db.prepare(
      "SELECT * FROM users WHERE username = ?"
    ).get(identity);

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check 2FA
    if (user.two_factor_enabled) {
      // Return a temporary token or just a flag
      const tempToken = jwt.sign(
        { id: user.id, username: user.username, pending_2fa: true },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ 
        require_2fa: true, 
        temp_token: tempToken 
      });
    }

    const tokenId = Math.random().toString(36).substring(7);
    const token = jwt.sign(
      { id: user.id, username: user.username, jti: tokenId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Record Session
    db.prepare(`
      INSERT INTO user_sessions (user_id, token_id, device_info, ip_address) 
      VALUES (?, ?, ?, ?)
    `).run(user.id, tokenId, req.headers['user-agent'] || 'Unknown', req.ip || '127.0.0.1');

    res.json({
      token,
      user: { id: user.id, username: user.username, avatar_url: user.avatar_url }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed", error: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/login/2fa", authLimiter, async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "Server configuration error" });
  }
  const { temp_token, code } = req.body;
  if (!temp_token || !code) {
    return res.status(400).json({ message: "Missing 2FA data" });
  }

  try {
    const payload = jwt.verify(temp_token, process.env.JWT_SECRET) as any;
    if (!payload.pending_2fa) {
      return res.status(401).json({ message: "Invalid temporary token" });
    }

    const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.id);
    if (!user) return res.status(404).json({ message: "User no longer exists" });

    const isValid = verify({
      token: code,
      secret: user.two_factor_secret
    });

    if (!isValid) {
      return res.status(401).json({ message: "Invalid 2FA code" });
    }

    const tokenId = Math.random().toString(36).substring(7);
    const token = jwt.sign(
      { id: user.id, username: user.username, jti: tokenId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Record Session
    db.prepare(`
      INSERT INTO user_sessions (user_id, token_id, device_info, ip_address) 
      VALUES (?, ?, ?, ?)
    `).run(user.id, tokenId, req.headers['user-agent'] || 'Unknown', req.ip || '127.0.0.1');

    res.json({
      token,
      user: { id: user.id, username: user.username, avatar_url: user.avatar_url }
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired session" });
  }
});

export default router;
