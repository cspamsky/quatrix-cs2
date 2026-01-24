import { spawn, exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "./db.js";
import si from "systeminformation";
import { pluginManager } from "./services/PluginManager.js";
import type { PluginId } from "./config/plugins.js";

import { promisify } from "util";
const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerManager {
  private runningServers: Map<string, any> = new Map();
  private logBuffers: Map<string, string[]> = new Map();
  private rconConnections: Map<string, any> = new Map();
  private steamCmdExe: string;
  private installDir: string;
  private getServerStmt = db.prepare("SELECT * FROM servers WHERE id = ?");

  // Noise filter for logs
  private static isNoise(line: string): boolean {
    const noisePatterns = [
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
    return noisePatterns.some(p => p.test(line));
  }

  constructor() {
    this.steamCmdExe = this.getSetting("steamcmd_path") || "steamcmd";
    this.installDir = this.getSetting("install_dir") || path.join(__dirname, "../data/instances");
    
    // Create directories if they don't exist
    if (!fs.existsSync(this.installDir)) {
      fs.mkdirSync(this.installDir, { recursive: true });
    }

    // Refresh settings periodically
    setInterval(() => this.refreshSettings(), 60000);
    
    // Auto-update player counts
    setInterval(() => this.updateAllPlayerCounts(), 10000);
  }

  private async updateAllPlayerCounts() {
    for (const [id, proc] of this.runningServers.entries()) {
      try {
        const { players } = await this.getPlayers(id);
        db.prepare("UPDATE servers SET current_players = ? WHERE id = ?").run(players.length, id);
      } catch (e) {
        // Silently fail, server might be starting
      }
    }
  }

  async init() {
    await this.recoverOrphanedServers();
  }

  private refreshSettings() {
    this.steamCmdExe = this.getSetting("steamcmd_path") || "steamcmd";
    this.installDir = this.getSetting("install_dir") || path.join(__dirname, "../data/instances");
  }

  getSetting(key: string): string {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
    return row ? row.value : "";
  }

  // --- Core Management ---
  
  async recoverOrphanedServers() {
    interface ServerRow { id: number; pid: number | null; status: string; }
    const rows = db.prepare("SELECT id, pid, status FROM servers WHERE status != 'OFFLINE'").all() as ServerRow[];
    
    for (const row of rows) {
      if (row.pid) {
        try {
          process.kill(row.pid, 0); 
          console.log(`[ServerManager] Recovered running server ${row.id} (PID: ${row.pid})`);
          this.runningServers.set(row.id.toString(), { pid: row.pid });
        } catch (e) {
          console.log(`[ServerManager] Cleaning up dead server record ${row.id}`);
          db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(row.id);
        }
      } else {
         db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(row.id);
      }
    }
  }

  async flushPlayerIdentities() {
    // Flush identities to db if needed
  }

  async startServer(
    instanceId: string | number,
    options: any,
    onLog?: (data: string) => void,
  ) {
    const id = instanceId.toString();
    if (this.runningServers.has(id)) throw new Error("Server already running");

    const server = this.getServerStmt.get(id) as any;
    const serverPath = path.join(this.installDir, id);
    const cs2Exe = path.join(serverPath, "game/bin/linuxsteamrt64/cs2");

    if (process.platform === 'linux' && !fs.existsSync(cs2Exe)) {
        throw new Error(`CS2 binary not found at ${cs2Exe}`);
    }

    // --- Linux Stability Fixes ---
    const binDir = path.join(serverPath, 'game/bin/linuxsteamrt64');
    const steamCmdDir = path.dirname(this.getSteamCmdDir());
    const steamClientSrc = path.join(steamCmdDir, 'linux64/steamclient.so');
    const steamClientDest = path.join(binDir, 'steamclient.so');

    if (process.platform === 'linux' && fs.existsSync(steamClientSrc)) {
      try {
        if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
        if (fs.existsSync(steamClientDest)) fs.unlinkSync(steamClientDest);
        fs.symlinkSync(steamClientSrc, steamClientDest);
        console.log(`[SYSTEM] Linked steamclient.so for ${id}`);
      } catch (e) { console.warn(`[SYSTEM] Link failed: ${e}`); }
    }

    // Config Generation
    const cfgDir = path.join(serverPath, "game/csgo/cfg");
    if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });
    
    const serverCfgPath = path.join(cfgDir, "server.cfg");
    const cfgContent = `hostname "${options.name || 'CS2 Server'}"\nrcon_password "${server.rcon_password || ''}"\nsv_cheats 0\n`;
    await fs.promises.writeFile(serverCfgPath, cfgContent);

    // Command line arguments (standard SRCDS order)
    const args = [
      "-dedicated",
      "-port", options.port.toString(),
      "-maxplayers", (options.max_players || 64).toString(),
      "+ip", (this.getSetting("server_ip") || "0.0.0.0"),
      server.tickrate ? `-tickrate ${server.tickrate}` : "-tickrate 128",
      "+map", options.map || "de_dust2",
      "+game_type", (options.game_type ?? 0).toString(),
      "+game_mode", (options.game_mode ?? 1).toString(),
    ];

    if (options.vac_enabled) {
      args.push("+sv_lan", "0");
    } else {
      args.push("-insecure", "+sv_lan", "1");
    }

    if (server.rcon_password) args.push("+rcon_password", server.rcon_password);
    if (server.gslt_token) args.push("+sv_setsteamaccount", server.gslt_token);
    if (server.steam_api_key) args.push("-authkey", server.steam_api_key);
    if (server.name) args.push("+hostname", server.name);

    console.log(`[STARTUP] ${id}: ${args.join(' ')}`);

    // --- Advanced Linux Environment for Stability ---
    const envVars: any = { 
        ...process.env,
        LD_LIBRARY_PATH: `${binDir}:${process.env.LD_LIBRARY_PATH || ''}`,
        // Preload tcmalloc for memory stability (Valve Recommendation)
        LD_PRELOAD: "/usr/lib/x86_64-linux-gnu/libtcmalloc_minimal.so.4",
        // CSS / .NET Stability
        DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: "1",
        SDL_VIDEODRIVER: "offscreen",
        SteamAppId: "730"
    };

    const proc = spawn(path.join(serverPath, "game/cs2.sh"), args, {
      cwd: serverPath,
      env: envVars,
    });

    this.runningServers.set(id, proc);
    db.prepare("UPDATE servers SET pid = ?, status = 'ONLINE' WHERE id = ?").run(proc.pid, id);

    proc.stdout?.on("data", (data) => {
      const line = data.toString();
      if (!ServerManager.isNoise(line)) {
        if (onLog) onLog(line);
      }
    });

    proc.stderr?.on("data", (data) => {
      const line = data.toString();
      if (onLog) onLog(`[STDERR] ${line}`);
    });

    proc.on("exit", (code, signal) => {
      console.log(`[SERVER] Instance ${id} exited with code ${code} and signal ${signal}`);
      this.runningServers.delete(id);
      db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(id);
    });
  }

  async stopServer(id: string | number) {
    const idStr = id.toString();
    const proc = this.runningServers.get(idStr);
    
    if (proc && proc.pid) {
      try {
        process.kill(proc.pid, "SIGTERM");
        // Force kill if not closed in 5s
        setTimeout(() => {
          try { process.kill(proc.pid, "SIGKILL"); } catch (e) {}
        }, 5000);
      } catch (e) {}
    } else {
        // Fallback for recovered servers
        const server = db.prepare("SELECT pid FROM servers WHERE id = ?").get(idStr) as any;
        if (server?.pid) {
            try { process.kill(server.pid, "SIGTERM"); } catch(e) {}
        }
    }

    this.runningServers.delete(idStr);
    db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL, current_players = 0 WHERE id = ?").run(idStr);
    this.rconConnections.delete(idStr);
  }

  async sendCommand(
    id: string | number,
    command: string,
    retries = 3,
  ): Promise<string> {
    const idStr = id.toString();
    const server = this.getServerStmt.get(idStr) as any;
    if (!server) throw new Error("Server not found in database");

    const { Rcon } = await import("rcon-client");
    let rcon = this.rconConnections.get(idStr);

    const rconPort = server.port;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (!rcon) {
          rcon = await Rcon.connect({
            host: "127.0.0.1",
            port: rconPort,
            password: server.rcon_password,
            timeout: 3000,
          });
          rcon.on("error", () => this.rconConnections.delete(idStr));
          rcon.on("end", () => this.rconConnections.delete(idStr));
          this.rconConnections.set(idStr, rcon);
        }
        return await rcon.send(command);
      } catch (error) {
        this.rconConnections.delete(idStr);
        rcon = undefined;
        if (attempt === retries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    throw new Error("RCON connection failed");
  }

  async getCurrentMap(id: string | number): Promise<string | null> {
    try {
      const res = await this.sendCommand(id, "host_map");
      const match = res.match(/Map: "([^"]+)"/i) || res.match(/Map: ([^\s]+)/i);
      return (match && match[1]) ? match[1] : null;
    } catch (e) { return null; }
  }

  async getPlayers(id: string | number): Promise<{ players: any[]; averagePing: number }> {
    try {
      const res = await this.sendCommand(id, "status");
      const players: any[] = [];
      const lines = res.split("\n");
      // Basic CS2 status parser
      for (const line of lines) {
          if (line.includes("#") && line.includes("BOT")) {
              players.push({ name: "[BOT]", ping: 0 });
          } else if (line.includes("#") && line.includes("STEAM_")) {
              players.push({ name: "Player", ping: 10 });
          }
      }
      return { players, averagePing: 0 };
    } catch (e) { return { players: [], averagePing: 0 }; }
  }

  // --- File Management ---
  private _resolveSecurePath(id: string | number, userPath: string): string {
    const instanceDir = path.join(this.installDir, id.toString());
    const fullPath = path.resolve(instanceDir, userPath);
    if (!fullPath.startsWith(path.resolve(instanceDir))) {
      throw new Error("Access denied: Path outside instance directory");
    }
    return fullPath;
  }

  async listFiles(id: string | number, subDir: string = "") {
    const fullPath = this._resolveSecurePath(id, subDir);
    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      size: 0,
      mtime: new Date()
    }));
  }

  async readFile(id: string | number, filePath: string) {
    const fullPath = this._resolveSecurePath(id, filePath);
    return fs.promises.readFile(fullPath, "utf-8");
  }

  async writeFile(id: string | number, filePath: string, content: string) {
    const fullPath = this._resolveSecurePath(id, filePath);
    await fs.promises.writeFile(fullPath, content);
  }

  async deleteFile(id: string | number, filePath: string) {
    const fullPath = this._resolveSecurePath(id, filePath);
    await fs.promises.rm(fullPath, { recursive: true, force: true });
  }

  async createDirectory(id: string | number, dirPath: string) {
    const fullPath = this._resolveSecurePath(id, dirPath);
    await fs.promises.mkdir(fullPath, { recursive: true });
  }

  async renameFile(id: string | number, oldPath: string, newPath: string) {
    const oldFullPath = this._resolveSecurePath(id, oldPath);
    const newFullPath = this._resolveSecurePath(id, newPath);
    await fs.promises.rename(oldFullPath, newFullPath);
  }

  getFilePath(id: string | number, filePath: string) {
    return this._resolveSecurePath(id, filePath);
  }

  async deleteServerFiles(id: string | number) {
    const serverPath = path.join(this.installDir, id.toString());
    if (fs.existsSync(serverPath)) {
      await fs.promises.rm(serverPath, { recursive: true, force: true });
    }
  }

  isServerRunning(id: string | number) {
    return this.runningServers.has(id.toString());
  }

  getLogs(id: string | number) {
    return this.logBuffers.get(id.toString()) || [];
  }

  getInstallDir() { return this.installDir; }
  getSteamCmdDir() { return this.steamCmdExe; }

  // --- Plugin Management Wrappers ---
  getPluginRegistry() { return pluginManager.getRegistry(); }

  async getPluginStatus(instanceId: string | number) {
    return pluginManager.getPluginStatus(this.installDir, instanceId);
  }

  async checkPluginUpdate(instanceId: string | number, pluginId: PluginId) {
     return pluginManager.checkPluginUpdate(instanceId, pluginId);
  }

  async checkAllPluginUpdates(instanceId: string | number) {
    return pluginManager.checkAllPluginUpdates(instanceId);
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

  // --- System Health ---
  async ensureSteamCMD(): Promise<boolean> {
    const steamcmdDir = path.dirname(this.steamCmdExe);
    if (!fs.existsSync(steamcmdDir)) {
      try {
        fs.mkdirSync(steamcmdDir, { recursive: true });
      } catch (e) { return false; }
    }
    return fs.existsSync(this.steamCmdExe);
  }

  async installOrUpdateServer(id: string | number, onLog: (data: string) => void) {
    const serverPath = path.join(this.installDir, id.toString());
    if (!fs.existsSync(serverPath)) fs.mkdirSync(serverPath, { recursive: true });

    onLog(`[INSTALL] Starting installation for server ${id}...\n`);
    
    // Example steamcmd command
    const cmd = `${this.steamCmdExe} +force_install_dir ${serverPath} +login anonymous +app_update 730 validate +quit`;
    
    return new Promise<void>((resolve, reject) => {
        const proc = exec(cmd);
        proc.stdout?.on("data", (data) => onLog(data.toString()));
        proc.stderr?.on("data", (data) => onLog(`[STDERR] ${data.toString()}`));
        proc.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`SteamCMD exited with code ${code}`));
        });
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
           // Skip sensitive directories
          if (entry.name === 'addons' || entry.name === 'configs' || entry.name === 'counterstrikesharp') continue;
          
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
      } catch (e) {}
    };

    await cleanDir(this.installDir);
    return { success: true, clearedFiles, clearedBytes };
  }
}

const serverManager = new ServerManager();
(async () => {
    try { await serverManager.init(); } catch (e) {}
})();

export { serverManager };
