import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import db from '../db.js';
import { serverManager } from '../serverManager.js';
import { authenticateToken } from '../middleware/auth.js';
import { createServerLimiter } from '../middleware/rateLimiter.js';
import { runtimeService } from '../services/RuntimeService.js';
import { fileSystemService } from '../services/FileSystemService.js';
import { databaseManager } from '../services/DatabaseManager.js';
import { logActivity, emitDashboardStats } from '../index.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// GET /api/servers/database/status (Global MariaDB Status)
router.get('/database/status', authenticateToken, async (_req: Request, res: Response) => {
  const available = await databaseManager.isAvailable();
  res.json({ status: available ? 'ONLINE' : 'OFFLINE' });
});

// GET /api/servers/:id/database
router.get('/:id/database', authenticateToken, async (req: Request, res: Response) => {
  try {
    const creds = await databaseManager.getDatabaseCredentials(req.params.id as string);
    if (!creds) {
      return res.json({ message: 'No database provisioned yet.', credentials: null });
    }
    const stats = await databaseManager.getDatabaseStats(req.params.id as string);
    res.json({ credentials: creds, stats });
  } catch {
    res.status(500).json({ message: 'Failed to fetch database credentials' });
  }
});

// POST /api/servers/:id/database/provision
router.post('/:id/database/provision', authenticateToken, async (req: Request, res: Response) => {
  try {
    const creds = await databaseManager.provisionDatabase(req.params.id as string);
    res.json({ message: 'Database provisioned successfully', credentials: creds });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: 'Failed to provision database', error: err.message });
  }
});

// POST /api/servers/:id/database
router.post('/:id/database', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { host, port, user, password, database } = req.body as {
      host: string;
      port: string | number;
      user: string;
      password?: string;
      database: string;
    };
    if (!host || !port || !user || !database) {
      return res.status(400).json({ message: 'Missing required database fields' });
    }

    const creds = { host, port: Number(port), user, password: password || '', database };
    await databaseManager.saveCredentials(req.params.id as string, creds);

    res.json({ message: 'Database credentials saved successfully', credentials: creds });
  } catch (error) {
    // Safe error logging: Do not log the full error object if it contains sensitive data
    const err = error as Error;
    console.error('[API] Save credentials error:', err.message);
    res.status(500).json({ message: 'Failed to save database credentials' });
  }
});

// Schema for validation
export const createServerSchema = z.object({
  name: z
    .string()
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name must be less than 50 characters'),
  port: z.number().int().min(1024, 'Port must be >= 1024').max(65535, 'Port must be <= 65535'),
  rcon_password: z.string().min(6, 'RCON Password must be at least 6 characters'),
  map: z.string().default('de_dust2'),
  max_players: z.number().int().min(1).max(64).default(10),
  password: z.string().nullable().optional(),
  gslt_token: z.string().nullable().optional(),
  steam_api_key: z.string().nullable().optional(),
  vac_enabled: z.number().min(0).max(1).default(1),
  game_type: z.number().int().min(0).default(0),
  game_mode: z.number().int().min(0).default(0),
  game_alias: z.string().nullable().optional(),
  hibernate: z.number().int().min(0).max(1).default(1),
  validate_files: z.number().int().min(0).max(1).default(0),
  additional_args: z.string().nullable().optional(),
  tickrate: z.number().int().min(1).max(128).default(128),
  auto_start: z.boolean().optional().default(false),
  cpu_priority: z.number().int().min(-20).max(19).optional().default(0),
  ram_limit: z.number().int().min(0).optional().default(0),
});

// Middleware for this router
router.use(authenticateToken);

// GET /api/servers
router.get('/', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    // Join with workshop_maps to get map images and names if they exist
    const servers = db
      .prepare(
        `
      SELECT 
        s.*, 
        s.is_installed as isInstalled,
        CASE 
          WHEN wm.name IS NOT NULL THEN wm.name
          ELSE s.map
        END as workshop_map_name,
        wm.image_url as workshop_map_image
      FROM servers s
      LEFT JOIN workshop_maps wm ON (
        -- Match exact map file
        s.map = wm.map_file OR
        -- Match workshop ID
        s.map = wm.workshop_id OR
        -- Match if map contains workshop ID anywhere
        s.map LIKE '%' || wm.workshop_id || '%' OR
        -- Match if map name matches the internal filename
        wm.map_file IS NOT NULL AND (
          s.map = wm.map_file OR 
          s.map LIKE '%/' || wm.map_file OR 
          s.map LIKE '%\\' || wm.map_file
        )
      )
      WHERE s.user_id = ?
    `
      )
      .all(authReq.user.id);

    res.json(servers);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Fetch servers error:', err.message);
    res.status(500).json({ message: 'Failed to fetch servers' });
  }
});

// GET /api/servers/stats (Dashboard summary)
router.get('/stats', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const counts = db
      .prepare(
        `
      SELECT 
        (SELECT COUNT(*) FROM servers WHERE user_id = ?) as totalServers,
        (SELECT COUNT(*) FROM servers WHERE user_id = ? AND status = 'ONLINE') as activeServers,
        (SELECT COUNT(*) FROM workshop_maps) as maps,
        (SELECT IFNULL(SUM(CAST(current_players AS INTEGER)), 0) FROM servers WHERE user_id = ?) as onlinePlayers,
        (SELECT IFNULL(SUM(CAST(max_players AS INTEGER)), 0) FROM servers WHERE user_id = ?) as totalCapacity
    `
      )
      .get(authReq.user.id, authReq.user.id, authReq.user.id, authReq.user.id) as any;

    res.json(
      counts || { totalServers: 0, activeServers: 0, maps: 0, onlinePlayers: 0, totalCapacity: 0 }
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Fetch stats error:', err.message);
    res.status(500).json({ message: 'Failed to fetch dashboard stats' });
  }
});

// GET /api/servers/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id as string);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    res.json(server);
  } catch {
    res.status(500).json({ message: 'Failed to fetch server' });
  }
});

// GET /api/servers/:id/logs
router.get('/:id/logs', (req: Request, res: Response) => {
  try {
    const logs = runtimeService.getLogBuffer(req.params.id as string);
    res.json(logs);
  } catch {
    res.status(500).json({ message: 'Failed to fetch logs' });
  }
});

// DELETE /api/servers/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const server = db
      .prepare('SELECT * FROM servers WHERE id = ?')
      .get(req.params.id as string) as any;
    if (!server) return res.status(404).json({ message: 'Server not found' });

    // Stop server if running
    if (server.status === 'ONLINE') {
      await serverManager.stopServer(server.id as string);
    }

    // Physically delete server folder
    await fileSystemService.deleteInstance(server.id as string);

    // Drop associated database and user
    await databaseManager.dropDatabase(server.id as string);

    db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id as string);
    emitDashboardStats();
    logActivity(
      'SERVER_DELETE',
      `${server.name} sunucusu ve tüm verileri silindi`,
      'WARNING',
      authReq.user.id
    );
    res.json({ message: 'Server deleted successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Delete server error:', err.message);
    res.status(500).json({ message: 'Failed to delete server', error: err.message });
  }
});

// PUT /api/servers/:id
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  const {
    name,
    map,
    max_players,
    port,
    password,
    rcon_password,
    vac_enabled,
    gslt_token,
    steam_api_key,
    game_type,
    game_mode,
    tickrate,
    game_alias,
    hibernate,
    validate_files,
    additional_args,
    cpu_priority,
    ram_limit,
  } = req.body as any;

  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    db.prepare(
      `
      UPDATE servers SET name = ?, map = ?, max_players = ?, port = ?, password = ?, 
          rcon_password = ?, vac_enabled = ?, gslt_token = ?, steam_api_key = ?,
          game_type = ?, game_mode = ?, tickrate = ?, game_alias = ?,
          hibernate = ?, validate_files = ?, additional_args = ?,
          cpu_priority = ?, ram_limit = ?
      WHERE id = ?
    `
    ).run(
      name,
      map,
      max_players,
      port,
      password,
      rcon_password,
      vac_enabled ? 1 : 0,
      gslt_token,
      steam_api_key,
      game_type || 0,
      game_mode || 0,
      tickrate || 128,
      game_alias || null,
      hibernate ?? 1,
      validate_files ?? 0,
      additional_args || null,
      cpu_priority || 0,
      ram_limit || 0,
      id as string
    );

    // Emit socket event for real-time UI update
    const io = req.app.get('io');
    if (io) io.emit('server_update', { serverId: parseInt(id as string) });

    res.json({ message: 'Server settings updated successfully' });
  } catch (error) {
    console.error('Update server error:', error);
    res.status(500).json({ message: 'Failed to update server settings' });
  }
});

router.post('/', createServerLimiter, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  console.log(`[API] POST /api/servers - Creating new server instance for user ${authReq.user.id}`);
  try {
    const result = createServerSchema.safeParse(req.body);
    if (!result.success) {
      return res
        .status(400)
        .json({ message: result.error.issues[0]?.message || 'Validation failed' });
    }

    const {
      name,
      port,
      rcon_password,
      map,
      max_players,
      password,
      gslt_token,
      steam_api_key,
      vac_enabled,
      game_type,
      game_mode,
      tickrate,
      auto_start,
      game_alias,
      hibernate,
      validate_files,
      additional_args,
      cpu_priority,
      ram_limit,
    } = result.data;

    const result_count = db
      .prepare('SELECT count(*) as count FROM servers WHERE port = ?')
      .get(port) as { count: number } | undefined;
    if (result_count && result_count.count > 0) {
      return res.status(400).json({ message: 'Port is already in use' });
    }

    const info = db
      .prepare(
        `
      INSERT INTO servers (
        name, port, rcon_password, status, is_installed, user_id, 
        map, max_players, password, gslt_token, steam_api_key, 
        vac_enabled, game_type, game_mode, tickrate, auto_start,
        game_alias, hibernate, validate_files, additional_args,
        cpu_priority, ram_limit
      )
      VALUES (?, ?, ?, 'OFFLINE', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        name,
        port,
        rcon_password,
        authReq.user.id,
        map,
        max_players,
        password,
        gslt_token,
        steam_api_key,
        vac_enabled,
        game_type || 0,
        game_mode || 0,
        tickrate || 128,
        auto_start ? 1 : 0,
        game_alias || null,
        hibernate ?? 1,
        validate_files ?? 0,
        additional_args || null,
        cpu_priority || 0,
        ram_limit || 0
      );

    const serverId = info.lastInsertRowid as number;
    emitDashboardStats();
    logActivity(
      'SERVER_CREATE',
      `${name} adlı yeni sunucu oluşturuldu`,
      'SUCCESS',
      authReq.user.id
    );

    // Emit socket event for real-time UI update (e.g. server list)
    const io = req.app.get('io');
    if (io) io.emit('server_update', { serverId });

    // If auto_start is enabled, trigger installation immediately
    if (auto_start) {
      console.log(`[SYSTEM] Auto-starting installation for server ${serverId}`);

      db.prepare("UPDATE servers SET status = 'INSTALLING' WHERE id = ?").run(serverId);
      if (io) io.emit('status_update', { serverId, status: 'INSTALLING' });

      serverManager
        .installOrUpdateServer(serverId.toString(), (data: string) => {
          if (io) io.emit(`console:${serverId}`, data);
        })
        .then(async () => {
          db.prepare("UPDATE servers SET status = 'OFFLINE', is_installed = 1 WHERE id = ?").run(
            serverId
          );
          if (io) io.emit('status_update', { serverId, status: 'OFFLINE' });

          // Optionally start the server after installation
          const serverData = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
          await serverManager.startServer(serverId.toString(), serverData, (data: string) => {
            if (io) io.emit(`console:${serverId}`, data);
          });
          db.prepare("UPDATE servers SET status = 'ONLINE' WHERE id = ?").run(serverId);
          if (io) io.emit('status_update', { serverId, status: 'ONLINE' });
        })
        .catch((err: unknown) => {
          const error = err as Error;
          console.error(`[SYSTEM] Auto-install failed for server ${serverId}:`, error);
          db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(serverId);
          if (io) io.emit('status_update', { serverId, status: 'OFFLINE' });
        });
    }

    res.status(201).json({ id: serverId, ...result.data });
  } catch (error) {
    console.error('Server creation error:', error);
    res.status(500).json({ message: 'Failed to create server' });
  }
});

// POST /api/servers/:id/database/custom (Create local DB with user-provided info)
router.post('/:id/database/custom', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { user, password, database } = req.body as {
      user: string;
      password?: string;
      database: string;
    };
    if (!user || !password || !database) {
      return res.status(400).json({ message: 'Missing required fields for custom database' });
    }
    const creds = { host: 'localhost', port: 3306, user, password, database };
    await databaseManager.createCustomDatabase(req.params.id as string, creds);
    res.json({ message: 'Custom local database created successfully', credentials: creds });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: 'Failed to create custom database', error: err.message });
  }
});

// POST /api/servers/:id/database/query (Raw SQL Console)
router.post('/:id/database/query', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { query } = req.body as { query: string };
    if (!query) return res.status(400).json({ message: 'Query is required' });

    const queryLower = query.trim().toLowerCase();

    // SECURITY: Strict SQL Injection Protection
    // 1. Only allow SELECT statements
    if (!queryLower.startsWith('select')) {
      return res.status(403).json({ message: 'Only SELECT queries are allowed.' });
    }

    // 2. Block dangerous keywords that could be used for SQL injection
    const dangerousKeywords = [
      'drop',
      'delete',
      'update',
      'insert',
      'alter',
      'create',
      'truncate',
      'replace',
      'grant',
      'revoke',
      'exec',
      'execute',
      'call',
      'procedure',
      'function',
      'trigger',
      'into outfile',
      'load_file',
      'benchmark',
      'sleep',
      'waitfor',
    ];

    for (const keyword of dangerousKeywords) {
      if (queryLower.includes(keyword)) {
        return res.status(403).json({
          message: `Query contains forbidden keyword: ${keyword}`,
        });
      }
    }

    // 3. Additional safety: limit query length
    if (query.length > 5000) {
      return res.status(400).json({ message: 'Query too long (max 5000 characters)' });
    }

    const results = await databaseManager.executeQuery(query);
    res.json({ results });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(400).json({ message: err.message });
  }
});

// POST /api/servers/:id/database/settings (Toggle Auto-Sync)
router.post('/:id/database/settings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { autoSync } = req.body as { autoSync: boolean };
    const all = await databaseManager.loadAllCredentials();
    const id = req.params.id as string;
    if (id === '__proto__' || id === 'constructor' || id === 'prototype') {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    if (!all[id]) {
      // @ts-expect-error - Partial initialization for config save
      all[id] = {};
    }
    // @ts-expect-error - Partial update
    all[id].autoSync = autoSync;

    const credsFile = path.join(process.cwd(), 'data', 'databases.json');
    await fs.promises.writeFile(credsFile, JSON.stringify(all, null, 2));

    res.json({ message: 'Database settings updated', autoSync });
  } catch {
    res.status(500).json({ message: 'Failed to update database settings' });
  }
});

export default router;
