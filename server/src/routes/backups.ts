import { Router } from 'express';
import type { Request, Response } from 'express';
import { backupService } from '../services/BackupService.js';
import { taskService } from '../services/TaskService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

// List backups
router.get('/:serverId', (req: Request, res: Response) => {
  try {
    const backups = backupService.getBackups(req.params.serverId as string);
    res.json(backups);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Create new backup
router.post('/:serverId/create', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const { comment, type } = req.body as { comment?: string; type?: string };

    // Create task
    const taskId = `backup_${Date.now()}`;
    taskService.createTask(taskId, 'backup_create', { serverId: serverId as string });

    // Start backup in background
    const backupType = (type === 'auto' ? 'auto' : 'manual') as 'manual' | 'auto';
    backupService
      .createBackup(serverId as string, backupType, comment || '', taskId)
      .catch((err) => {
        console.error('[API] Backup failed:', err);
      });

    res.json({ taskId, message: 'Backup process started.' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Restore from backup
router.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Create task
    const taskId = `restore_${Date.now()}`;
    taskService.createTask(taskId, 'backup_restore', { backupId: id as string });

    // Start restore in background
    backupService.restoreBackup(id as string, taskId).catch((err) => {
      console.error('[API] Restore failed:', err);
    });

    res.json({ taskId, message: 'Restore process started.' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Delete backup
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await backupService.deleteBackup(req.params.id as string);
    res.json({ message: 'Backup deleted.' });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

export default router;
