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

export interface PluginManifest {
    [key: string]: {
        name: string;
        version: string;
        downloadUrl: string;
        category: string;
        description: string;
        dependencies?: string[];
        folderName?: string;
    }
}

export class PluginManager {
    public pluginRegistry = pluginRegistry;
    private manifest: PluginManifest | null = null;
    private MANIFEST_PATH = path.resolve(__dirname, '../../../resources/plugins_manifest.json');
    private lastSync = 0;

    async syncRegistry(): Promise<void> {
        if (this.manifest && Date.now() - this.lastSync < 30000) return; 
        try {
            if (fs.existsSync(this.MANIFEST_PATH)) {
                const data = fs.readFileSync(this.MANIFEST_PATH, 'utf8');
                this.manifest = JSON.parse(data);
                this.lastSync = Date.now();
            } else { this.useFallback(); }
        } catch (error) { this.useFallback(); }
    }

    private useFallback() {
        this.manifest = {};
        for (const [id, info] of Object.entries(this.pluginRegistry)) {
            this.manifest[id] = {
                name: info.name,
                version: (info as any).currentVersion || 'latest',
                downloadUrl: (info as any).downloadUrl || '',
                category: info.category,
                description: (info as any).description || ''
            };
        }
    }

    async getRegistry() {
        await this.syncRegistry();
        return this.manifest || {};
    }

    async getPluginStatus(installDir: string, instanceId: string | number): Promise<Record<string, boolean>> {
        await this.syncRegistry();
        const id = instanceId.toString();
        const csgoDir = path.join(installDir, id, 'game', 'csgo');
        const addonsDir = path.join(csgoDir, 'addons');
        const cssPluginsDir = path.join(addonsDir, 'counterstrikesharp', 'plugins');
        const status: Record<string, boolean> = {};

        status.metamod = fs.existsSync(path.join(addonsDir, 'metamod.vdf')) || fs.existsSync(path.join(addonsDir, 'metamod_x64.vdf'));
        status.cssharp = fs.existsSync(path.join(addonsDir, 'counterstrikesharp'));

        const checkExists = (dir: string, name: string) => {
            if (!fs.existsSync(dir)) return false;
            const items = fs.readdirSync(dir);
            const lowerName = name.toLowerCase();
            return items.some(item => {
                const lowerItem = item.toLowerCase();
                return lowerItem === lowerName || 
                       lowerItem === lowerName + ".vdf" || 
                       lowerItem === lowerName + ".dll" ||
                       (lowerName.length > 3 && lowerItem.includes(lowerName));
            });
        };

        const registryToUse = this.manifest || (this.pluginRegistry as any);
        for (const pid of Object.keys(registryToUse)) {
            const info = registryToUse[pid];
            if (info.category === 'core') {
                status[pid] = status[pid] || false;
                continue;
            }

            // Check primary locations
            if (info.category === 'metamod') {
                status[pid] = checkExists(addonsDir, pid) || checkExists(addonsDir, info.folderName || "") || checkExists(addonsDir, info.name);
            } else if (info.category === 'cssharp') {
                status[pid] = checkExists(cssPluginsDir, pid) || checkExists(cssPluginsDir, info.folderName || "") || checkExists(cssPluginsDir, info.name);
                
                // Fallback check: Did it extract to root game/csgo/ by mistake?
                if (!status[pid]) {
                    status[pid] = checkExists(csgoDir, pid) || checkExists(csgoDir, info.folderName || "") || checkExists(csgoDir, info.name);
                }
            }
        }
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
            
            fs.mkdirSync(tempExtractDir, { recursive: true });
            
            if (isTarGz) {
                console.log(`[PLUGIN] Extracting .tar.gz using system tar...`);
                await execAsync(`tar -xzf "${tempFile}" -C "${tempExtractDir}"`);
            } else {
                const zip = new AdmZip(tempFile);
                zip.extractAllTo(tempExtractDir, true);
            }
            
            // Smart Extraction Logic
            const hasAddons = fs.existsSync(path.join(tempExtractDir, 'addons'));
            const hasGame = fs.existsSync(path.join(tempExtractDir, 'game'));
            
            // Standard CS2 asset folders often found at the root of plugin ZIPs
            const assetFolders = ['cfg', 'materials', 'models', 'particles', 'sound', 'soundevents', 'translations', 'maps', 'scripts'];
            const hasAnyAssetFolder = assetFolders.some(folder => fs.existsSync(path.join(tempExtractDir, folder)));
            
            // Special CSS roots
            const hasCSSRoot = fs.existsSync(path.join(tempExtractDir, 'counterstrikesharp'));
            const hasConfigsRoot = fs.existsSync(path.join(tempExtractDir, 'configs'));
            
            if (hasGame) {
                // If it has a 'game' folder, we merge from its parent (treating zip as root containing game/...)
                this.copyRecursiveSync(tempExtractDir, path.dirname(path.dirname(targetDir))); 
            } else if (hasAddons || hasAnyAssetFolder) {
                // If it has 'addons' OR any standard asset folder like 'cfg' or 'sound', 
                // we treat the extraction root as the 'game/csgo' directory.
                console.log(`[PLUGIN] Smart Merge: Detected standard CS2 folder structure. Merging into game/csgo...`);
                this.copyRecursiveSync(tempExtractDir, targetDir);
            } else if (hasCSSRoot || hasConfigsRoot) {
                // Some plugins (like SimpleAdmin) put everything inside a 'counterstrikesharp' or 'configs' folder
                const cssDest = path.join(targetDir, 'addons', 'counterstrikesharp');
                if (hasCSSRoot) {
                    this.copyRecursiveSync(path.join(tempExtractDir, 'counterstrikesharp'), cssDest);
                }
                if (hasConfigsRoot) {
                    this.copyRecursiveSync(path.join(tempExtractDir, 'configs'), path.join(cssDest, 'configs'));
                }
            } else {
                if (category === 'cssharp') {
                    const pluginDest = path.join(targetDir, 'addons', 'counterstrikesharp', 'plugins');
                    if (!fs.existsSync(pluginDest)) fs.mkdirSync(pluginDest, { recursive: true });
                    
                    const items = fs.readdirSync(tempExtractDir);
                    if (items.length === 1 && items[0] && fs.statSync(path.join(tempExtractDir, items[0])).isDirectory()) {
                        const firstItem = items[0];
                        // If the only folder is NOT 'counterstrikesharp' (already handled above), copy it as the plugin folder
                        this.copyRecursiveSync(path.join(tempExtractDir, firstItem), path.join(pluginDest, firstItem));
                    } else {
                        const dest = path.join(pluginDest, pluginName);
                        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
                        this.copyRecursiveSync(tempExtractDir, dest);
                    }
                } else if (category === 'metamod') {
                    const addonsDest = path.join(targetDir, 'addons');
                    if (!fs.existsSync(addonsDest)) fs.mkdirSync(addonsDest, { recursive: true });
                    this.copyRecursiveSync(tempExtractDir, addonsDest);
                } else {
                    this.copyRecursiveSync(tempExtractDir, targetDir);
                }
            }
            console.log(`[PLUGIN] Smart extraction complete.`);
        } finally {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
        }
    }

    private copyRecursiveSync(src: string, dest: string) {
        if (!fs.existsSync(src)) return;
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        
        for (const item of fs.readdirSync(src)) {
            const srcItem = path.join(src, item);
            const destItem = path.join(dest, item);
            if (fs.statSync(srcItem).isDirectory()) {
                this.copyRecursiveSync(srcItem, destItem);
            } else {
                fs.copyFileSync(srcItem, destItem);
            }
        }
    }

    async installPlugin(installDir: string, instanceId: string | number, pluginId: PluginId): Promise<void> {
        await this.syncRegistry();
        const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');
        const pluginInfo = this.manifest ? this.manifest[pluginId] : (this.pluginRegistry[pluginId] as any);
        if (pluginInfo?.downloadUrl) {
            console.log(`[PLUGIN] Installing ${pluginInfo.name}...`);
            await this.downloadAndExtract(pluginInfo.downloadUrl, csgoDir, pluginInfo.category, pluginId);
            
            // Record installation in DB
            try {
                db.prepare(`
                    INSERT INTO server_plugins (server_id, plugin_id, version) 
                    VALUES (?, ?, ?)
                    ON CONFLICT(server_id, plugin_id) DO UPDATE SET version = EXCLUDED.version
                `).run(instanceId, pluginId, pluginInfo.version);
            } catch (err) {
                console.error(`[DB] Failed to record plugin install:`, err);
            }

            if (pluginId === 'metamod') this.configureMetamod(csgoDir);
        }
    }

    private configureMetamod(csgoDir: string) {
        const gameinfo = path.join(csgoDir, 'gameinfo.gi');
        if (fs.existsSync(gameinfo)) {
            let content = fs.readFileSync(gameinfo, 'utf8');
            if (!content.includes('csgo/addons/metamod')) {
                // Target the specific line requested by the user
                const targetLine = /Game_LowViolence\s+csgo_lv\s+\/\/\s+Perfect World content override/i;
                
                if (targetLine.test(content)) {
                    content = content.replace(targetLine, '$&\n\t\t\tGame\tcsgo/addons/metamod');
                } else {
                    // Fallback injection point
                    content = content.replace(/(SearchPaths\s*\{)/, '$1\n\t\t\tGame\tcsgo/addons/metamod');
                }
                fs.writeFileSync(gameinfo, content);
            }
        }
    }

    async checkPluginUpdate(instanceId: string | number, pluginId: PluginId): Promise<any> {
        await this.syncRegistry();
        const info = this.manifest ? this.manifest[pluginId] : (this.pluginRegistry[pluginId] as any);
        if (!info) return { hasUpdate: false };

        try {
            const installed = db.prepare(`SELECT version FROM server_plugins WHERE server_id = ? AND plugin_id = ?`)
                               .get(instanceId, pluginId) as { version: string } | undefined;
            
            if (!installed) return { hasUpdate: false, latestVersion: info.version };

            const hasUpdate = installed.version !== info.version;
            return { 
                name: info.name, 
                hasUpdate, 
                currentVersion: installed.version, 
                latestVersion: info.version 
            };
        } catch (err) {
            return { hasUpdate: false, latestVersion: info.version };
        }
    }

    async updatePlugin(installDir: string, instanceId: string | number, pluginId: PluginId): Promise<void> {
        await this.installPlugin(installDir, instanceId, pluginId);
    }

    async uninstallPlugin(installDir: string, instanceId: string | number, pluginId: PluginId): Promise<void> {
        await this.syncRegistry();
        const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');
        const addonsDir = path.join(csgoDir, 'addons');
        
        if (pluginId === 'metamod' as any) return this.uninstallMetamod(installDir, instanceId);
        if (pluginId === 'cssharp' as any) return this.uninstallCounterStrikeSharp(installDir, instanceId);

        const info = this.manifest ? this.manifest[pluginId] : (this.pluginRegistry[pluginId] as any);
        if (!info) return;

        console.log(`[PLUGIN] Uninstalling ${info.name}...`);

        const folderName = info.folderName || info.name.replace(/[^a-zA-Z0-9]/g, '');
        const pathsToDelete: string[] = [];

        if (info.category === 'metamod') {
            pathsToDelete.push(path.join(addonsDir, `${pluginId}.vdf`));
            pathsToDelete.push(path.join(addonsDir, `${folderName}.vdf`));
            pathsToDelete.push(path.join(addonsDir, folderName));
        } else if (info.category === 'cssharp') {
            const cssPluginsDir = path.join(addonsDir, 'counterstrikesharp', 'plugins');
            // Delete the main folder/file
            pathsToDelete.push(path.join(cssPluginsDir, pluginId));
            pathsToDelete.push(path.join(cssPluginsDir, folderName));
            
            // Aggressive Cleanup: Delete anything starting with the name/folderName
            if (fs.existsSync(cssPluginsDir)) {
                const items = fs.readdirSync(cssPluginsDir);
                items.forEach(item => {
                    const lowerItem = item.toLowerCase();
                    if (lowerItem.startsWith(pluginId.toLowerCase() + "_") || 
                        lowerItem.startsWith(folderName.toLowerCase() + "_")) {
                        pathsToDelete.push(path.join(cssPluginsDir, item));
                    }
                });
            }
        }

        pathsToDelete.forEach(p => {
            if (fs.existsSync(p)) {
                fs.rmSync(p, { recursive: true, force: true });
                console.log(`[PLUGIN] Deleted: ${p}`);
            }
        });

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
        ['metamod', 'metamod.vdf', 'metamod_x64.vdf'].forEach(p => {
            const fullPath = path.join(addonsDir, p);
            if (fs.existsSync(fullPath)) fs.rmSync(fullPath, { recursive: true, force: true });
        });

        // 2. Remove dependencies (CS# and all plugins inside it)
        const cssDir = path.join(addonsDir, 'counterstrikesharp');
        if (fs.existsSync(cssDir)) {
            try {
                fs.rmSync(cssDir, { recursive: true, force: true });
                console.log(`[PLUGIN] CounterStrikeSharp and all associated plugins removed.`);
                // Clear all CSS eklentileri from DB
                db.prepare(`DELETE FROM server_plugins WHERE server_id = ? AND plugin_id != 'metamod'`).run(instanceId);
            } catch (err: any) {
                console.error(`[PLUGIN] Failed to remove CS# directory. It might be in use by the server: ${err.message}`);
                throw new Error("Cannot remove CounterStrikeSharp: Files are in use. Is the server running?");
            }
        }

        // 3. Clean up gameinfo.gi
        const gameinfo = path.join(csgoDir, 'gameinfo.gi');
        if (fs.existsSync(gameinfo)) {
            let content = fs.readFileSync(gameinfo, 'utf8');
            content = content.replace(/\s*Game\tcsgo\/addons\/metamod/g, '');
            fs.writeFileSync(gameinfo, content);
        }
        console.log(`[PLUGIN] Metamod uninstalled successfully.`);
    }

    async uninstallCounterStrikeSharp(installDir: string, instanceId: string | number): Promise<void> {
        const cssDir = path.join(installDir, instanceId.toString(), 'game', 'csgo', 'addons', 'counterstrikesharp');
        if (fs.existsSync(cssDir)) fs.rmSync(cssDir, { recursive: true, force: true });
    }
}

export const pluginManager = new PluginManager();
