import fs from 'fs';
import path from 'path';
import { fileSystemService } from '../FileSystemService.js';
import db from '../../db.js';

export class RuntimeLogWatcher {
  private watchers: Map<string, fs.FSWatcher> = new Map();

  constructor() {
    // Periodic check for log rotation (Every hour)
    setInterval(() => this.rotateLogs(), 3600000).unref();
  }

  /**
   * Starts watching a console.log file for an instance
   */
  startWatching(id: string, logFilePath: string, onData: (buffer: Buffer) => void): void {
    // Stop existing watcher if any
    this.stopWatching(id);

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
              onData(buffer);
            } else if (newSize < currentSize) {
              // File was truncated or rotated
              currentSize = newSize;
            }
          } catch {
            // Silent fail for log read errors to prevent backend crash
          }
        }
      });

      this.watchers.set(id, watcher);
    } catch (error: unknown) {
      console.error(`[LogWatcher] Failed to start log watcher for ${id}:`, error);
    }
  }

  /**
   * Stops watching an instance's log file
   */
  stopWatching(id: string): void {
    const watcher = this.watchers.get(id);
    if (watcher) {
      watcher.close();
      this.watchers.delete(id);
    }
  }

  /**
   * Rotates large logs and cleans up old round backups
   */
  public rotateLogs(): void {
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
            console.log(`[LogWatcher] Rotating log for instance ${id}`);
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
            console.log(`[LogWatcher] Cleaned ${backups.length} round backups for ${id}`);
        }
      }
    } catch (error: unknown) {
      console.warn('[LogWatcher] Maintenance failed:', error);
    }
  }
}

export const runtimeLogWatcher = new RuntimeLogWatcher();
