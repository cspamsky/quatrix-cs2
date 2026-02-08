import { ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import db from '../db.js';
import { fileSystemService } from './FileSystemService.js';
import { lockService } from './LockService.js';
import { instanceProcessManager } from './runtime/InstanceProcessManager.js';
import { runtimeLogWatcher } from './runtime/RuntimeLogWatcher.js';
import { instanceOutputHandler } from './runtime/InstanceOutputHandler.js';

export type ServerStatus = 'ONLINE' | 'OFFLINE' | 'STARTING' | 'CRASHED';

export interface InstanceState {
  process?: ChildProcess;
  pid?: number | undefined;
  status: ServerStatus;
  startedAt?: Date;
}

export interface InstanceOptions {
  cpu_priority?: string | number;
  ram_limit?: string | number;
  map?: string;
  auto_update?: boolean;
  steam_api_key?: string | null;
  max_players?: number;
  tickrate?: number;
  vac_enabled?: boolean | number;
  port: number;
  gslt_token?: string | null;
  name?: string;
  password?: string | null;
  rcon_password?: string;
  hibernate?: number | boolean;
  tv_enabled?: boolean;
  additional_args?: string | null;
}

class RuntimeService {
  private instances: Map<string, InstanceState> = new Map();

  /**
   * Initializes the runtime service, recovers orphan processes
   */
  public async init(onLogAdopted?: (id: string, data: string) => void) {
    console.log('[Runtime] Initializing and recovering orphans...');

    // Perform initial maintenance
    runtimeLogWatcher.rotateLogs();

    const onlineServers = db
      .prepare("SELECT id, pid FROM servers WHERE status = 'ONLINE' OR status = 'STARTING'")
      .all() as { id: number; pid: number }[];

    for (const s of onlineServers) {
      const id = s.id.toString();
      if (s.pid && instanceProcessManager.isAlive(s.pid)) {
        console.log('[Runtime] Adopted orphan process for server:', id, 'PID:', s.pid);

        this.instances.set(id, {
          pid: s.pid,
          status: 'ONLINE',
          startedAt: new Date(),
        });

        this.attachWatcher(id, onLogAdopted ? (data) => onLogAdopted(id, data) : undefined);
      } else {
        console.log('[Runtime] Server is dead or no PID. Marking OFFLINE.', id);
        db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);
        await lockService.releaseInstanceLock(id);
      }
    }
  }

  public getInstanceStatus(id: string): ServerStatus {
    return this.instances.get(id)?.status || 'OFFLINE';
  }

  public getLogBuffer(id: string): string[] {
    return instanceOutputHandler.getBuffer(id);
  }

  /**
   * Starts a game server instance
   */
  public async startInstance(
    id: string,
    options: InstanceOptions,
    onLog?: (line: string) => void
  ): Promise<void> {
    if (!/^\d+$/.test(id)) throw new Error(`Invalid instance id: ${id}`);

    if (!(await lockService.acquireInstanceLock(id, 'RUN'))) {
      throw new Error(`Instance ${id} is locked.`);
    }

    const instancePath = fileSystemService.getInstancePath(id);
    await this.ensureInstancePrepared(id, instancePath);

    const logFilePath = path.join(instancePath, 'console.log');
    const logFd = fs.openSync(logFilePath, 'a');

    try {
      const proc = await instanceProcessManager.spawnProcess(id, instancePath, options, logFd);

      // State management
      this.instances.set(id, {
        process: proc,
        pid: proc.pid,
        status: 'STARTING',
        startedAt: new Date(),
      });

      // Handlers
      this.attachWatcher(id, onLog);
      proc.on('exit', (code) => this.handleExit(id, code));

      // DB Update
      db.prepare("UPDATE servers SET status = 'ONLINE', pid = ? WHERE id = ?").run(proc.pid, id);

      console.log(`[Runtime] Instance ${id} started with PID ${proc.pid}`);
    } finally {
      fs.closeSync(logFd);
    }
  }

  /**
   * Stops a game server instance
   */
  public async stopInstance(id: string): Promise<boolean> {
    const state = this.instances.get(id);
    if (!state || !state.pid) return false;

    console.log(`[Runtime] Stopping instance ${id} (PID: ${state.pid})`);

    await instanceProcessManager.killProcess(state.pid, state.process);

    // Cleanup
    runtimeLogWatcher.stopWatching(id);
    instanceOutputHandler.clearBuffer(id);
    this.instances.delete(id);

    db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);
    await lockService.releaseInstanceLock(id);

    return true;
  }

  private attachWatcher(id: string, onLog?: (line: string) => void) {
    const instancePath = fileSystemService.getInstancePath(id);
    const logFilePath = path.join(instancePath, 'console.log');

    runtimeLogWatcher.startWatching(id, logFilePath, (chunk) => {
      instanceOutputHandler.handleOutput(id, chunk, onLog);
    });
  }

  private handleExit(id: string, code: number | null) {
    console.log(`[Runtime] Instance ${id} exited with code ${code}`);

    runtimeLogWatcher.stopWatching(id);
    lockService.releaseInstanceLock(id);
    this.instances.delete(id);

    const isCrash = code !== 0 && code !== null && code !== 137 && code !== 143;
    const status = isCrash ? 'CRASHED' : 'OFFLINE';

    if (isCrash) console.warn(`[Runtime] CRASH DETECTED for instance ${id}`);

    db.prepare('UPDATE servers SET status = ?, pid = NULL WHERE id = ?').run(status, id);
  }

  private async ensureInstancePrepared(id: string, instancePath: string) {
    try {
      const gameDir = path.join(instancePath, 'game');
      const gameBinDir = path.join(gameDir, 'bin');
      const csgoImportedDir = path.join(gameDir, 'csgo_imported');
      const csgoBinDir = path.join(gameDir, 'csgo', 'bin');
      const csgoMapsDir = path.join(gameDir, 'csgo', 'maps');
      const csgoCfgDir = path.join(gameDir, 'csgo', 'cfg');

      let needsPrepare = false;

      if (fs.existsSync(gameBinDir)) {
        const stats = await fs.promises.lstat(gameBinDir);
        if (stats.isSymbolicLink()) needsPrepare = true;
      } else {
        needsPrepare = true;
      }

      if (!needsPrepare && fs.existsSync(csgoBinDir)) {
        const stats = await fs.promises.lstat(csgoBinDir);
        if (stats.isSymbolicLink()) needsPrepare = true;
      }

      if (!needsPrepare && !fs.existsSync(csgoImportedDir)) needsPrepare = true;

      if (
        !needsPrepare &&
        (!fs.existsSync(csgoMapsDir) || (await fs.promises.readdir(csgoMapsDir)).length === 0)
      ) {
        needsPrepare = true;
      }

      if (
        !needsPrepare &&
        (!fs.existsSync(csgoCfgDir) || (await fs.promises.readdir(csgoCfgDir)).length <= 1)
      ) {
        needsPrepare = true;
      }

      if (!needsPrepare) {
        const gameinfoPath = path.join(gameDir, 'csgo', 'gameinfo.gi');
        if (fs.existsSync(gameinfoPath)) {
          const content = await fs.promises.readFile(gameinfoPath, 'utf8');
          if (!content.includes('csgo/addons/metamod')) needsPrepare = true;
        } else {
          needsPrepare = true;
        }
      }

      if (needsPrepare) {
        console.log(`[Runtime] Instance ${id} has incomplete structure. Re-preparing...`);
        await fileSystemService.prepareInstance(id);
      }
    } catch (error: unknown) {
      console.warn(`[Runtime] Auto-prepare check failed for instance ${id}:`, error);
    }
  }
}

export const runtimeService = new RuntimeService();
