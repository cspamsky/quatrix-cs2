import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from './db.js';
import si from 'systeminformation';
import { pluginManager } from './services/PluginManager.js';
import { steamManager } from './services/SteamManager.js';
import type { PluginId } from './config/plugins.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerManager {
    private runningServers: Map<string, any> = new Map();
    private logBuffers: Map<string, string[]> = new Map();
    private rconConnections: Map<string, any> = new Map();
    private installDir!: string;
    private steamCmdExe!: string;

    constructor() {
        this.refreshSettings(); 
        this.recoverOrphanedServers();
    }

    refreshSettings() {
        this.installDir = this.getSetting('install_dir') || path.resolve(__dirname, '../../instances');
        const steamCmdPath = this.getSetting('steamcmd_path');
        
        if (steamCmdPath) {
            if (steamCmdPath.endsWith('.sh')) {
                this.steamCmdExe = steamCmdPath;
            } else {
                this.steamCmdExe = path.join(steamCmdPath, 'steamcmd.sh');
            }
        } else {
            const steamCmdDir = path.resolve(__dirname, '../../server/data/steamcmd');
            this.steamCmdExe = path.join(steamCmdDir, 'steamcmd.sh');
        }

        if (!fs.existsSync(this.installDir)) {
            fs.mkdirSync(this.installDir, { recursive: true });
        }
    }

    private getSetting(key: string): string {
        const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string };
        return row ? row.value : '';
    }

    // --- Core Management ---
    recoverOrphanedServers() {
        const servers = db.prepare("SELECT id, pid, status FROM servers WHERE status != 'OFFLINE'").all() as any[];
        for (const server of servers) {
            let isAlive = false;
            if (server.pid) {
                try { process.kill(server.pid, 0); isAlive = true; } catch (e) { isAlive = false; }
            }
            if (!isAlive) {
                db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(server.id);
            }
        }
    }

    async startServer(instanceId: string | number, options: any, onLog?: (data: string) => void) {
        const id = instanceId.toString();
        const serverPath = path.join(this.installDir, id);
        // CS2 Linux uses linuxsteamrt64 directory
        const relativeBinPath = path.join('game', 'bin', 'linuxsteamrt64', 'cs2');
        const cs2Exe = path.join(serverPath, relativeBinPath);
        const binDir = path.dirname(cs2Exe);

        if (!fs.existsSync(cs2Exe)) throw new Error(`CS2 binary not found at ${cs2Exe}`);

        // steam_appid.txt is required for initialization
        fs.writeFileSync(path.join(binDir, 'steam_appid.txt'), '730');

        const cfgDir = path.join(serverPath, 'game', 'csgo', 'cfg');
        if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });
        const serverCfgPath = path.join(cfgDir, 'server.cfg');
        
        // Handle server.cfg generation for secrets
        let cfgContent = fs.existsSync(serverCfgPath) ? fs.readFileSync(serverCfgPath, 'utf8') : '';
        const updateLine = (c: string, k: string, v: string) => {
            const r = new RegExp(`^${k}\\s+.*$`, 'm');
            return r.test(c) ? c.replace(r, `${k} "${v}"`) : c + `\n${k} "${v}"`;
        };
        cfgContent = updateLine(cfgContent, 'sv_password', options.password || '');
        cfgContent = updateLine(cfgContent, 'rcon_password', options.rcon_password || 'secret');
        fs.writeFileSync(serverCfgPath, cfgContent);

        const args = [
            '-dedicated', '+map', options.map || 'de_dust2', '-port', options.port.toString(),
            '-maxplayers', (options.max_players || 16).toString(), '-nosteamclient', '+ip', '0.0.0.0'
        ];
        if (options.vac_enabled) args.push('+sv_lan', '0'); else args.push('-insecure', '+sv_lan', '1');
        if (options.gslt_token) args.push('+sv_setsteamaccount', options.gslt_token);
        if (options.steam_api_key) args.push('-authkey', options.steam_api_key);
        if (options.name) args.push('+hostname', options.name);

        // Linux Environment Setup
        const env: Record<string, string | undefined> = { 
            ...process.env, 
            SteamAppId: '730',
            STEAM_APP_ID: '730',
            // Dedicated server requires LD_LIBRARY_PATH on Linux to find steamclient.so
            LD_LIBRARY_PATH: `${binDir}:${path.join(binDir, 'steam')}:.`,
            // Stabilization for .NET on Linux if needed (rarely an issue compared to Windows)
            DOTNET_BUNDLE_EXTRACT_BASE_DIR: path.join(serverPath, '.net_cache')
        };

        // Ensure net_cache exists for .NET
        const netCache = path.join(serverPath, '.net_cache');
        if (!fs.existsSync(netCache)) fs.mkdirSync(netCache, { recursive: true });

        console.log(`[SERVER] Starting Linux CS2 instance: ${id}`);
        const serverProcess = spawn(cs2Exe, args, { 
            cwd: serverPath, 
            env,
            shell: false 
        });

        this.logBuffers.set(id, []);

        serverProcess.stdout.on('data', (data) => {
            const line = data.toString().trim();
            if (line && !line.includes('CTextConsoleWin')) {
                if (onLog) onLog(line);
                
                const buffer = this.logBuffers.get(id) || [];
                buffer.push(line);
                if (buffer.length > 100) buffer.shift();
                this.logBuffers.set(id, buffer);
            }
        });

        serverProcess.on('exit', () => {
            this.runningServers.delete(id);
            db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);
        });

        this.runningServers.set(id, serverProcess);
        if (serverProcess.pid) db.prepare("UPDATE servers SET pid = ? WHERE id = ?").run(serverProcess.pid, id);
    }

    async stopServer(id: string | number) {
        const idStr = id.toString();
        if (this.rconConnections.has(idStr)) {
            try { await this.rconConnections.get(idStr).end(); } catch {}
            this.rconConnections.delete(idStr);
        }

        const proc = this.runningServers.get(idStr);
        if (proc) proc.kill();
        const server = db.prepare("SELECT pid FROM servers WHERE id = ?").get(idStr) as any;
        if (server?.pid) try { process.kill(server.pid); } catch (e) {}
        db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(idStr);
        this.runningServers.delete(idStr);
        return true;
    }

    async sendCommand(id: string | number, command: string): Promise<string> {
        const idStr = id.toString();
        if (!this.isServerRunning(idStr)) throw new Error("Server is not running");
        const server = db.prepare("SELECT * FROM servers WHERE id = ?").get(idStr) as any;
        const { Rcon } = await import('rcon-client');
        let rcon = this.rconConnections.get(idStr);
        if (!rcon) {
            rcon = await Rcon.connect({ host: '127.0.0.1', port: server.port, password: server.rcon_password, timeout: 5000 });
            rcon.on('error', () => this.rconConnections.delete(idStr));
            rcon.on('end', () => this.rconConnections.delete(idStr));
            this.rconConnections.set(idStr, rcon);
        }
        return rcon.send(command);
    }

    async getCurrentMap(id: string | number): Promise<string | null> {
        try {
            const res = await this.sendCommand(id, 'status');
            const match = res.match(/loaded spawngroup\(\s*1\)\s*:\s*SV:\s*\[1:\s*(\w+)/i);
            return (match && match[1]) ? match[1] : null;
        } catch (e) { return null; }
    }

    async listFiles(id: string | number, subDir: string = '') {
        const base = path.join(this.installDir, id.toString(), 'game', 'csgo');
        const target = path.resolve(base, subDir);
        if (!target.startsWith(base)) throw new Error("Security: Path escape");
        if (!fs.existsSync(target)) return [];
        return fs.promises.readdir(target, { withFileTypes: true }).then(entries => 
            entries.map(e => ({ name: e.name, isDirectory: e.isDirectory(), size: 0, mtime: new Date() }))
        );
    }

    async readFile(id: string | number, filePath: string) {
        return fs.promises.readFile(path.join(this.installDir, id.toString(), 'game', 'csgo', filePath), 'utf8');
    }

    async writeFile(id: string | number, filePath: string, content: string) {
        return fs.promises.writeFile(path.join(this.installDir, id.toString(), 'game', 'csgo', filePath), content);
    }

    async deleteServerFiles(id: string | number) {
        const serverDir = path.join(this.installDir, id.toString());
        if (fs.existsSync(serverDir)) await fs.promises.rm(serverDir, { recursive: true, force: true });
    }

    isServerRunning(id: string | number) { return this.runningServers.has(id.toString()); }
    getLogs(id: string | number) { return this.logBuffers.get(id.toString()) || []; }
    getInstallDir() { return this.installDir; }
    getSteamCmdDir() { return path.dirname(this.steamCmdExe); }

    // --- Plugin Management Wrappers ---
    async getPluginRegistry() {
        return pluginManager.getRegistry();
    }

    async getPluginStatus(instanceId: string | number) {
        return pluginManager.getPluginStatus(this.installDir, instanceId);
    }

    async checkPluginUpdate(instanceId: string | number, pluginId: PluginId) {
        return pluginManager.checkPluginUpdate(instanceId, pluginId);
    }

    async installPlugin(instanceId: string | number, pluginId: PluginId) {
        return pluginManager.installPlugin(this.installDir, instanceId, pluginId);
    }

    async uninstallPlugin(instanceId: string | number, pluginId: PluginId) {
        return pluginManager.uninstallPlugin(this.installDir, instanceId, pluginId);
    }

    async updatePlugin(instanceId: string | number, pluginId: PluginId) {
        return pluginManager.updatePlugin(this.installDir, instanceId, pluginId);
    }

    // --- Steam/Server Installation ---
    async ensureSteamCMD() {
        return steamManager.ensureSteamCMD(this.getSteamCmdDir());
    }

    async installOrUpdateServer(id: string | number, onLog?: any) {
        return steamManager.installOrUpdateServer(id, this.steamCmdExe, this.installDir, onLog);
    }
    
    async getSystemHealth(): Promise<any> {
        const result: any = {
            os: { platform: process.platform, arch: process.arch },
            cpu: { avx: false, model: '', cores: 0 },
            ram: { total: 0, free: 0, status: 'unknown' },
            disk: { total: 0, free: 0, status: 'unknown' },
            runtimes: { 
                dotnet: { status: 'missing', versions: [], details: [] }, 
                vcruntime: { status: 'missing', missingFiles: [] } 
            }
        };
        try {
            const cpu = await si.cpu();
            result.cpu.model = cpu.brand;
            result.cpu.cores = cpu.cores;
            result.cpu.avx = cpu.flags.toLowerCase().includes('avx');
            const mem = await si.mem();
            result.ram.total = mem.total;
            result.ram.status = (mem.total / 1024 / 1024 / 1024) >= 8 ? 'good' : 'warning';
            
            const disk = await si.fsSize();
            const root = disk.find(d => this.installDir.startsWith(d.mount)) || disk[0];
            if (root) {
                result.disk.total = root.size;
                result.disk.free = root.available;
                result.disk.status = (root.available / 1024 / 1024 / 1024) >= 40 ? 'good' : 'warning';
            }

            // Enhanced .NET 8.0 check
            await new Promise<void>(res => {
                exec('dotnet --list-runtimes', (err, out) => {
                    if (!err && out) {
                        const lines = out.split('\n').filter(l => l.trim());
                        result.runtimes.dotnet.details = lines;
                        
                        // Check for .NET 8.0 specifically
                        const has80 = lines.some(l => l.includes('Microsoft.NETCore.App 8.0'));
                        result.runtimes.dotnet.status = has80 ? 'good' : 'missing';
                        
                        if (has80) {
                            result.runtimes.dotnet.versions = lines
                                .filter(l => l.includes('8.0'))
                                .map(l => l.trim());
                        }
                    }
                    res();
                });
            });

            // Removed VC++ Runtime check as it's Windows specific
        } catch (e) {}
        return result;
    }

    async repairSystemHealth(): Promise<{ success: boolean; message: string; details: any }> {
        const details: any = { dotnet: null, vcruntime: null };
        
        try {
            // Check .NET 8.0 Runtime
            const dotnetCheck = await new Promise<boolean>((resolve) => {
                exec('dotnet --list-runtimes', (err, out) => {
                    resolve(!!(!err && out && out.includes('8.0')));
                });
            });

            if (!dotnetCheck) {
                details.dotnet = { status: 'missing', action: 'download_required' };
                return {
                    success: false,
                    message: '.NET 8.0 Runtime not found. Please download from: https://dotnet.microsoft.com/download/dotnet/8.0',
                    details
                };
            } else {
                details.dotnet = { status: 'ok' };
            }

            // Removed Windows VC++ repair logic
            return {
                success: true,
                message: 'All system dependencies are healthy.',
                details
            };
        } catch (error: any) {
            return {
                success: false,
                message: `System health repair failed: ${error.message}`,
                details
            };
        }
    }
}

export const serverManager = new ServerManager();
