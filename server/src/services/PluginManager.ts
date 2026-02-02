import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import AdmZip from "adm-zip";
import { pluginRegistry, type PluginId } from "../config/plugins.js";
import { fileURLToPath } from "url";
import db from "../db.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// quatrix/server/src/services -> quatrix/
const PROJECT_ROOT = path.join(__dirname, "../../../");
const POOL_DIR = path.join(PROJECT_ROOT, "plugin_pool");

export class PluginManager {
  public pluginRegistry = pluginRegistry;
  private manifest: any = null;
  private checkAllStmt: any;
  private checkOneStmt: any;

  constructor() {
    this.checkAllStmt = db.prepare(
      "SELECT plugin_id, version FROM server_plugins WHERE server_id = ?",
    );
    this.checkOneStmt = db.prepare(
      "SELECT version FROM server_plugins WHERE server_id = ? AND plugin_id = ?",
    );

    // Ensure pool directory exists
    if (!fs.existsSync(POOL_DIR)) {
      fs.mkdirSync(POOL_DIR, { recursive: true });
    }
  }

  private getPoolDir(pluginId: PluginId): string {
    const info = (this.pluginRegistry as any)[pluginId];
    if (!info) return path.join(POOL_DIR, pluginId);
    
    // Use folderName first, then a sanitized version of Name, fallback to pluginId
    const safeName = (info.folderName || info.name || pluginId).replace(/[^a-zA-Z0-9.\-_]/g, "");
    return path.join(POOL_DIR, safeName);
  }

  async syncRegistry() {
    const manifest: Record<string, any> = {};
    for (const [id, info] of Object.entries(this.pluginRegistry)) {
      manifest[id] = {
        name: info.name,
        version: info.currentVersion || "latest",
        folderName: (info as any).folderName,
      };
    }
    this.manifest = manifest;
    return manifest;
  }

  async getRegistry() {
    const manifest: Record<string, any> = {};
    for (const [id, info] of Object.entries(this.pluginRegistry)) {
      manifest[id] = {
        name: info.name,
        version: info.currentVersion || "latest",
        downloadUrl: (info as any).downloadUrl || "",
        category: info.category,
        description: (info as any).description || "",
        folderName: (info as any).folderName,
      };
    }
    return manifest;
  }

  async getPluginStatus(
    installDir: string,
    instanceId: string | number,
  ): Promise<Record<string, { installed: boolean; hasConfigs: boolean }>> {
    const id = instanceId.toString();
    const csgoDir = path.join(installDir, id, "game", "csgo");
    const addonsDir = path.join(csgoDir, "addons");
    const cssPluginsDir = path.join(addonsDir, "counterstrikesharp", "plugins");
    const cssSharedDir = path.join(addonsDir, "counterstrikesharp", "shared");
    const status: Record<string, { installed: boolean; hasConfigs: boolean }> = {};

    const dirCache = new Map<
      string,
      Promise<{ raw: string; lower: string }[]>
    >();
    const getDirItems = (
      dir: string,
    ): Promise<{ raw: string; lower: string }[]> => {
      if (!dirCache.has(dir)) {
        dirCache.set(
          dir,
          fs.promises
            .readdir(dir)
            .then((items) =>
              items.map((i) => ({ raw: i, lower: i.toLowerCase() })),
            )
            .catch(() => []),
        );
      }
      return dirCache.get(dir)!;
    };

    const [hasMetaVdf, hasMetaX64Vdf, hasCSS] = await Promise.all([
      fs.promises
        .access(path.join(addonsDir, "metamod.vdf"))
        .then(() => true)
        .catch(() => false),
      fs.promises
        .access(path.join(addonsDir, "metamod_x64.vdf"))
        .then(() => true)
        .catch(() => false),
      fs.promises
        .access(path.join(addonsDir, "counterstrikesharp"))
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
          item.lower === lowerName + ".vdf" ||
          item.lower === lowerName + ".dll" ||
          (lowerName.length > 3 && item.lower.includes(lowerName))
        );
      });
    };

    const checks = Object.keys(this.pluginRegistry).map(async (pid) => {
      const info = (this.pluginRegistry as any)[pid];
      if (info.category === "core") {
        if (!status[pid]) status[pid] = { installed: false, hasConfigs: false };
        return;
      }

      let installed = false;
      if (info.category === "metamod") {
        installed =
          (await checkExists(addonsDir, pid)) ||
          (await checkExists(addonsDir, info.folderName || "")) ||
          (await checkExists(addonsDir, info.name));
      } else if (info.category === "cssharp") {
        installed =
          (await checkExists(cssPluginsDir, pid)) ||
          (await checkExists(cssPluginsDir, info.folderName || "")) ||
          (await checkExists(cssPluginsDir, info.name)) ||
          (await checkExists(cssSharedDir, pid)) ||
          (await checkExists(cssSharedDir, info.folderName || "")) ||
          (await checkExists(cssSharedDir, info.name));

        if (!installed) {
          installed =
            (await checkExists(csgoDir, pid)) ||
            (await checkExists(csgoDir, info.folderName || "")) ||
            (await checkExists(csgoDir, info.name));
        }
      }

      let hasConfigs = false;
      if (installed) {
        const configs = await this.getPluginConfigFiles(installDir, instanceId, pid as PluginId);
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
  async ensurePluginInPool(pluginId: PluginId): Promise<string> {
    const info = (this.pluginRegistry as any)[pluginId];
    const candidateNames = new Set([
        pluginId.toLowerCase(),
        (info.folderName || "").toLowerCase(),
        (info.name || "").toLowerCase().replace(/[^a-z0-9]/g, "")
    ].filter(Boolean));

    // List the pool directory once
    const poolItems = await fs.promises.readdir(POOL_DIR);
    
    // Find a match regardless of case
    const matchedFolder = poolItems.find(item => 
        candidateNames.has(item.toLowerCase())
    );

    if (matchedFolder) {
        const fullPath = path.join(POOL_DIR, matchedFolder);
        const items = await fs.promises.readdir(fullPath);
        if (items.length > 0) {
            console.log(`[PLUGIN] Syncing ${pluginId} from pool folder: ${matchedFolder}`);
            return fullPath;
        }
    }

    const expectedPath = path.join(POOL_DIR, info.folderName || pluginId);
    throw new Error(
      `Plugin "${pluginId}" not found in local pool. Please add its files to: ${expectedPath}`,
    );
  }

  async installPlugin(
    installDir: string,
    instanceId: string | number,
    pluginId: PluginId,
  ): Promise<void> {
    const csgoDir = path.join(installDir, instanceId.toString(), "game", "csgo");
    const pluginInfo = this.pluginRegistry[pluginId] as any;
    
    if (!pluginInfo) return;

    // 1. Ensure plugin is in our central pool
    const poolPath = await this.ensurePluginInPool(pluginId);

    // 2. Clear instance specific logic: where to copy the pool content?
    console.log(`[PLUGIN] Syncing ${pluginInfo.name} from pool (${path.basename(poolPath)}) to instance...`);

    const hasGameDir = fs.existsSync(path.join(poolPath, "game"));
    const hasAddonsDir = fs.existsSync(path.join(poolPath, "addons"));
    const hasCSSDir = fs.existsSync(path.join(poolPath, "counterstrikesharp"));

    // Check for standard CS2 folders to determine merge target
    const assetFolders = ["cfg", "materials", "models", "particles", "sound", "soundevents", "translations", "maps", "scripts"];
    const assetFound = (await Promise.all(assetFolders.map(f => fs.promises.access(path.join(poolPath, f)).then(() => true).catch(() => false)))).some(x => x);

    if (hasGameDir) {
      // Merge into instance root
      await fs.promises.cp(poolPath, path.dirname(path.dirname(csgoDir)), { recursive: true });
    } else if (hasAddonsDir || assetFound) {
      // Merge into game/csgo
      await fs.promises.cp(poolPath, csgoDir, { recursive: true });
    } else if (hasCSSDir) {
      // Merge into game/csgo/addons (contains counterstrikesharp/)
      await fs.promises.cp(poolPath, path.join(csgoDir, "addons"), { recursive: true });
    } else {
      // Non-standard or single-file plugin
      if (pluginInfo.category === "cssharp") {
        const folderName = pluginInfo.folderName || pluginId;
        const dest = path.join(csgoDir, "addons", "counterstrikesharp", "plugins", folderName);
        await fs.promises.mkdir(dest, { recursive: true });
        await fs.promises.cp(poolPath, dest, { recursive: true });
      } else if (pluginInfo.category === "metamod") {
        await fs.promises.cp(poolPath, path.join(csgoDir, "addons"), { recursive: true });
      } else {
        await fs.promises.cp(poolPath, csgoDir, { recursive: true });
      }
    }

    // 3. Process .example and .examle configurations
    const searchDir = hasGameDir 
      ? path.dirname(path.dirname(csgoDir)) 
      : (hasAddonsDir || assetFound ? csgoDir : (hasCSSDir ? path.join(csgoDir, "addons") : csgoDir));
    
    await this.processExampleConfigs(searchDir);

    // 4. Record in DB
    try {
      db.prepare(`
        INSERT INTO server_plugins (server_id, plugin_id, version) 
        VALUES (?, ?, ?)
        ON CONFLICT(server_id, plugin_id) DO UPDATE SET version = EXCLUDED.version
      `).run(instanceId, pluginId, pluginInfo.currentVersion);
    } catch (err) {
      console.error(`[DB] Failed to record plugin sync:`, err);
    }

    if (pluginId === "metamod") await this.configureMetamod(csgoDir);
    console.log(`[PLUGIN] ${pluginInfo.name} sync complete.`);
  }

  private async findContentRoot(searchDir: string): Promise<string> {
    const dirMarkers = ["addons", "game", "cfg", "counterstrikesharp", "configs", "materials", "sound", "models", "maps", "translations"];
    const fileMarkers = [".dll", ".deps.json", ".vdf"];
    const junkFiles = ["__macosx", ".ds_store", ".git", ".github", "readme", "license", "changelog"];

    const walk = async (currentDir: string): Promise<string | null> => {
      const items = await fs.promises.readdir(currentDir, { withFileTypes: true });
      
      const dirs = items.filter(i => i.isDirectory());
      const files = items.filter(i => i.isFile());

      // 1. Check for directory markers (e.g. 'addons', 'game')
      for (const dir of dirs) {
        if (dirMarkers.includes(dir.name.toLowerCase())) {
          return currentDir;
        }
      }

      // 2. Check for file markers (e.g. '.dll') at this level
      for (const file of files) {
        if (fileMarkers.some(m => file.name.toLowerCase().endsWith(m))) {
          return currentDir;
        }
      }

      // 3. If there is exactly ONE significant directory, descend into it
      const significantDirs = dirs.filter(d => !junkFiles.some(j => d.name.toLowerCase().includes(j)));
      const significantFiles = files.filter(f => !junkFiles.some(j => f.name.toLowerCase().includes(j)));

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
            const newName = item.name.replace(/[.-](example|examle)\./i, ".");
            const newPath = path.join(dir, newName);

            if (!fs.existsSync(newPath)) {
              console.log(`[PLUGIN] Activating config: ${item.name} -> ${newName}`);
              await fs.promises.copyFile(fullPath, newPath);
              await fs.promises.unlink(fullPath).catch(() => {});
            }
          }
        }
      }
    };

    await walk(targetDir).catch(err => console.error(`[PLUGIN] Example config processing failed:`, err));
  }

  private async configureMetamod(csgoDir: string) {
    const gameinfo = path.join(csgoDir, "gameinfo.gi");
    try {
      await fs.promises.access(gameinfo);
      let content = await fs.promises.readFile(gameinfo, "utf8");
      if (!content.includes("csgo/addons/metamod")) {
        const targetLine = /Game_LowViolence\s+csgo_lv\s+\/\/\s+Perfect World content override/i;
        if (targetLine.test(content)) {
          content = content.replace(targetLine, "$&\n\t\t\tGame\tcsgo/addons/metamod");
        } else {
          content = content.replace(/(SearchPaths\s*\{)/, "$1\n\t\t\tGame\tcsgo/addons/metamod");
        }
        await fs.promises.writeFile(gameinfo, content);
      }
    } catch {}
  }

  async checkAllPluginUpdates(instanceId: string | number): Promise<Record<string, any>> {
    await this.syncRegistry();
    const results: Record<string, any> = {};
    try {
      const installedPlugins = this.checkAllStmt.all(instanceId) as { plugin_id: string; version: string; }[];
      const installedMap = new Map(installedPlugins.map((p) => [p.plugin_id, p.version]));

      for (const pid of Object.keys(this.pluginRegistry)) {
        const info = this.manifest ? this.manifest[pid] : (this.pluginRegistry as any)[pid];
        if (!info) continue;
        const installedVersion = installedMap.get(pid);
        if (!installedVersion) {
          results[pid] = { hasUpdate: false, latestVersion: info.version || info.currentVersion };
          continue;
        }
        const latestVersion = info.version || info.currentVersion;
        results[pid] = { name: info.name, hasUpdate: installedVersion !== latestVersion, currentVersion: installedVersion, latestVersion };
      }
    } catch (err) {
      console.error(`[PLUGIN] Batch update check failed:`, err);
    }
    return results;
  }

  async checkPluginUpdate(instanceId: string | number, pluginId: PluginId): Promise<any> {
    try {
      const installed = this.checkOneStmt.get(instanceId, pluginId) as { version: string } | undefined;
      if (!installed) return { hasUpdate: false };
      const info = (this.pluginRegistry as any)[pluginId];
      if (!info) return { hasUpdate: false };
      const latestVersion = info.currentVersion || "latest";
      return { hasUpdate: latestVersion !== "latest" && installed.version !== latestVersion, currentVersion: installed.version, latestVersion };
    } catch (error) {
      console.error("[PLUGIN] Check update failed:", error);
      return { hasUpdate: false };
    }
  }

  async updatePlugin(installDir: string, instanceId: string | number, pluginId: PluginId): Promise<void> {
    // Force a fresh copy from pool, ensurePluginInPool will handle if it needs re-downloading
    // For a real 'update' that bypasses pool, we'd need to clear the pool item first.
    await this.installPlugin(installDir, instanceId, pluginId);
  }

  async uninstallPlugin(installDir: string, instanceId: string | number, pluginId: PluginId): Promise<void> {
    const csgoDir = path.join(installDir, instanceId.toString(), "game", "csgo");
    const addonsDir = path.join(csgoDir, "addons");

    if (pluginId === ("metamod" as any)) return this.uninstallMetamod(installDir, instanceId);
    if (pluginId === ("cssharp" as any)) return this.uninstallCounterStrikeSharp(installDir, instanceId);

    const info = this.pluginRegistry[pluginId] as any;
    if (!info) return;

    console.log(`[PLUGIN] Uninstalling ${info.name}...`);
    const folderName = info.folderName || info.name.replace(/[^a-zA-Z0-9]/g, "");
    const pathsToDelete: Set<string> = new Set();
    const searchDirs = [
      addonsDir, csgoDir,
      path.join(addonsDir, "counterstrikesharp", "plugins"),
      path.join(addonsDir, "counterstrikesharp", "configs", "plugins"),
      path.join(csgoDir, "cfg"), path.join(csgoDir, "configs"),
      path.join(csgoDir, "materials"), path.join(csgoDir, "models"),
      path.join(csgoDir, "particles"), path.join(csgoDir, "sound"),
      path.join(csgoDir, "soundevents"), path.join(csgoDir, "translations")
    ];

    await Promise.all(searchDirs.map(async (dir) => {
      try {
        const items = await fs.promises.readdir(dir);
        for (const item of items) {
          const lowerItem = item.toLowerCase();
          const lowerPluginId = pluginId.toLowerCase();
          const lowerFolderName = folderName.toLowerCase();
          const isMatch = lowerItem === lowerPluginId || lowerItem === lowerFolderName ||
                          lowerItem === lowerPluginId + ".vdf" || lowerItem === lowerFolderName + ".vdf" ||
                          lowerItem === lowerPluginId + ".dll" || lowerItem === lowerFolderName + ".dll" ||
                          (lowerPluginId.length > 3 && lowerItem.includes(lowerPluginId)) ||
                          (lowerFolderName.length > 3 && lowerItem.includes(lowerFolderName));
          if (isMatch) pathsToDelete.add(path.join(dir, item));
        }
      } catch {}
    }));

    for (const p of pathsToDelete) {
      try {
        await fs.promises.rm(p, { recursive: true, force: true });
        console.log(`[PLUGIN] Deep Deleted: ${p}`);
      } catch (err) {
        console.error(`[PLUGIN] Failed to delete ${p}:`, err);
      }
    }

    try {
      db.prepare(`DELETE FROM server_plugins WHERE server_id = ? AND plugin_id = ?`).run(instanceId, pluginId);
    } catch (err) {
      console.error(`[DB] Failed to remove plugin from DB:`, err);
    }
  }

  async uninstallMetamod(installDir: string, instanceId: string | number): Promise<void> {
    const csgoDir = path.join(installDir, instanceId.toString(), "game", "csgo");
    const addonsDir = path.join(csgoDir, "addons");
    console.log(`[PLUGIN] Performing deep cleanup of Metamod and dependencies...`);
    const metaFiles = ["metamod", "metamod.vdf", "metamod_x64.vdf"];
    await Promise.all(metaFiles.map((p) => fs.promises.rm(path.join(addonsDir, p), { recursive: true, force: true }).catch(() => {})));
    const cssDir = path.join(addonsDir, "counterstrikesharp");
    try {
      await fs.promises.rm(cssDir, { recursive: true, force: true });
      db.prepare(`DELETE FROM server_plugins WHERE server_id = ? AND plugin_id != 'metamod'`).run(instanceId);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw new Error("Cannot remove CS#: Files in use.");
    }
    const gameinfo = path.join(csgoDir, "gameinfo.gi");
    try {
      let content = await fs.promises.readFile(gameinfo, "utf8");
      content = content.replace(/\s*Game\tcsgo\/addons\/metamod/g, "");
      await fs.promises.writeFile(gameinfo, content);
    } catch {}
    try { await fs.promises.rm(addonsDir, { recursive: true, force: true }); } catch {}
  }

  async uninstallCounterStrikeSharp(installDir: string, instanceId: string | number): Promise<void> {
    const cssDir = path.join(installDir, instanceId.toString(), "game", "csgo", "addons", "counterstrikesharp");
    await fs.promises.rm(cssDir, { recursive: true, force: true }).catch(() => {});
  }

  async getPluginConfigFiles(
    installDir: string,
    instanceId: string | number,
    pluginId: PluginId
  ): Promise<{ name: string; path: string }[]> {
    const id = instanceId.toString();
    const serverPath = path.join(installDir, id);
    const csgoDir = path.join(serverPath, "game", "csgo");
    const info = (this.pluginRegistry as any)[pluginId];
    if (!info) return [];

    const configs: { name: string; path: string }[] = [];
    const searchPaths: string[] = [];

    // 1. CSSharp Specific Configs
    if (info.category === "cssharp") {
      const cssConfigBase = path.join(csgoDir, "addons", "counterstrikesharp", "configs", "plugins");
      const cssPluginBase = path.join(csgoDir, "addons", "counterstrikesharp", "plugins");
      const candidates = [pluginId, info.folderName, info.name].filter(Boolean);
      
      for (const cand of candidates) {
        // Standard config folder
        searchPaths.push(path.join(cssConfigBase, cand!));
        // Plugin internal folder (some newer plugins store config there)
        searchPaths.push(path.join(cssPluginBase, cand!));
        // Plugin internal configs folder
        searchPaths.push(path.join(cssPluginBase, cand!, "configs"));
      }
    }

    // 2. MetaMod Specific Configs
    if (info.category === "metamod") {
        const mmAddonDir = path.join(csgoDir, "addons", info.folderName || pluginId);
        searchPaths.push(path.join(mmAddonDir, "configs"));
        searchPaths.push(mmAddonDir);
    }

    // 3. General Map Configs (Check for files matching plugin name in cfg/maps)
    const mapCfgDir = path.join(csgoDir, "cfg", "maps");
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
            if ([".json", ".cfg", ".txt", ".ini", ".toml"].includes(ext)) {
              // Exclude system files like .deps.json
              if (item.name.toLowerCase().endsWith(".deps.json")) continue;

              const fullPath = path.join(searchDir, item.name);
              configs.push({
                name: item.name,
                path: path.relative(serverPath, fullPath).replace(/\\/g, "/")
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
}

export const pluginManager = new PluginManager();
