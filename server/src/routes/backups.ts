import express from "express";
import { backupService } from "../services/BackupService.js";
import { taskService } from "../services/TaskService.js";

const router = express.Router();

// Yedekleri listele
router.get("/:serverId", (req, res) => {
  try {
    const backups = backupService.getBackups(req.params.serverId);
    res.json(backups);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Yeni yedek oluştur
router.post("/:serverId/create", async (req, res) => {
  try {
    const { serverId } = req.params;
    const { comment, type } = req.body;
    
    // Task oluştur
    const taskId = `backup_${Date.now()}`;
    taskService.createTask(taskId, "backup_create", { serverId });

    // Arka planda yedeklemeyi başlat
    backupService.createBackup(serverId, type || "manual", comment, taskId).catch(err => {
      console.error("[API] Backup failed:", err);
    });

    res.json({ taskId, message: "Yedekleme işlemi başlatıldı." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Yedekten geri yükle
router.post("/:id/restore", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Task oluştur
    const taskId = `restore_${Date.now()}`;
    taskService.createTask(taskId, "backup_restore", { backupId: id });

    // Arka planda geri yüklemeyi başlat
    backupService.restoreBackup(id, taskId).catch(err => {
      console.error("[API] Restore failed:", err);
    });

    res.json({ taskId, message: "Geri yükleme işlemi başlatıldı." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Yedek sil
router.delete("/:id", async (req, res) => {
  try {
    await backupService.deleteBackup(req.params.id);
    res.json({ message: "Yedek silindi." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
