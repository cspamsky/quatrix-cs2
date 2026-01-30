import fs from "fs";
import path from "path";
import { fileSystemService } from "./FileSystemService.js";

class LockService {
  /**
   * Tries to acquire a lock for a specific instance.
   * Lock file: instances/{id}/.lock
   * Content: { pid: number, type: 'RUN' | 'UPDATE', timestamp: number }
   */
  public async acquireInstanceLock(id: string | number, type: 'RUN' | 'UPDATE'): Promise<boolean> {
    const lockFile = path.join(fileSystemService.getInstancePath(id), ".lock");
    
    if (await this.isLocked(lockFile)) {
      console.warn(`[LOCK] Failed to acquire ${type} lock for instance ${id}. Already locked.`);
      return false;
    }

    const content = JSON.stringify({
      pid: process.pid,
      type,
      timestamp: Date.now()
    });

    try {
      await fs.promises.writeFile(lockFile, content);
      return true;
    } catch (e) {
      return false;
    }
  }

  public async releaseInstanceLock(id: string | number) {
    const lockFile = path.join(fileSystemService.getInstancePath(id), ".lock");
    try {
      await fs.promises.unlink(lockFile);
    } catch {}
  }

  /**
   * Core Update Lock
   * lock file: core/.update.lock
   */
  public async acquireCoreLock(): Promise<boolean> {
    const lockFile = path.join(fileSystemService.getCorePath(), ".update.lock");
    if (await this.isLocked(lockFile)) return false;

    try {
      await fs.promises.writeFile(lockFile, String(process.pid));
      return true;
    } catch {
      return false;
    }
  }

  public async releaseCoreLock() {
    const lockFile = path.join(fileSystemService.getCorePath(), ".update.lock");
    try {
      await fs.promises.unlink(lockFile);
    } catch {}
  }

  private async isLocked(lockPath: string): Promise<boolean> {
    try {
      await fs.promises.access(lockPath);
      // Optional: Check if PID is actually alive?
      // For now, strict file existence is safer.
      return true;
    } catch {
      return false;
    }
  }
}

export const lockService = new LockService();
