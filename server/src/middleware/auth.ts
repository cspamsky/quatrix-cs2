import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '../types/index.js';
import db from '../db.js';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET is not defined.');
    return res.status(500).json({ message: 'Server configuration error' });
  }
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  jwt.verify(token, process.env.JWT_SECRET, (err: unknown, decoded: unknown) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });

    const user = decoded as User;

    // REAL-TIME SESSION CHECK:
    // Check if the session still exists in the database
    if (user.jti) {
      const session = db
        .prepare('SELECT 1 FROM user_sessions WHERE token_id = ? AND user_id = ?')
        .get(user.jti, user.id);
      if (!session) {
        return res.status(403).json({ message: 'Session has been terminated' });
      }

      // Update last active
      db.prepare('UPDATE user_sessions SET last_active = CURRENT_TIMESTAMP WHERE token_id = ?').run(
        user.jti
      );
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - appending to request
    req.user = user;
    next();
  });
};
