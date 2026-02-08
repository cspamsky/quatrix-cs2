import path from 'path';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import { fileURLToPath } from 'url';
import type { PluginMetadata } from '../PluginManager.js';
import { pluginDiscovery } from './PluginDiscovery.js';
import { pluginConfigManager } from './PluginConfigManager.js';
import { pluginDatabaseInjector } from './PluginDatabaseInjector.js';
import db from '../../db.js';
import { taskService } from '../TaskService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '../../../../');
const POOL_DIR = path.join(PROJECT_ROOT, 'data', 'plugin_pool');

/**
 * PluginInstaller Service
 * Responsible for:
 * - Installing plugins from pool to server instances
 * - Uninstalling plugins
 * - Smart Sync (distributing files by type)
 * - Upload handling and archive extraction
 */
export class PluginInstaller {
  private db = db;

  /**
   * Installs a plugin from the pool to a server instance
   * @param installDir Server installation directory
   * @param instanceId Server instance ID
   * @param pluginId Plugin identifier
   * @param pluginInfo Plugin metadata
   * @param taskId Optional task ID for progress tracking
   */
  async install(
    installDir: string,
    instanceId: string | number,
    pluginId: string,
    pluginInfo: PluginMetadata,
    taskId?: string
  ): Promise<void> {
    // SECURITY: Validate pluginId to prevent Path Traversal
    if (!/^[a-zA-Z0-9\-_]+$/.test(pluginId) && pluginId !== 'metamod' && pluginId !== 'cssharp') {
      throw new Error(`Invalid plugin ID: ${pluginId}`);
    }

    if (taskId) {
      taskService.updateTask(taskId, {
        status: 'running',
        message: `Installing ${pluginId}...`,
        progress: 10,
      });
    }

    const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');

    // 1. Smart Dependency: If installing any CSS plugin, ensure MM and CSS are present
    if (
      pluginInfo.category === 'cssharp' &&
      pluginId !== 'metamod' &&
      pluginId !== 'cssharp' &&
      pluginId !== 'cssharp-core'
    ) {
      const addonsDir = path.join(csgoDir, 'addons');
      const cssBase = path.join(addonsDir, 'counterstrikesharp');

      const mmInstalled = await fs
        .access(path.join(addonsDir, 'metamod.vdf'))
        .then(() => true)
        .catch(() =>
          fs
            .access(path.join(addonsDir, 'metamod_x64.vdf'))
            .then(() => true)
            .catch(() => false)
        );
      const cssInstalled = await fs
        .access(cssBase)
        .then(() => true)
        .catch(() => false);

      if (!mmInstalled || !cssInstalled) {
        const { pluginRegistry } = await import('../../config/plugins.js');
        if (!mmInstalled && pluginRegistry.metamod) {
          console.log(`[PLUGIN] Auto-installing Metamod dependency for ${pluginId}...`);
          await this.install(
            installDir,
            instanceId,
            'metamod',
            pluginRegistry.metamod as any,
            taskId
          );
        }
        if (!cssInstalled && pluginRegistry.cssharp) {
          console.log(`[PLUGIN] Auto-installing CounterStrikeSharp dependency for ${pluginId}...`);
          await this.install(
            installDir,
            instanceId,
            'cssharp',
            pluginRegistry.cssharp as any,
            taskId
          );
        }
      }
    }

    // 2. Find plugin in pool
    const poolPath = await this.findInPool(pluginId, pluginInfo);

    console.log(
      '[PLUGIN] Syncing',
      pluginInfo.name,
      'from pool (' + path.basename(poolPath) + ') to instance...'
    );

    // 2. Detect structure and determine sync strategy
    const hasGameDir = await fs
      .access(path.join(poolPath, 'game'))
      .then(() => true)
      .catch(() => false);
    const hasAddonsDir = await fs
      .access(path.join(poolPath, 'addons'))
      .then(() => true)
      .catch(() => false);
    const hasCSSDir = await fs
      .access(path.join(poolPath, 'counterstrikesharp'))
      .then(() => true)
      .catch(() => false);

    // Check for standard CS2 folders
    const assetFolders = [
      'cfg',
      'materials',
      'models',
      'particles',
      'sound',
      'soundevents',
      'translations',
      'maps',
      'scripts',
    ];
    const assetFound = (
      await Promise.all(
        assetFolders.map((f) =>
          fs
            .access(path.join(poolPath, f))
            .then(() => true)
            .catch(() => false)
        )
      )
    ).some((x) => x);

    // SECURITY: Sanitize pluginFolderName
    const rawFolderName = pluginInfo.folderName || pluginId;
    const baseName = path.basename(rawFolderName);
    const pluginFolderName = baseName.replace(/[^a-zA-Z0-9\-_]/g, '');

    if (!pluginFolderName) {
      throw new Error(`Invalid plugin folder name: ${rawFolderName}`);
    }

    // 3. Sync files based on structure
    if (taskId) {
      taskService.updateTask(taskId, { progress: 30, message: 'Syncing files...' });
    }

    if (hasGameDir) {
      // Merge into instance root
      await fs.cp(poolPath, path.dirname(path.dirname(csgoDir)), { recursive: true });
    } else if (hasAddonsDir || assetFound) {
      // Merge into game/csgo
      await fs.cp(poolPath, csgoDir, { recursive: true });
    } else if (hasCSSDir) {
      // Merge into game/csgo/addons
      await fs.cp(poolPath, path.join(csgoDir, 'addons'), { recursive: true });
    } else {
      // Smart Sync: Non-standard structure
      await this.smartSync(poolPath, csgoDir, pluginInfo, pluginFolderName);
    }

    if (taskId) {
      taskService.updateTask(taskId, { progress: 60, message: 'Post-processing configs...' });
    }

    // 4. Determine search directory for post-processing
    const searchDir = hasGameDir
      ? path.dirname(path.dirname(csgoDir))
      : hasAddonsDir || assetFound
        ? csgoDir
        : hasCSSDir
          ? path.join(csgoDir, 'addons')
          : csgoDir;

    // 5. Process example configs
    await pluginConfigManager.processExampleConfigs(searchDir);

    // 6. Inject MySQL credentials
    await pluginDatabaseInjector
      .injectCredentials(instanceId, searchDir)
      .catch((err) => console.error('[PLUGIN] MySQL Injection failed for:', pluginId, err));

    if (taskId) {
      taskService.updateTask(taskId, { progress: 80, message: 'Finalizing installation...' });
    }

    // 7. Record in database
    try {
      this.db
        .prepare(
          `
        INSERT INTO server_plugins (server_id, plugin_id, version) 
        VALUES (?, ?, ?)
        ON CONFLICT(server_id, plugin_id) DO UPDATE SET version = EXCLUDED.version
      `
        )
        .run(instanceId, pluginId, pluginInfo.currentVersion);
    } catch (err) {
      console.error(`[DB] Failed to record plugin sync:`, err);
    }

    // 8. Special handling for metamod
    if (pluginId === 'metamod') {
      await this.configureMetamod(csgoDir, taskId);
    }

    console.log('[PLUGIN]', pluginInfo.name, 'sync complete.');

    if (taskId) {
      taskService.completeTask(taskId, `${pluginInfo.name} installed`);
    }
  }

  /**
   * Smart Sync: Distributes files by type for non-standard plugin structures
   */
  private async smartSync(
    poolPath: string,
    csgoDir: string,
    pluginInfo: PluginMetadata,
    pluginFolderName: string
  ): Promise<void> {
    if (pluginInfo.category === 'cssharp') {
      const cssBase = path.join(csgoDir, 'addons', 'counterstrikesharp');
      const pluginDest = path.join(cssBase, 'plugins', pluginFolderName);
      const configDest = path.join(cssBase, 'configs', 'plugins', pluginFolderName);
      const transDest = path.join(cssBase, 'translations', pluginFolderName);

      // SECURITY: Path traversal check
      const checkDest = (dest: string, base: string) => {
        if (!dest.startsWith(path.resolve(base)) && !dest.startsWith(base)) {
          throw new Error(`Security Error: Plugin path traversal detected for ${dest}`);
        }
      };

      checkDest(pluginDest, cssBase);
      checkDest(configDest, cssBase);
      checkDest(transDest, cssBase);

      await fs.mkdir(pluginDest, { recursive: true });

      const items = await fs.readdir(poolPath, { withFileTypes: true });
      for (const item of items) {
        const src = path.join(poolPath, item.name);
        const lowerName = item.name.toLowerCase();

        // Double check src path
        if (!src.startsWith(poolPath)) continue;

        if (
          lowerName.endsWith('.dll') ||
          lowerName.endsWith('.deps.json') ||
          lowerName.endsWith('.pdb')
        ) {
          await fs.cp(src, path.join(pluginDest, item.name), { recursive: true });
        } else if (
          lowerName.endsWith('.json') ||
          lowerName.endsWith('.toml') ||
          lowerName.endsWith('.cfg') ||
          lowerName.endsWith('.ini')
        ) {
          await fs.mkdir(configDest, { recursive: true });
          await fs.cp(src, path.join(configDest, item.name), { recursive: true });
        } else if (lowerName.endsWith('.txt') || item.isDirectory()) {
          // Heuristic: folders in root are usually configs or translations
          if (lowerName === 'configs' || lowerName === 'cfg') {
            await fs.mkdir(configDest, { recursive: true });
            await fs.cp(src, configDest, { recursive: true });
          } else if (lowerName === 'translations' || lowerName === 'lang') {
            await fs.mkdir(transDest, { recursive: true });
            await fs.cp(src, transDest, { recursive: true });
          } else {
            // Default to plugin folder
            await fs.cp(src, path.join(pluginDest, item.name), { recursive: true });
          }
        } else {
          await fs.cp(src, path.join(pluginDest, item.name), { recursive: true });
        }
      }
    } else if (pluginInfo.category === 'metamod') {
      await fs.cp(poolPath, path.join(csgoDir, 'addons'), { recursive: true });
    } else {
      await fs.cp(poolPath, csgoDir, { recursive: true });
    }
  }

  /**
   * Finds plugin in pool directory
   */
  private async findInPool(pluginId: string, pluginInfo: PluginMetadata): Promise<string> {
    const candidateNames = new Set(
      [
        pluginId.toLowerCase(),
        (pluginInfo.folderName || '').toLowerCase(),
        (pluginInfo.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
      ].filter(Boolean)
    );

    const poolItems = await fs.readdir(POOL_DIR);
    const matchedFolder = poolItems.find((item) => candidateNames.has(item.toLowerCase()));

    if (matchedFolder) {
      const fullPath = path.join(POOL_DIR, matchedFolder);
      const items = await fs.readdir(fullPath);
      if (items.length > 0) {
        return fullPath;
      }
    }

    const expectedName = pluginInfo.folderName || pluginId;
    const expectedPath = path.join(POOL_DIR, expectedName);
    throw new Error(
      `Plugin "${pluginId}" not found in local pool. Please upload it via the dashboard or add its files to: ${expectedPath}`
    );
  }

  /**
   * Configures Metamod by patching gameinfo.gi
   */
  private async configureMetamod(csgoDir: string, taskId?: string): Promise<void> {
    if (taskId) {
      taskService.updateTask(taskId, { message: 'Configuring Metamod (patching gameinfo)...' });
    }
    const gameinfo = path.join(csgoDir, 'gameinfo.gi');
    try {
      await fs.access(gameinfo);
      let content = await fs.readFile(gameinfo, 'utf8');
      if (!content.includes('csgo/addons/metamod')) {
        const lines = content.split('\n');
        const searchIndex = lines.findIndex((l) => l.includes('Game_LowViolence'));
        if (searchIndex !== -1) {
          lines.splice(searchIndex, 0, '\t\t\tGame\tcsgo/addons/metamod');
          content = lines.join('\n');
          await fs.writeFile(gameinfo, content);
          console.log('[PLUGIN] Patched gameinfo.gi for Metamod');
        }
      }
    } catch (err) {
      console.error('[PLUGIN] Failed to configure Metamod:', err);
    }
  }

  /**
   * Uninstalls a plugin from a server instance
   */
  async uninstall(
    installDir: string,
    instanceId: string | number,
    pluginId: string,
    pluginInfo: PluginMetadata,
    taskId?: string
  ): Promise<void> {
    // SECURITY: Validate pluginId
    if (!/^[a-zA-Z0-9\-_]+$/.test(pluginId) && pluginId !== 'metamod' && pluginId !== 'cssharp') {
      throw new Error(`Invalid plugin ID: ${pluginId}`);
    }

    if (taskId) {
      taskService.updateTask(taskId, {
        status: 'running',
        message: `Uninstalling ${pluginId}...`,
        progress: 20,
      });
    }
    const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');
    const addonsDir = path.join(csgoDir, 'addons');
    const addonsDirResolved = path.resolve(addonsDir);

    console.log('[PLUGIN] Uninstalling', pluginInfo.name);

    // SECURITY: Sanitize folder name
    const rawFolderName = pluginInfo.folderName || pluginId;
    const baseFolderName = path.basename(rawFolderName).replace(/[^a-zA-Z0-9\-_]/g, '');

    if (!baseFolderName) {
      throw new Error(`Invalid plugin folder name: ${rawFolderName}`);
    }

    if (pluginInfo.category === 'cssharp') {
      const cssBase = path.join(addonsDir, 'counterstrikesharp');
      const cssBaseResolved = path.resolve(cssBase);

      const targets = [
        path.resolve(cssBase, 'plugins', baseFolderName),
        path.resolve(cssBase, 'configs', 'plugins', baseFolderName),
        path.resolve(cssBase, 'shared', baseFolderName),
        path.resolve(cssBase, 'translations', baseFolderName),
      ];

      // SECURITY: Ensure all targets are within cssBase
      for (const target of targets) {
        if (!target.startsWith(cssBaseResolved)) {
          console.warn(
            `[PLUGIN] Blocked unauthorized path traversal attempt during uninstall: ${target}`
          );
          continue;
        }
        await fs.rm(target, { recursive: true, force: true });
      }
    } else if (pluginInfo.category === 'metamod') {
      const target = path.resolve(addonsDir, baseFolderName);

      // SECURITY: Ensure target is within addonsDir
      if (target.startsWith(addonsDirResolved)) {
        await fs.rm(target, { recursive: true, force: true });
      } else {
        console.warn(
          `[PLUGIN] Blocked unauthorized path traversal attempt during uninstall: ${target}`
        );
      }
    }

    // Remove from database
    try {
      this.db
        .prepare(`DELETE FROM server_plugins WHERE server_id = ? AND plugin_id = ?`)
        .run(instanceId, pluginId);
    } catch (err) {
      console.error(`[DB] Failed to remove plugin from DB:`, err);
    }

    if (taskId) {
      taskService.completeTask(taskId, `${pluginInfo.name} uninstalled`);
    }
    console.log('[PLUGIN]', pluginInfo.name, 'uninstalled');
  }

  /**
   * Uploads a plugin archive to the pool
   */
  async uploadToPool(pluginId: string, filePath: string, originalName: string): Promise<void> {
    // SECURITY: Validate file path
    const resolvedFilePath = path.resolve(filePath);
    const expectedUploadDir = path.resolve('data/temp/uploads');

    if (!resolvedFilePath.startsWith(expectedUploadDir)) {
      throw new Error('Security Error: Invalid upload file path detected');
    }

    const tempExtractDir = path.join(POOL_DIR, `.temp_upload_${Date.now()}`);
    const lowerName = originalName.toLowerCase();
    console.log('[POOL] Processing upload:', originalName, '(ID:', pluginId + ')');

    try {
      await fs.mkdir(tempExtractDir, { recursive: true });

      // Extract archive
      if (lowerName.endsWith('.zip')) {
        const zip = new AdmZip(filePath);
        zip.extractAllTo(tempExtractDir, true);
      } else if (
        lowerName.endsWith('.tar.gz') ||
        lowerName.endsWith('.tgz') ||
        lowerName.endsWith('.tar')
      ) {
        await tar.x({
          file: filePath,
          C: tempExtractDir,
        });
      } else if (lowerName.endsWith('.rar')) {
        throw new Error(
          'RAR extraction is not natively supported yet. Please convert your plugin to .ZIP or .tar.gz format.'
        );
      } else {
        throw new Error(`Unsupported file format: "${originalName}". Use .zip, .tar.gz or .tar`);
      }

      // Derive plugin ID from filename if unknown
      let fallbackId =
        pluginId === 'unknown'
          ? originalName.replace(/\.(zip|tar\.gz|tgz|tar|rar)$/i, '')
          : pluginId;

      fallbackId = fallbackId.replace(/[^a-zA-Z0-9.\-_]/g, '');
      if (!fallbackId) fallbackId = 'unknown_plugin';

      // Find content root (smart flatten)
      const contentRoot = await pluginDiscovery.findContentRoot(tempExtractDir);

      // Detect metadata
      const metadata = await pluginDiscovery.extractMetadata(contentRoot, fallbackId);
      let finalFolderName = metadata.folderName;

      // Sanitize folder name
      finalFolderName = finalFolderName.replace(/[^a-zA-Z0-9.\-_]/g, '');
      if (!finalFolderName || finalFolderName === '.' || finalFolderName === '..') {
        finalFolderName = fallbackId;
      }

      const targetPoolPath = path.join(POOL_DIR, finalFolderName);

      // SECURITY: Final traversal check
      if (!targetPoolPath.startsWith(POOL_DIR)) {
        throw new Error('Invalid plugin folder name detected.');
      }

      // Remove existing and move new
      const exists = await fs
        .access(targetPoolPath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        await fs.rm(targetPoolPath, { recursive: true, force: true });
      }

      await fs.rename(contentRoot, targetPoolPath);

      // Update Metadata Cache
      try {
        db.prepare(
          'INSERT OR REPLACE INTO plugin_metadata_cache (plugin_id, name, category, folder_name, is_custom) VALUES (?, ?, ?, ?, ?)'
        ).run(finalFolderName, metadata.name, metadata.category, finalFolderName, 1);
      } catch (err) {
        console.error('[POOL] Failed to update cache for uploaded plugin:', finalFolderName, err);
      }

      console.log(
        '[POOL] Plugin',
        metadata.name,
        '(' + metadata.category + ') successfully uploaded to',
        targetPoolPath
      );
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`[POOL] Upload failed:`, err);
      throw new Error(`Failed to process plugin: ${err.message}`);
    } finally {
      // Cleanup
      await fs.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(filePath, { force: true }).catch(() => {});
    }
  }
}

export const pluginInstaller = new PluginInstaller();
