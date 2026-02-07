import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import db from '../db.js';
import { fileSystemService } from './FileSystemService.js';
import { lockService } from './LockService.js';

type ServerStatus = 'ONLINE' | 'OFFLINE' | 'STARTING' | 'CRASHED';

interface InstanceState {
  process?: ChildProcess;
  pid?: number;
  logBuffer: string[];
  logWatcher?: fs.FSWatcher;
  status: ServerStatus;
  startedAt?: Date;
}

export interface InstanceOptions {
  cpu_priority?: string | number;
  ram_limit?: string | number;
  map?: string;
  auto_update?: boolean;
  steam_api_key?: string;
  max_players?: number;
  tickrate?: number;
  vac_enabled?: boolean;
  port: number;
  gslt_token?: string;
  name?: string;
  password?: string;
  rcon_password?: string;
  hibernate?: number | boolean;
  tv_enabled?: boolean;
  additional_args?: string;
}

class RuntimeService {
  private instances: Map<string, InstanceState> = new Map();

  constructor() {
    // Periodic check for log rotation (Every hour)
    setInterval(() => this.rotateLogs(), 3600000);
  }

  private rotateLogs() {
    const MAX_LOG_SIZE = 50 * 1024 * 1024; // 50MB

    try {
      const servers = db.prepare('SELECT id FROM servers').all() as { id: number }[];
      for (const server of servers) {
        const id = server.id.toString();
        const instancePath = fileSystemService.getInstancePath(id);

        // 1. Rotate console.log
        const logPath = path.join(instancePath, 'console.log');
        if (fs.existsSync(logPath)) {
          const stats = fs.statSync(logPath);
          if (stats.size > MAX_LOG_SIZE) {
            console.log('[Runtime] Rotating log for instance:', id);
            const buffer = Buffer.alloc(1024 * 1024);
            const fd = fs.openSync(logPath, 'r');
            const start = stats.size - buffer.length;
            fs.readSync(fd, buffer, 0, buffer.length, start > 0 ? start : 0);
            fs.closeSync(fd);
            fs.writeFileSync(logPath, buffer.toString().trim());
          }
        }

        // 2. Cleanup Round Backups (backup_round*.txt)
        const csgoDir = path.join(instancePath, 'game', 'csgo');
        if (fs.existsSync(csgoDir)) {
          const files = fs.readdirSync(csgoDir);
          const backups = files.filter((f) => f.startsWith('backup_round') && f.endsWith('.txt'));
          for (const f of backups) {
            try {
              fs.unlinkSync(path.join(csgoDir, f));
            } catch {
              /* ignore */
            }
          }
          if (backups.length > 0)
            console.log('[Runtime] Cleaned round backups for:', id, 'Count:', backups.length);
        }
      }
    } catch (error: unknown) {
      console.warn('[Runtime] Maintenance failed:', error);
    }
  }

  public getInstanceStatus(id: string): ServerStatus {
    return this.instances.get(id)?.status || 'OFFLINE';
  }

  public getLogBuffer(id: string): string[] {
    return this.instances.get(id)?.logBuffer || [];
  }

  public async startInstance(
    id: string,
    options: InstanceOptions,
    onLog?: (line: string) => void
  ): Promise<void> {
    // Ensure instance identifiers are constrained to a safe, expected format
    if (!/^\d+$/.test(id)) {
      throw new Error(`Invalid instance id: ${id}`);
    }

    if (!(await lockService.acquireInstanceLock(id, 'RUN'))) {
      throw new Error(`Instance ${id} is locked.`);
    }

    const instancePath = fileSystemService.getInstancePath(id);

    // 1. Safety Check: If 'game/bin' is a symlink or critical mods are missing, re-prepare
    try {
      const gameDir = path.join(instancePath, 'game');
      const gameBinDir = path.join(gameDir, 'bin');
      const csgoImportedDir = path.join(gameDir, 'csgo_imported');
      const csgoBinDir = path.join(gameDir, 'csgo', 'bin');
      const csgoMapsDir = path.join(gameDir, 'csgo', 'maps');
      const csgoCfgDir = path.join(gameDir, 'csgo', 'cfg');

      let needsPrepare = false;

      // 1. Check game/bin (must be a directory, not a symlink)
      if (fs.existsSync(gameBinDir)) {
        const stats = await fs.promises.lstat(gameBinDir);
        if (stats.isSymbolicLink()) needsPrepare = true;
      } else {
        needsPrepare = true;
      }

      // 2. Check game/csgo/bin (must be a directory, not a symlink)
      if (!needsPrepare && fs.existsSync(csgoBinDir)) {
        const stats = await fs.promises.lstat(csgoBinDir);
        if (stats.isSymbolicLink()) needsPrepare = true;
      }

      // 3. Check for critical symlinks (csgo_imported, core, etc.)
      if (!needsPrepare && !fs.existsSync(csgoImportedDir)) {
        needsPrepare = true;
      }

      // 4. Check if maps are missing (should have more than just '.' and '..')
      if (
        !needsPrepare &&
        (!fs.existsSync(csgoMapsDir) || (await fs.promises.readdir(csgoMapsDir)).length === 0)
      ) {
        needsPrepare = true;
      }

      // 5. Check if CFG is empty or missing
      if (
        !needsPrepare &&
        (!fs.existsSync(csgoCfgDir) || (await fs.promises.readdir(csgoCfgDir)).length <= 1)
      ) {
        needsPrepare = true;
      }

      // Check if gameinfo.gi is patched for Metamod
      if (!needsPrepare) {
        const gameinfoPath = path.join(gameDir, 'csgo', 'gameinfo.gi');
        if (fs.existsSync(gameinfoPath)) {
          const content = await fs.promises.readFile(gameinfoPath, 'utf8');
          if (!content.includes('csgo/addons/metamod')) {
            needsPrepare = true;
          }
        } else {
          needsPrepare = true;
        }
      }

      if (needsPrepare) {
        console.log(
          '[Runtime] Instance has incomplete or old structure. Re-preparing...',
          'ID:',
          id
        );
        await fileSystemService.prepareInstance(id);
      }
    } catch (error: unknown) {
      console.warn('[Runtime] Auto-prepare check failed for instance:', id, error);
    }

    // 2. Resolve Executable (Linux Only)
    // Now that FileSystemService COPIES the binary instead of symlinking,
    // using the absolute path of the local copy preserves the instance root.
    const relativeBinPath = path.join('game', 'bin', 'linuxsteamrt64', 'cs2');
    const cs2BinLocal = path.join(instancePath, relativeBinPath);

    // Steam Runtime Check
    const runtimeWrapper = fileSystemService.getSteamRuntimePath('run');
    const useRuntime = fs.existsSync(runtimeWrapper);

    // Performance Orchestration: CPU Priority & RAM Limits
    // CPU Priority (nice: -20 to 19, default 0. Lower is higher priority)
    let cpuPriority = options.cpu_priority !== undefined ? Number(options.cpu_priority) : 0;
    if (isNaN(cpuPriority) || !isFinite(cpuPriority)) cpuPriority = 0;

    // RAM Limit (MB -> KB for ulimit)
    let ramLimitMb = options.ram_limit !== undefined ? Number(options.ram_limit) : 0;
    if (isNaN(ramLimitMb) || !isFinite(ramLimitMb)) ramLimitMb = 0;

    let executable = useRuntime ? runtimeWrapper : cs2BinLocal;

    // SECURITY: Path Escalation / Shell Injection Protection
    if (!fileSystemService.isPathSafe(executable) && executable !== 'nice') {
      throw new Error(
        `Security Error: Executable path ${executable} is outside allowed directories.`
      );
    }

    const finalArgs = [];

    // If we have performance tunables, we might need a wrapper or use 'nice' command
    if (cpuPriority !== 0) {
      // Ensure cpuPriority is treated as an integer string
      finalArgs.push('-n', Math.round(cpuPriority).toString(), executable);
      executable = 'nice';
    }

    // 3. Prepare Arguments
    const mapName = options.map || 'de_dust2';
    const isWorkshopID = (m: string) => /^\d+$/.test(m);

    // Group 1: Engine/Dash Parameters (Order matters for some engine initializations)
    const args = [];

    if (useRuntime && executable !== 'nice') {
      args.unshift(cs2BinLocal); // Actual binary is first for runtime wrapper
    } else if (useRuntime && executable === 'nice') {
      // finalArgs already contains [ "-n", cpuPriority, runtimeWrapper ]
      // We need to add cs2BinLocal to args
      args.unshift(cs2BinLocal);
    }

    // Essential headless / console flags
    args.push('-dedicated', '-console', '-usercon');
    args.push('--graphics-provider', '""'); // Force headless mode

    if (options.auto_update) args.push('-autoupdate');
    if (options.steam_api_key) args.push('-authkey', options.steam_api_key);

    args.push('-maxplayers', (options.max_players || 16).toString());
    args.push('-tickrate', (options.tickrate || 128).toString());

    if (options.vac_enabled === false) args.push('-insecure');

    // Group 2: Console Variables / Plus Parameters
    args.push('+ip', '0.0.0.0');
    args.push('+port', options.port.toString());

    if (options.gslt_token) args.push('+sv_setsteamaccount', options.gslt_token);
    if (options.name) args.push('+hostname', options.name);
    if (options.password) args.push('+sv_password', options.password);
    if (options.rcon_password) args.push('+rcon_password', options.rcon_password);

    if (options.hibernate !== undefined) {
      args.push('+sv_hibernate_when_empty', String(options.hibernate));
    }

    if (options.tv_enabled) {
      args.push('+tv_enable', '1');
      args.push('+tv_port', (options.port + 1).toString());
      args.push('+tv_autorecord', '0');
    }

    // Feature Parity: Additional Launch Arguments
    if (options.additional_args) {
      const extraArgs = options.additional_args.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      if (extraArgs.length > 0) {
        args.push(...extraArgs);
      }
    }

    // Map parameter
    args.push(isWorkshopID(mapName) ? '+host_workshop_map' : '+map', mapName);

    // Combine nice/wrapper/binary args
    let combinedArgs = [...finalArgs, ...args];

    // Apply RAM Limit via shell if set
    // Apply RAM Limit via shell if set
    if (ramLimitMb > 0) {
      const limitKb = ramLimitMb * 1024;
      // Use positional arguments to avoid shell injection
      // sh -c 'ulimit -v <limit> && exec "$@"' -- <executable> <args...>
      const originalExecutable = executable;
      const originalArgs = combinedArgs;

      executable = 'sh';
      combinedArgs = [
        '-c',
        `ulimit -v ${limitKb} && exec "$@"`,
        '--',
        originalExecutable,
        ...originalArgs,
      ];
    }

    // 4. Environment (Linux Only)
    const env: NodeJS.ProcessEnv = { ...process.env };
    const binDir = path.dirname(cs2BinLocal);

    const homeDir = process.env.HOME || '/home/quatrix';
    const steamSdk64 = path.join(homeDir, '.steam', 'sdk64');

    const libraryPaths = [
      binDir,
      path.join(binDir, 'linux64'),
      steamSdk64,
      process.env.LD_LIBRARY_PATH || '',
    ].filter(Boolean);

    env.LD_LIBRARY_PATH = libraryPaths.join(':');

    // 5. Spawn with file redirection
    const logFilePath = path.join(instancePath, 'console.log');
    const logFd = fs.openSync(logFilePath, 'a');

    // Create a safe version of args for logging
    // Create a safe version of args for logging
    // Collect sensitive values to explicitly block them by value (Taint Sink Protection)
    const sensitiveValues = new Set<string>();
    if (options.steam_api_key) sensitiveValues.add(options.steam_api_key);
    if (options.password) sensitiveValues.add(options.password);
    if (options.rcon_password) sensitiveValues.add(options.rcon_password);
    if (options.gslt_token) sensitiveValues.add(options.gslt_token);

    const safeArgs: string[] = [];
    let skipNext = false;

    for (let i = 0; i < combinedArgs.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }

      const arg = combinedArgs[i]!;

      // 0. Value-Based Check (Strongest Protection against Clear-Text Logging)
      // If the argument matches a known sensitive value, redact it immediately.
      if (sensitiveValues.has(arg)) {
        safeArgs.push('[REDACTED_VAL]');
        continue;
      }

      const argLower = typeof arg === 'string' ? arg.toLowerCase() : '';

      // 1. Exact match for sensitive flags (key + value pair)
      if (
        argLower === '+sv_setsteamaccount' ||
        argLower === '+sv_password' ||
        argLower === '+rcon_password' ||
        argLower === '+tv_password' ||
        argLower === '-authkey'
      ) {
        safeArgs.push(arg);
        // If the next argument exists, it's the sensitive value -> Redact it
        if (i + 1 < combinedArgs.length) {
          safeArgs.push('[REDACTED]');
          skipNext = true; // Mark next iteration to skip
        }
        continue;
      }

      // 2. Starts with sensitive key (e.g. +sv_password=foo)
      if (
        argLower.startsWith('+sv_setsteamaccount') ||
        argLower.startsWith('+sv_password') ||
        argLower.startsWith('+rcon_password') ||
        argLower.startsWith('+tv_password') ||
        argLower.startsWith('-authkey')
      ) {
        safeArgs.push('[REDACTED]');
        continue;
      }

      // 3. Safe argument
      safeArgs.push(arg);
    }

    console.log(
      '[Runtime] Spawning instance:',
      id,
      'Exe:',
      executable,
      'Args:',
      safeArgs.join(' ')
    );

    const proc = spawn(executable, combinedArgs, {
      cwd: instancePath,
      env,
      detached: true,
      shell: false, // Explicitly disable shell interpretation for safety
      stdio: ['ignore', logFd, logFd],
    });

    // Close the FD in our process as the child now has its own copy
    fs.closeSync(logFd);

    if (!proc.pid) throw new Error('Failed to spawn process');

    // Allow the backend process to exit without terminating the server
    proc.unref();

    // 6. State Management
    const state: InstanceState = {
      process: proc,
      pid: proc.pid,
      logBuffer: [],
      status: 'STARTING',
      startedAt: new Date(),
    };
    this.instances.set(id, state);

    // 7. Start log tailing for live console/chat
    this.startLogWatcher(id, logFilePath, onLog);

    // 8. DB Update
    db.prepare("UPDATE servers SET status = 'ONLINE', pid = ? WHERE id = ?").run(proc.pid, id);

    // 9. Event Listeners (Process level for crash detection)
    proc.on('exit', (code) => this.handleExit(id, code));
  }

  private startLogWatcher(id: string, logFilePath: string, onLog?: (line: string) => void) {
    const state = this.instances.get(id);
    if (!state) return;

    // Ensure file exists
    if (!fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, '');
    }

    let currentSize = fs.statSync(logFilePath).size;

    try {
      const watcher = fs.watch(logFilePath, (event) => {
        if (event === 'change') {
          try {
            const newSize = fs.statSync(logFilePath).size;
            if (newSize > currentSize) {
              const bufferSize = newSize - currentSize;
              const buffer = Buffer.alloc(bufferSize);
              const fd = fs.openSync(logFilePath, 'r');
              fs.readSync(fd, buffer, 0, bufferSize, currentSize);
              fs.closeSync(fd);

              currentSize = newSize;
              this.handleOutput(id, buffer, false, onLog);
            } else if (newSize < currentSize) {
              // File was truncated or rotated
              currentSize = newSize;
            }
          } catch {
            // Silent fail for log read errors to prevent backend crash
          }
        }
      });

      state.logWatcher = watcher;
    } catch (error: unknown) {
      console.error('[Runtime] Failed to start log watcher for:', id, error);
    }
  }

  public async init(onLogAdopted?: (id: string, data: string) => void) {
    console.log('[Runtime] Initializing and recovering orphans...');
    const onlineServers = db
      .prepare("SELECT id, pid FROM servers WHERE status = 'ONLINE' OR status = 'STARTING'")
      .all() as { id: number; pid: number }[];

    for (const s of onlineServers) {
      const id = s.id.toString();
      if (s.pid) {
        try {
          // Check if process is alive
          process.kill(s.pid, 0);
          console.log('[Runtime] Adopted orphan process for server:', id, 'PID:', s.pid);

          // Reconstruct state (without logs/process handle)
          this.instances.set(id, {
            pid: s.pid,
            logBuffer: ['[SYSTEM] Process adopted after backend restart.'],
            status: 'ONLINE',
            startedAt: new Date(), // Approximate
          });

          // Start log tailing for adopted process
          const instancePath = fileSystemService.getInstancePath(id);
          const logFilePath = path.join(instancePath, 'console.log');
          this.startLogWatcher(
            id,
            logFilePath,
            onLogAdopted ? (data) => onLogAdopted(id, data) : undefined
          );
        } catch {
          console.log('[Runtime] Server is dead. Marking OFFLINE.', 'ID:', id, 'PID:', s.pid);
          db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);
          // Clean stale lock
          await lockService.releaseInstanceLock(id);
        }
      } else {
        db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);
        // Clean stale lock
        await lockService.releaseInstanceLock(id);
      }
    }
  }

  public async stopInstance(id: string): Promise<boolean> {
    const state = this.instances.get(id);
    if (!state || !state.pid) return false;

    console.log('[Runtime] Stopping instance:', id, 'PID:', state.pid);

    try {
      // Try to use process object if available, otherwise raw kill
      if (state.process) {
        state.process.kill('SIGTERM');
      } else {
        process.kill(state.pid, 'SIGTERM');
      }

      // Force kill fallback
      setTimeout(() => {
        try {
          if (state.process) state.process.kill('SIGKILL');
          else process.kill(state.pid!, 'SIGKILL');
        } catch {
          /* ignore */
        }
      }, 5000);
    } catch (e) {
      console.warn('[Runtime] Error stopping:', id, e);
    }

    // Clean up immediately from DB perspective
    if (state.logWatcher) {
      state.logWatcher.close();
    }
    this.instances.delete(id);
    db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);

    // Release lock
    await lockService.releaseInstanceLock(id);

    return true;
  }

  private handleOutput(id: string, chunk: Buffer, isError: boolean, onLog?: (l: string) => void) {
    const state = this.instances.get(id);
    if (!state) return;

    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const logLine = trimmed; // Timestamps are already in console.log or added by engine

      // File Log: Handled by redirection in startInstance

      // Memory Buffer
      state.logBuffer.push(logLine);
      if (state.logBuffer.length > 200) state.logBuffer.shift();

      // Callback
      if (onLog) onLog(trimmed);
    }
  }

  private handleExit(id: string, code: number | null) {
    console.log('[Runtime] Instance exited:', id, 'Code:', code);
    const state = this.instances.get(id);

    if (state) {
      if (state.logWatcher) state.logWatcher.close();
      lockService.releaseInstanceLock(id);
    }

    this.instances.delete(id);

    // Crash Detection
    const isCrash = code !== 0 && code !== null && code !== 137 && code !== 143; // 137/143 are SIGKILL/SIGTERM
    const status = isCrash ? 'CRASHED' : 'OFFLINE';

    if (isCrash) console.warn('[Runtime] CRASH DETECTED for instance:', id, 'Code:', code);

    db.prepare('UPDATE servers SET status = ?, pid = NULL WHERE id = ?').run(status, id);
  }
}

export const runtimeService = new RuntimeService();
