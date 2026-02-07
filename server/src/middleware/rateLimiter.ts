import rateLimit from 'express-rate-limit';

// General API Limiter: 300 requests per minute
// Good for normal dashboard usage (stats polling etc)
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
  validate: { trustProxy: false },
});

// Strict Limiter: 60 requests per minute
// For resource-intensive operations (RCON, File Write, Start/Stop)
export const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { message: 'Rate limit exceeded for sensitive operation. Slow down.' },
  validate: { trustProxy: false },
});

// Creation Limiter: 10 servers per hour
// Prevents spamming the database with new servers
export const createServerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: 'You have created too many servers recently. Please wait.' },
  validate: { trustProxy: false },
});

// Auth Limiter: Already implemented elsewhere but good to keep in mind
