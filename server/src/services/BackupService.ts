import db from "../db.js";
import { fileSystemService } from "./FileSystemService.js";
import { taskService } from "./TaskService.js";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

export interface BackupMetadata {
  id: string;
  serverId: string | number;
  filename: string;
  size: number;
  createdAt: number;
  type: "manual" | "auto";
  comment?: string;
}

class BackupService {
  private backupDir: string;

  constructor() {
    this.backupDir = path.join(process.cwd(), "data", "backups");
    this.init();
  }

  private init() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    // Yedekleme tablosunu oluştur (eğer yoksa)
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

  public async createBackup(serverId: string | number, type: "manual" | "auto" = "manual", comment?: string, taskId?: string): Promise<string> {
    const id = Date.now().toString();
    const filename = `backup_${serverId}_${id}.zip`;
    const targetPath = path.join(this.backupDir, filename);

    if (taskId) {
      taskService.updateTask(taskId, { progress: 5, message: "Yedekleme başlatılıyor..." });
    }

    try {
      const zip = new AdmZip();
      const instancePath = fileSystemService.getInstancePath(serverId);

      if (!fs.existsSync(instancePath)) {
        throw new Error("Sunucu klasörü bulunamadı.");
      }

      // 1. Dosyaları tara ve ekle (Sadece cfg, logs ve data gibi önemli klasörleri yedekle)
      // Symlink'leri takip etmiyoruz, sadece local dosyaları alıyoruz.
      if (taskId) taskService.updateTask(taskId, { progress: 20, message: "Sunucu dosyaları paketleniyor..." });
      
      const csgoCfgPath = path.join(instancePath, "game", "csgo", "cfg");
      if (fs.existsSync(csgoCfgPath)) {
        zip.addLocalFolder(csgoCfgPath, "game/csgo/cfg");
      }

      const csgoAddonsPath = path.join(instancePath, "game", "csgo", "addons");
      if (fs.existsSync(csgoAddonsPath)) {
         // Addons içinde çok fazla dosya olabilir, belki sadece belirli dosyaları almalıyız?
         // Şimdilik ana klasörü alıyoruz.
         zip.addLocalFolder(csgoAddonsPath, "game/csgo/addons");
      }

      // 2. Veritabanı yedeği (Opsiyonel: Eğer bu sunucuya özel bir DB varsa veya tüm DB isteniyorsa)
      // Şimdilik sadece instance dosyalarını alıyoruz.

      if (taskId) taskService.updateTask(taskId, { progress: 80, message: "Arşiv oluşturuluyor..." });
      
      await zip.writeZipPromise(targetPath);

      const stats = fs.statSync(targetPath);
      
      // DB'ye kaydet
      db.prepare(`
        INSERT INTO backups (id, server_id, filename, size, type, comment)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, serverId, filename, stats.size, type, comment || "");

      if (taskId) {
        taskService.completeTask(taskId, "Yedekleme başarıyla tamamlandı.");
      }

      return id;
    } catch (error: any) {
      console.error("[BackupService] Yedekleme hatası:", error);
      if (taskId) {
        taskService.failTask(taskId, `Yedekleme başarısız: ${error.message}`);
      }
      throw error;
    }
  }

  public getBackups(serverId: string | number): BackupMetadata[] {
    const rows = db.prepare("SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC").all(serverId) as any[];
    return rows.map(row => ({
      id: row.id,
      serverId: row.server_id,
      filename: row.filename,
      size: row.size,
      type: row.type,
      comment: row.comment,
      createdAt: new Date(row.created_at).getTime()
    }));
  }

  public async deleteBackup(id: string) {
    const row = db.prepare("SELECT filename FROM backups WHERE id = ?").get(id) as any;
    if (row) {
      const filePath = path.join(this.backupDir, row.filename);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      db.prepare("DELETE FROM backups WHERE id = ?").run(id);
    }
  }

  public async restoreBackup(id: string, taskId?: string) {
    const row = db.prepare("SELECT * FROM backups WHERE id = ?").get(id) as any;
    if (!row) throw new Error("Yedek bulunamadı.");

    const serverId = row.server_id;
    const filePath = path.join(this.backupDir, row.filename);
    const instancePath = fileSystemService.getInstancePath(serverId);

    if (!fs.existsSync(filePath)) throw new Error("Yedek dosyası fiziksel olarak bulunamadı.");

    if (taskId) {
      taskService.updateTask(taskId, { progress: 10, message: "Yedek dosyası açılıyor..." });
    }

    try {
      const zip = new AdmZip(filePath);
      
      if (taskId) taskService.updateTask(taskId, { progress: 40, message: "Dosyalar geri yükleniyor..." });
      
      // Geri yükleme sırasında mevcut dosyaların üzerine yazar.
      zip.extractAllTo(instancePath, true);

      if (taskId) {
        taskService.completeTask(taskId, "Yedek başarıyla geri yüklendi.");
      }
    } catch (error: any) {
      console.error("[BackupService] Geri yükleme hatası:", error);
      if (taskId) {
        taskService.failTask(taskId, `Geri yükleme başarısız: ${error.message}`);
      }
      throw error;
    }
  }

  public startScheduledBackups() {
    // Basit bir günlük periyot (24 saatte bir kontrol)
    // Gerçek bir cron için node-cron önerilir ancak bağımlılık eklememek için setInterval kullanıyoruz.
    console.log("\x1b[32m[SYSTEM]\x1b[0m Scheduled Backup Service initialized (Daily at 03:00).");
    
    setInterval(async () => {
      const now = new Date();
      // Her gün gece 03:00'te çalıştır
      if (now.getHours() === 3 && now.getMinutes() === 0) {
        console.log("[BackupService] Starting scheduled daily backups...");
        try {
          const servers = db.prepare("SELECT id FROM servers").all() as any[];
          for (const server of servers) {
            await this.createBackup(server.id, "auto", "Daily Automated Backup");
          }
        } catch (error) {
          console.error("[BackupService] Scheduled backup failed:", error);
        }
      }
    }, 60000); // Her dakika kontrol et
  }
}

export const backupService = new BackupService();
