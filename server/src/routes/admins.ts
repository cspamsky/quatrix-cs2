import { Router } from 'express';
import type { Request, Response } from 'express';
import { serverManager } from '../serverManager.js';
import { authenticateToken } from '../middleware/auth.js';
import db from '../db.js';
import { fileSystemService } from '../services/FileSystemService.js';
import path from 'path';
import fs from 'fs';
import type { AuthenticatedRequest } from '../types/index.js';

interface AdminData {
  identity: string;
  flags: string[];
  immunity: number;
}

interface DbAdminRow {
  player_steamid: string | number;
  player_name: string;
  flags?: string;
  immunity?: number;
}

type AdminsJson = Record<string, AdminData>;

const router = Router();

router.use(authenticateToken);

const ADMINS_FILE_PATH = 'addons/counterstrikesharp/configs/admins.json';
// Ensure all path parts are lowercase for Linux consistency

// GET /api/servers/:id/admins
router.get('/:id/admins', async (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  try {
    // Validation: verify server ownership
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const serverPath = fileSystemService.getInstancePath(id as string);
    const csgoPath = path.join(serverPath, 'game', 'csgo');
    const filePath = path.join(csgoPath, ADMINS_FILE_PATH);

    // 1. Read from JSON file (primary source)
    let jsonAdmins: AdminsJson = {};
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      jsonAdmins = JSON.parse(content) as AdminsJson;
    } catch (error: unknown) {
      const err = error as { code?: string; message: string };
      if (err.code !== 'ENOENT') {
        console.error('[ADMINS] Error reading JSON:', err.message);
      }
    }

    // 2. Read from MariaDB (secondary source, for sync verification)
    try {
      const { databaseManager } = await import('../services/DatabaseManager.js');

      if (await databaseManager.isAvailable()) {
        const creds = await databaseManager.getDatabaseCredentials(id as string);

        if (creds) {
          const mysql = await import('mysql2/promise');
          const connection = await mysql.createConnection({
            host: creds.host,
            port: creds.port,
            user: creds.user,
            password: creds.password || '', // FIX: Add default empty string
            database: creds.database,
          });

          try {
            const [rows] = await connection.execute('SELECT * FROM sa_admins WHERE server_id = ?', [
              id as string,
            ]);

            // Merge MariaDB admins into JSON format (if not already present)
            for (const row of rows as DbAdminRow[]) {
              // Check if this Steam ID already exists in JSON (by checking identity field)
              const existsInJson = Object.values(jsonAdmins).some(
                (admin) => admin.identity === row.player_steamid.toString()
              );

              if (!existsInJson) {
                // Add admin with name as key (to match JSON format)
                jsonAdmins[row.player_name] = {
                  identity: row.player_steamid.toString(),
                  flags: row.flags?.split(',') || ['@css/root'],
                  immunity: row.immunity || 100,
                };
              }
            }
          } finally {
            await connection.end();
          }
        }
      }
    } catch {
      // Continue with JSON data only
    }

    res.json(jsonAdmins);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message || 'Failed to fetch admins' });
  }
});

// POST /api/servers/:id/admins
router.post('/:id/admins', async (req: Request, res: Response) => {
  const { id } = req.params;
  const admins = req.body as AdminsJson; // Expecting the full admins object
  const authReq = req as AuthenticatedRequest;

  try {
    // Validation: verify server ownership
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const serverPath = fileSystemService.getInstancePath(id as string);
    const csgoPath = path.join(serverPath, 'game', 'csgo');
    const filePath = path.join(csgoPath, ADMINS_FILE_PATH);

    // 1. Write to JSON file (for CounterStrikeSharp)
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(admins, null, 4));

    // 2. Sync to MariaDB (for CS2-SimpleAdmin)
    try {
      const { databaseManager } = await import('../services/DatabaseManager.js');

      if (await databaseManager.isAvailable()) {
        const creds = await databaseManager.getDatabaseCredentials(id as string);

        if (creds) {
          const mysql = await import('mysql2/promise');
          const connection = await mysql.createConnection({
            host: creds.host,
            port: creds.port,
            user: creds.user,
            password: creds.password || '', // FIX: Add default empty string
            database: creds.database,
          });

          try {
            // Clear existing admins for this server (optional, or use REPLACE INTO)
            await connection.execute('DELETE FROM sa_admins WHERE server_id = ?', [id as string]);

            // Insert each admin into sa_admins table
            for (const [adminName, adminData] of Object.entries(admins)) {
              // Extract Steam ID from identity field
              const steamId = adminData.identity || adminName;

              // Skip if Steam ID is invalid
              if (!/^\d{17}$/.test(steamId)) {
                console.warn(`[ADMINS] Skipping invalid Steam ID for ${adminName}: ${steamId}`);
                continue;
              }

              await connection.execute(
                `
                                INSERT INTO sa_admins (
                                    player_steamid, 
                                    player_name, 
                                    flags, 
                                    immunity, 
                                    server_id,
                                    created
                                ) VALUES (?, ?, ?, ?, ?, NOW())
                            `,
                [
                  steamId,
                  adminName,
                  adminData.flags?.join(',') || '@css/root',
                  adminData.immunity || 100,
                  id as string,
                ]
              );
            }

            console.log(
              `[ADMINS] Synced ${Object.keys(admins).length} admins to MariaDB for server ${id}`
            );
          } finally {
            await connection.end();
          }
        }
      }
    } catch {
      // Continue anyway - JSON file is the primary source
    }

    // 3. Reload admins in-game if server is running
    if (serverManager.isServerRunning(id as string)) {
      await serverManager.sendCommand(id as string, 'css_reloadadmins');
    }

    res.json({ success: true, message: 'Admins updated successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message || 'Failed to update admins' });
  }
});

export default router;
