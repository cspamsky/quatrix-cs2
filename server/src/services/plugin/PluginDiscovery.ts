import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import db from '../../db.js';
import type { PluginMetadata, PluginRegistryItem } from '../PluginManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '../../../../');
const POOL_DIR = path.join(PROJECT_ROOT, 'data', 'plugin_pool');

/**
 * PluginDiscovery Service
 * Responsible for:
 * - Scanning the plugin pool directory
 * - Detecting plugin metadata from file structure
 * - Determining plugin category (cssharp, metamod, core)
 */
export class PluginDiscovery {
  /**
   * Scans the plugin pool and merges with static registry
   * @param registry Static plugin registry
   * @returns Combined manifest of all available plugins
   */
  async scanPool(
    registry: Record<string, PluginRegistryItem>
  ): Promise<Record<string, PluginMetadata>> {
    const manifest: Record<string, PluginMetadata> = {};
    const poolItems = await fs.readdir(POOL_DIR).catch(() => []);
    const poolItemsLower = poolItems.map((i) => i.toLowerCase());

    // Load cache
    const cacheRows = db.prepare('SELECT * FROM plugin_metadata_cache').all() as any[];
    const cache = new Map<string, any>(cacheRows.map((r) => [r.plugin_id.toLowerCase(), r]));

    // 1. Process static registry
    for (const [id, info] of Object.entries(registry)) {
      const candidateNames = [
        id.toLowerCase(),
        (info.folderName || '').toLowerCase(),
        (info.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
      ].filter(Boolean);

      const inPool = candidateNames.some((name) => poolItemsLower.includes(name));

      manifest[id] = {
        name: info.name,
        version: info.currentVersion || 'latest',
        downloadUrl: info.downloadUrl || '',
        category: info.category,
        description: info.description || '',
        folderName: info.folderName || undefined,
        inPool: inPool,
        isCustom: false,
      };
    }

    // 2. Process dynamic pool folders (custom uploads)
    for (const item of poolItems) {
      const itemLower = item.toLowerCase();
      // Skip if already in manifest (by static registry)
      const isKnown = Object.values(manifest).some(
        (m: PluginMetadata) =>
          (m.folderName && m.folderName.toLowerCase() === itemLower) ||
          (m.name && m.name.toLowerCase().replace(/[^a-z0-9]/g, '') === itemLower)
      );

      if (!isKnown) {
        // Check cache first
        const cached = cache.get(itemLower);
        if (cached) {
          manifest[item] = {
            name: cached.name,
            version: cached.version || 'latest',
            category: cached.category as any,
            description: cached.description || 'Custom plugin',
            folderName: cached.folder_name,
            inPool: true,
            isCustom: true,
          };
          continue;
        }

        // New discovered plugin (not in cache)
        const fullPath = path.join(POOL_DIR, item);
        const stats = await fs.stat(fullPath).catch(() => null);
        if (stats && stats.isDirectory()) {
          const category = await this.detectCategory(fullPath);
          manifest[item] = {
            name: item,
            version: 'latest',
            category: category,
            description: 'Manually added or discovered plugin',
            folderName: item,
            inPool: true,
            isCustom: true,
          };

          // Update cache
          try {
            db.prepare(
              'INSERT OR REPLACE INTO plugin_metadata_cache (plugin_id, name, category, folder_name, is_custom) VALUES (?, ?, ?, ?, ?)'
            ).run(item, item, category, item, 1);
          } catch (err) {
            console.error('[Discovery] Failed to update cache for', item, err);
          }
        }
      }
    }

    return manifest;
  }

  /**
   * Detects plugin category by analyzing directory structure
   * @param dir Plugin directory path
   * @returns Plugin category
   */
  async detectCategory(dir: string): Promise<'metamod' | 'cssharp' | 'core'> {
    const items = await fs.readdir(dir).catch(() => []);
    const itemsLower = items.map((i) => i.toLowerCase());

    if (itemsLower.includes('counterstrikesharp')) return 'cssharp';
    if (itemsLower.includes('addons')) {
      const addonsContent = await fs.readdir(path.join(dir, 'addons')).catch(() => []);
      if (addonsContent.some((c) => c.toLowerCase() === 'counterstrikesharp')) return 'cssharp';
      return 'metamod';
    }

    // Look for signatures deeper
    const hasDLL = itemsLower.some((i) => i.endsWith('.dll'));
    if (hasDLL) return 'cssharp'; // Most dynamic uploads for CS2 are CSS plugins

    return 'cssharp'; // Default to CS#
  }

  /**
   * Extracts plugin metadata from extracted archive
   * @param dir Extracted plugin directory
   * @param suggestedId Suggested plugin ID (from filename)
   * @returns Plugin metadata
   */
  async extractMetadata(
    dir: string,
    suggestedId?: string
  ): Promise<{ name: string; category: 'cssharp' | 'metamod' | 'core'; folderName: string }> {
    const items = await fs.readdir(dir, { withFileTypes: true });
    const itemsLower = items.map((i) => i.name.toLowerCase());

    // 1. Check for CS# structure: addons/counterstrikesharp/plugins/Name
    if (itemsLower.includes('addons')) {
      const addonsPath = path.join(dir, 'addons');
      const addonsItems = await fs.readdir(addonsPath).catch(() => []);
      const hasCSS = addonsItems.some((i) => i.toLowerCase() === 'counterstrikesharp');
      if (hasCSS) {
        const pluginsPath = path.join(addonsPath, 'counterstrikesharp', 'plugins');
        const cssItems = await fs.readdir(pluginsPath).catch(() => []);
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
        const metamodItems = await fs.readdir(metamodPath).catch(() => []);
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

  /**
   * Finds the actual content root in an extracted archive
   * Handles nested folders and junk files
   * @param searchDir Directory to search
   * @returns Path to content root
   */
  async findContentRoot(searchDir: string): Promise<string> {
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
      const items = await fs.readdir(currentDir, { withFileTypes: true });

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
}

export const pluginDiscovery = new PluginDiscovery();
