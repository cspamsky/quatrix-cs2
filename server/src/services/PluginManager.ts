import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import type { Statement } from 'better-sqlite3';
import { pluginRegistry, type PluginId } from '../config/plugins.js';
import db from '../db.js';

import { databaseManager } from './DatabaseManager.js';
import { taskService } from './TaskService.js';
import { fileURLToPath } from 'url';
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

  private getPoolDir(pluginId: PluginId): string {
    const info = (this.pluginRegistry as unknown as Record<string, PluginRegistryItem>)[pluginId];
    if (!info) return path.join(POOL_DIR, pluginId);

    // Use folderName first, then a sanitized version of Name, fallback to pluginId
    const safeName = (info.folderName || info.name || pluginId).replace(/[^a-zA-Z0-9.\-_]/g, '');
    return path.join(POOL_DIR, safeName);
  }

  async syncRegistry() {
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

  async getRegistry(_serverId?: string | number) {
    const manifest: Record<string, PluginMetadata> = {};
    const poolItems = await fs.promises.readdir(POOL_DIR).catch(() => []);
    const poolItemsLower = poolItems.map((i) => i.toLowerCase());

    // 1. Process static registry
    for (const [id, info] of Object.entries(this.pluginRegistry)) {
      const pInfo = info as unknown as PluginRegistryItem;
      const candidateNames = [
        id.toLowerCase(),
        (pInfo.folderName || '').toLowerCase(),
        (pInfo.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
      ].filter(Boolean);

      const inPool = candidateNames.some((name) => poolItemsLower.includes(name));

      manifest[id] = {
        name: pInfo.name,
        version: pInfo.currentVersion || 'latest',
        downloadUrl: pInfo.downloadUrl || '',
        category: pInfo.category,
        description: pInfo.description || '',
        folderName: pInfo.folderName || undefined,
        inPool: inPool,
        isCustom: false,
      };
    }

    // 2. Process dynamic pool folders
    for (const item of poolItems) {
      const itemLower = item.toLowerCase();
      // Skip if already in manifest (by static registry)
      const isKnown = Object.values(manifest).some(
        (m: PluginMetadata) =>
          (m.folderName && m.folderName.toLowerCase() === itemLower) ||
          (m.name && m.name.toLowerCase().replace(/[^a-z0-9]/g, '') === itemLower)
      );

      if (!isKnown) {
        // New discovered plugin
        const fullPath = path.join(POOL_DIR, item);
        const stats = await fs.promises.stat(fullPath).catch(() => null);
        if (stats && stats.isDirectory()) {
          const category = await this.detectPoolFolderCategory(fullPath);
          // Use original case 'item' as the key to satisfy UI expectations
          manifest[item] = {
            name: item,
            version: 'latest',
            category: category,
            description: 'Manually added or discovered plugin',
            folderName: item,
            inPool: true,
            isCustom: true,
          };
        }
      }
    }

    return manifest;
  }

  private async detectPoolFolderCategory(dir: string): Promise<'metamod' | 'cssharp' | 'core'> {
    const items = await fs.promises.readdir(dir).catch(() => []);
    const itemsLower = items.map((i) => i.toLowerCase());

    if (itemsLower.includes('counterstrikesharp')) return 'cssharp';
    if (itemsLower.includes('addons')) {
      const addonsContent = await fs.promises.readdir(path.join(dir, 'addons')).catch(() => []);
      if (addonsContent.some((c) => c.toLowerCase() === 'counterstrikesharp')) return 'cssharp';
      return 'metamod';
    }

    // Look for signatures deeper
    const hasDLL = itemsLower.some((i) => i.endsWith('.dll'));
    if (hasDLL) return 'cssharp'; // Most dynamic uploads for CS2 are CSS plugins

    return 'cssharp'; // Default to CS#
  }

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
        const configs = await this.getPluginConfigFiles(installDir, instanceId, pid);
        hasConfigs = configs.length > 0;
      }

      status[pid] = { installed, hasConfigs };
    });

    await Promise.all(checks);
    return status;
  }

  /**
   * Validates that the plugin exists in the central pool.
   * Downloads are disabled; the pool must be populated manually.
   */
  async ensurePluginInPool(pluginId: string): Promise<string> {
    const info = (this.pluginRegistry as unknown as Record<string, PluginRegistryItem>)[pluginId];
    const candidateNames = new Set(
      [
        pluginId.toLowerCase(),
        (info?.folderName || '').toLowerCase(),
        (info?.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
      ].filter(Boolean)
    );

    // List the pool directory once
    const poolItems = await fs.promises.readdir(POOL_DIR);

    // Find a match regardless of case
    const matchedFolder = poolItems.find((item) => candidateNames.has(item.toLowerCase()));

    if (matchedFolder) {
      const fullPath = path.join(POOL_DIR, matchedFolder);
      const items = await fs.promises.readdir(fullPath);
      if (items.length > 0) {
        console.log('[PLUGIN] Syncing', pluginId, 'from pool folder:', matchedFolder);
        return fullPath;
      }
    }

    const expectedName = info?.folderName || pluginId;
    const expectedPath = path.join(POOL_DIR, expectedName);
    throw new Error(
      `Plugin "${pluginId}" not found in local pool. Please upload it via the dashboard or add its files to: ${expectedPath}`
    );
  }

  async uploadToPool(pluginId: string, filePath: string, originalName: string): Promise<void> {
    // SECURITY: Validate that filePath is within expected upload directory
    // This addresses SAST concerns about user-controlled path expressions
    const resolvedFilePath = path.resolve(filePath);
    const expectedUploadDir = path.resolve('data/temp/uploads');
    
    if (!resolvedFilePath.startsWith(expectedUploadDir)) {
      throw new Error('Security Error: Invalid upload file path detected');
    }
    
    const tempExtractDir = path.join(POOL_DIR, `.temp_upload_${Date.now()}`);
    const lowerName = originalName.toLowerCase();
    console.log('[POOL] Processing upload:', originalName, '(ID:', pluginId + ')');

    try {
      await fs.promises.mkdir(tempExtractDir, { recursive: true });
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

      // If pluginId is "unknown", let's try to derive a better ID from the filename
      let fallbackId =
        pluginId === 'unknown'
          ? originalName.replace(/\.(zip|tar\.gz|tgz|tar|rar)$/i, '')
          : pluginId;

      // Sanitize fallbackId to be sure it doesn't contain traversal
      fallbackId = fallbackId.replace(/[^a-zA-Z0-9.\-_]/g, '');
      if (!fallbackId) fallbackId = 'unknown_plugin';

      // Find the actual content root (smart flatten)
      const contentRoot = await this.findContentRoot(tempExtractDir);

      // Detect metadata from extracted files
      const metadata = await this.detectPluginMetadata(contentRoot, fallbackId);
      let finalFolderName = metadata.folderName;

      // Ensure finalFolderName is safe
      finalFolderName = finalFolderName.replace(/[^a-zA-Z0-9.\-_]/g, '');
      if (!finalFolderName || finalFolderName === '.' || finalFolderName === '..') {
        finalFolderName = fallbackId;
      }

      const targetPoolPath = path.join(POOL_DIR, finalFolderName);

      // Final verified check for traversal
      if (!targetPoolPath.startsWith(POOL_DIR)) {
        throw new Error('Invalid plugin folder name detected.');
      }

      if (fs.existsSync(targetPoolPath)) {
        await fs.promises.rm(targetPoolPath, { recursive: true, force: true });
      }

      await fs.promises.rename(contentRoot, targetPoolPath);
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
      // Cleanup temp dirs
      await fs.promises.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
      await fs.promises.rm(filePath, { force: true }).catch(() => {});
    }
  }

  private async detectPluginMetadata(
    dir: string,
    suggestedId?: string
  ): Promise<{ name: string; category: 'cssharp' | 'metamod' | 'core'; folderName: string }> {
    const items = await fs.promises.readdir(dir, { withFileTypes: true });
    const itemsLower = items.map((i) => i.name.toLowerCase());

    // 1. Check for CS# structure: addons/counterstrikesharp/plugins/Name
    if (itemsLower.includes('addons')) {
      const addonsPath = path.join(dir, 'addons');
      const addonsItems = await fs.promises.readdir(addonsPath).catch(() => []);
      const hasCSS = addonsItems.some((i) => i.toLowerCase() === 'counterstrikesharp');
      if (hasCSS) {
        const pluginsPath = path.join(addonsPath, 'counterstrikesharp', 'plugins');
        const cssItems = await fs.promises.readdir(pluginsPath).catch(() => []);
        const skipItems = ['counterstrikesharp.api', 'counterstrikesharp.shared'];
        const cssPlugins = cssItems.filter((i) => !skipItems.some((s) => i.toLowerCase() === s));

        if (cssPlugins.length > 0) {
          const pName = cssPlugins[0] || suggestedId || 'UnknownCS';
          return { name: pName, category: 'cssharp', folderName: pName };
        }
        const defName = suggestedId || 'UnknownCS';
        return { name: defName, category: 'cssharp', folderName: defName };
      }

      // 1b. Check for Metamod:Source specifically (Core vs Plugin)
      const metamodPath = path.join(addonsPath, 'metamod');
      const hasMetamodDir = addonsItems.some((i) => i.toLowerCase() === 'metamod');

      if (hasMetamodDir) {
        const metamodItems = await fs.promises.readdir(metamodPath).catch(() => []);
        const hasBin = metamodItems.some((i) => i.toLowerCase() === 'bin');
        const isMMSource =
          hasBin || (suggestedId && suggestedId.toLowerCase().includes('mmsource'));

        if (isMMSource) {
          return { name: 'Metamod:Source', category: 'metamod', folderName: 'metamod' };
        } else {
          // It's a metamod plugin, find the VDF name
          const vdfFile = metamodItems.find((i) => i.toLowerCase().endsWith('.vdf'));
          if (vdfFile) {
            const pName = vdfFile.replace(/\.vdf$/i, '');
            return { name: pName, category: 'metamod', folderName: pName };
          }
        }
      }

      const mmName = suggestedId || addonsItems[0] || 'UnknownMM';
      return { name: mmName, category: 'metamod', folderName: mmName };
    }

    // 2. Check for naked CS# plugin (just dlls/configs)
    const dllFiles = items.filter((i) => i.isFile() && i.name.toLowerCase().endsWith('.dll'));
    if (dllFiles.length > 0) {
      const skipDlls = [
        'counterstrikesharp.api',
        'metamod.source',
        'metamod',
        'counterstrikesharp',
        'dapper',
        'mysql.data',
        'newtonsoft.json',
        'npgsql',
        'system.data',
        'microsoft.data',
      ];

      const lowerSuggested = suggestedId?.toLowerCase();

      // Try to find a DLL that matches our suggested ID (zip name)
      let mainDll = dllFiles.find(
        (f) => f.name.toLowerCase().replace('.dll', '') === lowerSuggested
      );

      // If not found, look for something that isn't a known library
      if (!mainDll) {
        mainDll = dllFiles.find((f) => {
          const name = f.name.toLowerCase();
          return !name.includes('native') && !skipDlls.some((skip) => name.startsWith(skip));
        });
      }

      // Fallback to first DLL if still nothing found
      if (!mainDll) mainDll = dllFiles[0];

      if (mainDll) {
        let name = mainDll.name.replace('.dll', '');

        // 1. Strip common noise/suffixes
        const cleanName = name.replace(/[.-]Plugin$/i, '').replace(/Plugin$/i, '');

        // 2. If suggestedId (zip name) is valid, prefer it to keep naming consistent with upload
        if (suggestedId && suggestedId !== 'unknown') {
          // If the DLL name contains the suggestedId, use the suggestedId
          if (cleanName.toLowerCase().includes(suggestedId.toLowerCase())) {
            name = suggestedId;
          } else {
            name = cleanName;
          }
        } else {
          name = cleanName;
        }

        return { name: name, category: 'cssharp', folderName: name };
      }
    }

    // Fallback: If suggestedId is 'unknown', use the folder name instead of 'unknown'
    const fallbackName =
      suggestedId && suggestedId !== 'unknown' ? suggestedId : path.basename(dir);
    return { name: fallbackName, category: 'cssharp', folderName: fallbackName };
  }

  async installPlugin(
    installDir: string,
    instanceId: string | number,
    pluginId: string,
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
    const registry = await this.getRegistry(instanceId);
    const pluginInfo = registry[pluginId];

    if (!pluginInfo) {
      console.error('[PLUGIN] Attempted to install unknown plugin:', pluginId);
      if (taskId) {
        taskService.failTask(taskId, `Unknown plugin: ${pluginId}`);
      }
      return;
    }

    // 1. Ensure plugin is in our central pool
    const poolPath = await this.ensurePluginInPool(pluginId);

    // 2. Clear instance specific logic: where to copy the pool content?
    console.log(
      '[PLUGIN] Syncing',
      pluginInfo.name,
      'from pool (' + path.basename(poolPath) + ') to instance...'
    );

    const hasGameDir = fs.existsSync(path.join(poolPath, 'game'));
    const hasAddonsDir = fs.existsSync(path.join(poolPath, 'addons'));
    const hasCSSDir = fs.existsSync(path.join(poolPath, 'counterstrikesharp'));

    // Check for standard CS2 folders to determine merge target
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
          fs.promises
            .access(path.join(poolPath, f))
            .then(() => true)
            .catch(() => false)
        )
      )
    ).some((x) => x);

    // SECURITY: Sanitize pluginFolderName
    // 1. Use path.basename as additional protection against directory traversal
    const rawFolderName = pluginInfo.folderName || pluginId;
    const baseName = path.basename(rawFolderName);
    // 2. Strict Whitelist regex: remove any character that is not alphanumeric, dash or underscore
    const pluginFolderName = baseName.replace(/[^a-zA-Z0-9\-_]/g, '');

    if (!pluginFolderName) {
      throw new Error(`Invalid plugin folder name: ${rawFolderName}`);
    }

    if (hasGameDir) {
      // Merge into instance root
      await fs.promises.cp(poolPath, path.dirname(path.dirname(csgoDir)), { recursive: true });
    } else if (hasAddonsDir || assetFound) {
      // Merge into game/csgo
      await fs.promises.cp(poolPath, csgoDir, { recursive: true });
    } else if (hasCSSDir) {
      // Merge into game/csgo/addons (contains counterstrikesharp/)
      await fs.promises.cp(poolPath, path.join(csgoDir, 'addons'), { recursive: true });
    } else {
      // "Smart Sync": Non-standard structure, distribute by file type
      if (pluginInfo.category === 'cssharp') {
        const cssBase = path.join(csgoDir, 'addons', 'counterstrikesharp');
        const pluginDest = path.join(cssBase, 'plugins', pluginFolderName);
        const configDest = path.join(cssBase, 'configs', 'plugins', pluginFolderName);
        const transDest = path.join(cssBase, 'translations', pluginFolderName);

        // Explicit Path Traversal Check for Destinations
        const checkDest = (dest: string, base: string) => {
          if (!dest.startsWith(path.resolve(base)) && !dest.startsWith(base)) {
            throw new Error(`Security Error: Plugin path traversal detected for ${dest}`);
          }
        };

        checkDest(pluginDest, cssBase);
        checkDest(configDest, cssBase);
        checkDest(transDest, cssBase);

        await fs.promises.mkdir(pluginDest, { recursive: true });

        const items = await fs.promises.readdir(poolPath, { withFileTypes: true });
        for (const item of items) {
          const src = path.join(poolPath, item.name);
          const lowerName = item.name.toLowerCase();

          // Double check src path too (though it comes from readdir)
          if (!src.startsWith(poolPath)) continue;

          if (
            lowerName.endsWith('.dll') ||
            lowerName.endsWith('.deps.json') ||
            lowerName.endsWith('.pdb')
          ) {
            await fs.promises.cp(src, path.join(pluginDest, item.name), { recursive: true });
          } else if (
            lowerName.endsWith('.json') ||
            lowerName.endsWith('.toml') ||
            lowerName.endsWith('.cfg') ||
            lowerName.endsWith('.ini')
          ) {
            await fs.promises.mkdir(configDest, { recursive: true });
            await fs.promises.cp(src, path.join(configDest, item.name), { recursive: true });
          } else if (lowerName.endsWith('.txt') || item.isDirectory()) {
            // Heuristic: folders in root of a CSS plugin are usually configs or translations
            if (lowerName === 'configs' || lowerName === 'cfg') {
              await fs.promises.mkdir(configDest, { recursive: true });
              await fs.promises.cp(src, configDest, { recursive: true });
            } else if (lowerName === 'translations' || lowerName === 'lang') {
              await fs.promises.mkdir(transDest, { recursive: true });
              await fs.promises.cp(src, transDest, { recursive: true });
            } else {
              // Default to plugin folder
              await fs.promises.cp(src, path.join(pluginDest, item.name), { recursive: true });
            }
          } else {
            await fs.promises.cp(src, path.join(pluginDest, item.name), { recursive: true });
          }
        }
      } else if (pluginInfo.category === 'metamod') {
        await fs.promises.cp(poolPath, path.join(csgoDir, 'addons'), { recursive: true });
      } else {
        await fs.promises.cp(poolPath, csgoDir, { recursive: true });
      }
    }

    // 3. Process .example and .examle configurations
    const searchDir = hasGameDir
      ? path.dirname(path.dirname(csgoDir))
      : hasAddonsDir || assetFound
        ? csgoDir
        : hasCSSDir
          ? path.join(csgoDir, 'addons')
          : csgoDir;

    await this.processExampleConfigs(searchDir);

    // 4. Inject MySQL Credentials if needed
    await this.injectMySQLCredentials(instanceId, searchDir).catch((err) =>
      console.error('[PLUGIN] MySQL Injection failed for:', pluginId, err)
    );

    // 5. Record in DB
    try {
      db.prepare(
        `
        INSERT INTO server_plugins (server_id, plugin_id, version) 
        VALUES (?, ?, ?)
        ON CONFLICT(server_id, plugin_id) DO UPDATE SET version = EXCLUDED.version
      `
      ).run(instanceId, pluginId, pluginInfo.currentVersion);
    } catch (err) {
      console.error(`[DB] Failed to record plugin sync:`, err);
    }

    if (pluginId === 'metamod') await this.configureMetamod(csgoDir);
    console.log('[PLUGIN]', pluginInfo.name, 'sync complete.');

    if (taskId) {
      taskService.completeTask(taskId, `${pluginInfo.name} installed`);
    }
  }

  private async findContentRoot(searchDir: string): Promise<string> {
    const dirMarkers = [
      'addons',
      'game',
      'cfg',
      'counterstrikesharp',
      'configs',
      'materials',
      'sound',
      'models',
      'maps',
      'translations',
    ];
    const fileMarkers = ['.dll', '.deps.json', '.vdf'];
    const junkFiles = [
      '__macosx',
      '.ds_store',
      '.git',
      '.github',
      'readme',
      'license',
      'changelog',
    ];

    const walk = async (currentDir: string): Promise<string | null> => {
      const items = await fs.promises.readdir(currentDir, { withFileTypes: true });

      const dirs = items.filter((i) => i.isDirectory());
      const files = items.filter((i) => i.isFile());

      // 1. Check for directory markers (e.g. 'addons', 'game')
      for (const dir of dirs) {
        if (dirMarkers.includes(dir.name.toLowerCase())) {
          return currentDir;
        }
      }

      // 2. Check for file markers (e.g. '.dll') at this level
      for (const file of files) {
        if (fileMarkers.some((m) => file.name.toLowerCase().endsWith(m))) {
          return currentDir;
        }
      }

      // 3. If there is exactly ONE significant directory, descend into it
      const significantDirs = dirs.filter(
        (d) => !junkFiles.some((j) => d.name.toLowerCase().includes(j))
      );
      const significantFiles = files.filter(
        (f) => !junkFiles.some((j) => f.name.toLowerCase().includes(j))
      );

      const firstDir = significantDirs[0];
      if (significantDirs.length === 1 && firstDir && significantFiles.length === 0) {
        return await walk(path.join(currentDir, firstDir.name));
      }

      // 4. If we have files here, this might be the root
      if (files.length > 0) {
        return currentDir;
      }

      return null;
    };

    const found = await walk(searchDir);
    return found || searchDir;
  }

  private async processExampleConfigs(targetDir: string) {
    if (!fs.existsSync(targetDir)) return;

    const walk = async (dir: string) => {
      const items = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          await walk(fullPath);
        } else if (item.isFile()) {
          const lowerName = item.name.toLowerCase();
          // Support .example. .examle. -example. -examle.
          if (/[.-](example|examle)\./i.test(lowerName)) {
            const newName = item.name.replace(/[.-](example|examle)\./i, '.');
            const newPath = path.join(dir, newName);

            if (!fs.existsSync(newPath)) {
              console.log('[PLUGIN] Activating config:', item.name, '->', newName);
              await fs.promises.copyFile(fullPath, newPath);
              await fs.promises.unlink(fullPath).catch(() => {});
            }
          }
        }
      }
    };

    await walk(targetDir).catch((err) =>
      console.error(`[PLUGIN] Example config processing failed:`, err)
    );
  }

  private async configureMetamod(csgoDir: string) {
    const gameinfo = path.join(csgoDir, 'gameinfo.gi');
    try {
      await fs.promises.access(gameinfo);
      let content = await fs.promises.readFile(gameinfo, 'utf8');
      if (!content.includes('csgo/addons/metamod')) {
        const targetLine = /Game_LowViolence\s+csgo_lv\s+\/\/\s+Perfect World content override/i;
        if (targetLine.test(content)) {
          content = content.replace(targetLine, '$&\n\t\t\tGame\tcsgo/addons/metamod');
        } else {
          content = content.replace(/(SearchPaths\s*\{)/, '$1\n\t\t\tGame\tcsgo/addons/metamod');
        }
        await fs.promises.writeFile(gameinfo, content);
      }
    } catch {
      /* ignore */
    }
  }

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
    await this.syncRegistry();
    const results: Record<
      string,
      {
        hasUpdate: boolean;
        latestVersion: string | undefined;
        currentVersion: string | undefined;
        name: string | undefined;
      }
    > = {};
    try {
      const installedPlugins = this.checkAllStmt.all(instanceId) as {
        plugin_id: string;
        version: string;
      }[];
      const installedMap = new Map(installedPlugins.map((p) => [p.plugin_id, p.version]));

      for (const pid of Object.keys(this.pluginRegistry)) {
        const info = this.manifest
          ? this.manifest[pid]
          : (
              this.pluginRegistry as Record<
                string,
                { version?: string; currentVersion?: string; name?: string }
              >
            )[pid];
        if (!info) continue;
        const installedVersion = installedMap.get(pid);
        if (!installedVersion) {
          results[pid] = {
            hasUpdate: false,
            latestVersion: info.version || info.currentVersion,
            currentVersion: undefined,
            name: undefined,
          };
          continue;
        }
        const latestVersion = info.version || info.currentVersion;
        results[pid] = {
          name: info.name,
          hasUpdate: installedVersion !== latestVersion,
          currentVersion: installedVersion,
          latestVersion,
        };
      }
    } catch (err) {
      console.error(`[PLUGIN] Batch update check failed:`, err);
    }
    return results;
  }

  async checkPluginUpdate(
    instanceId: string | number,
    pluginId: PluginId
  ): Promise<{
    hasUpdate: boolean;
    currentVersion: string | undefined;
    latestVersion: string | undefined;
  }> {
    try {
      const installed = this.checkOneStmt.get(instanceId, pluginId) as
        | { version: string }
        | undefined;
      if (!installed)
        return { hasUpdate: false, currentVersion: undefined, latestVersion: undefined };
      const info = (
        this.pluginRegistry as Record<
          string,
          { currentVersion?: string; name?: string; version?: string }
        >
      )[pluginId];
      if (!info) return { hasUpdate: false, currentVersion: undefined, latestVersion: undefined };
      const latestVersion = info.currentVersion || 'latest';
      return {
        hasUpdate: latestVersion !== 'latest' && installed.version !== latestVersion,
        currentVersion: installed.version,
        latestVersion,
      };
    } catch (error) {
      console.error('[PLUGIN] Check update failed:', error);
      return { hasUpdate: false, currentVersion: undefined, latestVersion: undefined };
    }
  }

  async updatePlugin(
    installDir: string,
    instanceId: string | number,
    pluginId: string
  ): Promise<void> {
    // Force a fresh copy from pool, ensurePluginInPool will handle if it needs re-downloading
    // For a real 'update' that bypasses pool, we'd need to clear the pool item first.
    await this.installPlugin(installDir, instanceId, pluginId);
  }

  async uninstallPlugin(
    installDir: string,
    instanceId: string | number,
    pluginId: string
  ): Promise<void> {
    // SECURITY: Validate pluginId to prevent Path Traversal
    if (!/^[a-zA-Z0-9\-_]+$/.test(pluginId) && pluginId !== 'metamod' && pluginId !== 'cssharp') {
      throw new Error(`Invalid plugin ID: ${pluginId}`);
    }

    const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');
    const addonsDir = path.join(csgoDir, 'addons');

    if (pluginId === 'metamod') return this.uninstallMetamod(installDir, instanceId);
    if (pluginId === 'cssharp') return this.uninstallCounterStrikeSharp(installDir, instanceId);

    const registry = await this.getRegistry(instanceId);
    const info = registry[pluginId];
    if (!info) return;

    console.log('[PLUGIN] Uninstalling', info.name, '...');
    const folderName = info.folderName || info.name.replace(/[^a-zA-Z0-9]/g, '');
    const lowerPluginId = pluginId.toLowerCase();
    const lowerFolderName = folderName.toLowerCase();

    const pathsToDelete: Set<string> = new Set();
    const searchDirs = [
      addonsDir,
      csgoDir,
      path.join(addonsDir, 'counterstrikesharp', 'plugins'),
      path.join(addonsDir, 'counterstrikesharp', 'configs', 'plugins'),
      path.join(addonsDir, 'counterstrikesharp', 'translations'),
      path.join(csgoDir, 'cfg'),
      path.join(csgoDir, 'configs'),
      path.join(csgoDir, 'materials'),
      path.join(csgoDir, 'models'),
      path.join(csgoDir, 'particles'),
      path.join(csgoDir, 'sound'),
      path.join(csgoDir, 'soundevents'),
      path.join(csgoDir, 'translations'),
    ];

    await Promise.all(
      searchDirs.map(async (dir) => {
        if (!fs.existsSync(dir)) return;
        try {
          const items = await fs.promises.readdir(dir);
          for (const item of items) {
            const lowerItem = item.toLowerCase();
            const isMatch =
              lowerItem === lowerPluginId ||
              lowerItem === lowerFolderName ||
              lowerItem === lowerPluginId + '.vdf' ||
              lowerItem === lowerFolderName + '.vdf' ||
              lowerItem === lowerPluginId + '.dll' ||
              lowerItem === lowerFolderName + '.dll' ||
              (lowerPluginId.length > 3 && lowerItem.includes(lowerPluginId)) ||
              (lowerFolderName.length > 3 && lowerItem.includes(lowerFolderName));

            if (isMatch) {
              const fullPath = path.join(dir, item);
              pathsToDelete.add(fullPath);
            }
          }
        } catch {
          // Directory might not exist or be inaccessible
        }
      })
    );

    for (const p of pathsToDelete) {
      try {
        await fs.promises.rm(p, { recursive: true, force: true });
        console.log('[PLUGIN] Deep Deleted:', p);
      } catch (err) {
        console.error('[PLUGIN] Failed to delete:', p, err);
      }
    }

    try {
      db.prepare(`DELETE FROM server_plugins WHERE server_id = ? AND plugin_id = ?`).run(
        instanceId,
        pluginId
      );
    } catch (err) {
      console.error(`[DB] Failed to remove plugin from DB:`, err);
    }
  }

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
   * Scans configuration files in the target directory and injects MySQL credentials
   * if it detects database settings.
   */
  private async injectMySQLCredentials(instanceId: string | number, targetDir: string) {
    if (!(await databaseManager.isAvailable())) return;

    // Load credentials and check for autoSync setting
    const allCreds = await databaseManager.loadAllCredentials();
    const serverSettings = allCreds[instanceId.toString()];

    // If autoSync is explicitly disabled, skip injection
    if (serverSettings && serverSettings.autoSync === false) {
      console.log('[DB] Auto-sync disabled for server', instanceId, ', skipping injection.');
      return;
    }

    let credentials: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    } | null = null;
    const getCreds = async () => {
      if (!credentials) {
        const raw = await databaseManager.provisionDatabase(instanceId);
        // Deep clean: trim all string values to avoid JSON breakage
        credentials = {
          host: raw.host.trim(),
          port: Number(raw.port),
          user: raw.user.trim(),
          password: raw.password.trim(),
          database: raw.database.trim(),
        };
      }
      return credentials;
    };

    const walk = async (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const items = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          await walk(fullPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          const content = await fs.promises.readFile(fullPath, 'utf8');
          const creds = await getCreds();

          // 1. JSON Injection
          if (
            ext === '.json' &&
            (content.includes('"Database"') ||
              content.includes('"Host"') ||
              content.includes('"MySQL"'))
          ) {
            try {
              const config = JSON.parse(content);
              let changed = false;

              const keysMapping: Record<string, string | number> = {
                DatabaseHost: creds.host,
                DatabasePort: creds.port,
                DatabaseUser: creds.user,
                DatabasePassword: creds.password,
                DatabaseName: creds.database,
                Host: creds.host,
                Port: creds.port,
                User: creds.user,
                Password: creds.password,
                Database: creds.database,
              };

              // Check top level keys
              for (const [key, val] of Object.entries(keysMapping)) {
                if (
                  Object.prototype.hasOwnProperty.call(config, key) &&
                  typeof config[key] !== 'object'
                ) {
                  config[key] = val;
                  changed = true;
                }
              }

              // Check nested "Database" or "MySQL" objects
              const subObjects = ['Database', 'MySQL', 'mysql', 'database'];
              for (const subKey of subObjects) {
                if (config[subKey] && typeof config[subKey] === 'object') {
                  for (const [k, v] of Object.entries(keysMapping)) {
                    if (Object.prototype.hasOwnProperty.call(config[subKey], k)) {
                      config[subKey][k] = v;
                      changed = true;
                    }
                  }
                }
              }

              if (changed) {
                console.log('[DB] Injected credentials into JSON:', fullPath);
                await fs.promises.writeFile(fullPath, JSON.stringify(config, null, 2));
              }
            } catch {
              // Skip non-valid or non-standard JSON
            }
          }
          // 2. TOML / CFG Injection (Regex based for common formats)
          else if (
            (ext === '.toml' || ext === '.cfg') &&
            (content.includes('Database') || content.includes('MySQL') || content.includes('Host'))
          ) {
            let newContent = content;
            let changed = false;

            const patterns = [
              { regex: /(DatabaseHost\s*=\s*")([^"]*)(")/gi, val: creds.host },
              { regex: /(DatabaseUser\s*=\s*")([^"]*)(")/gi, val: creds.user },
              { regex: /(DatabasePassword\s*=\s*")([^"]*)(")/gi, val: creds.password },
              { regex: /(DatabaseName\s*=\s*")([^"]*)(")/gi, val: creds.database },
              { regex: /(DatabasePort\s*=\s*)(\d+)/gi, val: creds.port },
              // CFG style (no equals)
              { regex: /(DatabaseHost\s+")([^"]*)(")/gi, val: creds.host },
              { regex: /(DatabaseUser\s+")([^"]*)(")/gi, val: creds.user },
              { regex: /(DatabasePassword\s+")([^"]*)(")/gi, val: creds.password },
              { regex: /(DatabaseName\s+")([^"]*)(")/gi, val: creds.database },
            ];

            for (const p of patterns) {
              if (p.regex.test(newContent)) {
                newContent = newContent.replace(p.regex, `$1${p.val}$3`);
                changed = true;
              }
            }

            if (changed) {
              console.log('[DB] Injected credentials into', ext.toUpperCase(), ':', fullPath);
              await fs.promises.writeFile(fullPath, newContent);
            }
          }
        }
      }
    };

    await walk(targetDir).catch((err) => console.error(`[PLUGIN] Injection walk failed:`, err));
  }

  async getPluginConfigFiles(
    installDir: string,
    instanceId: string | number,
    pluginId: string
  ): Promise<{ name: string; path: string }[]> {
    const id = instanceId.toString();
    const serverPath = path.join(installDir, id);
    const csgoDir = path.join(serverPath, 'game', 'csgo');
    const registry = await this.getRegistry(instanceId);
    const info = registry[pluginId];
    if (!info) return [];

    const configs: { name: string; path: string }[] = [];
    const searchPaths: string[] = [];

    // 1. CSSharp Specific Configs
    if (info.category === 'cssharp') {
      // On Linux, paths are case-sensitive. Standard CSS uses lowercase for addons/counterstrikesharp
      const cssConfigBase = path.join(
        csgoDir,
        'addons',
        'counterstrikesharp',
        'configs',
        'plugins'
      );
      const cssPluginBase = path.join(csgoDir, 'addons', 'counterstrikesharp', 'plugins');

      // Normalize candidates and remove duplicates (ignoring case for set, but keeping original for paths)
      const candSet = new Set([pluginId, info.folderName, info.name].filter(Boolean));
      const candidates = [...candSet];

      // Add the global admins.json path ONLY for SimpleAdmin or if specifically requested
      // For now, let's keep it isolated to avoid "all configs" cluttering.
      // searchPaths.push(path.join(csgoDir, "addons", "counterstrikesharp", "configs"));

      for (const cand of candidates) {
        // Standard plugin-specific config folder
        searchPaths.push(path.join(cssConfigBase, cand!));
        // Plugin internal folder (some newer plugins store config there)
        searchPaths.push(path.join(cssPluginBase, cand!));
        // Plugin internal configs folder
        searchPaths.push(path.join(cssPluginBase, cand!, 'configs'));
      }
    }

    // 2. MetaMod Specific Configs
    if (info.category === 'metamod') {
      const mmAddonDir = path.join(csgoDir, 'addons', info.folderName || pluginId);
      searchPaths.push(path.join(mmAddonDir, 'configs'));
      searchPaths.push(mmAddonDir);
    }

    // 3. General Map Configs (Check for files matching plugin name in cfg/maps)
    const mapCfgDir = path.join(csgoDir, 'cfg', 'maps');
    if (fs.existsSync(mapCfgDir)) {
      // We could look for de_dust2_plugin.cfg but that's complex to guess.
      // For now, let's stick to the official config directories.
    }

    // Deduplicate and filter search paths
    const uniquePaths = [...new Set(searchPaths)];

    for (const searchDir of uniquePaths) {
      if (!fs.existsSync(searchDir)) continue;

      try {
        const items = await fs.promises.readdir(searchDir, { withFileTypes: true });
        for (const item of items) {
          if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (['.json', '.cfg', '.txt', '.ini', '.toml'].includes(ext)) {
              // Exclude system files like .deps.json
              if (item.name.toLowerCase().endsWith('.deps.json')) continue;

              const fullPath = path.join(searchDir, item.name);
              configs.push({
                name: item.name,
                path: path.relative(serverPath, fullPath).replace(/\\/g, '/'),
              });
            }
          }
        }
      } catch (err) {
        console.error(`[PLUGIN] Failed to read config dir ${searchDir}:`, err);
      }
    }

    return configs;
  }

  async deleteFromPool(pluginId: string): Promise<void> {
    const registry = await this.getRegistry();
    const info = registry[pluginId];
    if (!info || !info.inPool) throw new Error('Plugin not found in pool');

    const targetName = info.folderName || pluginId;
    const poolPath = path.resolve(POOL_DIR, targetName);

    if (!poolPath.startsWith(path.resolve(POOL_DIR))) {
      throw new Error('Invalid plugin path');
    }

    if (fs.existsSync(poolPath)) {
      await fs.promises.rm(poolPath, { recursive: true, force: true });
      console.log('[POOL] Plugin', pluginId, 'deleted from central repository.');
    }
  }

  /**
   * Saves a configuration file for a specific plugin in a server instance.
   * Includes security checks to prevent directory traversal.
   */
  async savePluginConfigFile(
    installDir: string,
    instanceId: string | number,
    pluginId: string,
    relativeFilePath: string,
    content: string
  ): Promise<void> {
    const id = instanceId.toString();
    const serverPath = path.join(installDir, id);

    // 1. Resolve absolute path and prevent traversal
    const fullPath = path.resolve(serverPath, relativeFilePath);
    if (!fullPath.startsWith(serverPath)) {
      throw new Error('Security Violation: Path traversal detected.');
    }

    // 2. Validate file extension
    const ext = path.extname(fullPath).toLowerCase();
    const allowedExts = ['.json', '.cfg', '.txt', '.ini', '.toml'];
    if (!allowedExts.includes(ext)) {
      throw new Error(`Forbidden file extension: ${ext}`);
    }

    // 3. Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    // 4. Save file
    await fs.promises.writeFile(fullPath, content, 'utf8');
    console.log('[PLUGIN] Config saved for', pluginId, ':', relativeFilePath);
  }
}

export const pluginManager = new PluginManager();
