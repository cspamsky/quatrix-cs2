import path from 'path';
import fs from 'fs';
import type { Statement } from 'better-sqlite3';
import { pluginRegistry, type PluginId } from '../config/plugins.js';
import db from '../db.js';
import { fileURLToPath } from 'url';

// Import modular services
import { pluginDiscovery } from './plugin/PluginDiscovery.js';
import { pluginConfigManager } from './plugin/PluginConfigManager.js';
import { pluginInstaller } from './plugin/PluginInstaller.js';
import { taskService } from './TaskService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '../../../');
const POOL_DIR = path.join(PROJECT_ROOT, 'data', 'plugin_pool');

export interface PluginMetadata {
  name: string;
  version: string;
  currentVersion?: string | undefined;
  folderName?: string | undefined;
  downloadUrl?: string | undefined;
  category: 'cssharp' | 'metamod' | 'core';
  description: string;
  inPool: boolean;
  isCustom: boolean;
}

export interface PluginRegistryItem {
  name: string;
  currentVersion?: string;
  folderName?: string;
  category: 'cssharp' | 'metamod' | 'core';
  tags?: readonly string[];
  description?: string;
  downloadUrl?: string;
}

/**
 * PluginManager - Orchestrator Service
 *
 * This is the main entry point for plugin management.
 * It delegates work to specialized services:
 * - PluginDiscovery: Pool scanning and metadata extraction
 * - PluginInstaller: Installation, uninstallation, and Smart Sync
 * - PluginConfigManager: Configuration file management
 * - PluginDatabaseInjector: MySQL credential injection
 */
export class PluginManager {
  public pluginRegistry = pluginRegistry;
  private manifest: Record<string, PluginMetadata> | null = null;
  private checkAllStmt: Statement;
  private checkOneStmt: Statement;

  constructor() {
    this.checkAllStmt = db.prepare(
      'SELECT plugin_id, version FROM server_plugins WHERE server_id = ?'
    );
    this.checkOneStmt = db.prepare(
      'SELECT version FROM server_plugins WHERE server_id = ? AND plugin_id = ?'
    );

    // Ensure pool directory exists
    if (!fs.existsSync(POOL_DIR)) {
      fs.mkdirSync(POOL_DIR, { recursive: true });
    }
  }

  /**
   * Gets the registry of all available plugins
   * Delegates to PluginDiscovery service
   */
  async getRegistry(_serverId?: string | number): Promise<Record<string, PluginMetadata>> {
    return await pluginDiscovery.scanPool(
      this.pluginRegistry as unknown as Record<string, PluginRegistryItem>
    );
  }

  /**
   * Syncs the static registry (legacy method, kept for compatibility)
   */
  async syncRegistry(): Promise<Record<string, PluginMetadata>> {
    const manifest: Record<string, PluginMetadata> = {};
    for (const [id, info] of Object.entries(this.pluginRegistry)) {
      const pInfo = info as unknown as PluginRegistryItem;
      manifest[id] = {
        name: pInfo.name,
        version: pInfo.currentVersion || 'latest',
        folderName: pInfo.folderName || undefined,
        category: pInfo.category,
        description: pInfo.description || '',
        inPool: false,
        isCustom: false,
      };
    }
    this.manifest = manifest;
    return manifest;
  }

  /**
   * Gets plugin installation status for a server
   */
  async getPluginStatus(
    installDir: string,
    instanceId: string | number
  ): Promise<Record<string, { installed: boolean; hasConfigs: boolean }>> {
    const id = instanceId.toString();
    const csgoDir = path.join(installDir, id, 'game', 'csgo');
    const addonsDir = path.join(csgoDir, 'addons');
    const cssPluginsDir = path.join(addonsDir, 'counterstrikesharp', 'plugins');
    const cssSharedDir = path.join(addonsDir, 'counterstrikesharp', 'shared');
    const status: Record<string, { installed: boolean; hasConfigs: boolean }> = {};

    const dirCache = new Map<string, Promise<{ raw: string; lower: string }[]>>();
    const getDirItems = (dir: string): Promise<{ raw: string; lower: string }[]> => {
      if (!dirCache.has(dir)) {
        dirCache.set(
          dir,
          fs.promises
            .readdir(dir)
            .then((items) => items.map((i) => ({ raw: i, lower: i.toLowerCase() })))
            .catch(() => [])
        );
      }
      return dirCache.get(dir)!;
    };

    const [hasMetaVdf, hasMetaX64Vdf, hasCSS] = await Promise.all([
      fs.promises
        .access(path.join(addonsDir, 'metamod.vdf'))
        .then(() => true)
        .catch(() => false),
      fs.promises
        .access(path.join(addonsDir, 'metamod_x64.vdf'))
        .then(() => true)
        .catch(() => false),
      fs.promises
        .access(path.join(addonsDir, 'counterstrikesharp'))
        .then(() => true)
        .catch(() => false),
    ]);

    status.metamod = { installed: hasMetaVdf || hasMetaX64Vdf, hasConfigs: false };
    status.cssharp = { installed: hasCSS, hasConfigs: false };

    const checkExists = async (dir: string, name: string) => {
      const items = await getDirItems(dir);
      const lowerName = name.toLowerCase();
      return items.some((item) => {
        return (
          item.lower === lowerName ||
          item.lower === lowerName + '.vdf' ||
          item.lower === lowerName + '.dll' ||
          (lowerName.length > 3 && item.lower.includes(lowerName))
        );
      });
    };

    const registry = await this.getRegistry(instanceId);
    const checks = Object.keys(registry).map(async (pid) => {
      const info = registry[pid];
      if (!info) return;

      if (info.category === 'core') {
        if (!status[pid]) status[pid] = { installed: false, hasConfigs: false };
        return;
      }

      let installed = false;
      if (info.category === 'metamod') {
        installed =
          (await checkExists(addonsDir, pid)) ||
          (await checkExists(addonsDir, info.folderName || '')) ||
          (await checkExists(addonsDir, info.name));
      } else if (info.category === 'cssharp') {
        installed =
          (await checkExists(cssPluginsDir, pid)) ||
          (await checkExists(cssPluginsDir, info.folderName || '')) ||
          (await checkExists(cssPluginsDir, info.name)) ||
          (await checkExists(cssSharedDir, pid)) ||
          (await checkExists(cssSharedDir, info.folderName || '')) ||
          (await checkExists(cssSharedDir, info.name));

        if (!installed) {
          installed =
            (await checkExists(csgoDir, pid)) ||
            (await checkExists(csgoDir, info.folderName || '')) ||
            (await checkExists(csgoDir, info.name));
        }
      }

      let hasConfigs = false;
      if (installed) {
        const configs = await this.getPluginConfigFiles(
          installDir,
          instanceId,
          pid,
          info.folderName
        );
        hasConfigs = configs.length > 0;
      }

      status[pid] = { installed, hasConfigs };
    });

    await Promise.all(checks);
    return status;
  }

  /**
   * Installs a plugin
   * Delegates to PluginInstaller service
   */
  async installPlugin(
    installDir: string,
    instanceId: string | number,
    pluginId: string,
    taskId?: string
  ): Promise<void> {
    const registry = await this.getRegistry(instanceId);
    const pluginInfo = registry[pluginId];

    if (!pluginInfo) {
      console.error('[PLUGIN] Attempted to install unknown plugin:', pluginId);
      return;
    }

    await pluginInstaller.install(installDir, instanceId, pluginId, pluginInfo, taskId);
  }

  /**
   * Uninstalls a plugin
   * Delegates to PluginInstaller service
   */
  async uninstallPlugin(
    installDir: string,
    instanceId: string | number,
    pluginId: string,
    taskId?: string
  ): Promise<void> {
    const registry = await this.getRegistry(instanceId);
    const pluginInfo = registry[pluginId];

    if (!pluginInfo) {
      console.error('[PLUGIN] Attempted to uninstall unknown plugin:', pluginId);
      if (taskId) taskService.failTask(taskId, `Unknown plugin: ${pluginId}`);
      return;
    }

    await pluginInstaller.uninstall(installDir, instanceId, pluginId, pluginInfo, taskId);
  }

  /**
   * Uploads a plugin to the pool
   * Delegates to PluginInstaller service
   */
  async uploadToPool(pluginId: string, filePath: string, originalName: string): Promise<void> {
    await pluginInstaller.uploadToPool(pluginId, filePath, originalName);
  }

  /**
   * Gets plugin configuration files
   * Delegates to PluginConfigManager service
   */
  async getPluginConfigFiles(
    installDir: string,
    instanceId: string | number,
    pluginId: string,
    folderName?: string
  ): Promise<string[]> {
    let finalFolderName = folderName;
    if (!finalFolderName) {
      const registry = await this.getRegistry(instanceId);
      finalFolderName = registry[pluginId]?.folderName;
    }
    return await pluginConfigManager.discoverConfigs(
      installDir,
      instanceId,
      pluginId,
      finalFolderName
    );
  }

  /**
   * Reads a plugin configuration file
   * Delegates to PluginConfigManager service
   */
  async readPluginConfigFile(filePath: string): Promise<string> {
    return await pluginConfigManager.readConfig(filePath);
  }

  /**
   * Saves a plugin configuration file
   * Delegates to PluginConfigManager service
   */
  async savePluginConfigFile(
    installDir: string,
    instanceId: string | number,
    pluginId: string,
    relativeFilePath: string,
    content: string
  ): Promise<void> {
    await pluginConfigManager.writeConfig(
      installDir,
      instanceId,
      pluginId,
      relativeFilePath,
      content
    );
  }

  /**
   * Checks for plugin updates
   */
  async checkAllPluginUpdates(instanceId: string | number): Promise<
    Record<
      string,
      {
        hasUpdate: boolean;
        latestVersion: string | undefined;
        currentVersion: string | undefined;
        name: string | undefined;
      }
    >
  > {
    const registry = await this.getRegistry(instanceId);
    const rows = this.checkAllStmt.all(instanceId) as { plugin_id: string; version: string }[];

    const updates: Record<
      string,
      {
        hasUpdate: boolean;
        latestVersion: string | undefined;
        currentVersion: string | undefined;
        name: string | undefined;
      }
    > = {};

    for (const row of rows) {
      const pid = row.plugin_id as PluginId;
      const info = registry[pid];
      if (!info) continue;

      const currentVersion = row.version;
      const latestVersion = info.currentVersion || info.version;
      const hasUpdate = currentVersion !== latestVersion && latestVersion !== 'latest';

      updates[pid] = {
        hasUpdate,
        currentVersion,
        latestVersion,
        name: info.name,
      };
    }

    return updates;
  }

  /**
   * Checks for a single plugin update
   */
  async checkPluginUpdate(
    instanceId: string | number,
    pluginId: PluginId
  ): Promise<{
    hasUpdate: boolean;
    currentVersion: string | undefined;
    latestVersion: string | undefined;
  }> {
    const registry = await this.getRegistry(instanceId);
    const info = registry[pluginId];

    if (!info) {
      return { hasUpdate: false, currentVersion: undefined, latestVersion: undefined };
    }

    const row = this.checkOneStmt.get(instanceId, pluginId) as { version: string } | undefined;
    const currentVersion = row?.version;
    const latestVersion = info.currentVersion || info.version;
    const hasUpdate =
      !!currentVersion && currentVersion !== latestVersion && latestVersion !== 'latest';

    return { hasUpdate, currentVersion, latestVersion };
  }

  /**
   * Updates a plugin (reinstalls with latest version)
   */
  async updatePlugin(
    installDir: string,
    instanceId: string | number,
    pluginId: string,
    taskId?: string
  ): Promise<void> {
    await this.uninstallPlugin(installDir, instanceId, pluginId, taskId);
    await this.installPlugin(installDir, instanceId, pluginId, taskId);
  }

  /**
   * Uninstalls Metamod and all dependent plugins
   */
  async uninstallMetamod(installDir: string, instanceId: string | number): Promise<void> {
    const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');
    const addonsDir = path.join(csgoDir, 'addons');
    console.log(`[PLUGIN] Performing deep cleanup of Metamod and dependencies...`);
    const metaFiles = ['metamod', 'metamod.vdf', 'metamod_x64.vdf'];
    await Promise.all(
      metaFiles.map((p) =>
        fs.promises.rm(path.join(addonsDir, p), { recursive: true, force: true }).catch(() => {})
      )
    );
    const cssDir = path.join(addonsDir, 'counterstrikesharp');
    try {
      await fs.promises.rm(cssDir, { recursive: true, force: true });
      db.prepare(`DELETE FROM server_plugins WHERE server_id = ? AND plugin_id != 'metamod'`).run(
        instanceId
      );
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code !== 'ENOENT') throw new Error('Cannot remove CS#: Files in use.');
    }
    const gameinfo = path.join(csgoDir, 'gameinfo.gi');
    try {
      let content = await fs.promises.readFile(gameinfo, 'utf8');
      content = content.replace(/\s*Game\tcsgo\/addons\/metamod/g, '');
      await fs.promises.writeFile(gameinfo, content);
    } catch {
      /* ignore */
    }
    try {
      await fs.promises.rm(addonsDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  /**
   * Uninstalls CounterStrikeSharp
   */
  async uninstallCounterStrikeSharp(
    installDir: string,
    instanceId: string | number
  ): Promise<void> {
    const cssDir = path.join(
      installDir,
      instanceId.toString(),
      'game',
      'csgo',
      'addons',
      'counterstrikesharp'
    );
    await fs.promises.rm(cssDir, { recursive: true, force: true }).catch(() => {});
  }

  /**
   * Deletes a plugin from the pool
   */
  async deleteFromPool(pluginId: string): Promise<void> {
    // 1. Sanitize the pluginId (only allow alphanumeric, dash, underscore)
    // This prevents basic path traversal attempts like ../../secret
    if (!/^[a-zA-Z0-9\-_]+$/.test(pluginId)) {
      throw new Error(`Invalid plugin ID format: ${pluginId}`);
    }

    const registry = await this.getRegistry();
    const pluginInfo = registry[pluginId];

    if (!pluginInfo) {
      throw new Error(`Plugin "${pluginId}" not found in registry`);
    }

    // 2. Resolve and verify the path is within the pool directory
    const folderName = pluginInfo.folderName || pluginId;
    const poolPath = path.resolve(POOL_DIR, folderName);

    if (!poolPath.startsWith(POOL_DIR)) {
      throw new Error('Access denied: Unauthorized path access attempted.');
    }

    if (!fs.existsSync(poolPath)) {
      throw new Error(`Plugin "${pluginId}" not found in pool`);
    }

    await fs.promises.rm(poolPath, { recursive: true, force: true });
    console.log('[POOL] Deleted plugin from pool:', pluginId);
  }
}

export const pluginManager = new PluginManager();
