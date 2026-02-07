import { type Request, type Response, type NextFunction } from 'express';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
}

const ipHits = new Map<string, { count: number; resetTime: number }>();

export const rateLimiter = (config: RateLimitConfig) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const record = ipHits.get(ip);

    if (!record || now > record.resetTime) {
      ipHits.set(ip, { count: 1, resetTime: now + config.windowMs });
      return next();
    }

    if (record.count >= config.max) {
      return res.status(429).json({
        message: config.message || 'Too many requests, please try again later.',
      });
    }

    record.count += 1;
    next();
  };
};

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipHits.entries()) {
    if (now > record.resetTime) {
      ipHits.delete(ip);
    }
  }
}, 60000); // Cleanup every minute
