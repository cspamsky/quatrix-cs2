import db from '../db.js';
import { fileSystemService } from './FileSystemService.js';
import path from 'path';
import fs from 'fs/promises';
import { registerWorkshopMap } from '../utils/workshop.js';
import { taskService } from './TaskService.js';

/**
 * MapManager Service
 *
 * Central service for managing server maps, workshop subscriptions,
 * and map-specific configurations.
 */
export class MapManager {
  private MAP_CFG_DIR = 'cfg/maps_cfg';

  /**
   * Reads the configuration file for a specific map
   */
  async getMapConfig(serverId: string | number, mapName: string): Promise<string> {
    const serverPath = fileSystemService.getInstancePath(serverId.toString());
    const mapsCfgDir = path.join(serverPath, 'game/csgo', this.MAP_CFG_DIR);
    const fullPath = path.resolve(mapsCfgDir, `${mapName}.cfg`);

    // Security check: prevent directory traversal
    if (!fullPath.startsWith(path.resolve(mapsCfgDir))) {
      throw new Error('Access denied: Invalid map configuration path');
    }

    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  }

  /**
   * Saves or updates the configuration file for a specific map
   */
  async saveMapConfig(serverId: string | number, mapName: string, content: string): Promise<void> {
    const serverPath = fileSystemService.getInstancePath(serverId.toString());
    const cfgDirPath = path.join(serverPath, 'game/csgo', this.MAP_CFG_DIR);

    // Ensure directory exists
    await fs.mkdir(cfgDirPath, { recursive: true }).catch((err) => {
      if (err.code !== 'EEXIST') throw err;
    });

    const fullPath = path.resolve(cfgDirPath, `${mapName}.cfg`);

    // Security check: prevent directory traversal
    if (!fullPath.startsWith(path.resolve(cfgDirPath))) {
      throw new Error('Access denied: Invalid map configuration path');
    }

    await fs.writeFile(fullPath, content);
  }

  /**
   * Returns all registered workshop maps from the database
   */
  async getWorkshopMaps() {
    return db.prepare('SELECT * FROM workshop_maps ORDER BY created_at DESC').all();
  }

  /**
   * Registers a new workshop map by its Steam ID
   * Fetches metadata from Steam Web API
   */
  async addWorkshopMap(workshopId: string, mapFile?: string, taskId?: string) {
    return await registerWorkshopMap(workshopId, mapFile, taskId);
  }

  /**
   * Deletes a workshop map registration
   */
  async deleteWorkshopMap(id: string | number): Promise<void> {
    db.prepare('DELETE FROM workshop_maps WHERE id = ?').run(id);
  }

  /**
   * Updates the active map (or workshop ID) for a server instance
   */
  async setActiveMap(serverId: string | number, mapId: string): Promise<void> {
    db.prepare('UPDATE servers SET map = ? WHERE id = ?').run(mapId, serverId);
  }

  /**
   * Scans the server's maps directory for local .vpk or .bsp files
   * (Experimental/Future use)
   */
  async scanLocalMaps(serverId: string | number): Promise<string[]> {
    const serverPath = fileSystemService.getInstancePath(serverId.toString());
    const mapsDir = path.join(serverPath, 'game/csgo/maps');

    try {
      const files = await fs.readdir(mapsDir);
      return files
        .filter((f) => f.endsWith('.vpk') || f.endsWith('.bsp'))
        .map((f) => f.replace(/\.(vpk|bsp)$/, ''));
    } catch {
      return [];
    }
  }
}

export const mapManager = new MapManager();
