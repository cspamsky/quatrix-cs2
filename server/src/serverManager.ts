import { spawn, exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "./db.js";
import si from "systeminformation";
import { pluginManager } from "./services/PluginManager.js";
import { steamManager } from "./services/SteamManager.js";
import type { PluginId } from "./config/plugins.js";
import Docker from "dockerode";

import { promisify } from "util";
const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerManager {
  private docker: Docker | null = null;
  private isDockerMode: boolean = process.env.DOCKER_MODE === "true";
  private runningServers: Map<string, any> = new Map();
  private logBuffers: Map<string, string[]> = new Map();
  private rconConnections: Map<string, any> = new Map();
  private playerIdentityCache: Map<string, Map<string, string>> = new Map();
  private playerIdentityBuffer: Map<string, string> = new Map();
  private installDir!: string;
  private lastInstallDir: string = "";
  private lastSteamCmdPath: string = "";
  private steamCmdExe!: string;
  private logStreams: Map<string, fs.WriteStream> = new Map();
  private io: any = null;

  public setSocketIO(io: any) {
    console.log(`[ServerManager] Socket.IO injected`);
    this.io = io;
  }


  private isNoise(line: string): boolean {
    const noisePatterns = [
      /^Loaded .*?\.so/,
      /^dlopen failed/,
      /^with error:/,
      /^steamclient\.so/,
      /texturebase\.cpp/,
      /ResourceHandleToData/,
      /collision found/,
      /^Path ID:/,
      /^ADDONS/,
      /^CONTENT/,
      /^DEFAULT_WRITE_PATH/,
      /^EXECUTABLE_PATH/,
      /^GAME/,
      /^GAMEROOT/,
      /^MOD/,
      /^OFFICIAL_ADDONS/,
      /^PLATFORM/,
      /^SHADER_SOURCE/,
      /contentupdatecontext\.cpp/,
      /Staging library folder not found/,
      /Install library folder not found/,
      /^InitSteamLogin_Internal/,
      /^ResetBreakpadAppId/,
      /^Steam AppId/,
      /^Using breakpad crash handler/,
      /^Console initialized/,
      /^Steam Universe/,
      /^\-+$/, // Line of dashes
      /^command line arguments:/,
      /^Network System Initialized/,
      /^Source2Init OK/,
      /^Created physics for/,
      /^USRLOCAL path not found/,
      /^Trying to set dxlevel/,
      /^Physics Console Communications/,
      /^Event System loaded/,
      /^CEntitySystem::BuildEntityNetworking/,
      /^CHostStateMgr::QueueNewRequest/,
      /^HostStateRequest::Start/,
      /^SwitchToLoop/,
      /^Host activate:/,
      /^SV:\s+Level loading started/,
      /^CL:\s+CLoopModeLevelLoad/,
      /^SteamInternal_SetMinidumpSteamID/,
      /^Caching Steam ID:/,
      /^Setting Steam ID:/,
      /^Looking up breakpad interfaces/,
      /^Calling BreakpadMiniDumpSystemInit/,
      /^GameTypes: missing mapgroupsSP/,
      /^\[S_API FAIL\]/,
      /CSSharp: Copying bytes from disk/,
      /CSSharp: Loading hostfxr/,
      /CSSharp: Loading CSS API/,
      /erVoiceListener::PostSpawnGroupUnload/,
      /CSource2Server::GameServerSteamAPIDeactivated/
    ];
    return noisePatterns.some((pattern) => pattern.test(line));
  }

  // Prepared statements for performance
  private flushCheckStmt = db.prepare(
    "SELECT steam_id FROM player_identities WHERE name = ?",
  );
  private flushUpdateStmt = db.prepare(
    "UPDATE player_identities SET steam_id = ?, last_seen = CURRENT_TIMESTAMP WHERE name = ?",
  );
  private flushInsertStmt = db.prepare(
    "INSERT INTO player_identities (name, steam_id, first_seen, last_seen) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
  );
  private getSettingStmt = db.prepare(
    "SELECT value FROM settings WHERE key = ?",
  );
  private updateStatusStmt = db.prepare(
    "UPDATE servers SET status = ?, pid = ? WHERE id = ?",
  );
  private getServerStmt = db.prepare("SELECT * FROM servers WHERE id = ?");
  private getOrphanedStmt = db.prepare(
    "SELECT id, pid, status FROM servers WHERE status != 'OFFLINE'",
  );
  private updatePlayerCountStmt = db.prepare(
    "UPDATE servers SET current_players = ? WHERE id = ?",
  );
  private updateMapStmt = db.prepare(
    "UPDATE servers SET map = ? WHERE id = ?",
  );

  constructor() {
    // Async initialization - call init() after construction
    this.installDir = "";
    this.steamCmdExe = "";

    if (this.isDockerMode) {
      console.log("[SYSTEM] Initializing in DOCKER MODE");
      this.docker = new Docker({ socketPath: "/var/run/docker.sock" });
    } else {
      console.log("[SYSTEM] Initializing in CHILD PROCESS MODE");
    }

    // Performance: Flush player identities every 5 seconds in batches
    setInterval(() => this.flushPlayerIdentities(), 5000);

    // Update player counts periodically (every 15s)
    setInterval(() => this.updateAllPlayerCounts(), 15000);
  }

  private async updateAllPlayerCounts() {
    for (const [id] of this.runningServers) {
      try {
        const { players } = await this.getPlayers(id);
        this.updatePlayerCountStmt.run(players.length, id);

        // Sync current map to database so it persists on restart
        const currentMap = await this.getCurrentMap(id);
        if (currentMap) {
          this.updateMapStmt.run(currentMap, id);

          // SELF-LEARNING: If it's a workshop path, learn the mapping between filename and ID
          // Example: workshop/3070247085/awp_lego_2
          const wsMatch = currentMap.match(/workshop\/(\d+)\/(.+)/i);
          if (wsMatch) {
            const wsId = wsMatch[1];
            const fileName = wsMatch[2];
            db.prepare("UPDATE workshop_maps SET map_file = ? WHERE workshop_id = ?").run(fileName, wsId);
          }
        }
      } catch (error) {
        // Silently fail, server might be starting or busy
      }
    }
  }

  public async init() {
    await this.refreshSettings();
    
    if (this.isDockerMode && this.docker) {
        try {
            const networks = await this.docker.listNetworks();
            const exists = networks.some((n: any) => n.Name === "quatrix_default");
            if (!exists) {
                console.log(`[DOCKER] Creating network 'quatrix_default'...`);
                await this.docker.createNetwork({
                    Name: "quatrix_default",
                    Driver: "bridge",
                    CheckDuplicate: true,
                    Labels: {
                        "com.docker.compose.network": "default",
                        "com.docker.compose.project": "quatrix"
                    }
                });
            }
        } catch (e) {
            console.error("[DOCKER] Failed to initialize network:", e);
        }
    }

    this.recoverOrphanedServers();
  }

  public async refreshSettings() {
    const isWin = process.platform === "win32";
    const projectRoot = process.cwd();
    
    // Docker mount points (must match docker-compose.yml)
    const defaultInstallDir = this.isDockerMode ? (isWin ? path.join(projectRoot, "instances") : "/app/instances") : path.join(projectRoot, "data/instances");
    const defaultDataDir = this.isDockerMode ? (isWin ? path.join(projectRoot, "server/data") : "/app/server/data") : path.join(projectRoot, "data");
    const defaultSteamCmdPath = path.join(defaultDataDir, "steamcmd", isWin ? "steamcmd.exe" : "steamcmd.sh");

    const newInstallDir = this.isDockerMode ? defaultInstallDir : (this.getSetting("install_dir") || defaultInstallDir);
    const newSteamCmdPath = this.isDockerMode ? defaultSteamCmdPath : (this.getSetting("install_dir") ? this.getSetting("steamcmd_path") : defaultSteamCmdPath);
    const dataDir = path.join(__dirname, "../data");

    // In Docker mode, we don't need to manually clean up or manage SteamCMD paths in the panel
    if (this.isDockerMode) {
      this.lastInstallDir = newInstallDir;
      this.lastSteamCmdPath = newSteamCmdPath;
      this.installDir = newInstallDir;
      this.steamCmdExe = newSteamCmdPath;
      return;
    }

    // If this is not the first run and paths have changed, clean up the local data directory
    if (
      this.lastInstallDir &&
      (newInstallDir !== this.lastInstallDir ||
        newSteamCmdPath !== this.lastSteamCmdPath)
    ) {
      console.log(
        `[SYSTEM] Installation paths changed detected. Cleaning up local data directory: ${dataDir}`,
      );
      try {
        if (fs.existsSync(dataDir)) {
          // Use a small delay or ensure no servers are running?
          // For now, we follow user request and attempt deletion.
          await fs.promises.rm(dataDir, { recursive: true, force: true });
          console.log(`[SYSTEM] Successfully cleaned up ${dataDir}`);
        }
      } catch (error) {
        console.error(`[SYSTEM] Error cleaning up data directory:`, error);
      }
    }

    this.installDir = newInstallDir;
    this.lastInstallDir = newInstallDir;
    this.lastSteamCmdPath = newSteamCmdPath;

    if (newSteamCmdPath) {
      if (newSteamCmdPath.endsWith(".sh") || newSteamCmdPath.endsWith(".exe")) {
        this.steamCmdExe = newSteamCmdPath;
      } else {
        const exeName =
          process.platform === "win32" ? "steamcmd.exe" : "steamcmd.sh";
        this.steamCmdExe = path.join(newSteamCmdPath, exeName);
      }
    } else {
      const steamCmdDir = path.join(dataDir, "steamcmd");
      const exeName =
        process.platform === "win32" ? "steamcmd.exe" : "steamcmd.sh";
      this.steamCmdExe = path.join(steamCmdDir, exeName);
    }

    // Re-create the necessary directory
    try {
      await fs.promises.mkdir(this.installDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
    }
  }

  private getSetting(key: string): string {
    const row = this.getSettingStmt.get(key) as { value: string };
    return row ? row.value : "";
  }

  // --- Core Management ---
  async recoverOrphanedServers() {
    interface ServerRow {
      id: number;
      pid: number | string | null;
      status: string;
    }
    const servers = this.getOrphanedStmt.all() as ServerRow[];
    const deadServerIds: number[] = [];

    if (this.isDockerMode && this.docker) {
      const containers = await this.docker.listContainers({ all: true });
      for (const server of servers) {
        const containerName = `quatrix-cs2-${server.id}`;
        const container = containers.find((c: any) => c.Names.includes(`/${containerName}`));
        
        if (container && container.State === "running") {
          console.log(`[SYSTEM] Found running container for server ${server.id}`);
          this.runningServers.set(server.id.toString(), this.docker.getContainer(container.Id));
        } else {
          deadServerIds.push(server.id);
        }
      }
    } else {
      for (const server of servers) {
        let isAlive = false;
        if (server.pid) {
          try {
            process.kill(Number(server.pid), 0);
            isAlive = true;
          } catch (e) {
            isAlive = false;
          }
        }
        if (!isAlive) {
          deadServerIds.push(server.id);
        }
      }
    }

    if (deadServerIds.length > 0) {
      console.log(
        `[SYSTEM] Recovering ${deadServerIds.length} orphaned servers...`,
      );

      // Execute updates in batches for maximum SQLite performance
      const BATCH_SIZE = 900;
      const transaction = db.transaction((ids: number[]) => {
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const chunk = ids.slice(i, i + BATCH_SIZE);
          const placeholders = chunk.map(() => "?").join(",");
          const stmt = db.prepare(
            `UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id IN (${placeholders})`,
          );
          stmt.run(...chunk);
        }
      });

      transaction(deadServerIds);
    }
  }

  public async flushPlayerIdentities() {
    if (this.playerIdentityBuffer.size === 0) return;

    const identities = Array.from(this.playerIdentityBuffer.entries());
    this.playerIdentityBuffer.clear();

    console.log(
      `[DB] Batch flushing ${identities.length} player identities...`,
    );

    try {
      const transaction = db.transaction((data) => {
        for (const [name, steamId64] of data) {
          const existing = this.flushCheckStmt.get(name);
          if (existing) {
            this.flushUpdateStmt.run(steamId64, name);
          } else {
            this.flushInsertStmt.run(name, steamId64);
          }
        }
      });
      transaction(identities);
    } catch (error) {
      console.error("[DB] Batch flush failed:", error);
    }
  }

  public async startServer(
    instanceId: string | number,
    options: any,
    onLog?: (data: string) => void,
  ) {
    const id = instanceId.toString();

    if (this.isDockerMode && this.docker) {
        console.log(`[DOCKER] Starting CS2 container for instance ${id}...`);
        
        const containerName = `quatrix-cs2-${id}`;
        const imageName = "joedwards32/cs2:latest";

        // Check if image exists locally
        try {
            await this.docker.getImage(imageName).inspect();
        } catch (e) {
            console.log(`[DOCKER] Image ${imageName} not found. Pulling... (This may take a while)`);
            if (onLog) onLog(`[SYSTEM] Pulling CS2 Docker Image (${imageName})... Please wait.`);
            await new Promise((resolve, reject) => {
                this.docker!.pull(imageName, (err: any, stream: any) => {
                    if (err) return reject(err);
                    this.docker!.modem.followProgress(stream, onFinished, onProgress);
                    function onFinished(err: any, output: any) {
                        if (err) return reject(err);
                        resolve(output);
                    }
                    function onProgress(event: any) {
                        // Log to backend console only to avoid spamming UI
                        // console.log(`[PULL] ${event.status} ${event.progress || ''}`);
                    }
                });
            });
            console.log(`[DOCKER] Image pulled successfully.`);
        }

        // Stop and remove existing container with the same name if any
        try {
            const existing = this.docker.getContainer(containerName);
            const info = await existing.inspect();
            if (info.State.Running) await existing.stop();
            await existing.remove();
        } catch (e) {}

        const env = [
            `CS2_SERVERNAME=${(options.name || "Quatrix Server").replace(/\//g, "\\/")}`,
            `CS2_PORT=${options.port}`,
            `CS2_PW=${options.password || ""}`,
            `CS2_RCONPW=${options.rcon_password || "secret"}`,
            `CS2_MAXPLAYERS=${options.max_players || 16}`,
            `CS2_STARTMAP=${options.map || "de_dust2"}`,
            `CS2_TICKRATE=${options.tickrate || 128}`,
            `CS2_LAN=${options.vac_enabled ? "0" : "1"}`,
            `SRCDS_TOKEN=${options.gslt_token || ""}`,
            `CS2_SERVER_HIBERNATE=${options.hibernate ?? 0}`,
            `STEAMAPPVALIDATE=${options.validate_files ? "1" : "0"}`,
            `STEAMAPPID=730`,
            `CS2_RCON_PORT=${options.port}`
        ];

        if (options.game_alias) {
            env.push(`CS2_GAMEALIAS=${options.game_alias}`);
        } else {
            env.push(`CS2_GAMETYPE=${options.game_type ?? 0}`);
            env.push(`CS2_GAMEMODE=${options.game_mode ?? 1}`);
        }

        // Always disable RCON banning to prevent the panel from being locked out during polling
        const safetyArgs = "+sv_rcon_banpenalty 0 +sv_rcon_maxfailures 100 +sv_rcon_minfailures 100 +sv_rcon_minfailuretime 60";
        if (options.additional_args) {
            env.push(`CS2_ADDITIONAL_ARGS=${options.additional_args} ${safetyArgs}`);
        } else {
            env.push(`CS2_ADDITIONAL_ARGS=${safetyArgs}`);
        }

        if (options.steam_api_key) env.push(`STEAM_AUTHKEY=${options.steam_api_key}`);

        // Ensure host directories exist for binds
        const isWin = process.platform === "win32";
        // Host paths (Docker daemon needs the path as seen by the host OS - e.g. D:\PROJE\...)
        const hostRoot = process.env.HOST_PROJECT_PATH || "";
        const hostCommonDir = hostRoot ? `${hostRoot}/common`.replace(/\\/g, '/') : "";
        const hostInstanceDir = hostRoot ? `${hostRoot}/instances/${id}`.replace(/\\/g, '/') : "";

        // Local paths (Panel container needs /app/... to perform fs operations)
        const localCommonDir = "/app/common";
        const localInstanceDir = `/app/instances/${id}`;
        
        console.log(`[DOCKER] Host Path: ${hostCommonDir}`);
        console.log(`[DOCKER] Local Path: ${localCommonDir}`);

        try {
            await fs.promises.mkdir(localCommonDir, { recursive: true });
            
            // Create essential config/log directories
            await fs.promises.mkdir(path.join(localInstanceDir, "game/csgo/cfg"), { recursive: true });
            await fs.promises.mkdir(path.join(localInstanceDir, "game/csgo/addons"), { recursive: true });
            await fs.promises.mkdir(path.join(localInstanceDir, "game/csgo/logs"), { recursive: true });

            // Ensure plugin asset directories exist so they can be bound
            const assetDirs = ["materials", "models", "particles", "sound", "soundevents", "scripts", "maps", "resource"];
            for (const dir of assetDirs) {
                await fs.promises.mkdir(path.join(localInstanceDir, "game/csgo", dir), { recursive: true });
            }
        } catch (e) {
            console.error(`[DOCKER] Failed to create local directories:`, e);
        }

        const binds = [
            // Use HOST paths for Binds
            // Mount common to both the game dir AND the steamcmd's steamapps dir to ensure rename() works (same filesystem)
            `${hostCommonDir}:/home/steam/cs2-dedicated`,
            `${hostCommonDir}:/home/steam/Steam/steamapps`,
            
            `${path.join(hostInstanceDir, "game/csgo/cfg").replace(/\\/g, '/')}:/home/steam/cs2-dedicated/game/csgo/cfg:rw`,
            `${path.join(hostInstanceDir, "game/csgo/addons").replace(/\\/g, '/')}:/home/steam/cs2-dedicated/game/csgo/addons:rw`,
            `${path.join(hostInstanceDir, "game/csgo/logs").replace(/\\/g, '/')}:/home/steam/cs2-dedicated/game/csgo/logs:rw`
        ];

        // Add binds for plugin assets
        const assetDirs = ["materials", "models", "particles", "sound", "soundevents", "scripts", "maps", "resource"];
        for (const dir of assetDirs) {
            binds.push(`${path.join(hostInstanceDir, "game/csgo", dir).replace(/\\/g, '/')}:/home/steam/cs2-dedicated/game/csgo/${dir}:rw`);
        }

        const container = await this.docker.createContainer({
            Image: imageName,
            name: containerName,
            Env: env,
            ExposedPorts: {
                [`${options.port}/udp`]: {},
                [`${options.port}/tcp`]: {}
            },
            HostConfig: {
                NetworkMode: "quatrix_default",
                PidsLimit: 0,
                Ulimits: [
                    { Name: "nofile", Soft: 65536, Hard: 65536 },
                    { Name: "nproc", Soft: 65536, Hard: 65536 }
                ],
                PortBindings: {
                    [`${options.port}/udp`]: [{ HostPort: options.port.toString() }],
                    [`${options.port}/tcp`]: [{ HostPort: options.port.toString() }]
                },
                Binds: binds,
                RestartPolicy: { Name: "always" }
            }
        });

        await container.start();
        this.runningServers.set(id, container);
        this.updateStatusStmt.run("ONLINE", container.id, id);

        // Attached logs for UI
        const stream = await container.logs({
            follow: true,
            stdout: true,
            stderr: true,
            timestamps: true
        });

        stream.on("data", (chunk: any) => {
            const lines = chunk.toString().split("\n");
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                
                // Clean docker timestamp if present
                const cleanLine = line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+/, "");
                
                if (onLog) onLog(cleanLine);
                
                // Mirror logic from spawn mode for player tracking
                if (this.isNoise(cleanLine)) continue;
                
                const buffer = this.logBuffers.get(id) || [];
                buffer.push(`[LOG] ${cleanLine}`);
                if (buffer.length > 200) buffer.shift();
                this.logBuffers.set(id, buffer);

                const steam64Match = cleanLine.match(/steamid:(\d{17})/i);
                if (steam64Match) {
                    const steamId64 = steam64Match[1];
                    const nameMatch = cleanLine.match(/['"](.+?)['"]/);
                    if (nameMatch) {
                        const name = nameMatch[1];
                        const cache = this.playerIdentityCache.get(id) || new Map();
                        cache.set(`n:${name}`, steamId64);
                        this.playerIdentityCache.set(id, cache);
                        this.playerIdentityBuffer.set(name, steamId64);
                    }
                }
            }
        });

        return;
    }

    const serverPath = path.join(this.installDir, id);
    const isWin = process.platform === "win32";
    // ... rest of the original startServer follows ...

    // Detect binary path based on platform
    const relativeBinPath = isWin
      ? path.join("game", "bin", "win64", "cs2.exe")
      : path.join("game", "bin", "linuxsteamrt64", "cs2");
    const cs2Exe = path.join(serverPath, relativeBinPath);
    const binDir = path.dirname(cs2Exe);

    // Check if CS2 binary exists (async)
    try {
      await fs.promises.access(cs2Exe);
    } catch {
      throw new Error(`CS2 binary not found at ${cs2Exe}`);
    }

    // Parallel Initialization: Writing steam_appid.txt and creating cfg directory concurrently
    const cfgDir = path.join(serverPath, "game", "csgo", "cfg");

    await Promise.all([
      fs.promises.writeFile(path.join(binDir, "steam_appid.txt"), "730"),
      fs.promises.mkdir(cfgDir, { recursive: true }).catch((error) => {
        if (error.code !== "EEXIST") throw error;
      }),
    ]);
    const serverCfgPath = path.join(cfgDir, "server.cfg");

    // Handle server.cfg generation for secrets (ASYNC)
    let cfgContent = "";
    try {
      cfgContent = await fs.promises.readFile(serverCfgPath, "utf8");
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }

    const updateLine = (c: string, k: string, v: string) => {
      const r = new RegExp(`^${k}\\s+.*$`, "m");
      return r.test(c) ? c.replace(r, `${k} "${v}"`) : c + `\n${k} "${v}"`;
    };
    cfgContent = updateLine(cfgContent, "sv_password", options.password || "");
    cfgContent = updateLine(
        cfgContent,
      "rcon_password",
      options.rcon_password || "secret",
    );
    await fs.promises.writeFile(serverCfgPath, cfgContent);
    console.log(`[SERVER] Generated config at ${serverCfgPath}`);

    const args = ["-dedicated"];

    if (options.steam_api_key) {
      args.push("-authkey", options.steam_api_key);
    }

    args.push(
      "+game_type", (options.game_type ?? 0).toString(),
      "+game_mode", (options.game_mode ?? 0).toString()
    );

    // Detect if the map is a workshop map
    let mapName = options.map || "de_dust2";
    let workshopId: string | null = null;
    let knownWorkshop: { workshop_id: string; map_file?: string } | undefined;

    const workshopMatch = mapName.match(/workshop\/(\d+)/i) || mapName.match(/^(\d{8,})$/);
    if (workshopMatch) {
      workshopId = workshopMatch[1];
    } else {
      knownWorkshop = db.prepare(`
        SELECT workshop_id, map_file FROM workshop_maps 
        WHERE LOWER(map_file) = LOWER(?) 
        OR LOWER(name) = LOWER(?) 
        OR LOWER(REPLACE(name, ' ', '_')) = LOWER(?)
      `).get(mapName, mapName, mapName) as any;
      
      if (knownWorkshop) {
        workshopId = knownWorkshop.workshop_id;
      }
    }
    
    let workshopIdToSwitch: string | null = null;
    if (workshopId) {
      console.log(`[SERVER] Workshop map detected. Starting on de_dust2 first for stability, then will auto-switch to ID: ${workshopId}`);
      args.push("+map", "de_dust2");
      workshopIdToSwitch = workshopId;
    } else {
      console.log(`[SERVER] Launching Standard Map: ${mapName}`);
      args.push("+map", mapName);
    }

    args.push(
      "-port",
      options.port.toString(),
      "-maxplayers",
      (options.max_players || 16).toString(),
      "+ip",
      "0.0.0.0",
      "-tickrate",
      (options.tickrate || 128).toString(),
      "+exec",
      "server.cfg"
    );
    if (options.vac_enabled) args.push("+sv_lan", "0");
    else args.push("-insecure", "+sv_lan", "1");
    if (options.gslt_token)
      args.push("+sv_setsteamaccount", options.gslt_token);
    if (options.steam_api_key) args.push("-authkey", options.steam_api_key);
    if (options.name) args.push("+hostname", options.name);

    // Environment Setup (Platform Specific)
    const env: Record<string, string | undefined> = {
      ...process.env,
      SteamAppId: "730",
      STEAM_APP_ID: "730",
    };

    if (isWin) {
      // Windows specific stabilization
      env.PATH = `${binDir};${process.env.PATH}`;
    } else {
      // Linux specific stabilization
      env.LD_LIBRARY_PATH = `${binDir}:${path.join(binDir, "steam")}:.`;
      env.DOTNET_BUNDLE_EXTRACT_BASE_DIR = path.join(serverPath, ".net_cache");
    }

    // Ensure Steam SDK directory exists for initialization (Linux Only ASYNC)
    if (!isWin) {
      try {
        const homeDir = process.env.HOME || "/root";
        const sdkDir = path.join(homeDir, ".steam/sdk64");
        const targetLink = path.join(sdkDir, "steamclient.so");
        const steamCmdDir = path.dirname(this.steamCmdExe);
        
        // Potential locations for steamclient.so based on your 'find' results
        const possibleSources = [
          path.join(steamCmdDir, "linux64/steamclient.so"),
          path.join(steamCmdDir, "linux32/steamclient.so"),
          path.join(steamCmdDir, "steamclient.so"),
          path.join(serverPath, "game/bin/linuxsteamrt64/steamclient.so"),
        ];

        // Ensure directory exists regardless of target existence
        await fs.promises.mkdir(sdkDir, { recursive: true });

        // Check using lstat to detect symlinks (even dangling ones)
        const targetStat = await fs.promises.lstat(targetLink).catch(() => null);

        // If target doesn't exist OR it's a dangling symlink, we repair
        const targetValid = await fs.promises.access(targetLink).then(() => true).catch(() => false);

        if (!targetValid) {
          // If it exists but is invalid (dangling symlink), remove it first
          if (targetStat) {
            await fs.promises.rm(targetLink, { force: true }).catch(() => {});
          }

          let sourceFound = "";
          for (const source of possibleSources) {
            if (await fs.promises.access(source).then(() => true).catch(() => false)) {
              sourceFound = source;
              break;
            }
          }

          if (sourceFound) {
            console.log(`[SYSTEM] Auto-fixing Steam SDK (Fresh Copy): ${sourceFound} -> ${targetLink}`);
            try {
              await fs.promises.copyFile(sourceFound, targetLink);
            } catch (e) {
              await fs.promises.symlink(sourceFound, targetLink).catch(() => {});
            }
          } else {
            console.warn(`[SYSTEM] Could not find steamclient.so in any confirmed locations.`);
          }
        }
      } catch (err) {
        console.warn(`[SYSTEM] Steam SDK auto-fix failed:`, err);
      }
    }

    console.log(`[SERVER] Starting ${isWin ? "Windows" : "Linux"} CS2 instance: ${id}`);
    const serverProcess = spawn(cs2Exe, args, {
      cwd: serverPath,
      env,
      shell: false,
    });

    // Handle the automated workshop switch after a delay
    if (workshopIdToSwitch) {
      const targetId = workshopIdToSwitch;
      setTimeout(async () => {
        try {
          console.log(`[SERVER] Triggering automated workshop switch to ${targetId} for instance ${id}...`);
          // Use more retries for this initial boot switch
          await this.sendCommand(id, `host_workshop_map ${targetId}`, 10);
          console.log(`[SERVER] Successfully switched to workshop map ${targetId}`);
        } catch (e) {
          console.error(`[SERVER] Automated workshop switch failed for ${id}. Error:`, e);
        }
      }, 20000); // 20 seconds is usually enough for boot + steam init
    }

    const logFile = path.join(serverPath, "console.log");
    const logStream = fs.createWriteStream(logFile, { flags: "a" });
    this.logStreams.set(id, logStream);

    serverProcess.stdout.on("data", (data) => {
      const rawMsg = data.toString().trim();
      if (!rawMsg || rawMsg.includes("CTextConsoleWin")) return;

      // Always write to physical log file with timestamp
      const timestamp = new Date().toISOString();
      logStream.write(`[${timestamp}] ${rawMsg}\n`);

      // Filter noise for the UI console
      if (this.isNoise(rawMsg)) return;

      const line = rawMsg;
      if (onLog) onLog(line);

      const buffer = this.logBuffers.get(id) || [];
      const timestampedLine = `[${timestamp}] ${line}`;
      buffer.push(timestampedLine);
      if (buffer.length > 200) buffer.shift();
      this.logBuffers.set(id, buffer);

        // --- OYUNCU TAKIBI (Sadece Steam64 Yakalama) ---
        // Steam64 formatı: steamid:76561198968591397
        const steam64Match = line.match(/steamid:(\d{17})/i);

        const serverId = id.toString();
        if (!this.playerIdentityCache.has(serverId))
          this.playerIdentityCache.set(serverId, new Map());
        const cache = this.playerIdentityCache.get(serverId);

        if (steam64Match) {
          const steamId64 = steam64Match[1];
          const nameMatch = line.match(/['"](.+?)['"]/);
          if (nameMatch) {
            const name = nameMatch[1];
            // Namespaced cache to prevent ID spoofing
            cache?.set(`n:${name}`, steamId64);

            // Performance: Buffer the identity instead of writing to DB on every single log line
            this.playerIdentityBuffer.set(name, steamId64);

            console.log(`[IDENTITY] Steam64 Buffered: ${name} -> ${steamId64}`);
        }
      }
    });

    serverProcess.on("error", (err) => {
      const errMsg = `[SYSTEM] Process error: ${err.message}`;
      console.error(`[SERVER ${id}] ${errMsg}`);

      const stream = this.logStreams.get(id);
      if (stream) {
        stream.end(`[${new Date().toISOString()}] ${errMsg}\n`);
        this.logStreams.delete(id);
      }

      if (onLog) onLog(errMsg);
    });

    serverProcess.stderr.on("data", (data) => {
      const rawMsg = data.toString().trim();
      if (!rawMsg || rawMsg === "[STDERR]") return;

      const line = `[STDERR] ${rawMsg}`;
      const timestamp = new Date().toISOString();
      logStream.write(`[${timestamp}] ${line}\n`);

      if (onLog) onLog(line);

      const buffer = this.logBuffers.get(id) || [];
      const timestampedLine = `[${timestamp}] ${line}`;
      buffer.push(timestampedLine);
      if (buffer.length > 200) buffer.shift();
      this.logBuffers.set(id, buffer);
      console.error(`[SERVER ${id} STDERR] ${line}`);
    });

    serverProcess.on("exit", (code, signal) => {
      const exitMsg = `[SYSTEM] Process exited with code ${code} and signal ${signal}`;
      console.log(`[SERVER] Instance ${id} ${exitMsg}`);

      // Close and remove log stream
      const stream = this.logStreams.get(id);
      if (stream) {
        stream.end(`[${new Date().toISOString()}] ${exitMsg}\n`);
        this.logStreams.delete(id);
      }

      this.runningServers.delete(id);
      this.updateStatusStmt.run("OFFLINE", null, id);
      this.updatePlayerCountStmt.run(0, id);

      if (onLog) onLog(exitMsg);
    });

    this.runningServers.set(id, serverProcess);
    if (serverProcess.pid)
      this.updateStatusStmt.run("ONLINE", serverProcess.pid, id);
  }

  public async stopServer(id: string | number) {
    const idStr = id.toString();
    console.log(`[SERVER] Stopping instance ${idStr}...`);

    if (this.isDockerMode && this.docker) {
        try {
            const container = this.docker.getContainer(`quatrix-cs2-${idStr}`);
            await container.stop();
            await container.remove();
            console.log(`[DOCKER] Container quatrix-cs2-${idStr} stopped and removed.`);
        } catch (e) {
            console.error(`[DOCKER] Failed to stop container:`, e);
        }
        this.updateStatusStmt.run("OFFLINE", null, idStr);
        this.updatePlayerCountStmt.run(0, idStr);
        this.runningServers.delete(idStr);
        return true;
    }

    // 1. Try graceful shutdown via RCON
    try {
      await this.sendCommand(id, "quit");
      // Wait a bit for the process to exit naturally
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (e) {
      console.log(`[SERVER] RCON quit failed for ${idStr}, proceeding to kill.`);
    }

    // 2. Clear RCON Connection
    if (this.rconConnections.has(idStr)) {
      try {
        await this.rconConnections.get(idStr).end();
      } catch {}
      this.rconConnections.delete(idStr);
    }

    // 3. Force Kill if still running
    const proc = this.runningServers.get(idStr);
    const server = this.getServerStmt.get(idStr) as any;
    const pid = proc?.pid || server?.pid;

    if (pid) {
      try {
        // Send SIGKILL to ensure port is released
        process.kill(pid, "SIGKILL");
        console.log(`[SERVER] Sent SIGKILL to PID ${pid}`);
      } catch (e: any) {
        if (e.code !== "ESRCH") {
          console.error(`[SERVER] Error killing process ${pid}:`, e);
        }
      }
    }

    // 4. Update Database & Cleanup
    this.updateStatusStmt.run("OFFLINE", null, idStr);
    this.updatePlayerCountStmt.run(0, idStr);
    this.runningServers.delete(idStr);
    
    // Also clean up any potential stale processes (advanced)
    if (server?.port) {
      try {
        if (process.platform === "linux") {
          await execAsync(`fuser -k ${server.port}/udp`).catch(() => {});
        } else if (process.platform === "win32") {
          // Alternative approach for Windows if needed
        }
      } catch {}
    }

    return true;
  }

  public async sendCommand(
    id: string | number,
    command: string,
    retries = 3,
  ): Promise<string> {
    const idStr = id.toString();
    const server = this.getServerStmt.get(idStr) as any;
    if (!server) throw new Error("Server not found in database");

    const { Rcon } = await import("rcon-client");
    let rcon = this.rconConnections.get(idStr);

    // RCON portu: Eğer rcon_port tanımlıysa onu kullan, yoksa game port'u kullan
    const rconPort = server.rcon_port || server.port;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (!rcon) {
          const rconHost = this.isDockerMode ? `quatrix-cs2-${idStr}` : "127.0.0.1";
          
          
          console.log(`[RCON] Init connection to ${rconHost}:${rconPort} (Docker: ${this.isDockerMode})...`);
          console.log(`[RCON] Connection details - Host: ${rconHost}, Port: ${rconPort}, Password (len): ${server.rcon_password?.length || 0}`);

          rcon = await Rcon.connect({
            host: rconHost,
            port: parseInt(rconPort.toString()),
            password: server.rcon_password,
            timeout: 10000, // 10 seconds timeout
          });
          
          // Add error handler to prevent "Uncaught Exception: Error: read ECONNRESET"
          // This ensures the socket error doesn't crash the entire node process
          rcon.on("error", (err: any) => {
             // console.warn(`[RCON] Socket error for ${idStr}:`, err.message);
             this.rconConnections.delete(idStr);
          });
          rcon.on("end", () => this.rconConnections.delete(idStr));
          this.rconConnections.set(idStr, rcon);
        }
        return await rcon.send(command);
      } catch (error) {
        this.rconConnections.delete(idStr);
        rcon = undefined;

        if (attempt === retries) {
          const isAlive = this.runningServers.has(idStr);
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          console.error(
            `[RCON] Critical Failure for server ${id} at 127.0.0.1:${rconPort} after ${retries} attempts. Server Running: ${isAlive}. Error: ${errorMsg}`,
          );
          throw new Error(
            `RCON Connection failed. Server is ${isAlive ? "ONLINE" : "OFFLINE"}. Reason: ${errorMsg}`,
          );
        }

        // Sunucu başlatılıyorsa biraz bekle
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    throw new Error("RCON connection failed after all retries");
  }

  public async getCurrentMap(id: string | number): Promise<string | null> {
    try {
      const res = await this.sendCommand(id, "status");
      
      // 1. Try standard 'map :' line (up to first space/newline)
      // Example: map : workshop/3070176466/de_dust2
      const mapLineMatch = res.match(/map\s+:\s+([^\s\r\n]+)/i);
      if (mapLineMatch && mapLineMatch[1]) {
        return mapLineMatch[1].trim();
      }

      // 2. Try 'loaded spawngroup' (Internal engine state)
      const spawnMatch = res.match(
        /loaded spawngroup\(\s*1\)\s*:\s*SV:\s*\[1:\s*([^\s\r\n\]]+)/i,
      );
      if (spawnMatch && spawnMatch[1]) {
        return spawnMatch[1].trim();
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  public async getPlayers(
    id: string | number,
  ): Promise<{ players: any[]; averagePing: number }> {
    try {
      // Try css_players first (CounterStrikeSharp - includes Steam IDs), fallback to status
      let combinedOutput = "";
      try {
        combinedOutput = await this.sendCommand(id, "css_players");
      } catch (e) {
        console.log("[PLAYERS] css_players failed, falling back to status");
        combinedOutput = await this.sendCommand(id, "status");
      }
      console.log("[DEBUG] Raw status output:", combinedOutput);
      const lines = combinedOutput.split("\n");
      const idStr = id.toString();
      const cache = this.playerIdentityCache.get(idStr);

      const parsedPlayers: any[] = [];
      const seenNames = new Set<string>();
      const unresolvedNames = new Set<string>();

      // 1. First Pass: Parse status output and extract basic stats
      for (const line of lines) {
        const trimmed = line.trim();

        // Skip non-player lines and bots
        if (
          trimmed.includes("BOT") ||
          trimmed.includes("<BOT>") ||
          trimmed.startsWith("userid") ||
          trimmed.startsWith("version")
        ) {
          continue;
        }

        // Identify format type
        const isCSS = trimmed.includes("SteamID64:");
        const isStandard = trimmed.startsWith("#") || /^\s*\d+\s+\d{1,2}:\d{2}/.test(trimmed);
        const isPlugin = trimmed.includes("[Client]");

        if (!isCSS && !isStandard && !isPlugin) continue;

        let name = "";
        let connectedTime = "00:00:00";
        let ping = 0;
        let idPart = "";
        let steamId64 = "";

        if (isCSS) {
          // CSS Format: • [#2] "Pamsky" (IP Address: "159.146.35.163" SteamID64: "76561198968591397")
          const match = trimmed.match(
            /•\s*\[#(\d+)\]\s*["'](.+?)["']\s*\(.*?SteamID64:\s*["'](\d{17})["']\)/,
          );
          if (match) {
            idPart = match[1] || "";
            name = match[2] || "";
            steamId64 = match[3] || "";
            // CSS doesn't provide ping/time in this format, use defaults
            connectedTime = "00:00:00";
            ping = 0;
          }
        } else if (isStandard) {
          // CS2 Standard Format: 2    02:59   25    0     active 786432 159.146.35.163:14887 'Pamsky'
          // Pattern: id time ping loss state rate ip:port 'name'
          const match = trimmed.match(
            /^\s*(\d+)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d+)\s+\d+\s+\w+\s+\d+\s+[\d.:]+\s+['"](.+?)['"]/,
          );
          if (match) {
            idPart = match[1] || "";
            const rawTime = match[2] || "00:00";
            connectedTime =
              rawTime.split(":").length === 2
                ? `00:${rawTime.padStart(5, "0")}`
                : rawTime;
            ping = parseInt(match[3] || "0") || 0;
            name = match[4] || "";
          }
        } else if (isPlugin) {
          // Plugin: [Client] 2 05:20 50 "Name"
          const match = trimmed.match(
            /\[Client\]\s+(\d+)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d+)\s+["'](.+?)["']/,
          );
          if (match) {
            idPart = match[1] || "";
            const rawTime = match[2] || "00:00";
            connectedTime =
              rawTime.split(":").length === 2
                ? `00:${rawTime.padStart(5, "0")}`
                : rawTime;
            ping = parseInt(match[3] || "0") || 0;
            name = match[4] || "";
          }
        }

        if (
          !name ||
          name.toUpperCase().includes("BOT") ||
          seenNames.has(name) ||
          idPart === "65535"
        ) {
          continue;
        }
        seenNames.add(name);

        // Initial Identity Resolution
        let steamId = steamId64 || cache?.get(`i:${idPart}`) || cache?.get(`n:${name}`);

        if (!steamId) {
          unresolvedNames.add(name);
        }

        parsedPlayers.push({
          userId: idPart,
          name: name,
          steamId: steamId || null,
          connected: connectedTime,
          ping: ping,
          state: "active",
        });
      }

      // 2. Batch Resolution (Memory Logs + Database)
      if (unresolvedNames.size > 0) {
        const nameArray = Array.from(unresolvedNames);
        const localResolution = new Map<string, string>();

        // A. Scan logs first (High speed memory scan)
        const logBuffer = this.logBuffers.get(idStr) || [];
        for (const name of nameArray) {
          for (const logLine of logBuffer) {
            if (logLine.includes(name)) {
              const match = logLine.match(/\b(765611\d{10,12})\b/);
              if (match?.[1]) {
                localResolution.set(name, match[1]);
                break;
              }
            }
          }
        }

        // B. Batch Database Lookup for remaining
        const stillUnresolved = nameArray.filter(
          (n) => !localResolution.has(n),
        );
        if (stillUnresolved.length > 0) {
          const placeholders = stillUnresolved.map(() => "?").join(",");
          const dbResults = db
            .prepare(
              `SELECT name, steam_id FROM player_identities WHERE name IN (${placeholders})`,
            )
            .all(...stillUnresolved) as { name: string; steam_id: string }[];

          for (const row of dbResults) {
            localResolution.set(row.name, row.steam_id);
          }
        }

        // C. Backfill and Update Cache
        for (const player of parsedPlayers) {
          if (!player.steamId && localResolution.has(player.name)) {
            player.steamId = localResolution.get(player.name);
            // Update cache with namespaced keys
            if (cache) {
              cache.set(`i:${player.userId}`, player.steamId!);
              cache.set(`n:${player.name}`, player.steamId!);
            }
          }
          if (!player.steamId) player.steamId = "Hidden/Pending";
        }
      } else {
        // All resolved or no players, just sanitize display IDs
        for (const player of parsedPlayers) {
          if (!player.steamId) player.steamId = "Hidden/Pending";
        }
      }

      // 3. Avatar Enrichment (Steam API)
      const steamIds = parsedPlayers
        .map((p) => p.steamId)
        .filter((sid) => sid && /^\d{17}$/.test(sid));

      if (steamIds.length > 0) {
        try {
          const { getPlayerAvatars } = await import("./utils/steamApi.js");
          const avatars = await getPlayerAvatars(steamIds);
          for (const player of parsedPlayers) {
            if (avatars.has(player.steamId)) {
              player.avatar = avatars.get(player.steamId);
            }
          }
        } catch (err) {
          console.error("[Avatar] Enhancement failed:", err);
        }
      }

      const totalPing = parsedPlayers.reduce((sum, p) => sum + p.ping, 0);
      return {
        players: parsedPlayers,
        averagePing:
          parsedPlayers.length > 0
            ? Math.round(totalPing / parsedPlayers.length)
            : 0,
      };
    } catch (e) {
      console.error(`[RCON] getPlayers failed:`, e);
      return { players: [], averagePing: 0 };
    }
  }

  /**
   * SECURITY: Resolve and validate file path to prevent path traversal attacks (CWE-22)
   * @param id Server instance ID
   * @param userPath User-provided path (untrusted input)
   * @returns Validated absolute path
   * @throws Error if path escapes the allowed directory
   */
  private _resolveSecurePath(id: string | number, userPath: string): string {
    const base = path.join(this.installDir, id.toString(), "game", "csgo");
    const resolved = path.resolve(base, userPath);

    // Strict check: resolved path must start with base + separator (or be exactly base)
    // This prevents both "../" traversal and sibling attacks (e.g., /var/www vs /var/www-secret)
    const normalizedBase = path.normalize(base + path.sep);
    const normalizedResolved = path.normalize(resolved + path.sep);

    if (!normalizedResolved.startsWith(normalizedBase)) {
      throw new Error(
        `Security: Path traversal attempt detected. Path "${userPath}" escapes allowed directory.`,
      );
    }

    return resolved;
  }

  public async listFiles(id: string | number, subDir: string = "") {
    // SECURITY: Validate path before use
    const target = this._resolveSecurePath(id, subDir);

    // Async readdir with error handling
    try {
      const entries = await fs.promises.readdir(target, {
        withFileTypes: true,
      });
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        size: 0,
        mtime: new Date(),
      }));
    } catch (error: any) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  public async readFile(id: string | number, filePath: string) {
    // SECURITY: Validate path to prevent directory traversal (CWE-22)
    const safePath = this._resolveSecurePath(id, filePath);
    return fs.promises.readFile(safePath, "utf8");
  }

  public getFilePath(id: string | number, subDir: string) {
    return this._resolveSecurePath(id, subDir);
  }

  public async writeFile(id: string | number, filePath: string, content: string) {
    // SECURITY: Validate path to prevent directory traversal (CWE-22)
    const safePath = this._resolveSecurePath(id, filePath);
    return fs.promises.writeFile(safePath, content);
  }

  public async deleteFile(id: string | number, filePath: string) {
    const safePath = this._resolveSecurePath(id, filePath);
    return fs.promises.rm(safePath, { recursive: true, force: true });
  }

  public async createDirectory(id: string | number, dirPath: string) {
    const safePath = this._resolveSecurePath(id, dirPath);
    return fs.promises.mkdir(safePath, { recursive: true });
  }

  public async renameFile(id: string | number, oldPath: string, newPath: string) {
    const safeOldPath = this._resolveSecurePath(id, oldPath);
    const safeNewPath = this._resolveSecurePath(id, newPath);
    return fs.promises.rename(safeOldPath, safeNewPath);
  }

  async deleteServerFiles(id: string | number) {
    const idStr = id.toString();
    const serverDir = path.join(this.installDir, idStr);

    console.log(
      `[SYSTEM] Deleting physical files for instance ${idStr} at ${serverDir}`,
    );

    // No need for existsSync - fs.promises.rm handles ENOENT gracefully with force: true
    try {
      // First attempt
      await fs.promises.rm(serverDir, { recursive: true, force: true });
    } catch (err: any) {
      // If it fails (e.g. process still exiting), wait 1s and retry
      if (err.code !== "ENOENT") {
        console.warn(`[SYSTEM] Delete failed, retrying in 1s...`, err);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await fs.promises.rm(serverDir, { recursive: true, force: true });
      }
    }
  }

  isServerRunning(id: string | number) {
    return this.runningServers.has(id.toString());
  }
  getLogs(id: string | number) {
    return this.logBuffers.get(id.toString()) || [];
  }
  getInstallDir() {
    return this.installDir;
  }
  getSteamCmdDir() {
    return path.dirname(this.steamCmdExe);
  }

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

  // --- Steam/Server Installation ---
  // --- Steam/Server Installation ---
  public async ensureSteamCMD() {
    if (this.isDockerMode) return true;
    const exists = await steamManager.ensureSteamCMD(this.steamCmdExe);
    if (exists) return true;

    try {
      console.log(
        `[SYSTEM] SteamCMD missing at ${this.steamCmdExe}. Downloading...`,
      );
      await steamManager.downloadSteamCmd(this.steamCmdExe);
      return true;
    } catch (err) {
      console.error(`[SYSTEM] Failed to download SteamCMD:`, err);
      // Log more context
      if (err instanceof Error) {
        console.error(`[SYSTEM] Error Name: ${err.name}, Stack: ${err.stack}`);
      }
      return false;
    }
  }

  public async installOrUpdateServer(id: string | number, onLog?: any) {
    if (this.isDockerMode && this.docker) {
      const serverId = id.toString();
      console.log(`[DOCKER] Triggering update for shared base using a temporary container...`);
      if (onLog) onLog("[SYSTEM] Starting shared base update via Docker... This may take a while.");
      
      const localCommonDir = "/app/common";
      const hostRoot = process.env.HOST_PROJECT_PATH || process.cwd();
      const hostCommonDir = `${hostRoot}/common`.replace(/\\/g, '/');

      await fs.promises.mkdir(localCommonDir, { recursive: true });

      const containerName = `quatrix-updater-${serverId}-${Date.now()}`;
      const container = await this.docker.createContainer({
        Image: "joedwards32/cs2",
        name: containerName,
        HostConfig: {
            Binds: [`${hostCommonDir}:/home/steam/cs2-dedicated`],
            AutoRemove: true
        }
      });

      await container.start();
      if (onLog) onLog("[SYSTEM] Updater container started. Waiting for completion...");

      // Wait for completion
      try {
          await container.wait();
          console.log(`[DOCKER] Update container ${containerName} finished.`);
          if (onLog) onLog("[SYSTEM] Shared base update completed successfully.");
          
          // Mark as installed in DB
          db.prepare("UPDATE servers SET is_installed = 1 WHERE id = ?").run(id);
      } catch (err) {
          console.error(`[DOCKER] Update container failed:`, err);
          if (onLog) onLog("[ERROR] Update failed. Check docker logs.");
          throw err;
        }
      return;
    }

    const serverId = id.toString();
    try {
      await steamManager.installOrUpdateServer(
        serverId,
        this.steamCmdExe,
        this.installDir,
        onLog,
      );
    } catch (err) {
      // SteamCMD sometimes returns errors (like 0x602) even if the installation is actually complete or in a usable state.
      // We perform a manual check for the CS2 executable to verify.
      const serverPath = path.join(this.installDir, serverId);
      const isWin = process.platform === "win32";
      const relativeBinPath = isWin
        ? path.join("game", "bin", "win64", "cs2.exe")
        : path.join("game", "bin", "linuxsteamrt64", "cs2");
      const cs2Exe = path.join(serverPath, relativeBinPath);

      try {
        await fs.promises.access(cs2Exe);
        console.log(`[SYSTEM] SteamCMD reported error but CS2 binary found at ${cs2Exe}. Marking as success.`);
        return; 
      } catch (fsErr) {
        console.error(`[SYSTEM] Installation failed and binary not found:`, err);
        throw err;
      }
    }
  }

  public async getSystemHealth(): Promise<any> {
    const result: any = {
      os: { platform: process.platform, arch: process.arch },
      docker: { active: this.isDockerMode },
      cpu: { avx: false, model: "", cores: 0 },
      ram: { total: 0, free: 0, status: "unknown" },
      disk: { total: 0, free: 0, status: "unknown" },
      runtimes: {
        dotnet: { status: this.isDockerMode ? "good" : "missing", versions: [], details: [] },
        steam_sdk: { status: this.isDockerMode ? "good" : "missing" },
      },
    };
    try {
      const cpu = await si.cpu();
      result.cpu.model = cpu.brand;
      result.cpu.cores = cpu.cores;
      result.cpu.avx = cpu.flags.toLowerCase().includes("avx");
      const mem = await si.mem();
      result.ram.total = mem.total;
      result.ram.status =
        mem.total / 1024 / 1024 / 1024 >= 8 ? "good" : "warning";

      const disk = await si.fsSize();
      const root =
        disk.find((d) => this.installDir.startsWith(d.mount)) || disk[0];
      if (root) {
        result.disk.total = root.size;
        result.disk.free = root.available;
        result.disk.status =
          root.available / 1024 / 1024 / 1024 >= 40 ? "good" : "warning";
      }

      // Enhanced .NET 8.0 check
      await new Promise<void>((res) => {
        exec("dotnet --list-runtimes", (err, out) => {
          if (!err && out) {
            const lines = out.split("\n").filter((l) => l.trim());
            result.runtimes.dotnet.details = lines;

            // Check for .NET 8.0 specifically
            const has80 = lines.some((l) =>
              l.includes("Microsoft.NETCore.App 8.0"),
            );
            result.runtimes.dotnet.status = has80 ? "good" : "missing";

            if (has80) {
              result.runtimes.dotnet.versions = lines
                .filter((l) => l.includes("8.0"))
                .map((l) => l.trim());
            }
          }
          res();
        });
      });

      // Steam SDK check (async)
      const homeDir = process.env.HOME || "/root";
      const sdkSo = process.platform === 'win32' 
        ? path.join(path.dirname(this.steamCmdExe), "steamclient.dll")
        : path.join(homeDir, ".steam/sdk64/steamclient.so");
        
      try {
        await fs.promises.access(sdkSo);
        result.runtimes.steam_sdk.status = "good";
      } catch {
        result.runtimes.steam_sdk.status = "missing";
      }
    } catch (e: any) {
      console.error("[SYSTEM] getSystemHealth top-level error:", e);
    }
    return result;
  }

  async repairSystemHealth(): Promise<{
    success: boolean;
    message: string;
    details: any;
  }> {
    const details: any = { dotnet: null, vcruntime: null };

    try {
      // Check .NET 8.0 Runtime
      const dotnetCheck = await new Promise<boolean>((resolve) => {
        exec("dotnet --list-runtimes", (err, out) => {
          resolve(!!(!err && out && out.includes("8.0")));
        });
      });

      if (!dotnetCheck) {
        details.dotnet = { status: "missing", action: "download_required" };
        return {
          success: false,
          message:
            ".NET 8.0 Runtime not found. Please download from: https://dotnet.microsoft.com/download/dotnet/8.0",
          details,
        };
      } else {
        details.dotnet = { status: "ok" };
      }

      // Check and Repair Steam SDK (ASYNC)
      const homeDir = process.env.HOME || "/root";
      const sdkDir = path.join(homeDir, ".steam/sdk64");
      const targetLink = path.join(sdkDir, "steamclient.so");

      // Check if target link exists (async)
      const targetExists = await fs.promises
        .access(targetLink)
        .then(() => true)
        .catch(() => false);

      if (!targetExists) {
        console.log(`[REPAIR] Fixing Steam SDK...`);
        const steamCmdDir = path.dirname(this.steamCmdExe);
        const sourceSo = path.join(steamCmdDir, "linux64/steamclient.so");

        // Check if source exists (async)
        const sourceExists = await fs.promises
          .access(sourceSo)
          .then(() => true)
          .catch(() => false);

        if (sourceExists) {
          // Ensure directory exists (async)
          await fs.promises.mkdir(sdkDir, { recursive: true });

          try {
            await fs.promises.symlink(sourceSo, targetLink);
          } catch (e) {
            await fs.promises.copyFile(sourceSo, targetLink);
          }
          details.steam_sdk = { status: "repaired" };
        } else {
          details.steam_sdk = {
            status: "failed",
            reason: "Source steamclient.so not found. Is SteamCMD installed?",
          };
        }
      } else {
        details.steam_sdk = { status: "ok" };
      }

      return {
        success: true,
        message:
          "System dependencies have been checked and repaired where possible.",
        details,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `System health repair failed: ${error.message}`,
        details,
      };
    }
  }

  async stopInstallation(id: string | number) {
    console.warn(`[SYSTEM] stopInstallation requested for ${id}, but not fully implemented yet.`);
    // In the future, we would track steamCmd processes in a Map and kill them here.
    return true;
  }

  async cleanupGarbage() {
    console.warn(`[SYSTEM] cleanupGarbage requested, but not fully implemented yet.`);
    return { success: true, message: "Garbage cleanup not implemented, but call succeeded." };
  }
}


// Async initialization pattern
const serverManager = new ServerManager();

// Initialize asynchronously
(async () => {
  try {
    await serverManager.init();
    console.log("[ServerManager] Initialized successfully");
  } catch (error) {
    console.error("[ServerManager] Initialization failed:", error);
  }
})();

export { serverManager };
export default serverManager;
