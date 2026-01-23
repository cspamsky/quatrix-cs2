import { spawn, exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "./db.js";
import si from "systeminformation";
import { pluginManager } from "./services/PluginManager.js";
import { steamManager } from "./services/SteamManager.js";
import type { PluginId } from "./config/plugins.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerManager {
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

  constructor() {
    // Async initialization - call init() after construction
    this.installDir = "";
    this.steamCmdExe = "";

    // Performance: Flush player identities every 5 seconds in batches
    setInterval(() => this.flushPlayerIdentities(), 5000);
  }

  async init() {
    await this.refreshSettings();
    this.recoverOrphanedServers();
  }

  async refreshSettings() {
    const newInstallDir =
      this.getSetting("install_dir") ||
      path.join(__dirname, "../data/instances");
    const newSteamCmdPath = this.getSetting("steamcmd_path") || "";
    const dataDir = path.join(__dirname, "../data");

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
  recoverOrphanedServers() {
    interface ServerRow {
      id: number;
      pid: number | null;
      status: string;
    }
    const servers = this.getOrphanedStmt.all() as ServerRow[];

    const deadServerIds: number[] = [];

    for (const server of servers) {
      let isAlive = false;
      if (server.pid) {
        try {
          process.kill(server.pid, 0);
          isAlive = true;
        } catch (e) {
          isAlive = false;
        }
      }
      if (!isAlive) {
        deadServerIds.push(server.id);
      }
    }

    if (deadServerIds.length > 0) {
      console.log(
        `[SYSTEM] Recovering ${deadServerIds.length} orphaned servers...`,
      );

      // Execute updates in batches for maximum SQLite performance (Batch size 900 to stay under SQLITE_LIMIT_VARIABLE_NUMBER)
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

  private flushPlayerIdentities() {
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

  async startServer(
    instanceId: string | number,
    options: any,
    onLog?: (data: string) => void,
  ) {
    const id = instanceId.toString();
    const serverPath = path.join(this.installDir, id);
    // CS2 Linux uses linuxsteamrt64 directory
    const relativeBinPath = path.join("game", "bin", "linuxsteamrt64", "cs2");
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

    const args = [
      "-dedicated",
      "+game_type",
      (options.game_type ?? 0).toString(),
      "+game_mode",
      (options.game_mode ?? 0).toString(),
      "+map",
      options.map || "de_dust2",
      "-port",
      options.port.toString(),
      "-maxplayers",
      (options.max_players || 16).toString(),
      "-nosteamclient",
      "+ip",
      "0.0.0.0",
      "-tickrate",
      (options.tickrate || 128).toString(),
    ];
    if (options.vac_enabled) args.push("+sv_lan", "0");
    else args.push("-insecure", "+sv_lan", "1");
    if (options.gslt_token)
      args.push("+sv_setsteamaccount", options.gslt_token);
    if (options.steam_api_key) args.push("-authkey", options.steam_api_key);
    if (options.name) args.push("+hostname", options.name);

    // Linux Environment Setup
    const env: Record<string, string | undefined> = {
      ...process.env,
      SteamAppId: "730",
      STEAM_APP_ID: "730",
      // Dedicated server requires LD_LIBRARY_PATH on Linux to find steamclient.so
      LD_LIBRARY_PATH: `${binDir}:${path.join(binDir, "steam")}:.`,
      // Stabilization for .NET on Linux if needed (rarely an issue compared to Windows)
      DOTNET_BUNDLE_EXTRACT_BASE_DIR: path.join(serverPath, ".net_cache"),
    };

    // Ensure Steam SDK directory exists for initialization (ASYNC)
    // CS2 Linux often requires steamclient.so in ~/.steam/sdk64/
    try {
      const homeDir = process.env.HOME || "/root";
      const sdkDir = path.join(homeDir, ".steam/sdk64");
      const targetLink = path.join(sdkDir, "steamclient.so");
      const steamCmdDir = path.dirname(this.steamCmdExe);
      const sourceSo = path.join(steamCmdDir, "linux64/steamclient.so");

      // Async mkdir
      await fs.promises.mkdir(sdkDir, { recursive: true });

      // Check if target link and source exist (async)
      const [targetExists, sourceExists] = await Promise.all([
        fs.promises
          .access(targetLink)
          .then(() => true)
          .catch(() => false),
        fs.promises
          .access(sourceSo)
          .then(() => true)
          .catch(() => false),
      ]);

      if (!targetExists && sourceExists) {
        console.log(
          `[SYSTEM] Creating Steam SDK symlink: ${sourceSo} -> ${targetLink}`,
        );
        // Use symlink if possible, or copy if not
        try {
          await fs.promises.symlink(sourceSo, targetLink);
        } catch (e) {
          await fs.promises.copyFile(sourceSo, targetLink);
        }
      }
    } catch (err) {
      console.warn(`[SYSTEM] Potential non-fatal SDK setup issue:`, err);
    }

    console.log(`[SERVER] Starting Linux CS2 instance: ${id}`);
    const serverProcess = spawn(cs2Exe, args, {
      cwd: serverPath,
      env,
      shell: false,
    });

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

      if (onLog) onLog(exitMsg);
    });

    this.runningServers.set(id, serverProcess);
    if (serverProcess.pid)
      this.updateStatusStmt.run("ONLINE", serverProcess.pid, id);
  }

  async stopServer(id: string | number) {
    const idStr = id.toString();
    if (this.rconConnections.has(idStr)) {
      try {
        await this.rconConnections.get(idStr).end();
      } catch {}
      this.rconConnections.delete(idStr);
    }

    const proc = this.runningServers.get(idStr);
    if (proc) proc.kill();
    const server = this.getServerStmt.get(idStr) as any;
    if (server?.pid)
      try {
        process.kill(server.pid);
      } catch (e) {}
    this.updateStatusStmt.run("OFFLINE", null, idStr);
    this.runningServers.delete(idStr);
    return true;
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

    // RCON portu: Eğer rcon_port tanımlıysa onu kullan, yoksa game port'u kullan
    const rconPort = server.rcon_port || server.port;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (!rcon) {
          if (attempt === 1) {
            console.log(
              `[RCON] Connecting to server ${id} at 127.0.0.1:${rconPort}`,
            );
          } else {
            console.log(`[RCON] Retry ${attempt}/${retries} for server ${id}`);
          }

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

        if (attempt === retries) {
          console.error(
            `[RCON] Failed to connect to server ${id} at 127.0.0.1:${rconPort} after ${retries} attempts`,
          );
          throw new Error(
            `RCON Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }

        // Sunucu başlatılıyorsa biraz bekle
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    throw new Error("RCON connection failed after all retries");
  }

  async getCurrentMap(id: string | number): Promise<string | null> {
    try {
      const res = await this.sendCommand(id, "status");
      const match = res.match(
        /loaded spawngroup\(\s*1\)\s*:\s*SV:\s*\[1:\s*(\w+)/i,
      );
      return match && match[1] ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  async getPlayers(
    id: string | number,
  ): Promise<{ players: any[]; averagePing: number }> {
    try {
      const combinedOutput = await this.sendCommand(id, "status");
      const lines = combinedOutput.split("\n");
      const idStr = id.toString();
      const cache = this.playerIdentityCache.get(idStr);

      const parsedPlayers: any[] = [];
      const seenNames = new Set<string>();
      const unresolvedNames = new Set<string>();

      // 1. First Pass: Parse status output and extract basic stats
      for (const line of lines) {
        const trimmed = line.trim();

        // Skip bots and non-client lines
        if (
          trimmed.includes("BOT") ||
          trimmed.includes("<BOT>") ||
          !trimmed.includes("[Client]")
        ) {
          continue;
        }

        const nameMatch = trimmed.match(/["'](.+)["']/);
        if (!nameMatch) continue;

        const name = nameMatch[1];
        if (name === undefined || name === null) continue;
        if (name.length < 2 || name.toUpperCase().includes("BOT")) continue;

        // De-duplicate immediately
        if (seenNames.has(name)) continue;
        seenNames.add(name);

        const parts = trimmed.replace("[Client]", "").trim().split(/\s+/);
        const idPart = parts[0];
        if (!idPart || !/^\d+$/.test(idPart) || idPart === "65535") continue;

        // Connection Duration Extraction
        let connectedTime = "00:00:00";
        if (parts.length >= 2 && parts[1]?.includes(":")) {
          const timeParts = parts[1].split(":");
          if (
            timeParts.length === 2 &&
            timeParts[0] !== undefined &&
            timeParts[1] !== undefined
          ) {
            connectedTime = `00:${timeParts[0].padStart(2, "0")}:${timeParts[1].padStart(2, "0")}`;
          } else if (
            timeParts.length === 3 &&
            timeParts[0] !== undefined &&
            timeParts[1] !== undefined &&
            timeParts[2] !== undefined
          ) {
            connectedTime = `${timeParts[0].padStart(2, "0")}:${timeParts[1].padStart(2, "0")}:${timeParts[2].padStart(2, "0")}`;
          }
        }

        // Ping Extraction
        let ping = 0;
        if (parts.length >= 3 && parts[2]) {
          const pVal = parseInt(parts[2]);
          if (!isNaN(pVal)) ping = pVal;
        }

        // Initial Identity Resolution
        let steamId = cache?.get(`i:${idPart}`) || cache?.get(`n:${name}`);

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

  async listFiles(id: string | number, subDir: string = "") {
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

  async readFile(id: string | number, filePath: string) {
    // SECURITY: Validate path to prevent directory traversal (CWE-22)
    const safePath = this._resolveSecurePath(id, filePath);
    return fs.promises.readFile(safePath, "utf8");
  }

  async writeFile(id: string | number, filePath: string, content: string) {
    // SECURITY: Validate path to prevent directory traversal (CWE-22)
    const safePath = this._resolveSecurePath(id, filePath);
    return fs.promises.writeFile(safePath, content);
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
  async ensureSteamCMD() {
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
      return false;
    }
  }

  async installOrUpdateServer(id: string | number, onLog?: any) {
    return steamManager.installOrUpdateServer(
      id,
      this.steamCmdExe,
      this.installDir,
      onLog,
    );
  }

  async getSystemHealth(): Promise<any> {
    const result: any = {
      os: { platform: process.platform, arch: process.arch },
      cpu: { avx: false, model: "", cores: 0 },
      ram: { total: 0, free: 0, status: "unknown" },
      disk: { total: 0, free: 0, status: "unknown" },
      runtimes: {
        dotnet: { status: "missing", versions: [], details: [] },
        steam_sdk: { status: "missing" },
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
      const sdkSo = path.join(homeDir, ".steam/sdk64/steamclient.so");
      try {
        await fs.promises.access(sdkSo);
        result.runtimes.steam_sdk.status = "good";
      } catch {
        result.runtimes.steam_sdk.status = "missing";
      }
    } catch (e) {}
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
