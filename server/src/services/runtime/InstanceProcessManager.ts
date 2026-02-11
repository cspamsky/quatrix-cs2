import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileSystemService } from '../FileSystemService.js';
import type { InstanceOptions } from '../RuntimeService.js';

export class InstanceProcessManager {
  /**
   * Spawns a new game server process
   */
  async spawnProcess(
    id: string,
    instancePath: string,
    options: InstanceOptions,
    logFd: number
  ): Promise<ChildProcess> {
    const { executable, args, env } = await this.prepareLaunchConfig(id, instancePath, options);

    const proc = spawn(executable, args, {
      cwd: instancePath,
      env,
      detached: true,
      shell: false,
      stdio: ['ignore', logFd, logFd],
    });

    if (!proc.pid) {
      throw new Error('Failed to spawn process');
    }

    proc.unref();
    return proc;
  }

  /**
   * Terminates an instance process
   */
  async killProcess(pid: number, processHandle?: ChildProcess): Promise<void> {
    try {
      if (processHandle) {
        processHandle.kill('SIGTERM');
      } else {
        process.kill(pid, 'SIGTERM');
      }

      // Force kill fallback after 5 seconds
      setTimeout(() => {
        try {
          if (processHandle) processHandle.kill('SIGKILL');
          else process.kill(pid, 'SIGKILL');
        } catch {
          /* ignore */
        }
      }, 5000).unref();
    } catch (e) {
      console.warn(`[ProcessManager] Error killing process ${pid}:`, e);
    }
  }

  /**
   * Checks if a PID is still alive
   */
  isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Prepares arguments and environment for launch
   */
  private async prepareLaunchConfig(id: string, instancePath: string, options: InstanceOptions) {
    const relativeBinPath = path.join('game', 'bin', 'linuxsteamrt64', 'cs2');
    const cs2BinLocal = path.join(instancePath, relativeBinPath);

    const runtimeWrapper = fileSystemService.getSteamRuntimePath('run');
    const useRuntime =
      fs.existsSync(runtimeWrapper) && process.env.DISABLE_STEAM_RUNTIME !== 'true';

    let cpuPriority = options.cpu_priority !== undefined ? Number(options.cpu_priority) : 0;
    if (isNaN(cpuPriority) || !isFinite(cpuPriority)) cpuPriority = 0;

    let ramLimitMb = options.ram_limit !== undefined ? Number(options.ram_limit) : 0;
    if (isNaN(ramLimitMb) || !isFinite(ramLimitMb)) ramLimitMb = 0;

    let executable = useRuntime ? runtimeWrapper : cs2BinLocal;

    if (!fileSystemService.isPathSafe(executable) && executable !== 'nice') {
      throw new Error(
        `Security Error: Executable path ${executable} is outside allowed directories.`
      );
    }

    const finalArgs: string[] = [];
    if (cpuPriority !== 0) {
      finalArgs.push('-n', Math.round(cpuPriority).toString(), executable);
      executable = 'nice';
    }

    const mapName = options.map || 'de_dust2';
    const isWorkshopID = (m: string) => /^\d+$/.test(m);

    const args: string[] = [];
    if (useRuntime) {
      // Script lesson: graphics-provider causes 'must be absolute path' errors in wrapper, better to remove for dedicated.
      // We pass crucial environment variables into the container via --set-env
      const homeDir = process.env.HOME || '/home/quatrix';
      const steamSdk64 = path.join(homeDir, '.steam', 'sdk64');
      const binDir = path.join(instancePath, 'game', 'bin', 'linuxsteamrt64');
      
      const libPath = `${binDir}:${path.join(binDir, 'linux64')}:${steamSdk64}`;
      
      args.push('--set-env', `LD_LIBRARY_PATH=${libPath}`, '--', cs2BinLocal);
    }

    args.push('-dedicated', '-console', '-usercon');
    // args.push('--graphics-provider', '""'); // Removed to avoid wrapper errors

    if (options.auto_update) args.push('-autoupdate');
    if (options.steam_api_key) args.push('-authkey', options.steam_api_key);

    args.push('-maxplayers', (options.max_players || 16).toString());
    args.push('-tickrate', (options.tickrate || 128).toString());

    if (options.vac_enabled === false) args.push('-insecure');

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

    if (options.additional_args) {
      const extraArgs = options.additional_args.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      args.push(...extraArgs);
    }

    args.push(isWorkshopID(mapName) ? '+host_workshop_map' : '+map', mapName);

    let combinedArgs = [...finalArgs, ...args];

    if (ramLimitMb > 0) {
      const limitKb = ramLimitMb * 1024;
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

    return { executable, args: combinedArgs, env };
  }

  /**
   * Redacts sensitive information from launch arguments for safe logging
   */
  getRedactedArgs(combinedArgs: string[], options: InstanceOptions): string[] {
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
      if (sensitiveValues.has(arg)) {
        safeArgs.push('[REDACTED_VAL]');
        continue;
      }

      const argLower = typeof arg === 'string' ? arg.toLowerCase() : '';
      if (
        argLower === '+sv_setsteamaccount' ||
        argLower === '+sv_password' ||
        argLower === '+rcon_password' ||
        argLower === '+tv_password' ||
        argLower === '-authkey'
      ) {
        safeArgs.push(arg);
        if (i + 1 < combinedArgs.length) {
          safeArgs.push('[REDACTED]');
          skipNext = true;
        }
        continue;
      }

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

      safeArgs.push(arg);
    }
    return safeArgs;
  }
}

export const instanceProcessManager = new InstanceProcessManager();
