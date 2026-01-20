import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import AdmZip from 'adm-zip';
import { pluginRegistry, type PluginId } from '../config/plugins.js';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PluginManager {
    public pluginRegistry = pluginRegistry;
    private manifest: any = null;
    private checkAllStmt: any;

    constructor() {
        this.checkAllStmt = db.prepare("SELECT plugin_id, version FROM server_plugins WHERE server_id = ?");
    }

    async syncRegistry() {
        // In a real scenarios, this might fetch from a remote URL.
        // For now, we populate our manifest from the static registry.
        const manifest: Record<string, any> = {};
        for (const [id, info] of Object.entries(this.pluginRegistry)) {
            manifest[id] = {
                name: info.name,
                version: info.currentVersion || 'latest',
                folderName: (info as any).folderName
            };
        }
        this.manifest = manifest;
        return manifest;
    }

    async getRegistry() {
        // Convert pluginRegistry to manifest format
        const manifest: Record<string, any> = {};
        for (const [id, info] of Object.entries(this.pluginRegistry)) {
            manifest[id] = {
                name: info.name,
                version: info.currentVersion || 'latest',
                downloadUrl: (info as any).downloadUrl || '',
                category: info.category,
                description: (info as any).description || '',
                folderName: (info as any).folderName
            };
        }
        return manifest;
    }

    async getPluginStatus(installDir: string, instanceId: string | number): Promise<Record<string, boolean>> {
        const id = instanceId.toString();
        const csgoDir = path.join(installDir, id, 'game', 'csgo');
        const addonsDir = path.join(csgoDir, 'addons');
        const cssPluginsDir = path.join(addonsDir, 'counterstrikesharp', 'plugins');
        const status: Record<string, boolean> = {};

        // PERFORMANCE: Cache directory listings as Promises to prevent "dog-piling" duplicate reads
        const dirCache = new Map<string, Promise<string[]>>();
        const getDirItems = (dir: string): Promise<string[]> => {
            if (!dirCache.has(dir)) {
                dirCache.set(dir, fs.promises.readdir(dir).catch(() => []));
            }
            return dirCache.get(dir)!;
        };

        // Parallel check for core components
        const [hasMetaVdf, hasMetaX64Vdf, hasCSS] = await Promise.all([
            fs.promises.access(path.join(addonsDir, 'metamod.vdf')).then(() => true).catch(() => false),
            fs.promises.access(path.join(addonsDir, 'metamod_x64.vdf')).then(() => true).catch(() => false),
            fs.promises.access(path.join(addonsDir, 'counterstrikesharp')).then(() => true).catch(() => false)
        ]);

        status.metamod = hasMetaVdf || hasMetaX64Vdf;
        status.cssharp = hasCSS;

        const checkExistsInDir = async (dir: string, name: string) => {
            const items = await getDirItems(dir);
            const lowerName = name.toLowerCase();
            return items.some(item => {
                const lowerItem = item.toLowerCase();
                return lowerItem === lowerName || 
                       lowerItem === lowerName + ".vdf" || 
                       lowerItem === lowerName + ".dll" ||
                       (lowerName.length > 3 && lowerItem.includes(lowerName));
            });
        };

        const checks = Object.keys(this.pluginRegistry).map(async (pid) => {
            const info = (this.pluginRegistry as any)[pid];
            if (info.category === 'core') {
                status[pid] = status[pid] || false;
                return;
            }

            // Check primary locations
            if (info.category === 'metamod') {
                status[pid] = await checkExistsInDir(addonsDir, pid) || await checkExistsInDir(addonsDir, info.folderName || "") || await checkExistsInDir(addonsDir, info.name);
            } else if (info.category === 'cssharp') {
                status[pid] = await checkExistsInDir(cssPluginsDir, pid) || await checkExistsInDir(cssPluginsDir, info.folderName || "") || await checkExistsInDir(cssPluginsDir, info.name);
                
                // Fallback check: Did it extract to root game/csgo/ by mistake?
                if (!status[pid]) {
                    status[pid] = await checkExistsInDir(csgoDir, pid) || await checkExistsInDir(csgoDir, info.folderName || "") || await checkExistsInDir(csgoDir, info.name);
                }
            }
        });

        await Promise.all(checks);
        return status;
    }

    async downloadAndExtract(url: string, targetDir: string, category: string = 'other', pluginName: string = 'unnamed_plugin'): Promise<void> {
        console.log(`[PLUGIN] Downloading: ${url}`);
        const isTarGz = url.endsWith('.tar.gz');
        const tempFile = path.join(targetDir, `temp_${Math.random().toString(36).substring(7)}${isTarGz ? '.tar.gz' : '.zip'}`);
        const tempExtractDir = path.join(targetDir, `temp_extract_${Math.random().toString(36).substring(7)}`);
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            // @ts-ignore
            await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(tempFile));
            
            await fs.promises.mkdir(tempExtractDir, { recursive: true });
            
            if (isTarGz) {
                console.log(`[PLUGIN] Extracting .tar.gz using system tar...`);
                await execAsync(`tar -xzf "${tempFile}" -C "${tempExtractDir}"`);
            } else {
                const zip = new AdmZip(tempFile);
                zip.extractAllTo(tempExtractDir, true);
            }
            
            // Smart Extraction Logic
            const [hasAddons, hasGame] = await Promise.all([
                fs.promises.access(path.join(tempExtractDir, 'addons')).then(() => true).catch(() => false),
                fs.promises.access(path.join(tempExtractDir, 'game')).then(() => true).catch(() => false)
            ]);
            
            // Standard CS2 asset folders often found at the root of plugin ZIPs
            const assetFolders = ['cfg', 'materials', 'models', 'particles', 'sound', 'soundevents', 'translations', 'maps', 'scripts'];
            const assetChecks = await Promise.all(assetFolders.map(folder => 
                fs.promises.access(path.join(tempExtractDir, folder)).then(() => true).catch(() => false)
            ));
            const hasAnyAssetFolder = assetChecks.some(exists => exists);
            
            // Special CSS roots
            const [hasCSSRoot, hasConfigsRoot] = await Promise.all([
                fs.promises.access(path.join(tempExtractDir, 'counterstrikesharp')).then(() => true).catch(() => false),
                fs.promises.access(path.join(tempExtractDir, 'configs')).then(() => true).catch(() => false)
            ]);
            
            if (hasGame) {
                // If it has a 'game' folder, we merge from its parent (treating zip as root containing game/...)
                await this.copyRecursive(tempExtractDir, path.dirname(path.dirname(targetDir))); 
            } else if (hasAddons || hasAnyAssetFolder) {
                // If it has 'addons' OR any standard asset folder like 'cfg' or 'sound', 
                // we treat the extraction root as the 'game/csgo' directory.
                console.log(`[PLUGIN] Smart Merge: Detected standard CS2 folder structure. Merging into game/csgo...`);
                await this.copyRecursive(tempExtractDir, targetDir);
            } else if (hasCSSRoot || hasConfigsRoot) {
                // Some plugins (like SimpleAdmin) put everything inside a 'counterstrikesharp' or 'configs' folder
                const cssDest = path.join(targetDir, 'addons', 'counterstrikesharp');
                if (hasCSSRoot) {
                    await this.copyRecursive(path.join(tempExtractDir, 'counterstrikesharp'), cssDest);
                }
                if (hasConfigsRoot) {
                    await this.copyRecursive(path.join(tempExtractDir, 'configs'), path.join(cssDest, 'configs'));
                }
            } else {
                if (category === 'cssharp') {
                    const pluginDest = path.join(targetDir, 'addons', 'counterstrikesharp', 'plugins');
                    try { await fs.promises.mkdir(pluginDest, { recursive: true }); } catch {}
                    
                    const items = await fs.promises.readdir(tempExtractDir);
                    const firstItem = items[0];
                    const firstItemPath = (items.length === 1 && firstItem) ? path.join(tempExtractDir, firstItem) : null;
                    const isDir = firstItemPath ? (await fs.promises.stat(firstItemPath)).isDirectory() : false;

                    if (items.length === 1 && isDir && firstItem) {
                        // If the only folder is NOT 'counterstrikesharp' (already handled above), copy it as the plugin folder
                        await this.copyRecursive(path.join(tempExtractDir, firstItem), path.join(pluginDest, firstItem));
                    } else {
                        const dest = path.join(pluginDest, pluginName);
                        try { await fs.promises.mkdir(dest, { recursive: true }); } catch {}
                        await this.copyRecursive(tempExtractDir, dest);
                    }
                } else if (category === 'metamod') {
                    const addonsDest = path.join(targetDir, 'addons');
                    try { await fs.promises.mkdir(addonsDest, { recursive: true }); } catch {}
                    await this.copyRecursive(tempExtractDir, addonsDest);
                } else {
                    await this.copyRecursive(tempExtractDir, targetDir);
                }
            }
            console.log(`[PLUGIN] Smart extraction complete.`);
        } finally {
            try { await fs.promises.unlink(tempFile); } catch {}
            try { await fs.promises.rm(tempExtractDir, { recursive: true, force: true }); } catch {}
        }
    }

    private async copyRecursive(src: string, dest: string) {
        try { await fs.promises.access(src); } catch { return; }
        try { await fs.promises.mkdir(dest, { recursive: true }); } catch {}
        
        const items = await fs.promises.readdir(src);
        for (const item of items) {
            const srcItem = path.join(src, item);
            const destItem = path.join(dest, item);
            const stat = await fs.promises.stat(srcItem);
            
            if (stat.isDirectory()) {
                await this.copyRecursive(srcItem, destItem);
            } else {
                await fs.promises.copyFile(srcItem, destItem);
            }
        }
    }

    async installPlugin(installDir: string, instanceId: string | number, pluginId: PluginId): Promise<void> {
        const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');
        const pluginInfo = (this.pluginRegistry[pluginId] as any);
        if (pluginInfo?.downloadUrl) {
            console.log(`[PLUGIN] Installing ${pluginInfo.name}...`);
            await this.downloadAndExtract(pluginInfo.downloadUrl, csgoDir, pluginInfo.category, pluginId);
            
            // Record installation in DB
            try {
                db.prepare(`
                    INSERT INTO server_plugins (server_id, plugin_id, version) 
                    VALUES (?, ?, ?)
                    ON CONFLICT(server_id, plugin_id) DO UPDATE SET version = EXCLUDED.version
                `).run(instanceId, pluginId, pluginInfo.currentVersion);
            } catch (err) {
                console.error(`[DB] Failed to record plugin install:`, err);
            }

            if (pluginId === 'metamod') await this.configureMetamod(csgoDir);
        }
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
        } catch {}
    }

    async checkAllPluginUpdates(instanceId: string | number): Promise<Record<string, any>> {
        await this.syncRegistry();
        const results: Record<string, any> = {};

        try {
            const installedPlugins = this.checkAllStmt.all(instanceId) as { plugin_id: string, version: string }[];
            const installedMap = new Map(installedPlugins.map(p => [p.plugin_id, p.version]));

            for (const pid of Object.keys(this.pluginRegistry)) {
                const info = this.manifest ? this.manifest[pid] : (this.pluginRegistry as any)[pid];
                if (!info) continue;

                const installedVersion = installedMap.get(pid);
                if (!installedVersion) {
                    results[pid] = { hasUpdate: false, latestVersion: info.version || info.currentVersion };
                    continue;
                }

                const latestVersion = info.version || info.currentVersion;
                const hasUpdate = installedVersion !== latestVersion;
                
                results[pid] = {
                    name: info.name,
                    hasUpdate,
                    currentVersion: installedVersion,
                    latestVersion
                };
            }
        } catch (err) {
            console.error(`[PLUGIN] Batch update check failed:`, err);
        }

        return results;
    }

    async checkPluginUpdate(instanceId: string | number, pluginId: PluginId): Promise<any> {
        const updates = await this.checkAllPluginUpdates(instanceId);
        return updates[pluginId] || { hasUpdate: false };
    }

    async updatePlugin(installDir: string, instanceId: string | number, pluginId: PluginId): Promise<void> {
        await this.installPlugin(installDir, instanceId, pluginId);
    }

    async uninstallPlugin(installDir: string, instanceId: string | number, pluginId: PluginId): Promise<void> {
        const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');
        const addonsDir = path.join(csgoDir, 'addons');
        
        if (pluginId === 'metamod' as any) return this.uninstallMetamod(installDir, instanceId);
        if (pluginId === 'cssharp' as any) return this.uninstallCounterStrikeSharp(installDir, instanceId);

        const info = (this.pluginRegistry[pluginId] as any);
        if (!info) return;

        console.log(`[PLUGIN] Uninstalling ${info.name}...`);

        const folderName = info.folderName || info.name.replace(/[^a-zA-Z0-9]/g, '');
        const pathsToDelete: Set<string> = new Set();

        const searchDirs = [
            addonsDir,
            csgoDir,
            path.join(addonsDir, 'counterstrikesharp', 'plugins'),
            path.join(addonsDir, 'counterstrikesharp', 'configs', 'plugins'),
            path.join(csgoDir, 'cfg'),
            path.join(csgoDir, 'configs'),
            path.join(csgoDir, 'materials'),
            path.join(csgoDir, 'models'),
            path.join(csgoDir, 'particles'),
            path.join(csgoDir, 'sound'),
            path.join(csgoDir, 'soundevents'),
            path.join(csgoDir, 'translations')
        ];

        for (const dir of searchDirs) {
            try {
                const items = await fs.promises.readdir(dir);
                for (const item of items) {
                    const lowerItem = item.toLowerCase();
                    const lowerPluginId = pluginId.toLowerCase();
                    const lowerFolderName = folderName.toLowerCase();
                    
                    const isMatch = lowerItem === lowerPluginId || 
                                    lowerItem === lowerFolderName ||
                                    lowerItem === lowerPluginId + ".vdf" ||
                                    lowerItem === lowerFolderName + ".vdf" ||
                                    lowerItem === lowerPluginId + ".dll" ||
                                    lowerItem === lowerFolderName + ".dll" ||
                                    (lowerPluginId.length > 3 && lowerItem.includes(lowerPluginId)) ||
                                    (lowerFolderName.length > 3 && lowerItem.includes(lowerFolderName));
                    
                    if (isMatch) {
                        pathsToDelete.add(path.join(dir, item));
                    }
                }
            } catch {}
        }

        for (const p of pathsToDelete) {
            try {
                await fs.promises.rm(p, { recursive: true, force: true });
                console.log(`[PLUGIN] Deep Deleted: ${p}`);
            } catch (err) {
                console.error(`[PLUGIN] Failed to delete ${p}:`, err);
            }
        }

        // Remove from DB
        try {
            db.prepare(`DELETE FROM server_plugins WHERE server_id = ? AND plugin_id = ?`)
              .run(instanceId, pluginId);
        } catch (err) {
            console.error(`[DB] Failed to remove plugin from DB:`, err);
        }
    }

    async uninstallMetamod(installDir: string, instanceId: string | number): Promise<void> {
        const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');
        const addonsDir = path.join(csgoDir, 'addons');
        
        console.log(`[PLUGIN] Performing deep cleanup of Metamod and all dependencies...`);

        // 1. Remove Metamod files
        const metaFiles = ['metamod', 'metamod.vdf', 'metamod_x64.vdf'];
        await Promise.all(metaFiles.map(p => 
            fs.promises.rm(path.join(addonsDir, p), { recursive: true, force: true }).catch(() => {})
        ));

        // 2. Remove dependencies (CS# and all plugins inside it)
        const cssDir = path.join(addonsDir, 'counterstrikesharp');
        try {
            await fs.promises.rm(cssDir, { recursive: true, force: true });
            console.log(`[PLUGIN] CounterStrikeSharp and all associated plugins removed.`);
            db.prepare(`DELETE FROM server_plugins WHERE server_id = ? AND plugin_id != 'metamod'`).run(instanceId);
        } catch (err: any) {
            if (err.code !== 'ENOENT') {
                console.error(`[PLUGIN] Failed to remove CS# directory: ${err.message}`);
                throw new Error("Cannot remove CounterStrikeSharp: Files are in use. Is the server running?");
            }
        }

        // 3. Clean up gameinfo.gi
        const gameinfo = path.join(csgoDir, 'gameinfo.gi');
        try {
            let content = await fs.promises.readFile(gameinfo, 'utf8');
            content = content.replace(/\s*Game\tcsgo\/addons\/metamod/g, '');
            await fs.promises.writeFile(gameinfo, content);
        } catch {}
        console.log(`[PLUGIN] Metamod uninstalled successfully.`);
    }

    async uninstallCounterStrikeSharp(installDir: string, instanceId: string | number): Promise<void> {
        const cssDir = path.join(installDir, instanceId.toString(), 'game', 'csgo', 'addons', 'counterstrikesharp');
        await fs.promises.rm(cssDir, { recursive: true, force: true }).catch(() => {});
    }
}

export const pluginManager = new PluginManager();
