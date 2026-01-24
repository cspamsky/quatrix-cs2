import { spawn, exec, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "./db.js";
import { pluginManager } from "./services/PluginManager.js";
import { pluginRegistry, type PluginId } from "./config/plugins.js";
import { promisify } from "util";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Noise patterns to filter out from server console logs to keep them clean.
 * Focuses on Linux-specific CS2 logging noise.
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
    private installingServers: Map<string, any> = new Map(); // Track active installations
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
        this.steamCmdExe = this.getSetting("steamcmd_path") || "/usr/games/steamcmd";
        this.installDir = this.getSetting("install_dir") || "/root/gserver";

        if (!fs.existsSync(this.installDir)) {
            fs.mkdirSync(this.installDir, { recursive: true });
        }
    }

    private setupMaintenanceTasks() {
        setInterval(() => this.refreshSettings(), 60000);
        setInterval(() => this.updateAllPlayerCounts(), 10000);
    }

    async init() {
        await this.recoverOrphanedServers();
        console.log("[Linux-Manager] System initialized for dedicated CS2 hosting.");
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
            } catch (err) {}
        }
    }

    private async recoverOrphanedServers() {
        try {
            const rows = db.prepare("SELECT id, pid, status FROM servers WHERE status != 'OFFLINE'").all() as any[];
            for (const row of rows) {
                if (row.pid) {
                    try {
                        process.kill(row.pid, 0); 
                        this.runningServers.set(row.id.toString(), { pid: row.pid });
                    } catch (e) {
                        db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(row.id);
                    }
                }
            }
        } catch (err) {}
    }

    // --- Server Control ---

    async startServer(idStr: string | number, options: any, onLog?: (data: string) => void) {
        const id = idStr.toString();
        const server = this.getServerStmt.get(id) as any;
        if (!server) throw new Error("Server not found");

        const serverPath = path.join(this.installDir, id);
        const binDir = path.join(serverPath, "game/bin/linuxsteamrt64");
        const cs2Bin = path.join(binDir, "cs2");

        if (!fs.existsSync(cs2Bin)) {
            throw new Error(`CS2 binary not found at ${cs2Bin}. Run install first.`);
        }

        // FORCE LINUX ENVIRONMENT
        await this.prepareEnvironment(id, serverPath, binDir);

        const args = [
            "-dedicated",
            "-nosteamclient",
            "-port", options.port.toString(),
            "-maxplayers", (options.max_players || 64).toString(),
            "+ip", "0.0.0.0",
            "-tickrate", (options.tickrate || 128).toString(),
            "-nojoy",
            "+sv_lan", "0",
            "+hostname", options.name || server.name || "Quatrix Linux Server"
        ];

        // Map Resolution
        let mapVal = options.map || "de_dust2";
        if (!/^\d+$/.test(mapVal)) {
            const workshopMap = db.prepare("SELECT workshop_id FROM workshop_maps WHERE map_file = ? OR LOWER(name) = ?").get(mapVal, mapVal.toLowerCase()) as any;
            if (workshopMap) args.push("+host_workshop_map", workshopMap.workshop_id);
            else args.push("+map", mapVal);
        } else {
            args.push("+host_workshop_map", mapVal);
        }

        args.push("+game_type", (options.game_type ?? 0).toString());
        args.push("+game_mode", (options.game_mode ?? 1).toString());

        if (server.rcon_password) args.push("+rcon_password", server.rcon_password);
        if (server.gslt_token) args.push("+sv_setsteamaccount", server.gslt_token);
        if (server.steam_api_key) args.push("-authkey", server.steam_api_key);

        const envVars = this.getEnvironmentVariables(serverPath, binDir);

        // CLEANUP PORT FOR LINUX
        try { execSync(`fuser -k -n udp ${options.port} 2>/dev/null || true`); } catch (e) {}

        const proc = spawn(cs2Bin, args, { cwd: serverPath, env: envVars });

        // PERSISTENT LOGGING
        this.logBuffers.set(id, []);
        const logFilePath = path.join(serverPath, "game/csgo/console.log");
        try {
            if (!fs.existsSync(path.dirname(logFilePath))) fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
            fs.writeFileSync(logFilePath, `--- Quatrix Linux Log [${new Date().toISOString()}] ---\n`);
        } catch (e) {}

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
                setTimeout(() => { try { process.kill(proc.pid, "SIGKILL"); } catch {} }, 5000);
            } catch (e) {}
        }
        this.runningServers.delete(id);
        db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(id);
    }

    private setupProcessHandlers(id: string, proc: any, onLog?: (data: string) => void) {
        const serverPath = path.join(this.installDir, id);
        const logFilePath = path.join(serverPath, "game/csgo/console.log");

        const appendToLogFile = (line: string) => { fs.appendFile(logFilePath, line + "\n", () => {}); };

        proc.stdout?.on("data", (data: any) => {
            data.toString().split("\n").forEach((line: string) => {
                const trimmed = line.trim();
                if (trimmed && !LOG_NOISE_PATTERNS.some(p => p.test(trimmed))) {
                    if (onLog) onLog(trimmed);
                    appendToLogFile(trimmed);
                    let buf = this.logBuffers.get(id) || [];
                    buf.push(trimmed);
                    if (buf.length > 500) buf.shift();
                    this.logBuffers.set(id, buf);
                }
            });
        });

        proc.stderr?.on("data", (data: any) => {
            const line = `[STDERR] ${data.toString()}`;
            if (onLog) onLog(line);
            appendToLogFile(line);
        });

        proc.on("exit", () => {
            this.runningServers.delete(id);
            db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(id);
        });
    }

    // --- Core Logic ---

    async sendCommand(idStr: string | number, command: string): Promise<string> {
        const server = this.getServerStmt.get(idStr.toString()) as any;
        const { Rcon } = await import("rcon-client");
        const rcon = new Rcon({ host: "127.0.0.1", port: server.port, password: server.rcon_password, timeout: 5000 });
        await rcon.connect();
        const response = await rcon.send(command);
        rcon.end();
        return response;
    }

    async getPlayers(id: string | number): Promise<{ players: any[]; averagePing: number }> {
        try {
            const res = await this.sendCommand(id, "status");
            const players: any[] = [];
            res.split("\n").forEach(line => {
                if (line.includes("#") && (line.includes("BOT") || line.includes("STEAM_"))) {
                    players.push({ name: "Player", ping: line.match(/ping\s+(\d+)/)?.[1] || 0 });
                }
            });
            return { players, averagePing: 0 };
        } catch { return { players: [], averagePing: 0 }; }
    }

    private async prepareEnvironment(id: string, serverPath: string, binDir: string) {
        const steamClientSrc = await this.findSteamClientLib();
        if (!steamClientSrc) throw new Error("steamclient.so missing. Please ensure SteamCMD is installed correctly.");

        const targets = [
            binDir,
            path.join(binDir, 'steam'),
            path.join(serverPath, '.steam/sdk64')
        ];

        targets.forEach(t => {
            if (!fs.existsSync(t)) fs.mkdirSync(t, { recursive: true });
            const dest = path.join(t, 'steamclient.so');
            fs.copyFileSync(steamClientSrc, dest);
            fs.chmodSync(dest, 0o755);
        });

        // Metamod VDF
        const vdfPath = path.join(serverPath, "game/csgo/addons/metamod.vdf");
        if (fs.existsSync(path.join(serverPath, "game/csgo/addons/metamod"))) {
            fs.writeFileSync(vdfPath, `"Plugin"\n{\n\t"file"\t"addons/metamod/bin/linuxsteamrt64/metamod"\n}\n`);
        }
    }

    private async findSteamClientLib(): Promise<string> {
        const baseDir = fs.existsSync(this.steamCmdExe) && fs.statSync(this.steamCmdExe).isDirectory() 
            ? this.steamCmdExe 
            : path.dirname(this.steamCmdExe);

        const paths = [
            baseDir,
            path.join(baseDir, "linux64"),
            path.join(baseDir, "linux32"),
            path.join(__dirname, "../data/steamcmd/linux64"),
            "/usr/games/steamcmd/linux64"
        ];
        for (const p of paths) {
            const file = path.join(p, 'steamclient.so');
            if (fs.existsSync(file)) return file;
        }
        return "";
    }

    private getEnvironmentVariables(serverPath: string, binDir: string): any {
        const baseDir = fs.existsSync(this.steamCmdExe) && fs.statSync(this.steamCmdExe).isDirectory() 
            ? this.steamCmdExe 
            : path.dirname(this.steamCmdExe);
        const steamLib64 = path.join(baseDir, "linux64");
        const env: any = {
            ...process.env,
            HOME: serverPath,
            USER: "root",
            LD_LIBRARY_PATH: `${binDir}:${path.join(binDir, 'steam')}:${steamLib64}:${process.env.LD_LIBRARY_PATH || ''}`,
            DOTNET_ROOT: path.join(serverPath, "game/csgo/addons/counterstrikesharp/dotnet"),
            DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: "1",
            SDL_VIDEODRIVER: "offscreen",
            SteamAppId: "730"
        };

        const preloads = [path.join(serverPath, ".steam/sdk64/steamclient.so"), "/usr/lib/x86_64-linux-gnu/libtcmalloc_minimal.so.4"];
        env.LD_PRELOAD = preloads.filter(p => fs.existsSync(p)).join(":");
        return env;
    }

    // --- API Methods ---

    async installOrUpdateServer(idStr: string | number, onLog: (data: string) => void) {
        const id = idStr.toString();
        const serverPath = path.join(this.installDir, id);
        if (!fs.existsSync(serverPath)) fs.mkdirSync(serverPath, { recursive: true });

        // Kill existing installation for this instance if any
        await this.stopInstallation(id);

        let exe = this.steamCmdExe;
        if (fs.existsSync(exe) && fs.statSync(exe).isDirectory()) {
            const found = ['steamcmd.sh', 'steamcmd', 'linux32/steamcmd'].map(n => path.join(exe, n)).find(p => fs.existsSync(p));
            if (found) exe = found;
        }

        execSync(`chmod +x "${exe}"`);

        // Check for corruption and offer to clear bad files
        const pakPath = path.join(serverPath, "game/csgo/pak01.vpk");
        if (fs.existsSync(pakPath)) {
            onLog("[INSTALL] Existing installation found. Validating files...\n");
        }

        const args = [
            "+login", "anonymous", 
            "+force_install_dir", serverPath, 
            "+@sSteamCmdForcePlatformType", "linux", 
            "+app_update", "730", "validate", 
            "+quit"
        ];

        onLog(`[INSTALL] Running SteamCMD validation for App 730...\n`);

        return new Promise<void>((resolve, reject) => {
            const proc = spawn(exe, args);
            this.installingServers.set(id, proc);
            
            proc.stdout?.on("data", (d) => onLog(d.toString()));
            proc.stderr?.on("data", (d) => onLog(`[ERR] ${d.toString()}`));
            proc.on("exit", (c) => {
                this.installingServers.delete(id);
                if (c === 0) {
                    onLog("\n[INSTALL] Successfully completed and validated!\n");
                    resolve();
                } else {
                    onLog(`\n[INSTALL] SteamCMD exited with code ${c}. If you see 0x602/0x212, try again.\n`);
                    reject(new Error(`Exit ${c}`));
                }
            });
        });
    }

    async stopInstallation(idStr: string | number) {
        const id = idStr.toString();
        const proc = this.installingServers.get(id);
        if (proc) {
            try {
                proc.kill("SIGKILL");
                console.log(`[INSTALL] Force stopped installation for instance ${id}`);
            } catch (e) {}
            this.installingServers.delete(id);
        }
    }

    async getSystemHealth() {
        return { success: true, status: "HEALTHY", details: { platform: "linux", installPath: this.installDir } };
    }

    async cleanupGarbage() {
        // Linux specific: find and remove core dumps
        try { execSync(`find ${this.installDir} -name "core.*" -delete`); } catch {}
        return { success: true };
    }

    async getPluginStatus(id: string | number) { return pluginManager.getPluginStatus(this.installDir, id); }
    async installPlugin(id: string | number, pId: PluginId) { return pluginManager.installPlugin(this.installDir, id, pId); }
    async uninstallPlugin(id: string | number, pId: PluginId) { return pluginManager.uninstallPlugin(this.installDir, id, pId); }
    async getPluginRegistry() { return pluginRegistry; }
    getLogs(id: string | number) { return this.logBuffers.get(id.toString()) || []; }
    async ensureSteamCMD() { return fs.existsSync(this.steamCmdExe); }
    getSteamCmdDir() { return this.steamCmdExe; }
    isServerRunning(id: string | number) { return this.runningServers.has(id.toString()); }
    
    // --- Security ---
    private _securePath(id: string | number, userPath: string) {
        const base = path.join(this.installDir, id.toString());
        const full = path.resolve(base, userPath);
        if (!full.startsWith(path.resolve(base))) throw new Error("Forbidden");
        return full;
    }
    async listFiles(id: string | number, dir = "") {
        const entries = await fs.promises.readdir(this._securePath(id, dir), { withFileTypes: true });
        return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
    }
    async readFile(id: string | number, f: string) { return fs.promises.readFile(this._securePath(id, f), "utf-8"); }
    async writeFile(id: string | number, f: string, c: string) { await fs.promises.writeFile(this._securePath(id, f), c); }
}

export const serverManager = new ServerManager();
(async () => { try { await serverManager.init(); } catch (e) {} })();
