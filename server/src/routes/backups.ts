import { Router } from 'express';
import type { Request, Response } from 'express';
import { backupService } from '../services/BackupService.js';
import { taskService } from '../services/TaskService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

// Yedekleri listele
router.get('/:serverId', (req: Request, res: Response) => {
  try {
    const backups = backupService.getBackups(req.params.serverId as string);
    res.json(backups);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Yeni yedek oluştur
router.post('/:serverId/create', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const { comment, type } = req.body as { comment?: string; type?: string };

    // Task oluştur
    const taskId = `backup_${Date.now()}`;
    taskService.createTask(taskId, 'backup_create', { serverId: serverId as string });

    // Arka planda yedeklemeyi başlat
    const backupType = (type === 'auto' ? 'auto' : 'manual') as 'manual' | 'auto';
    backupService
      .createBackup(serverId as string, backupType, comment || '', taskId)
      .catch((err) => {
        console.error('[API] Backup failed:', err);
      });

    res.json({ taskId, message: 'Yedekleme işlemi başlatıldı.' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Yedekten geri yükle
router.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Task oluştur
    const taskId = `restore_${Date.now()}`;
    taskService.createTask(taskId, 'backup_restore', { backupId: id as string });

    // Arka planda geri yüklemeyi başlat
    backupService.restoreBackup(id as string, taskId).catch((err) => {
      console.error('[API] Restore failed:', err);
    });

    res.json({ taskId, message: 'Geri yükleme işlemi başlatıldı.' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Yedek sil
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await backupService.deleteBackup(req.params.id as string);
    res.json({ message: 'Yedek silindi.' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

export default router;
