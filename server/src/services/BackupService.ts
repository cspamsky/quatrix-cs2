import db from '../db.js';
import { fileSystemService } from './FileSystemService.js';
import { taskService } from './TaskService.js';
import { databaseManager } from './DatabaseManager.js';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface BackupMetadata {
  id: string;
  serverId: string | number;
  filename: string;
  size: number;
  createdAt: number;
  type: 'manual' | 'auto';
  comment?: string;
}

class BackupService {
  private backupDir: string;

  constructor() {
    this.backupDir = path.join(process.cwd(), 'data', 'backups');
    this.init();
  }

  private init() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    // Create backups table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        server_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        size INTEGER NOT NULL,
        type TEXT NOT NULL,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public async createBackup(
    serverId: string | number,
    type: 'manual' | 'auto' = 'manual',
    comment?: string,
    taskId?: string
  ): Promise<string> {
    // Sanitize serverId to prevent path traversal
    const safeServerId = serverId.toString().replace(/[^a-zA-Z0-9]/g, '');
    if (!safeServerId) {
      throw new Error('Invalid server ID');
    }

    const id = Date.now().toString();
    const filename = `backup_${safeServerId}_${id}.zip`;
    const targetPath = path.join(this.backupDir, filename);

    // Prevent directory traversal check (double check)
    if (!targetPath.startsWith(this.backupDir)) {
      throw new Error('Invalid backup path');
    }

    if (taskId) {
      taskService.updateTask(taskId, { progress: 5, message: 'tasks.messages.backup_starting' });
    }

    try {
      const zip = new AdmZip();
      const instancePath = fileSystemService.getInstancePath(serverId);

      if (!fs.existsSync(instancePath)) {
        throw new Error('Server folder not found.');
      }

      // 1. Scan and add files
      if (taskId)
        taskService.updateTask(taskId, {
          progress: 20,
          message: 'tasks.messages.packaging_files',
        });

      // Exclusion patterns
      const excludePatterns = ['.log', '.tmp', '.tar.gz', '.zip', 'backups', 'core.'];

      const addFolderRecursive = (localPath: string, zipPath: string) => {
        if (!fs.existsSync(localPath)) return;
        const files = fs.readdirSync(localPath);
        for (const file of files) {
          if (excludePatterns.some((p) => file.includes(p))) continue;
          const fullPath = path.join(localPath, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            addFolderRecursive(fullPath, path.join(zipPath, file));
          } else {
            zip.addLocalFile(fullPath, zipPath);
          }
        }
      };

      const csgoCfgPath = path.join(instancePath, 'game', 'csgo', 'cfg');
      if (fs.existsSync(csgoCfgPath)) {
        addFolderRecursive(csgoCfgPath, 'game/csgo/cfg');
      }

      const csgoAddonsPath = path.join(instancePath, 'game', 'csgo', 'addons');
      if (fs.existsSync(csgoAddonsPath)) {
        addFolderRecursive(csgoAddonsPath, 'game/csgo/addons');
      }

      // 2. Panel Database Backup (SQLite)
      const sqlitePath = path.join(process.cwd(), 'data', 'database.sqlite');
      if (fs.existsSync(sqlitePath)) {
        const sqliteBackupPath = path.join(process.cwd(), 'data', `database_temp_${id}.sqlite`);
        fs.copyFileSync(sqlitePath, sqliteBackupPath);
        zip.addLocalFile(sqliteBackupPath, '', 'panel_database.sqlite');
        // We'll delete temp file after zip write
      }

      // 3. CS2 Server Database Backup (MySQL)
      const creds = await databaseManager.getDatabaseCredentials(serverId);
      let mysqlBackupFile = '';
      if (creds && (await databaseManager.isAvailable())) {
        if (taskId)
          taskService.updateTask(taskId, { progress: 50, message: 'tasks.messages.dumping_mysql' });

        mysqlBackupFile = path.join(process.cwd(), 'data', `mysql_dump_${serverId}_${id}.sql`);
        try {
          const cmd = `mysqldump -h ${creds.host} -P ${creds.port} -u ${creds.user} -p'${creds.password}' ${creds.database} > "${mysqlBackupFile}"`;
          await execAsync(cmd);
          if (fs.existsSync(mysqlBackupFile)) {
            zip.addLocalFile(mysqlBackupFile, '', 'server_database.sql');
          }
        } catch (dumpErr) {
          console.error('[BackupService] MySQL Dump failed:', dumpErr);
        }
      }

      if (taskId)
        taskService.updateTask(taskId, {
          progress: 80,
          message: 'tasks.messages.creating_archive',
        });

      await zip.writeZipPromise(targetPath);

      // Cleanup temp files
      const sqliteTemp = path.join(process.cwd(), 'data', `database_temp_${id}.sqlite`);
      if (fs.existsSync(sqliteTemp)) fs.unlinkSync(sqliteTemp);
      if (mysqlBackupFile && fs.existsSync(mysqlBackupFile)) fs.unlinkSync(mysqlBackupFile);

      const stats = fs.statSync(targetPath);

      // Save to DB
      db.prepare(
        `
        INSERT INTO backups (id, server_id, filename, size, type, comment)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(id, serverId, filename, stats.size, type, comment || '');

      // 4. Retention Policy (Cleanup for automated backups)
      if (type === 'auto') {
        await this.cleanupOldBackups(serverId);
      }

      if (taskId) {
        taskService.completeTask(taskId, 'tasks.messages.backup_success');
      }

      return id;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[BackupService] Backup error:', err);
      // Cleanup on failure
      const sqliteTemp = path.join(process.cwd(), 'data', `database_temp_${id}.sqlite`);
      if (fs.existsSync(sqliteTemp)) fs.unlinkSync(sqliteTemp);
      if (taskId) {
        taskService.failTask(taskId, `tasks.messages.backup_failed`);
      }
      throw err;
    }
  }

  public getBackups(serverId: string | number): BackupMetadata[] {
    const rows = db
      .prepare('SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC')
      .all(serverId) as {
      id: string;
      server_id: number;
      filename: string;
      size: number;
      type: 'manual' | 'auto';
      comment: string;
      created_at: string;
    }[];
    return rows.map((row) => ({
      id: row.id,
      serverId: row.server_id,
      filename: row.filename,
      size: row.size,
      type: row.type,
      comment: row.comment,
      createdAt: new Date(row.created_at).getTime(),
    }));
  }

  public async deleteBackup(id: string) {
    const row = db.prepare('SELECT filename FROM backups WHERE id = ?').get(id) as
      | {
          filename: string;
        }
      | undefined;
    if (row) {
      const filePath = path.join(this.backupDir, row.filename);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      db.prepare('DELETE FROM backups WHERE id = ?').run(id);
    }
  }

  public async restoreBackup(id: string, taskId?: string) {
    const row = db.prepare('SELECT * FROM backups WHERE id = ?').get(id) as
      | {
          server_id: number;
          filename: string;
        }
      | undefined;
    if (!row) throw new Error('Backup not found.');

    const serverId = row.server_id;
    const filePath = path.join(this.backupDir, row.filename);
    const instancePath = fileSystemService.getInstancePath(serverId);

    if (!fs.existsSync(filePath)) throw new Error('Backup file not found physically.');

    if (taskId) {
      taskService.updateTask(taskId, { progress: 10, message: 'tasks.messages.opening_backup' });
    }

    try {
      const zip = new AdmZip(filePath);

      if (taskId)
        taskService.updateTask(taskId, { progress: 40, message: 'tasks.messages.restoring_files' });

      // Overwrites existing files during restoration.
      zip.extractAllTo(instancePath, true);

      if (taskId) {
        taskService.completeTask(taskId, 'tasks.messages.restore_success');
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[BackupService] Restore error:', err);
      if (taskId) {
        taskService.failTask(taskId, `tasks.messages.restore_failed`);
      }
      throw err;
    }
  }

  private async cleanupOldBackups(serverId: string | number) {
    const limitSetting = db
      .prepare("SELECT value FROM settings WHERE key = 'backup_retention_limit'")
      .get() as { value: string } | undefined;
    const limit = parseInt(limitSetting?.value || '7');

    const backups = db
      .prepare(
        "SELECT id, filename FROM backups WHERE server_id = ? AND type = 'auto' ORDER BY created_at ASC"
      )
      .all(serverId) as { id: string; filename: string }[];

    if (backups.length > limit) {
      const toDelete = backups.slice(0, backups.length - limit);
      for (const backup of toDelete) {
        console.log(`[BackupService] Retention cleanup: Deleting old backup ${backup.filename}`);
        await this.deleteBackup(backup.id);
      }
    }
  }

  public startScheduledBackups() {
    console.log('\x1b[32m[SYSTEM]\x1b[0m Scheduled Backup Service initialized.');

    setInterval(async () => {
      const now = new Date();

      const autoEnabled = db
        .prepare("SELECT value FROM settings WHERE key = 'backup_auto_enabled'")
        .get() as { value: string } | undefined;
      if (autoEnabled?.value !== 'true') return;

      const timeSetting = db
        .prepare("SELECT value FROM settings WHERE key = 'backup_schedule_time'")
        .get() as { value: string } | undefined;
      const scheduleTime = timeSetting?.value || '03:00';
      const [schedHours, schedMinutes] = scheduleTime.split(':').map((n) => parseInt(n));

      // Check if current time matches scheduled time
      if (now.getHours() === schedHours && now.getMinutes() === schedMinutes) {
        const frequencySetting = db
          .prepare("SELECT value FROM settings WHERE key = 'backup_frequency'")
          .get() as { value: string } | undefined;
        const freq = frequencySetting?.value || 'daily';

        const specificDateSetting = db
          .prepare("SELECT value FROM settings WHERE key = 'backup_specific_date'")
          .get() as { value: string } | undefined;
        const todayStr = now.toISOString().split('T')[0]; // 2026-02-14

        let shouldRun = false;

        // Check for specific one-time date
        if (specificDateSetting?.value && specificDateSetting.value === todayStr) {
          shouldRun = true;
          // Clear specific date after trigger so it doesn't run again
          db.prepare("UPDATE settings SET value = '' WHERE key = 'backup_specific_date'").run();
          console.log(`[BackupService] One-time specific date backup triggered for ${todayStr}.`);
        } else {
          // Standard frequency check
          if (freq === 'daily') {
            shouldRun = true;
          } else if (freq === 'weekly') {
            shouldRun = now.getDay() === 0; // Sunday
          } else if (freq === 'monthly') {
            shouldRun = now.getDate() === 1; // 1st of month
          }
        }

        if (shouldRun) {
          console.log(`[BackupService] Starting scheduled ${freq} backups for ${scheduleTime}...`);
          try {
            const servers = db.prepare('SELECT id, is_installed FROM servers').all() as {
              id: number;
              is_installed: number;
            }[];
            for (const server of servers) {
              if (server.is_installed) {
                await this.createBackup(
                  server.id,
                  'auto',
                  `${freq.charAt(0).toUpperCase() + freq.slice(1)} Automated Backup`
                );
              }
            }
          } catch (error) {
            console.error('[BackupService] Scheduled backup failed:', error);
          }
        }
      }
    }, 60000); // Check every minute
  }
}

export const backupService = new BackupService();
