console.log('[BOOT] Loading index.ts...');
import express from 'express';
import { createServer } from 'http';
import { Server, type Socket } from 'socket.io';
import cors from 'cors';
import si from 'systeminformation';
import db from './db.js';
import { serverManager } from './serverManager.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authenticateToken } from './middleware/auth.js';
import type { Request, Response, NextFunction } from 'express';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'http';

// Routes
import authRouter from './routes/auth.js';
import serversRouter from './routes/servers.js';
import commandsRouter from './routes/commands.js';
import configRouter from './routes/config.js';
import filesRouter from './routes/files.js';
import pluginsRouter from './routes/plugins.js';
import playersRouter from './routes/players.js';
import mapsRouter from './routes/maps.js';
import bansRouter from './routes/bans.js';
import adminsRouter from './routes/admins.js';
import backupRoutes from './routes/backups.js';
import chatRouter from './routes/chat.js';
import logsRouter from './routes/logs.js';
import profileRouter from './routes/profile.js';
import steamRouter from './routes/steam.js';
import analyticsRouter from './routes/analytics.js';
import usersRouter from './routes/users.js';
import { databaseManager } from './services/DatabaseManager.js';
import { taskService } from './services/TaskService.js';
import { monitoringService } from './services/MonitoringService.js';
import { backupService } from './services/BackupService.js';

// Environment variables are loaded via --env-file in package.json dev script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy for rate limiting (needed behind Nginx)
app.set('trust proxy', true);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Make io accessible to routes
app.set('io', io);

// Static uploads folder
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Inject Socket.IO into Services for real-time updates
console.log(`[DEBUG] serverManager type: ${typeof serverManager}`);
console.log(`[DEBUG] has setSocketIO: ${typeof serverManager?.setSocketIO === 'function'}`);
if (serverManager && typeof serverManager.setSocketIO === 'function') {
  serverManager.setSocketIO(io);
}

taskService.setSocketIO(io);

const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// --- phpMyAdmin Proxy (Must be at the top) ---
// We place this BEFORE any body parsers or CORS to avoid stream consumption issues
app.use(
  '/phpmyadmin',
  (req, res, next) => {
    if (req.originalUrl === '/phpmyadmin') {
      return res.redirect(301, '/phpmyadmin/');
    }
    next();
  },
  createProxyMiddleware({
    target: 'http://localhost:8080',
    changeOrigin: true,
    xfwd: true,
    pathRewrite: { '^/phpmyadmin/': '/' },
    cookiePathRewrite: { '/': '/phpmyadmin/' },
    on: {
      proxyRes: (proxyRes: IncomingMessage) => {
        // Fix redirects: if backend (8080) redirects to /something,
        // rewrite it to /phpmyadmin/something so the browser stays within the proxy path.
        if (proxyRes.headers.location && proxyRes.headers.location.startsWith('/')) {
          proxyRes.headers.location = '/phpmyadmin' + proxyRes.headers.location;
        }
      },
      proxyReq: (proxyReq: ClientRequest, req: IncomingMessage) => {
        const protocol =
          req.headers['x-forwarded-proto'] || ((req.socket as any).encrypted ? 'https' : 'http');
        proxyReq.setHeader('X-Forwarded-Proto', protocol);
      },
      error: (err: Error, _req: IncomingMessage, res: ServerResponse | unknown) => {
        const response = res as ServerResponse;
        if (!response.headersSent)
          response
            .writeHead(502)
            .end('phpMyAdmin is not reachable. Check if Nginx or PHP-FPM is running on port 8080.');
      },
    },
  }) as express.RequestHandler
);

(async () => {
  await databaseManager.init();
})();

app.use(cors());
app.use(express.json());

// Simple Request Logger
app.use((req, res, next) => {
  if (!req.path.startsWith('/socket.io')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

app.use('/api', apiLimiter);

// --- Register Routes ---
app.use('/api', authRouter);
app.use('/api', configRouter); // /api/settings, /api/system-info, etc.
app.use('/api/servers/:id/files', filesRouter);
app.use('/api/servers', pluginsRouter); // /api/servers/plugins/...
app.use('/api/servers', serversRouter); // /api/servers (base)
app.use('/api/servers', commandsRouter); // /api/servers/:id/start, etc.
app.use('/api/servers', playersRouter); // /api/servers/:id/players
app.use('/api/servers', bansRouter); // /api/servers/:id/bans
app.use('/api/servers', adminsRouter); // /api/servers/:id/admins
app.use('/api/logs', logsRouter);
app.use('/api/backups', backupRoutes);
app.use('/api/chat', chatRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/profile', authenticateToken, profileRouter);
app.use('/api/steam', authenticateToken, steamRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/users', usersRouter);

// --- Serve Frontend in Production ---
if (isProduction) {
  const clientBuildPath = path.join(__dirname, '../../client/dist');
  console.log(`\x1b[34m[INFO]\x1b[0m Serving frontend from: \x1b[35m${clientBuildPath}\x1b[0m`);

  app.use(express.static(clientBuildPath));

  // SPA fallback - tüm non-API route'ları index.html'e yönlendir
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }

    const indexPath = path.join(clientBuildPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error(`\x1b[31m[ERROR]\x1b[0m Failed to serve index.html:`, err.message);
        res.status(500).send("Frontend build not found. Please run 'npm run build' first.");
      }
    });
  });
} else {
  console.log(
    `\x1b[33m[WARN]\x1b[0m Running in development mode. Frontend should be started separately via 'npm run dev'.`
  );
}

/**
 * Global Dashboard Stats Emitter
 */
export const emitDashboardStats = async () => {
  try {
    const counts = db
      .prepare(
        `
            SELECT 
                (SELECT COUNT(*) FROM servers) as totalServers,
                (SELECT COUNT(*) FROM servers WHERE status = 'ONLINE') as activeServers,
                (SELECT COUNT(*) FROM workshop_maps) as maps,
                (SELECT IFNULL(SUM(CAST(current_players AS INTEGER)), 0) FROM servers) as onlinePlayers,
                (SELECT IFNULL(SUM(CAST(max_players AS INTEGER)), 0) FROM servers) as totalCapacity
        `
      )
      .get() as Record<string, number>;
    io.emit('dashboard_stats', counts);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[STATS] Failed to emit dashboard stats:', error.message);
  }
};

/**
 * Global Activity Logger
 */
export const logActivity = (
  type: string,
  message: string,
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' = 'INFO',
  userId?: number
) => {
  try {
    db.prepare(
      'INSERT INTO activity_logs (user_id, type, message, severity) VALUES (?, ?, ?, ?)'
    ).run(userId || null, type, message, severity);
    io.emit('activity', { type, message, severity, created_at: new Date().toISOString() });
  } catch (err) {
    console.error('[ACTIVITY] Failed to log activity:', err);
  }
};

// GET /api/system-info
app.get('/api/system-info', authenticateToken, async (_req, res) => {
  try {
    const [cpu, mem, os] = await Promise.all([
      si.cpu().catch((e: unknown) => {
        console.error('[SI] CPU Error:', e);
        return {} as si.Systeminformation.CpuData;
      }),
      si.mem().catch((e: unknown) => {
        console.error('[SI] MEM Error:', e);
        return { total: 0 } as si.Systeminformation.MemData;
      }),
      si.osInfo().catch((e: unknown) => {
        console.error('[SI] OS Error:', e);
        return {
          distro: 'Generic',
          release: 'OS',
          hostname: 'unknown',
        } as si.Systeminformation.OsData;
      }),
    ]);

    // Better CPU String
    let cpuModel = 'Processor';
    if (cpu.brand || cpu.manufacturer) {
      cpuModel = `${cpu.manufacturer || ''} ${cpu.brand || ''}`.trim();
    } else if (process.env.PROCESSOR_IDENTIFIER) {
      cpuModel = process.env.PROCESSOR_IDENTIFIER;
    }

    // Memory Guard: If si.mem().total is 0 but we might have OS level info or previous
    let totalMem = Math.round((mem.total || 0) / (1024 * 1024));
    if (totalMem === 0 && process.platform === 'win32') {
      // Fallback for Windows if WMI fails
      try {
        const osMem = (os as si.Systeminformation.OsData & { totalmem?: number }).totalmem;
        if (osMem) totalMem = Math.round(osMem / (1024 * 1024));
      } catch {
        /* ignore */
      }
    }

    console.log(`[SYSTEM] Stats: CPU=${cpuModel}, RAM=${totalMem}MB, OS=${os.distro}`);

    res.json({
      cpuModel,
      totalMemory: totalMem,
      os: `${os.distro} ${os.release}`,
      hostname: os.hostname,
    });
  } catch (error) {
    console.error('[API] system-info failure:', error);
    res.status(500).json({ message: 'Failed to fetch system info' });
  }
});

// --- Background Tasks ---

// WebSocket client counter
io.on('connection', (socket: Socket) => {
  // Send initial telemetry history
  socket.emit('stats_history', monitoringService.getStatsHistory());

  // Send recent activities
  try {
    const recentActivities = db
      .prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10')
      .all();
    socket.emit('recent_activity', recentActivities);
  } catch {
    /* ignore */
  }

  // Send active tasks
  socket.emit('active_tasks', taskService.getTasks());

  socket.on('disconnect', () => {
    // disconnected logic
  });
});

// 1. Stats Collection (Moved to MonitoringService)
monitoringService.setSocketIO(io);
monitoringService.start();

// 2. Backup Scheduling
backupService.startScheduledBackups();

// 3. Dashboard Stats Auto-Emit (Every 5 seconds)
setInterval(async () => {
  try {
    await emitDashboardStats();
  } catch (err) {
    console.error('[DASHBOARD] Failed to emit stats:', err);
  }
}, 5000);

// 4. Map Sync Task (Every 10 seconds)
setInterval(async () => {
  try {
    const servers = db.prepare("SELECT id, map FROM servers WHERE status = 'ONLINE'").all() as {
      id: string;
      map: string;
    }[];
    if (servers.length === 0) return;

    // 1. Fetch current maps via RCON (Parallel/Network bound)
    const updateTasks = await Promise.all(
      servers.map(async (server) => {
        const currentMap = await serverManager.getCurrentMap(server.id);

        // Auto-discovery of Workshop Maps:
        // If it's a workshop map and we don't know it, try to fetch details
        const lowerMap = currentMap?.toLowerCase() || '';
        if (currentMap && (lowerMap.includes('workshop/') || lowerMap.includes('workshop\\'))) {
          const workshopIdMatch = currentMap.match(/workshop[/\\](\d+)/i);
          if (workshopIdMatch) {
            const workshopId = workshopIdMatch[1];
            if (workshopId) {
              console.log(`[SYNC] Discovering/Updating workshop map: ${workshopId}`);
              // Extract map name from path if available
              const mapParts = currentMap.split(/[/\\]/);
              const discoveredName = mapParts.pop()?.replace('.vpk', '').replace('.bsp', '');

              const wid = workshopId;
              import('./utils/workshop.js')
                .then((m) => m.registerWorkshopMap(wid, discoveredName))
                .catch((e) =>
                  console.warn(`[SYNC] registration failed for ${workshopId}:`, e.message)
                );
            }
          }
        }

        if (currentMap && currentMap !== server.map) {
          return { id: server.id, map: currentMap };
        }
        return null;
      })
    );

    const validUpdates = updateTasks.filter((u): u is { id: string; map: string } => u !== null);

    // 2. Flush all changes to DB in a SINGLE write transaction
    if (validUpdates.length > 0) {
      const updateStmt = db.prepare('UPDATE servers SET map = ? WHERE id = ?');
      const batchUpdate = db.transaction((data: { id: string; map: string }[]) => {
        for (const update of data) {
          updateStmt.run(update.map, update.id);
        }
      });

      batchUpdate(validUpdates);

      // Notify clients
      validUpdates.forEach((u) => io.emit('server_update', { serverId: u.id }));
      console.log(`[SYNC] Synced maps for ${validUpdates.length} servers.`);
    }
  } catch {
    /* silent map sync fail */
  }
}, 10000); // Check every 10 seconds for UI updates

// 3. System Initialization
serverManager.ensureSteamCMD().then((success: boolean) => {
  if (success) {
    console.log('\x1b[32m[SYSTEM]\x1b[0m SteamCMD is \x1b[1mactive\x1b[0m');
  } else {
    console.log('\x1b[33m[WARNING]\x1b[0m SteamCMD not found. Installation may be required.');
  }
});

// --- Maintenance Task (Cleanup old logs every hour) ---
setInterval(() => {
  try {
    console.log('[MAINTENANCE] Cleaning up old logs...');
    // Keep 7 days of join/leave logs
    db.prepare("DELETE FROM join_logs WHERE created_at < datetime('now', '-7 days')").run();
    // Keep 14 days of chat logs
    db.prepare("DELETE FROM chat_logs WHERE created_at < datetime('now', '-14 days')").run();
    // Keep 30 days of activity logs
    db.prepare("DELETE FROM activity_logs WHERE created_at < datetime('now', '-30 days')").run();
    // VACUUM periodically
    if (Math.random() < 0.05) db.exec('VACUUM');
    console.log('[MAINTENANCE] Cleanup complete.');
  } catch (err) {
    console.error('[MAINTENANCE] Cleanup failed:', err);
  }
}, 3600000); // Every hour

// --- Global Error Handlers to Prevent Unhandled Crashes ---
process.on('uncaughtException', (err) => {
  console.error('\x1b[31m[CRITICAL]\x1b[0m Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.warn('\x1b[33m[WARNING]\x1b[0m Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- Server Lifecycle ---
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE')
    console.error(`\x1b[31m[ERROR]\x1b[0m Port ${PORT} is already in use.`);
  else console.error('\x1b[31m[ERROR]\x1b[0m Server Error:', err);
  process.exit(1);
});

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m');
  console.log('\x1b[1m\x1b[34m QUATRIX BACKEND \x1b[0m');
  console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m');
  console.log(`\x1b[32m[READY]\x1b[0m Running on port \x1b[1m${PORT}\x1b[0m`);
  console.log(
    `\x1b[34m[INFO]\x1b[0m Environment: \x1b[35m${process.env.NODE_ENV || 'development'}\x1b[0m`
  );
  console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m\n');
});

// Catch-all 404
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
});

// 4. Global Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('\x1b[31m[CRITICAL]\x1b[0m Uncaught Exception:', err);
  res.status(500).json({
    message: 'Internal Server Error',
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});
