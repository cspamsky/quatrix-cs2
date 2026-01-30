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
      const lockDir = path.dirname(lockFile);
      if (!fs.existsSync(lockDir)) {
          await fs.promises.mkdir(lockDir, { recursive: true });
      }
      await fs.promises.writeFile(lockFile, content);
      return true;
    } catch (e: any) {
      console.error(`[LOCK] Unexpected error writing lock file ${lockFile}:`, e.message);
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
      const lockDir = path.dirname(lockFile);
      if (!fs.existsSync(lockDir)) {
          await fs.promises.mkdir(lockDir, { recursive: true });
      }
      await fs.promises.writeFile(lockFile, String(process.pid));
      return true;
    } catch (e: any) {
      console.error(`[LOCK] Unexpected error writing core lock file ${lockFile}:`, e.message);
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
      
      // Smart Lock Check: Check age and content
      try {
          const stats = await fs.promises.stat(lockPath);
          const ageMs = Date.now() - stats.mtimeMs;
          
          // 5 Minute Timeout for locks
          if (ageMs > 5 * 60 * 1000) {
              console.warn(`[LOCK] Found stale lock at ${lockPath} (${Math.floor(ageMs/1000)}s old). Removing...`);
              await fs.promises.unlink(lockPath);
              return false;
          }

          // Optional: Check if PID is alive (if content is valid JSON)
          const content = await fs.promises.readFile(lockPath, 'utf-8');
          try {
              const data = JSON.parse(content);
              if (data.pid) {
                  try {
                       process.kill(data.pid, 0); // Check if process exists
                  } catch (e: any) {
                       if (e.code === 'ESRCH') {
                           console.warn(`[LOCK] Lock owner PID ${data.pid} is dead. Removing stale lock.`);
                           await fs.promises.unlink(lockPath);
                           return false;
                       }
                       // If EPERM, it means it's ALIVE but we can't signal it.
                       // In that case, we should assume it's LOCKED.
                  }
              }
          } catch {} 

      } catch (e) {
          // If reading fails, assume locked to be safe, or corrupt? 
          // If we can't read it but it exists, it's a zombie file.
          // Let's rely on age check mainly.
      }

      return true;
    } catch {
      return false;
    }
  }
}

export const lockService = new LockService();
