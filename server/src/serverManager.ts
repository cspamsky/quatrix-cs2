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
  private io: any = null; // Socket.IO instance for real-time updates

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

  // Method to inject Socket.IO instance
  setSocketIO(socketIO: any) {
    this.io = socketIO;
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

    // --- Advanced Linux Stability Fixes (Automated Symlinking) ---
    const binDir = path.join(serverPath, 'game/bin/linuxsteamrt64');
    const steamSubDir = path.join(binDir, 'steam');
    
    // Attempt to find steamclient.so in multiple potential locations
    const potentialSteamCmdDirs = [
        path.dirname(this.getSteamCmdDir()),
        path.join(__dirname, "../data/steamcmd"),
        "/root/quatrix/server/data/steamcmd",
        "/root/.steam/sdk64"
    ];

    let steamClientSrc = "";
    for (const dir of potentialSteamCmdDirs) {
        const testPath = path.join(dir, 'linux64/steamclient.so');
        const testPathDirect = path.join(dir, 'steamclient.so');
        if (fs.existsSync(testPath)) { steamClientSrc = testPath; break; }
        if (fs.existsSync(testPathDirect)) { steamClientSrc = testPathDirect; break; }
    }

    if (process.platform === 'linux' && steamClientSrc) {
      try {
        if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
        if (!fs.existsSync(steamSubDir)) fs.mkdirSync(steamSubDir, { recursive: true });

        // Copy instead of Symlink (Safer for some Linux distros)
        const dest1 = path.join(binDir, 'steamclient.so');
        const dest2 = path.join(steamSubDir, 'steamclient.so');
        
        fs.copyFileSync(steamClientSrc, dest1);
        fs.copyFileSync(steamClientSrc, dest2);
        
        console.log(`[SYSTEM] Steam API files updated for instance ${id}`);
      } catch (e) { 
        console.warn(`[SYSTEM] Steam API update failed: ${e}`); 
      }
    }

    // Command line arguments (Minimalist for Linux Stability)
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

    console.log(`[STARTUP] ${id}: ${args.join(' ')}`);

    const cssDotnetDir = path.join(serverPath, "game/csgo/addons/counterstrikesharp/dotnet");

    const envVars: any = { 
        ...process.env,
        HOME: "/root",
        USER: "root",
        // Precise library path: prioritize game binaries and Steam API
        LD_LIBRARY_PATH: `${binDir}:${steamSubDir}:${path.dirname(steamClientSrc)}:${process.env.LD_LIBRARY_PATH || ''}`,
        // CSS / .NET Stability settings
        DOTNET_ROOT: cssDotnetDir,
        DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: "1",
        DOTNET_BUNDLE_EXTRACT_BASE_DIR: path.join(serverPath, ".net_cache"),
        DOTNET_GENERATE_ASPNET_ROOT: "0",
        SDL_VIDEODRIVER: "offscreen",
        SteamAppId: "730"
    };

    // Preload tcmalloc if available (Fixes most SIGSEGV on Linux)
    const tcmalloc = "/usr/lib/x86_64-linux-gnu/libtcmalloc_minimal.so.4";
    if (fs.existsSync(tcmalloc)) envVars.LD_PRELOAD = tcmalloc;

    // Ensure metamod.vdf exists for plugin loading
    const gameInfoPath = path.join(serverPath, "game/csgo/gameinfo.gi");
    const metamodVdfPath = path.join(serverPath, "game/csgo/addons/metamod.vdf");
    
    if (fs.existsSync(path.join(serverPath, "game/csgo/addons/metamod")) && !fs.existsSync(metamodVdfPath)) {
      const vdfContent = `"Plugin"\n{\n\t"file"\t"../csgo/addons/metamod/bin/linuxsteamrt64/metamod"\n}\n`;
      try {
        fs.writeFileSync(metamodVdfPath, vdfContent);
        console.log(`[SYSTEM] Created metamod.vdf for instance ${id}`);
      } catch (e) {
        console.warn(`[SYSTEM] Failed to create metamod.vdf: ${e}`);
      }
    }

    // Use cs2.sh wrapper script (required for proper environment setup)
    const cs2Script = path.join(serverPath, "game/cs2.sh");
    
    const proc = spawn(cs2Script, args, {
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
    retries = 2,
  ): Promise<string> {
    const idStr = id.toString();
    const server = this.getServerStmt.get(idStr) as any;
    if (!server) throw new Error("Server not found");

    const { Rcon } = await import("rcon-client");
    let rcon = this.rconConnections.get(idStr);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (!rcon || !rcon.authenticated) {
          // Try 127.0.0.1 first, then public IP if available
          const host = "127.0.0.1";
          
          rcon = new Rcon({
            host,
            port: server.port,
            password: server.rcon_password,
            timeout: 15000, // CS2 can be slow
          });

          rcon.on("error", (err: any) => {
            if (attempt === retries) console.warn(`[RCON] Error for server ${idStr}:`, err.message);
            this.rconConnections.delete(idStr);
          });

          await rcon.connect();
          this.rconConnections.set(idStr, rcon);
        }

        return await rcon.send(command);
      } catch (error: any) {
        this.rconConnections.delete(idStr);
        rcon = undefined;
        if (attempt === retries) {
            console.error(`[RCON] Failed to reach server ${idStr} on port ${server.port}:`, error.message);
            throw new Error(`RCON Connection Refused`);
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    throw new Error("RCON unreachable");
  }

  async getCurrentMap(id: string | number): Promise<string | null> {
    try {
      const res = await this.sendCommand(id, "status");
      
      // Improved regex to catch map names even in paths
      // Matches: "loaded spawngroup(  1)  : SV:  [1: awp_lego_2 | main lump]" 
      // OR: "loaded spawngroup(  1)  : SV:  [1: workshop/123/awp_lego_2 | main lump]"
      const spawnGroupMatch = res.match(/loaded spawngroup.*SV:.*\[\d+:\s*([^\s|\]]+)/i);
      
      let currentMap = null;
      if (spawnGroupMatch && spawnGroupMatch[1]) {
          const fullPath = spawnGroupMatch[1].trim();
          const parts = fullPath.split('/');
          currentMap = parts[parts.length - 1]; // Get 'awp_lego_2' from 'workshop/id/awp_lego_2'
      }
      
      if (!currentMap) {
        // Try old method as final fallback
        const mapMatch = res.match(/Map: "([^"]+)"/i) || res.match(/Map: ([^\s]+)/i);
        currentMap = (mapMatch && mapMatch[1]) ? mapMatch[1] : null;
      }
      
      // Check if map changed and emit real-time update
      if (currentMap) {
        const server = this.getServerStmt.get(id.toString()) as any;
        if (server && server.map !== currentMap) {
          console.log(`[MAP SYNC] Server ${id}: ${server.map} -> ${currentMap}`);
          db.prepare("UPDATE servers SET map = ? WHERE id = ?").run(currentMap, id.toString());
          if (this.io) {
            this.io.emit('server_update', { serverId: parseInt(id.toString()) });
          }
        }
      }
      
      return currentMap;
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

  async repairSystemHealth() {
    console.log(`[SYSTEM] Starting system health repair...`);
    // Basic repair logic: ensure steamcmd is active
    const steamActive = await this.ensureSteamCMD();
    
    // Ensure instances dir
    if (!fs.existsSync(this.installDir)) {
      fs.mkdirSync(this.installDir, { recursive: true });
    }

    return { 
      success: true, 
      message: "System health repair completed",
      details: { steamActive }
    };
  }
}

const serverManager = new ServerManager();
(async () => {
    try { await serverManager.init(); } catch (e) {}
})();

export { serverManager };
