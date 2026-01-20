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
    private playerIdentityCache: Map<string, Map<string, string>> = new Map();
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
            '-dedicated', 
            '+game_type', (options.game_type ?? 0).toString(),
            '+game_mode', (options.game_mode ?? 0).toString(),
            '+map', options.map || 'de_dust2', 
            '-port', options.port.toString(),
            '-maxplayers', (options.max_players || 16).toString(), 
            '-nosteamclient', 
            '+ip', '0.0.0.0'
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

        // Ensure Steam SDK directory exists for initialization
        // CS2 Linux often requires steamclient.so in ~/.steam/sdk64/
        try {
            const homeDir = process.env.HOME || '/root';
            const sdkDir = path.join(homeDir, '.steam/sdk64');
            const targetLink = path.join(sdkDir, 'steamclient.so');
            const steamCmdDir = path.dirname(this.steamCmdExe);
            const sourceSo = path.join(steamCmdDir, 'linux64/steamclient.so');

            if (!fs.existsSync(sdkDir)) {
                fs.mkdirSync(sdkDir, { recursive: true });
            }

            if (!fs.existsSync(targetLink) && fs.existsSync(sourceSo)) {
                console.log(`[SYSTEM] Creating Steam SDK symlink: ${sourceSo} -> ${targetLink}`);
                // Use symlink if possible, or copy if not
                try {
                    fs.symlinkSync(sourceSo, targetLink);
                } catch (e) {
                    fs.copyFileSync(sourceSo, targetLink);
                }
            }
        } catch (err) {
            console.warn(`[SYSTEM] Potential non-fatal SDK setup issue:`, err);
        }

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
                if (buffer.length > 200) buffer.shift();
                this.logBuffers.set(id, buffer);

                // --- OYUNCU TAKIBI (Sadece Steam64 Yakalama) ---
                // Steam64 formatı: steamid:76561198968591397
                const steam64Match = line.match(/steamid:(\d{17})/i);
                
                const serverId = id.toString();
                if (!this.playerIdentityCache.has(serverId)) this.playerIdentityCache.set(serverId, new Map());
                const cache = this.playerIdentityCache.get(serverId);

                if (steam64Match) {
                    const steamId64 = steam64Match[1];
                    const nameMatch = line.match(/['"](.+?)['"]/);
                    if (nameMatch) {
                        const name = nameMatch[1];
                        cache?.set(name, steamId64);
                        try {
                            db.prepare("INSERT OR REPLACE INTO player_identities (name, steam_id, last_seen) VALUES (?, ?, CURRENT_TIMESTAMP)")
                              .run(name, steamId64);
                        } catch (e) {}
                        console.log(`[IDENTITY] Steam64 Saved: ${name} -> ${steamId64}`);
                    }
                }
            }
        });

        serverProcess.stderr.on('data', (data) => {
            const line = `[STDERR] ${data.toString().trim()}`;
            if (line.trim() === '[STDERR]') return;
            if (onLog) onLog(line);
            
            const buffer = this.logBuffers.get(id) || [];
            buffer.push(line);
            if (buffer.length > 200) buffer.shift();
            this.logBuffers.set(id, buffer);
            console.error(`[SERVER ${id} STDERR] ${line}`);
        });

        serverProcess.on('exit', (code, signal) => {
            const exitMsg = `[SYSTEM] Process exited with code ${code} and signal ${signal}`;
            console.log(`[SERVER] Instance ${id} ${exitMsg}`);
            this.runningServers.delete(id);
            db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);
            
            if (onLog) onLog(exitMsg);
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

    async sendCommand(id: string | number, command: string, retries = 3): Promise<string> {
        const idStr = id.toString();
        const server = db.prepare("SELECT * FROM servers WHERE id = ?").get(idStr) as any;
        if (!server) throw new Error("Server not found in database");

        const { Rcon } = await import('rcon-client');
        let rcon = this.rconConnections.get(idStr);
        
        // RCON portu: Eğer rcon_port tanımlıysa onu kullan, yoksa game port'u kullan
        const rconPort = server.rcon_port || server.port;
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (!rcon) {
                    if (attempt === 1) {
                        console.log(`[RCON] Connecting to server ${id} at 127.0.0.1:${rconPort}`);
                    } else {
                        console.log(`[RCON] Retry ${attempt}/${retries} for server ${id}`);
                    }
                    
                    rcon = await Rcon.connect({ 
                        host: '127.0.0.1', 
                        port: rconPort, 
                        password: server.rcon_password, 
                        timeout: 3000
                    });
                    rcon.on('error', () => this.rconConnections.delete(idStr));
                    rcon.on('end', () => this.rconConnections.delete(idStr));
                    this.rconConnections.set(idStr, rcon);
                }
                return await rcon.send(command);
            } catch (error) {
                this.rconConnections.delete(idStr);
                rcon = undefined;
                
                if (attempt === retries) {
                    console.error(`[RCON] Failed to connect to server ${id} at 127.0.0.1:${rconPort} after ${retries} attempts`);
                    throw new Error(`RCON Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
                
                // Sunucu başlatılıyorsa biraz bekle
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        throw new Error('RCON connection failed after all retries');
    }

    async getCurrentMap(id: string | number): Promise<string | null> {
        try {
            const res = await this.sendCommand(id, 'status');
            const match = res.match(/loaded spawngroup\(\s*1\)\s*:\s*SV:\s*\[1:\s*(\w+)/i);
            return (match && match[1]) ? match[1] : null;
        } catch (e) { return null; }
    }

    async getPlayers(id: string | number): Promise<any[]> {
        try {
            // CS2 için mevcut komutları gönder (dump_player_list CS2'de yok)
            const combinedOutput = await this.sendCommand(id, 'status');
            const players: any[] = [];
            const lines = combinedOutput.split('\n');
            const idStr = id.toString();
            const cache = this.playerIdentityCache.get(idStr);
            
            // 1. Önce CSS_PLAYERS veya DUMP_PLAYER_LIST tablosunu tara
            for (const line of lines) {
                const trimmed = line.trim();
                const steam64Match = trimmed.match(/(\b765611\d{10,12}\b)/);
                if (steam64Match) {
                    const steamId64 = steam64Match[1];
                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 2) {
                        const nameMatch = trimmed.match(/["'](.+)["']/);
                        const name = nameMatch ? nameMatch[1] : parts[1];
                        if (!players.find(p => p.steamId === steamId64)) {
                            const userId = parts[0] ? parts[0].replace(/#/g, '') : '0';
                            players.push({
                                userId: userId,
                                name: name,
                                steamId: steamId64,
                                connected: '00:00',
                                ping: 0,
                                state: 'active'
                            });
                        }
                    }
                }
            }

            // 2. Normal liste tarama ve Derin Kimlik Eşleştirme (Veritabanı + Log desteği)
            for (const line of lines) {
                const trimmed = line.trim();
                
                // Bot satırlarını direkt atla
                if (trimmed.includes('BOT') || trimmed.includes('<BOT>')) {
                    continue;
                }
                
                const nameMatch = trimmed.match(/["'](.+)["']/);
                if (nameMatch && nameMatch[1]) {
                    const name = nameMatch[1];
                    
                    // Bot isimlerini filtrele (genelde kısa isimler veya BOT içerir)
                    if (name.length < 2 || name.toUpperCase().includes('BOT')) {
                        continue;
                    }
                    
                    const idPart = trimmed.replace('[Client]', '').trim().split(/\s+/)[0];
                    if (idPart && /^\d+$/.test(idPart) && idPart !== '65535' && !players.find(p => p.name === name)) {
                        // 1. Memory Cache
                        let steamId = cache?.get(idPart) || cache?.get(name);
                        
                        // 2. Log History Taraması (Sadece Steam64)
                        if (!steamId) {
                            const buffer = this.logBuffers.get(idStr) || [];
                            for (const logLine of buffer) {
                                if (logLine.includes(name)) {
                                    // Sadece Steam64 formatını ara (76561...)
                                    const steam64 = logLine.match(/\b(765611\d{10,12})\b/);
                                    if (steam64 && steam64[1]) {
                                        steamId = steam64[1];
                                        if (cache) cache.set(idPart, steamId);
                                        break;
                                    }
                                }
                            }
                        }

                        // 3. Veritabanı Taraması (En güçlü yedek)
                        if (!steamId) {
                            const dbRow = db.prepare("SELECT steam_id FROM player_identities WHERE name = ?")
                                           .get(name) as { steam_id: string } | undefined;
                            if (dbRow) {
                                steamId = dbRow.steam_id;
                                if (cache) cache.set(idPart, steamId);
                            }
                        }

                        // Bot'ları listeye ekleme (Ekstra kontrol)
                        if (steamId && steamId.toUpperCase() === 'BOT') {
                            continue;
                        }

                        players.push({
                            userId: idPart,
                            name: name,
                            steamId: steamId || 'Hidden/Pending',
                            connected: '00:00',
                            ping: 0,
                            state: 'active'
                        });
                    }
                }
            }

            return players;
        } catch (e) {
            console.error(`[RCON] Player fetch failed:`, e);
            return [];
        }
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
        const idStr = id.toString();
        const serverDir = path.join(this.installDir, idStr);
        
        console.log(`[SYSTEM] Deleting physical files for instance ${idStr} at ${serverDir}`);
        
        if (fs.existsSync(serverDir)) {
            try {
                // First attempt
                await fs.promises.rm(serverDir, { recursive: true, force: true });
            } catch (err) {
                // If it fails (e.g. process still exiting), wait 1s and retry
                console.warn(`[SYSTEM] Delete failed, retrying in 1s...`, err);
                await new Promise(resolve => setTimeout(resolve, 1000));
                await fs.promises.rm(serverDir, { recursive: true, force: true });
            }
        }
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
    // --- Steam/Server Installation ---
    async ensureSteamCMD() {
        const exists = await steamManager.ensureSteamCMD(this.steamCmdExe);
        if (exists) return true;

        try {
            console.log(`[SYSTEM] SteamCMD missing at ${this.steamCmdExe}. Downloading...`);
            await steamManager.downloadSteamCmd(this.steamCmdExe);
            return true;
        } catch (err) {
            console.error(`[SYSTEM] Failed to download SteamCMD:`, err);
            return false;
        }
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
                steam_sdk: { status: 'missing' }
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

            // Steam SDK check
            const homeDir = process.env.HOME || '/root';
            const sdkSo = path.join(homeDir, '.steam/sdk64/steamclient.so');
            result.runtimes.steam_sdk.status = fs.existsSync(sdkSo) ? 'good' : 'missing';
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

            // Check and Repair Steam SDK
            const homeDir = process.env.HOME || '/root';
            const sdkDir = path.join(homeDir, '.steam/sdk64');
            const targetLink = path.join(sdkDir, 'steamclient.so');
            
            if (!fs.existsSync(targetLink)) {
                console.log(`[REPAIR] Fixing Steam SDK...`);
                const steamCmdDir = path.dirname(this.steamCmdExe);
                const sourceSo = path.join(steamCmdDir, 'linux64/steamclient.so');
                
                if (fs.existsSync(sourceSo)) {
                    if (!fs.existsSync(sdkDir)) fs.mkdirSync(sdkDir, { recursive: true });
                    try {
                        fs.symlinkSync(sourceSo, targetLink);
                    } catch (e) {
                        fs.copyFileSync(sourceSo, targetLink);
                    }
                    details.steam_sdk = { status: 'repaired' };
                } else {
                    details.steam_sdk = { status: 'failed', reason: 'Source steamclient.so not found. Is SteamCMD installed?' };
                }
            } else {
                details.steam_sdk = { status: 'ok' };
            }

            return {
                success: true,
                message: 'System dependencies have been checked and repaired where possible.',
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
