import { exec, spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "./db.js";
import si from "systeminformation";
import { pluginManager } from "./services/PluginManager.js";
import { steamManager } from "./services/SteamManager.js";
import { fileSystemService } from "./services/FileSystemService.js";
import { lockService } from "./services/LockService.js";
import { runtimeService } from "./services/RuntimeService.js";
import { taskService } from "./services/TaskService.js";
import type { PluginId } from "./config/plugins.js";
import { emitDashboardStats } from "./index.js";

import { promisify } from "util";
const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerManager {
  private rconConnections: Map<string, any> = new Map();
  private playerIdentityCache: Map<string, Map<string, string>> = new Map();
  private playerIdentityBuffer: Map<string, string> = new Map();
  private installDir!: string; // Maintained for backward compat in paths, but backed by FileSystem
  private lastInstallDir: string = "";
  private lastSteamCmdPath: string = "";
  private steamCmdExe!: string;
  public pluginManager = pluginManager;
  private io: any = null;

  public setSocketIO(io: any) {
    console.log(`[ServerManager] Socket.IO injected`);
    this.io = io;
  }

  // Prepared statements
  private flushCheckStmt = db.prepare("SELECT steam_id FROM player_identities WHERE name = ?");
  private flushUpdateStmt = db.prepare("UPDATE player_identities SET steam_id = ?, last_seen = CURRENT_TIMESTAMP WHERE name = ?");
  private flushInsertStmt = db.prepare("INSERT INTO player_identities (name, steam_id, first_seen, last_seen) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
  private getSettingStmt = db.prepare("SELECT value FROM settings WHERE key = ?");
  private updateStatusStmt = db.prepare("UPDATE servers SET status = ?, pid = ? WHERE id = ?");
  private getServerStmt = db.prepare("SELECT * FROM servers WHERE id = ?");
  private getOrphanedStmt = db.prepare("SELECT id, pid, status FROM servers WHERE status != 'OFFLINE'");
  private updatePlayerCountStmt = db.prepare("UPDATE servers SET current_players = ? WHERE id = ?");
  private updateMapStmt = db.prepare("UPDATE servers SET map = ? WHERE id = ?");
  private chatInsertStmt = db.prepare(`
    INSERT INTO chat_logs (server_id, player_name, steam_id, message, type)
    VALUES (?, ?, ?, ?, ?)
  `);
  private joinLogInsertStmt = db.prepare(`
    INSERT INTO join_logs (server_id, player_name, steam_id, event_type)
    VALUES (?, ?, ?, ?)
  `);

  constructor() {
    this.installDir = "";
    this.steamCmdExe = "";
    console.log("[SYSTEM] Initializing ServerManager (Service-Based Architecture)");

    // Flush identities periodically
    setInterval(() => this.flushPlayerIdentities(), 5000);
    // Update stats from RuntimeService periodically
    setInterval(() => this.syncRuntimeStats(), 5000); // More frequent updates from memory
  }

  // --- Initialization & Settings ---

  public async init() {
    await fileSystemService.init();
    await this.refreshSettings();
    
    // Linux Pre-Flight Checks
    console.log("[SYSTEM] Running Linux Pre-flight checks...");
    await this.ensureSteamSdk();
    if (this.steamCmdExe && fs.existsSync(this.steamCmdExe)) {
        await fileSystemService.ensureExecutable(this.steamCmdExe);
    }



    // Recover Orphans via RuntimeService (PID check)
    await runtimeService.init((id, data) => this.handleLog(id, data));
    
    // Legacy cleanup just in case
    // this.recoverOrphanedServers(); // No longer needed as runtimeService handles it
  }

  public async refreshSettings() {
    const projectRoot = process.cwd();
    
    const defaultInstallDir = path.join(projectRoot, "data/instances");
    const defaultDataDir = path.join(projectRoot, "data");
    const defaultSteamCmdPath = path.join(defaultDataDir, "steamcmd", "steamcmd.sh");

    const newInstallDir = this.getSetting("install_dir") || defaultInstallDir;
    const newSteamCmdPath = this.getSetting("install_dir") ? this.getSetting("steamcmd_path") : defaultSteamCmdPath;

    this.installDir = newInstallDir;
    this.lastInstallDir = newInstallDir;
    this.lastSteamCmdPath = newSteamCmdPath;

    // Update FileSystem Service Base
    const baseDir = path.dirname(newInstallDir); 
    fileSystemService.setBaseDir(baseDir);

    if (newSteamCmdPath) {
      if (newSteamCmdPath.endsWith(".sh")) {
        this.steamCmdExe = newSteamCmdPath;
      } else {
        this.steamCmdExe = path.join(newSteamCmdPath, "steamcmd.sh");
      }
    } else {
        // Fallback
        const steamCmdDir = path.join(projectRoot, "data/steamcmd");
        this.steamCmdExe = path.join(steamCmdDir, "steamcmd.sh");
    }

    try {
      await fs.promises.mkdir(this.installDir, { recursive: true });
    } catch (error: any) {
        if (error.code !== "EEXIST") throw error;
    }

    // Double check SDK on settings refresh
    try {
        await this.ensureSteamSdk();
    } catch {}
  }

  private async ensureSteamSdk() {
    // CS2 on Linux requires steamclient.so in ~/.steam/sdk64/
    const homeDir = process.env.HOME || "/home/quatrix";
    const sdkDir = path.join(homeDir, ".steam", "sdk64");
    const targetSo = path.join(sdkDir, "steamclient.so");

    if (!fs.existsSync(targetSo)) {
        console.log("[SYSTEM] Steam SDK link missing, creating...");
        // Use path.dirname(this.steamCmdExe) to get the actual steamcmd directory
        const steamCmdDir = this.steamCmdExe ? path.dirname(this.steamCmdExe) : path.join(process.cwd(), "data", "steamcmd");
        const sourceSo = path.join(steamCmdDir, "linux64", "steamclient.so");

        if (fs.existsSync(sourceSo)) {
            try {
                if (!fs.existsSync(sdkDir)) {
                    fs.mkdirSync(sdkDir, { recursive: true });
                }
                // Try to symlink first
                try {
                    fs.symlinkSync(sourceSo, targetSo);
                    console.log("[SYSTEM] Created Steam SDK symlink.");
                } catch {
                    // Fallback to copy if symlink fails
                    fs.copyFileSync(sourceSo, targetSo);
                    console.log("[SYSTEM] Copied Steam SDK binary.");
                }
            } catch (err: any) {
                console.error("[SYSTEM] Error providing Steam SDK:", err.message);
            }
        } else {
            console.warn("[SYSTEM] Could not find source steamclient.so in data/steamcmd. Skipping SDK link.");
        }
    }
  }

  private getSetting(key: string): string {
    const row = this.getSettingStmt.get(key) as { value: string };
    return row ? row.value : "";
  }

  // --- Runtime Management Delegated to RuntimeService ---

  public async startServer(instanceId: string | number, options: any, onLog?: (data: string) => void) {
    const id = instanceId.toString();
    console.log(`[SERVER] Request to start instance ${id}`);

    const server = this.getServerStmt.get(id) as any;
    if (!server) throw new Error(`Server instance ${id} not found.`);

    let dbOptions = JSON.parse(server.settings || "{}");
    const mergedOptions = { ...server, ...dbOptions, ...options }; // Combine DB cols, DB settings, and runtime options

    // Feature Parity: Validate Files
    if (mergedOptions.validate_files) {
        console.log(`[SERVER] Validation requested for server ${id}. Running SteamCMD verify...`);
        try {
            // We use 730 (CS2 App ID)
            await this.validateServerFiles(id, "730"); 
        } catch (e: any) {
            console.error(`[SERVER] Validation failed for ${id}, aborting start:`, e.message || e);
            throw new Error(`Validation failed: ${e.message || "Unknown error"}`);
        }
    }

    // 1. Config Generation (Server.cfg)
    // We treat this as "Pre-Flight" preparation
    const serverPath = fileSystemService.getInstancePath(id);
    const cfgDir = path.join(serverPath, "game", "csgo", "cfg"); // Should exist from prepareInstance
    await fs.promises.mkdir(cfgDir, { recursive: true });

    const serverCfgPath = path.join(cfgDir, "server.cfg");
    let cfgContent = "";
    try {
        cfgContent = await fs.promises.readFile(serverCfgPath, "utf8");
    } catch {}

    const updateLine = (c: string, k: string, v: string) => {
       const r = new RegExp(`^${k}\\s+.*$`, "m");
       return r.test(c) ? c.replace(r, `${k} "${v}"`) : c + `\n${k} "${v}"`;
    };
    cfgContent = updateLine(cfgContent, "sv_password", options.password || "");
    cfgContent = updateLine(cfgContent, "rcon_password", options.rcon_password || "secret");
    cfgContent = updateLine(cfgContent, "log", "on");
    cfgContent = updateLine(cfgContent, "sv_logecho", "1");
    cfgContent = updateLine(cfgContent, "sv_logfile", "1");
    cfgContent = updateLine(cfgContent, "sv_logbans", "1");
    
    // Use the region setting from database, default to 3 (Europe)
    const region = mergedOptions.region !== undefined ? mergedOptions.region : "3";
    cfgContent = updateLine(cfgContent, "sv_region", region.toString());
    await fs.promises.writeFile(serverCfgPath, cfgContent);

    // 2. Start via RuntimeService
    const originalMap = mergedOptions.map || "de_dust2";
    const isWorkshopID = (m: string) => /^\d+$/.test(m);
    
    if (isWorkshopID(originalMap)) {
        console.log(`[SERVER] Workshop bootstrap: Starting instance ${id} on de_dust2 first...`);
        // We override the map just for the startup command to ensure a clean boot
        const bootOptions = { ...mergedOptions, map: "de_dust2" };
        
        await runtimeService.startInstance(id, bootOptions, (line) => {
            this.handleLog(id, line, onLog);
        });

        // Target switch after boot (Wait for engine + Steam initialization)
        setTimeout(async () => {
            try {
                console.log(`[SERVER] Bootstrap phase complete for ${id}. Switching to target workshop map ${originalMap}...`);
                await this.sendCommand(id, `host_workshop_map ${originalMap}`, 10);
                // Note: database 'map' column already contains originalMap, so it remains persistent.
            } catch (e) {
                console.error(`[SERVER] Bootstrap switch failed for instance ${id}:`, e);
            }
        }, 20000);
    } else {
        // Normal startup for local maps
        await runtimeService.startInstance(id, mergedOptions, (line) => {
            this.handleLog(id, line, onLog);
        });
    }
  }

  public async stopServer(id: string | number) {
      const idStr = id.toString();
      // Delegate to RuntimeService
      const result = await runtimeService.stopInstance(idStr);
      
      // Cleanup RCON
      if (this.rconConnections.has(idStr)) {
          try { await this.rconConnections.get(idStr).end(); } catch {}
          this.rconConnections.delete(idStr);
      }
      
      // Database sync happens in handleLog/handleExit of RuntimeService, 
      // but we force update here to be responsive
      this.updateStatusStmt.run("OFFLINE", null, idStr);
      this.updatePlayerCountStmt.run(0, idStr);
      
      return result;
  }

  // --- Monitoring & Logs ---

  private isNoise(line: string): boolean {
      // KEEP EXISTING NOISE PATTERNS
      if (line.match(/^Loaded .*?\.so/)) return true;
      if (line.includes("dlopen failed")) return true;
      // ... (We can expand this list or keep strictly what was there)
      return false;
  }

  private handleLog(id: string, line: string, onUiLog?: (l: string) => void) {
      if (onUiLog && !this.isNoise(line)) onUiLog(line);

      // Strip potential timestamp L 02/06/2026 - 18:00:00: (more flexible version)
      // Works with both L MM/DD/YYYY and L DD/MM/YYYY
      const cleanLine = line.replace(/^L\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+-\s+\d{1,2}:\d{1,2}:\d{1,2}:\s+/, "").trim();

      if (process.env.DEBUG_LOGS) console.log(`[LOG:${id}] Processing:`, cleanLine);

      // Player Tracking logic
      const steam64Match = cleanLine.match(/steamid:(\d{17})/i);
      if (steam64Match && steam64Match[1]) {
          const steamId64 = steam64Match[1];
          const nameMatch = cleanLine.match(/['"](.+?)['"]/);
          if (nameMatch && nameMatch[1]) {
              const name = nameMatch[1];
              if (!this.playerIdentityCache.has(id))
                  this.playerIdentityCache.set(id, new Map());
              const cache = this.playerIdentityCache.get(id);
              if (cache) {
                  cache.set(`n:${name}`, steamId64);
                  this.playerIdentityBuffer.set(name, steamId64);
              }
          }
      }

      // Chat Message Tracking (Relaxed regex)
      const chatMatch = cleanLine.match(/"(.+?)<\d+><(.+?)><.*?>" (say|say_team) "(.*)"/i);
      if (chatMatch) {
          const [, name, steamId, type, message] = chatMatch;
          const steamId64 = steamId === "Console" ? "0" : steamId;
          
          try {
              this.chatInsertStmt.run(id, name, steamId64, message, type);
              
              if (this.io) {
                  this.io.emit('chat_message', {
                      serverId: id,
                      name,
                      steamId: steamId64,
                      message,
                      type,
                      timestamp: new Date().toISOString()
                  });
              }
          } catch (e) {
              console.error(`[SERVER:${id}] Failed to save chat message:`, e);
          }
      }

    // Join/Leave Tracking (Refined)
    // We prioritize "entered the game" for joins to avoid double-logging with "connected"
    const joinMatch = cleanLine.match(/"(.+?)<\d+><(.+?)><.*?>" entered the game/i);
    const leaveMatch = cleanLine.match(/"(.+?)<\d+><(.+?)><.*?>" (disconnected|left the game)/i);

    if (joinMatch || leaveMatch) {
        const match = joinMatch || leaveMatch;
        if (match && match[1] && match[2]) {
            const [, name, steamId] = match;
            
            // 🛑 EXCLUDE BOTS
            if (steamId === "BOT" || steamId.includes("BOT") || name.toUpperCase().includes("BOT")) {
                return;
            }

            const eventType = joinMatch ? 'join' : 'leave';
            const steamId64 = steamId?.startsWith("[") || steamId?.startsWith("STEAM_") ? steamId : (steamId === "Console" ? "0" : steamId);

            if (process.env.DEBUG_LOGS) console.log(`[LOG:${id}] Saving ${eventType} for ${name} (${steamId64})`);

            try {
                this.joinLogInsertStmt.run(id, name, steamId64, eventType);
                
                if (this.io) {
                    this.io.emit('player_event', {
                        serverId: id,
                        name,
                        steamId: steamId64,
                        eventType,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (e) {
                console.error(`[SERVER:${id}] Failed to save join log:`, e);
            }
        }
    }
  }

  public async flushPlayerIdentities() {
      if (this.playerIdentityBuffer.size === 0) return;
      const identities = Array.from(this.playerIdentityBuffer.entries());
      this.playerIdentityBuffer.clear();
      
      const transaction = db.transaction((data: [string, string][]) => {
          for (const [name, steamId64] of data) {
              const existing = this.flushCheckStmt.get(name);
              if (existing) this.flushUpdateStmt.run(steamId64, name);
              else this.flushInsertStmt.run(name, steamId64);
          }
      });
      try { transaction(identities); } catch (e) { console.error("Flush failed", e); }
  }

  public getLogs(id: string | number) {
      return runtimeService.getLogBuffer(id.toString());
  }

  public isServerRunning(id: string | number) {
      return runtimeService.getInstanceStatus(id.toString()) === "ONLINE" || 
             runtimeService.getInstanceStatus(id.toString()) === "STARTING";
  }

  // --- Validation ---
  private async validateServerFiles(id: string, appId: string, taskId?: string) {
      if (!this.steamCmdExe) throw new Error("SteamCMD not initialized");
      
      const instancePath = fileSystemService.getInstancePath(id);
      console.log(`[VALIDATE] Verifying files for ${id} inside ${instancePath}...`);

      // Use steamManager logic but adapted for specific instance
      // SteamManager manages the 'install' but we want to force validate on existing instance
      // We can reuse steamManager.installServer but with force=true and validate=true
      // But steamManager installs to "servers/id"?
      
      // Let's implement direct steamcmd call here for transparency and control
      const args = [
          "+force_install_dir", instancePath,
          "+login", "anonymous",
          "+app_update", appId,
          "validate",
          "+quit"
      ];
      
      return new Promise<void>((resolve, reject) => {
          const p = spawn(this.steamCmdExe, args, { cwd: path.dirname(this.steamCmdExe) });
          
          p.stdout.on("data", (d: any) => console.log(`[STEAMCMD:${id}] ${d.toString().trim()}`));
          p.stderr.on("data", (d: any) => console.error(`[STEAMCMD:${id}] ${d.toString().trim()}`));
          
          p.on("close", (code: number) => {
              if (code === 0) {
                if (taskId) taskService.completeTask(taskId, "Validation successful");
                resolve();
              } else {
                const error = `SteamCMD validation exited with code ${code}`;
                if (taskId) taskService.failTask(taskId, error);
                reject(new Error(error));
              }
          });
      });
  }

  // --- RCON & Game State ---

  public async sendCommand(id: string | number, command: string, retries = 3): Promise<string> {
    const idStr = id.toString();
    const server = this.getServerStmt.get(idStr) as any;
    if (!server) throw new Error("Server not found");

    const { Rcon } = await import("rcon-client");
    let rcon = this.rconConnections.get(idStr);
    const rconPort = server.rcon_port || server.port;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            if (!rcon) {
                console.log(`[RCON] Connecting to 127.0.0.1:${rconPort}...`);
                rcon = await Rcon.connect({
                    host: "127.0.0.1",
                    port: parseInt(rconPort.toString()),
                    password: server.rcon_password,
                    timeout: 5000
                });
                rcon.on("error", () => this.rconConnections.delete(idStr));
                rcon.on("end", () => this.rconConnections.delete(idStr));
                this.rconConnections.set(idStr, rcon);
            }
            return await rcon.send(command);
        } catch (e: any) {
            this.rconConnections.delete(idStr);
            rcon = undefined;
            if (attempt === retries) throw e;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error("RCON Failed");
  }

  public async getPlayers(id: string | number): Promise<{ players: any[]; averagePing: number }> {
      try {
          const rawOutput = await this.sendCommand(id, "css_players");
          if (process.env.DEBUG_RCON) console.log(`[RCON:${id}] css_players output:`, JSON.stringify(rawOutput));
          
          const players: any[] = [];
          // More robust split for different newline formats
          const lines = rawOutput.split(/[\r\n]+|\\\\n/);
          let totalPing = 0;

          for (const line of lines) {
              const cleanLine = line.trim();
              if (cleanLine.length < 3) continue;

              // 1. Detected SimpleAdmin format: • [#2] "Pamsky" (IP Address: "159.146.33.127" SteamID64: "76561198968591397")
              const simpleAdminMatch = cleanLine.match(/[^\w\s]*\s*\[#(\d+)\]\s+"(.+?)"\s+\(IP Address:\s*"(.+?)"\s+SteamID64:\s+"(.+?)"\)/i);
              if (simpleAdminMatch && simpleAdminMatch[2] && simpleAdminMatch[4]) {
                  const [, userId, name, ipAddress, steamId] = simpleAdminMatch;
                  
                  // Skip bots
                  if (steamId.toUpperCase() === "BOT" || name.toUpperCase().includes("BOT")) continue;

                  players.push({
                      userId,
                      name,
                      steamId,
                      ipAddress,
                      ping: 0,
                      connected: "Connected",
                      state: "Active"
                  });
                  continue;
              }

              // 2. Original parser pattern: # [userid] "name" (steamid) [ping: ms]
              const cssMatch = cleanLine.match(/#\s+(\d+)\s+"(.+?)"\s+\((.+?)\)\s+\[ping:\s+(\d+)ms\]/i);
              if (cssMatch && cssMatch[2] && cssMatch[3]) {
                  const [, userId, name, steamId, ping] = cssMatch;
                  
                  // Skip bots
                  if (steamId.toUpperCase() === "BOT" || name.toUpperCase().includes("BOT")) continue;

                  players.push({
                      userId,
                      name,
                      steamId,
                      ping: parseInt(ping || "0"),
                      connected: "Connected",
                      state: "Active"
                  });
                  totalPing += parseInt(ping || "0");
                  continue;
              }

              // 3. Try vanilla status pattern (more flexible)
              if (cleanLine.includes('#')) {
                  // Example: # 2 1 "Name" [U:1:123456] 01:23 30 0 active 127.0.0.1:27005
                  const statusMatch = cleanLine.match(/#\s+(\d+)\s+(\d+)\s+"(.+?)"\s+([\[\]\w:_\-]+)\s+[\d:]+\s+(\d+)\s+(\d+)\s+active\s+([\d\.:]+)/i);
                  if (statusMatch && statusMatch[3] && statusMatch[4]) {
                      const [, , userId, name, steamId, ping, , adr] = statusMatch;
                      
                      // Skip bots
                      if (steamId.toUpperCase() === "BOT" || name.toUpperCase().includes("BOT")) continue;

                      players.push({
                          userId,
                          name,
                          steamId,
                          ipAddress: adr ? adr.split(':')[0] : '',
                          ping: parseInt(ping || "0"),
                          connected: "Connected",
                          state: "Active"
                      });
                      totalPing += parseInt(ping || "0");
                  }
              }
          }

          if (process.env.DEBUG_RCON) console.log(`[RCON:${id}] Parsed ${players.length} players.`);

          if (players.length === 0 && rawOutput.toLowerCase().includes("unknown command")) {
              const statusOutput = await this.sendCommand(id, "status");
              // Check fallback parsing...
          }

          return { 
              players, 
              averagePing: players.length > 0 ? Math.round(totalPing / players.length) : 0 
          };
      } catch (e) {
          console.error(`[SERVER:${id}] Error in getPlayers:`, e);
          return { players: [], averagePing: 0 };
      }
  }

  public async getCurrentMap(id: string | number): Promise<string | null> {
      try {
          const res = await this.sendCommand(id, "status");
          const mapMatch = res.match(/map\s+:\s+([^\s\r\n]+)/i);
          return (mapMatch && mapMatch[1]) ? mapMatch[1] : null;
      } catch { return null; }
  }

  // --- Installation & Updates ---

  public async ensureSteamCMD(taskId?: string) {
      if (await steamManager.ensureSteamCMD(this.steamCmdExe, taskId)) return true;
      try {
          await steamManager.downloadSteamCmd(this.steamCmdExe, taskId);
          return true;
      } catch { return false; }
  }

  public async installOrUpdateServer(id: string | number, onLog?: any, taskId?: string) {
      if (!await lockService.acquireInstanceLock(id, 'UPDATE')) {
          console.warn(`[LOCK] Installation rejected for ${id}: Instance already has an active UPDATE lock.`);
          throw new Error(`Instance ${id} is locked.`);
      }

      try {
          // 1. Update Core
          if (await lockService.acquireCoreLock()) {
              console.log("[SYSTEM] Starting Core Update (Downloading CS2 base files)... This might take 10-15 minutes.");
              try {
                  await steamManager.installToPath(fileSystemService.getCorePath(), this.steamCmdExe, onLog, taskId);
                  console.log("[SYSTEM] Core Update successful.");
              } catch (e: any) {
                  console.error("[SYSTEM] Core Update failed:", e.message);
                  throw e; // Rethrow to notify caller
              } finally {
                  lockService.releaseCoreLock();
              }
          } else {
              console.log("[SYSTEM] Core Update skipped: Core is currently locked by another process.");
          }

          // 2. Prepare Instance
          console.log(`[SYSTEM] Preparing instance ${id}...`);
          await fileSystemService.prepareInstance(id);
      } finally {
          lockService.releaseInstanceLock(id);
      }
  }

  public async deleteServerFiles(id: string | number) {
      await fileSystemService.deleteInstance(id.toString());
  }

  // --- System Health ---
  public async getSystemHealth(): Promise<any> {
      try {
          const [cpuInfo, mem, disk] = await Promise.all([si.cpu(), si.mem(), si.fsSize()]);
          
          // 1. Check for AVX Support (Linux specific check)
          let hasAVX = false;
          try {
              const { stdout } = await execAsync("lscpu | grep Flags | grep -i avx");
              hasAVX = stdout.length > 0;
          } catch {
              // Fallback check in CPU flags if lscpu fails
              hasAVX = cpuInfo.flags.includes('avx') || cpuInfo.flags.includes('avx2');
          }

          // 2. Check for .NET 8 Runtime
          let dotnetStatus = 'missing';
          let dotnetVersions: string[] = [];
          try {
              const { stdout } = await execAsync("dotnet --list-runtimes");
              dotnetVersions = stdout.split('\n').filter(l => l.trim());
              if (stdout.includes("Microsoft.NETCore.App 8")) {
                  dotnetStatus = 'good';
              }
          } catch {}

          // 3. Check for Steam SDK
          const homeDir = process.env.HOME || "/home/quatrix";
          const sdkPath = path.join(homeDir, ".steam", "sdk64", "steamclient.so");
          const steamSdkStatus = fs.existsSync(sdkPath) ? 'good' : 'missing';

          // 4. Check for Steam Runtime 3.0
          const runtimePath = fileSystemService.getSteamRuntimePath();
          const runtimeStatus = fs.existsSync(path.join(runtimePath, "run")) ? 'good' : 'missing';

          // 5. Check for Unprivileged User Namespaces
          let namespacesStatus = 'unknown';
          let namespacesMessage = '';
          try {
              const { stdout } = await execAsync("sysctl kernel.unprivileged_userns_clone");
              if (stdout.includes("= 1")) {
                  namespacesStatus = 'good';
                  namespacesMessage = 'Enabled';
              } else {
                  namespacesStatus = 'warning';
                  namespacesMessage = 'Disabled';
              }
          } catch {
              namespacesStatus = 'info';
              namespacesMessage = 'Not available on this kernel';
          }

          // 6. Garbage Check (Core dumps)
          let garbageCount = 0;
          let garbageSize = 0;
          try {
              const { stdout } = await execAsync("find . -name 'core.*' -type f -exec du -b {} +");
              const lines = stdout.split('\n').filter(l => l.trim());
              garbageCount = lines.length;
              garbageSize = lines.reduce((acc, line) => acc + parseInt(line.split('\t')[0] || "0"), 0);
          } catch {}

          return {
              os: { platform: process.platform },
              cpu: { 
                  cores: cpuInfo.cores, 
                  model: cpuInfo.brand,
                  avx: hasAVX
              },
              ram: { 
                  total: mem.total, 
                  free: mem.free,
                  status: mem.total > 8 * 1024 * 1024 * 1024 ? 'good' : 'low'
              },
              disk: { 
                  total: disk[0]?.size || 0, 
                  free: disk[0]?.available || 0,
                  status: (disk[0]?.available || 0) > 40 * 1024 * 1024 * 1024 ? 'good' : 'low',
                  garbage: {
                      count: garbageCount,
                      size: garbageSize
                  }
              },
              runtimes: {
                  dotnet: {
                      status: dotnetStatus,
                      versions: dotnetVersions
                  },
                  steam_sdk: {
                      status: steamSdkStatus
                  },
                  steam_runtime: {
                      status: runtimeStatus
                  },
                  namespaces: {
                      status: namespacesStatus,
                      message: namespacesMessage
                  }
              }
          };
      } catch (error) {
          console.error("[HEALTH] Failed to get system health:", error);
          throw error;
      }
  }

  public async repairSystemHealth() {
      console.log("[HEALTH] Starting system repair...");
      try {
          // 1. Ensure Steam SDK
          await this.ensureSteamSdk();

          // 2. Ensure Steam Runtime
          const runtimePath = fileSystemService.getSteamRuntimePath();
          if (!fs.existsSync(path.join(runtimePath, "run"))) {
              console.log("[HEALTH] Steam Runtime missing or incomplete. Starting installation...");
              await steamManager.installSteamRuntime(runtimePath, this.steamCmdExe);
          }

          // 3. Clean Garbage (Core Dumps)
          try {
              await execAsync("find . -name 'core.*' -type f -delete");
              console.log("[HEALTH] Cleaned core dumps.");
          } catch (e) {
              console.warn("[HEALTH] Failed to clean core dumps:", e);
          }

          // 4. Fix permissions and sync .so files on instances
          const servers = db.prepare("SELECT id FROM servers").all() as { id: number }[];
          for (const server of servers) {
              try {
                  const binPath = path.join(this.installDir, server.id.toString(), "game", "bin", "linuxsteamrt64", "cs2");
                  if (fs.existsSync(binPath)) {
                      await fs.promises.chmod(binPath, 0o755);
                  }
                  // Force sync .so files
                  await fileSystemService.ensureSoFiles(server.id);
              } catch (err) {
                  console.warn(`[HEALTH] Failed to repair instance ${server.id}:`, err);
              }
          }

          return { success: true, message: "System repaired successfully. Steam SDK linked, Steam Runtime installed, and instances synchronized." };
      } catch (error: any) {
          console.error("[HEALTH] Repair failed:", error);
          return { success: false, message: error.message };
      }
  }

  // --- Orphan Recovery ---
  async recoverOrphanedServers() {
      // We can iterate DB and check if PIDs are alive?
      // Since RuntimeService is new, it has empty state on restart.
      // So we assume all previous servers are dead if the Node process restarted.
      // We just clean up the DB.
      db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE status != 'OFFLINE'").run();
  }

  // --- Periodic Sync ---
  private async syncRuntimeStats() {
      // Sync DB state with RuntimeService state if needed?
      // RuntimeService updates DB on start/exit, so maybe just player counts.
      this.updateAllPlayerCounts();
  }

  private async updateAllPlayerCounts() {
      const runningIds = db.prepare("SELECT id FROM servers WHERE status = 'ONLINE'").all() as {id: number}[];
      for (const {id} of runningIds) {
          try {
              const { players } = await this.getPlayers(id);
              this.updatePlayerCountStmt.run(players.length, id);
              
              const map = await this.getCurrentMap(id);
              if (map) this.updateMapStmt.run(map, id);

              // Periodic Enforcement for Log capture (Syncing game state with Panel needs)
              if (Math.random() < 0.3) {
                  this.sendCommand(id, "log on").catch(() => {});
                  this.sendCommand(id, "sv_logecho 1").catch(() => {});
                  this.sendCommand(id, "sv_logfile 1").catch(() => {});
                  this.sendCommand(id, "sv_logbans 1").catch(() => {});
              }
          } catch {}
      }
      emitDashboardStats(); // Trigger dashboard update after polling all servers
  }
  
  // --- Plugin Management Wrappers ---
  getInstallDir() { return this.installDir; }
  getSteamCmdDir() { return path.dirname(this.steamCmdExe); }
  getCoreDir() { return fileSystemService.getCorePath(); }

  async getPluginRegistry() { return pluginManager.getRegistry(); }
  async getPluginStatus(id: string | number) { return pluginManager.getPluginStatus(this.installDir, id); } // installDir is now used for legacy/plugin compat
  async checkPluginUpdate(id: string | number, pid: PluginId) { return pluginManager.checkPluginUpdate(id, pid); }
  async checkAllPluginUpdates(id: string | number) { return pluginManager.checkAllPluginUpdates(id); }
  async installPlugin(id: string | number, pid: PluginId) { return pluginManager.installPlugin(this.installDir, id, pid); }
  async uninstallPlugin(id: string | number, pid: PluginId) { return pluginManager.uninstallPlugin(this.installDir, id, pid); }
  async updatePlugin(id: string | number, pid: PluginId) { return pluginManager.updatePlugin(this.installDir, id, pid); }
  async getPluginConfigFiles(id: string | number, pid: PluginId) { return pluginManager.getPluginConfigFiles(this.installDir, id, pid); }
  async savePluginConfigFile(id: string | number, pid: PluginId, filePath: string, content: string) { 
    return pluginManager.savePluginConfigFile(this.installDir, id, pid, filePath, content); 
  }
}

export const serverManager = new ServerManager();
// Async init
(async () => { await serverManager.init(); })();
export default serverManager;
