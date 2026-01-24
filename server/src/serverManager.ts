import { spawn, exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "./db.js";
import { pluginManager } from "./services/PluginManager.js";
import type { PluginId } from "./config/plugins.js";
import { promisify } from "util";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Noise patterns to filter out from server console logs to keep them clean.
 */
const LOG_NOISE_PATTERNS = [
    /notify_one/,
    /Adding process/i,
    /Wait for/i,
    /Resource leak/,
    /GC Connection established/,
    /SDR RelayNetworkStatus/,
    /AuthStatus/,
    /CNAV/,
    /ResourceHandleToData/,
    /multiple info_map_parameters/i,
    /physics/i,
    /forgot to remove resource/i,
    /High water mark/,
    /MainLoop returning/,
    /Source2Shutdown/,
    /usrlocal path/i,
    /visibility enabled/i,
    /initsteamlogin/i,
    /breakpad/i
];

class ServerManager {
    private runningServers: Map<string, any> = new Map();
    private logBuffers: Map<string, string[]> = new Map();
    private rconConnections: Map<string, any> = new Map();
    private steamCmdExe: string = "";
    private installDir: string = "";
    private io: any = null;

    private getServerStmt = db.prepare("SELECT * FROM servers WHERE id = ?");

    constructor() {
        this.refreshSettings();
        this.setupMaintenanceTasks();
    }

    // --- Initialization & Tasks ---

    private refreshSettings() {
        this.steamCmdExe = this.getSetting("steamcmd_path") || "steamcmd";
        this.installDir = this.getSetting("install_dir") || path.join(__dirname, "../data/instances");

        if (!fs.existsSync(this.installDir)) {
            fs.mkdirSync(this.installDir, { recursive: true });
        }
    }

    private setupMaintenanceTasks() {
        // Refresh settings periodically
        setInterval(() => this.refreshSettings(), 60000);

        // Auto-update player counts for UI
        setInterval(() => this.updateAllPlayerCounts(), 10000);
    }

    async init() {
        await this.recoverOrphanedServers();
        console.log("[ServerManager] Initialized and recovered orphaned processes.");
    }

    setSocketIO(socketIO: any) {
        this.io = socketIO;
    }

    private getSetting(key: string): string {
        try {
            const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
            return row ? row.value : "";
        } catch { return ""; }
    }

    private async updateAllPlayerCounts() {
        for (const id of this.runningServers.keys()) {
            try {
                const { players } = await this.getPlayers(id);
                db.prepare("UPDATE servers SET current_players = ? WHERE id = ?").run(players.length, id);
            } catch (err) { /* Server might be busy */ }
        }
    }

    private async recoverOrphanedServers() {
        try {
            const rows = db.prepare("SELECT id, pid, status FROM servers WHERE status != 'OFFLINE'").all() as any[];
            for (const row of rows) {
                if (row.pid) {
                    try {
                        process.kill(row.pid, 0); // Check if alive
                        this.runningServers.set(row.id.toString(), { pid: row.pid });
                        console.log(`[ServerManager] Successfully recovered server ${row.id} (PID ${row.pid})`);
                    } catch (e) {
                        console.log(`[ServerManager] Cleaning up stale server record ${row.id}`);
                        db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(row.id);
                    }
                } else {
                    db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(row.id);
                }
            }
        } catch (err) {
            console.error("[ServerManager] Recovery error:", err);
        }
    }

    // --- Server Control ---

    async startServer(idStr: string | number, options: any, onLog?: (data: string) => void) {
        const id = idStr.toString();
        if (this.runningServers.has(id)) throw new Error("Server is already running");

        const server = this.getServerStmt.get(id) as any;
        if (!server) throw new Error("Server not found in database");

        const serverPath = path.join(this.installDir, id);
        const binDir = path.join(serverPath, "game/bin/linuxsteamrt64");
        const cs2Script = path.join(serverPath, "game/cs2.sh");

        if (process.platform === 'linux' && !fs.existsSync(cs2Script)) {
            throw new Error(`Starter script not found at ${cs2Script}. Ensure server is installed.`);
        }

        // Automated Environment Fixes (Steam API, Metamod, etc.)
        await this.prepareEnvironment(id, serverPath, binDir);

        // Build command line arguments
        const args = [
            "-dedicated",
            "-nosteamclient",
            "-port", options.port.toString(),
            "-maxplayers", (options.max_players || 64).toString(),
            "+ip", "0.0.0.0",
            "+map", options.map || "de_dust2",
            "+game_type", (options.game_type ?? 0).toString(),
            "+game_mode", (options.game_mode ?? 1).toString(),
            "-nojoy",
            "+sv_lan", "0"
        ];

        if (server.rcon_password) args.push("+rcon_password", server.rcon_password);
        if (server.gslt_token) args.push("+sv_setsteamaccount", server.gslt_token);
        if (server.steam_api_key) args.push("-authkey", server.steam_api_key);

        const envVars = this.getEnvironmentVariables(serverPath, binDir);

        console.log(`[STARTUP] Instance ${id}: spawning process...`);
        const proc = spawn(cs2Script, args, { cwd: serverPath, env: envVars });

        this.runningServers.set(id, proc);
        db.prepare("UPDATE servers SET pid = ?, status = 'ONLINE' WHERE id = ?").run(proc.pid, id);

        this.setupProcessHandlers(id, proc, onLog);
    }

    async stopServer(idStr: string | number) {
        const id = idStr.toString();
        const proc = this.runningServers.get(id);

        if (proc && proc.pid) {
            try {
                process.kill(proc.pid, "SIGTERM");
                setTimeout(() => {
                    try { process.kill(proc.pid, "SIGKILL"); } catch {}
                }, 5000);
            } catch (e) {}
        } else {
            const server = db.prepare("SELECT pid FROM servers WHERE id = ?").get(id) as any;
            if (server?.pid) {
                try { process.kill(server.pid, "SIGTERM"); } catch {}
            }
        }

        this.runningServers.delete(id);
        this.rconConnections.delete(id);
        db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(id);
    }

    private setupProcessHandlers(id: string, proc: any, onLog?: (data: string) => void) {
        proc.stdout?.on("data", (data: any) => {
            const lines = data.toString().split("\n");
            lines.forEach((line: string) => {
                if (line.trim() && !LOG_NOISE_PATTERNS.some(p => p.test(line))) {
                    if (onLog) onLog(line);
                }
            });
        });

        proc.stderr?.on("data", (data: any) => {
            if (onLog) onLog(`[STDERR] ${data.toString()}`);
        });

        proc.on("exit", (code: any, signal: any) => {
            console.log(`[SERVER] Instance ${id} exited (Code: ${code}, Signal: ${signal})`);
            this.runningServers.delete(id);
            this.rconConnections.delete(id);
            db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(id);
        });
    }

    // --- RCON & Queries ---

    async sendCommand(idStr: string | number, command: string, retries = 2): Promise<string> {
        const id = idStr.toString();
        const server = this.getServerStmt.get(id) as any;
        if (!server) throw new Error("Server not found");

        const { Rcon } = await import("rcon-client");
        let rcon = this.rconConnections.get(id);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (!rcon || !rcon.authenticated) {
                    rcon = new Rcon({
                        host: "127.0.0.1",
                        port: server.port,
                        password: server.rcon_password,
                        timeout: 15000
                    });

                    rcon.on("error", (err: any) => {
                        this.rconConnections.delete(id);
                    });

                    await rcon.connect();
                    this.rconConnections.set(id, rcon);
                }

                return await rcon.send(command);
            } catch (error: any) {
                this.rconConnections.delete(id);
                rcon = undefined;
                if (attempt === retries) {
                    console.error(`[RCON] Final failure for ${id}:`, error.message);
                    throw new Error("RCON Connection Refused/Timed out");
                }
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        throw new Error("RCON command failed");
    }

    async getCurrentMap(idStr: string | number): Promise<string | null> {
        const id = idStr.toString();
        try {
            const res = await this.sendCommand(id, "status");
            
            // Complex regex to handle both standard and workshop map paths
            const mapMatch = res.match(/loaded spawngroup.*SV:.*\[\d+:\s*([^\s|\]]+)/i);
            
            let currentMap = null;
            if (mapMatch && mapMatch[1]) {
                const parts = mapMatch[1].trim().split('/');
                currentMap = parts[parts.length - 1]; // Extracts filename
            }

            if (!currentMap) {
                const fallbackMatch = res.match(/Map: "([^"]+)"/i) || res.match(/Map: ([^\s]+)/i);
                currentMap = (fallbackMatch && fallbackMatch[1]) ? fallbackMatch[1] : null;
            }

            if (currentMap) {
                const server = this.getServerStmt.get(id) as any;
                if (server && server.map !== currentMap) {
                    console.log(`[MAP SYNC] Server ${id}: ${server.map} -> ${currentMap}`);
                    db.prepare("UPDATE servers SET map = ? WHERE id = ?").run(currentMap, id);
                    if (this.io) this.io.emit('server_update', { serverId: parseInt(id) });
                }
            }
            return currentMap;
        } catch { return null; }
    }

    async getPlayers(id: string | number): Promise<{ players: any[]; averagePing: number }> {
        try {
            const res = await this.sendCommand(id, "status");
            const players: any[] = [];
            const lines = res.split("\n");
            
            for (const line of lines) {
                if (line.includes("#") && (line.includes("BOT") || line.includes("STEAM_"))) {
                    players.push({ 
                        name: line.includes("BOT") ? "[BOT]" : "Player",
                        ping: line.match(/ping\s+(\d+)/)?.[1] || 0
                    });
                }
            }
            return { players, averagePing: 0 };
        } catch { return { players: [], averagePing: 0 }; }
    }

    // --- Environment Preparation ---

    private async prepareEnvironment(id: string, serverPath: string, binDir: string) {
        if (process.platform !== 'linux') return;

        const steamSubDir = path.join(binDir, 'steam');
        const steamClientSrc = await this.findSteamClientLib();

        if (steamClientSrc) {
            try {
                if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
                if (!fs.existsSync(steamSubDir)) fs.mkdirSync(steamSubDir, { recursive: true });

                fs.copyFileSync(steamClientSrc, path.join(binDir, 'steamclient.so'));
                fs.copyFileSync(steamClientSrc, path.join(steamSubDir, 'steamclient.so'));
                console.log(`[SYSTEM] Steam API libraries deployed for instance ${id}`);
            } catch (e) {
                console.warn(`[SYSTEM] Library deployment failed for ${id}:`, e);
            }
        }

        // Metamod VDF Deployment
        const metamodVdfPath = path.join(serverPath, "game/csgo/addons/metamod.vdf");
        if (fs.existsSync(path.join(serverPath, "game/csgo/addons/metamod")) && !fs.existsSync(metamodVdfPath)) {
            const vdf = `"Plugin"\n{\n\t"file"\t"../csgo/addons/metamod/bin/linuxsteamrt64/metamod"\n}\n`;
            try { fs.writeFileSync(metamodVdfPath, vdf); } catch {}
        }
    }

    private async findSteamClientLib(): Promise<string> {
        const potentialDirs = [
            path.dirname(this.steamCmdExe),
            path.join(__dirname, "../data/steamcmd"),
            "/root/quatrix/server/data/steamcmd",
            "/root/.steam/sdk64"
        ];

        for (const dir of potentialDirs) {
            const p1 = path.join(dir, 'linux64/steamclient.so');
            const p2 = path.join(dir, 'steamclient.so');
            if (fs.existsSync(p1)) return p1;
            if (fs.existsSync(p2)) return p2;
        }
        return "";
    }

    private getEnvironmentVariables(serverPath: string, binDir: string): any {
        const cssDotnetDir = path.join(serverPath, "game/csgo/addons/counterstrikesharp/dotnet");
        const steamClientSrc = path.dirname(this.steamCmdExe); // Rough estimate for LD_LIBRARY_PATH

        return {
            ...process.env,
            HOME: "/root",
            USER: "root",
            LD_LIBRARY_PATH: `${binDir}:${path.join(binDir, 'steam')}:${steamClientSrc}:${process.env.LD_LIBRARY_PATH || ''}`,
            DOTNET_ROOT: cssDotnetDir,
            DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: "1",
            DOTNET_BUNDLE_EXTRACT_BASE_DIR: path.join(serverPath, ".net_cache"),
            DOTNET_GENERATE_ASPNET_ROOT: "0",
            SDL_VIDEODRIVER: "offscreen",
            SteamAppId: "730"
        };
    }

    // --- File Operations ---

    private _securePath(id: string | number, userPath: string): string {
        const base = path.join(this.installDir, id.toString());
        const full = path.resolve(base, userPath);
        if (!full.startsWith(path.resolve(base))) throw new Error("Unauthorized path access");
        return full;
    }

    async listFiles(id: string | number, subDir = "") {
        const full = this._securePath(id, subDir);
        const entries = await fs.promises.readdir(full, { withFileTypes: true });
        return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory(), size: 0, mtime: new Date() }));
    }

    async readFile(id: string | number, file: string) {
        return fs.promises.readFile(this._securePath(id, file), "utf-8");
    }

    async writeFile(id: string | number, file: string, content: string) {
        await fs.promises.writeFile(this._securePath(id, file), content);
    }

    async deleteFile(id: string | number, file: string) {
        await fs.promises.rm(this._securePath(id, file), { recursive: true, force: true });
    }

    async createDirectory(id: string | number, dirPath: string) {
        await fs.promises.mkdir(this._securePath(id, dirPath), { recursive: true });
    }

    async renameFile(id: string | number, oldPath: string, newPath: string) {
        await fs.promises.rename(this._securePath(id, oldPath), this._securePath(id, newPath));
    }

    getFilePath(id: string | number, filePath: string) {
        return this._securePath(id, filePath);
    }

    async deleteServerFiles(id: string | number) {
        const serverPath = path.join(this.installDir, id.toString());
        if (fs.existsSync(serverPath)) {
            await fs.promises.rm(serverPath, { recursive: true, force: true });
        }
    }

    // --- System & Extensions ---

    async installOrUpdateServer(id: string | number, onLog: (data: string) => void) {
        const serverPath = path.join(this.installDir, id.toString());
        if (!fs.existsSync(serverPath)) fs.mkdirSync(serverPath, { recursive: true });

        onLog(`[INSTALL] Commencing update for instance ${id}...\n`);
        const cmd = `${this.steamCmdExe} +force_install_dir ${serverPath} +login anonymous +app_update 730 validate +quit`;
        
        return new Promise<void>((resolve, reject) => {
            const proc = exec(cmd);
            proc.stdout?.on("data", (d) => onLog(d.toString()));
            proc.stderr?.on("data", (d) => onLog(`[ERR] ${d.toString()}`));
            proc.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)));
        });
    }

    async cleanupGarbage(): Promise<{ success: boolean; clearedFiles: number; clearedBytes: number }> {
        console.log(`[SYSTEM] Starting garbage cleanup...`);
        let clearedFiles = 0;
        let clearedBytes = 0;

        const cleanDir = async (dir: string) => {
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (['addons', 'configs', 'counterstrikesharp'].includes(entry.name)) continue;
                    
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await cleanDir(fullPath);
                    } else if (/^core\.\d+$/.test(entry.name)) {
                        const stats = await fs.promises.stat(fullPath);
                        await fs.promises.rm(fullPath, { force: true }).catch(() => {});
                        clearedFiles++;
                        clearedBytes += stats.size;
                    }
                }
            } catch {}
        };

        await cleanDir(this.installDir);
        return { success: true, clearedFiles, clearedBytes };
    }

    async repairSystemHealth() {
        console.log(`[SYSTEM] Starting repair...`);
        if (!fs.existsSync(this.installDir)) fs.mkdirSync(this.installDir, { recursive: true });
        return { success: true, message: "System environment verified." };
    }

    // Wrappers for PluginManager
    async getPluginStatus(id: string | number) { return pluginManager.getPluginStatus(this.installDir, id); }
    async installPlugin(id: string | number, pId: PluginId) { return pluginManager.installPlugin(this.installDir, id, pId); }
    async uninstallPlugin(id: string | number, pId: PluginId) { return pluginManager.uninstallPlugin(this.installDir, id, pId); }
    async updatePlugin(id: string | number, pId: PluginId) { return pluginManager.updatePlugin(this.installDir, id, pId); }
    async checkPluginUpdate(id: string | number, pId: PluginId) { return pluginManager.checkPluginUpdate(id, pId); }
    async checkAllPluginUpdates(id: string | number) { return pluginManager.checkAllPluginUpdates(id); }

    // Path Helpers
    getInstallDir() { return this.installDir; }
    getSteamCmdDir() { return this.steamCmdExe; }
    isServerRunning(id: string | number) { return this.runningServers.has(id.toString()); }
}

export const serverManager = new ServerManager();
(async () => {
    try { await serverManager.init(); } catch (e) { console.error("[ServerManager] Init failed:", e); }
})();
