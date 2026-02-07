import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { strictLimiter } from '../middleware/rateLimiter.js';
import { fileSystemService } from '../services/FileSystemService.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router({ mergeParams: true });

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (
    req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    const { id } = req.params;
    const subDir = (req.query.path as string) || '';
    try {
      const serverPath = fileSystemService.getInstancePath(id as string);
      const targetDir = path.join(serverPath, subDir);
      // Security check: ensure targetDir is within serverPath
      if (!targetDir.startsWith(serverPath)) throw new Error('Invalid path');

      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      cb(null, targetDir);
    } catch (error: unknown) {
      cb(error as Error, '');
    }
  },
  filename: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

router.use(authenticateToken);

// GET /api/servers/:id/files - List files
router.get('/', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: subDir } = req.query;
  const authReq = req as AuthenticatedRequest;
  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const serverPath = fileSystemService.getInstancePath(id as string);
    const targetDir = path.join(serverPath, (subDir as string) || '');
    if (!targetDir.startsWith(serverPath)) throw new Error('Invalid path');

    const items = await fs.promises.readdir(targetDir, { withFileTypes: true });
    const files = items.map((item) => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      size: 0, // Simplified for now
      path: path.relative(serverPath, path.join(targetDir, item.name)).replace(/\\/g, '/'),
    }));
    res.json(files);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// GET /api/servers/:id/files/read - Read file content
router.get('/read', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: filePath } = req.query;
  const authReq = req as AuthenticatedRequest;
  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const serverPath = fileSystemService.getInstancePath(id as string);
    const targetPath = path.join(serverPath, filePath as string);
    if (!targetPath.startsWith(serverPath)) throw new Error('Invalid path');

    const content = await fs.promises.readFile(targetPath, 'utf-8');
    res.json({ content });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// POST /api/servers/:id/files/write - Write file content
router.post('/write', strictLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: filePath, content } = req.body as { path: string; content: string };
  const authReq = req as AuthenticatedRequest;
  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const serverPath = fileSystemService.getInstancePath(id as string);
    const targetPath = path.join(serverPath, filePath);
    if (!targetPath.startsWith(serverPath)) throw new Error('Invalid path');

    await fs.promises.writeFile(targetPath, content);
    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/servers/:id/files - Delete file or directory
router.delete('/', strictLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: filePath } = req.query;
  const authReq = req as AuthenticatedRequest;
  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const serverPath = fileSystemService.getInstancePath(id as string);
    const targetPath = path.join(serverPath, filePath as string);
    if (!targetPath.startsWith(serverPath)) throw new Error('Invalid path');

    await fs.promises.rm(targetPath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// POST /api/servers/:id/files/mkdir - Create directory
router.post('/mkdir', strictLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: dirPath } = req.body as { path: string };
  const authReq = req as AuthenticatedRequest;
  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const serverPath = fileSystemService.getInstancePath(id as string);
    const targetPath = path.join(serverPath, dirPath);
    if (!targetPath.startsWith(serverPath)) throw new Error('Invalid path');

    await fs.promises.mkdir(targetPath, { recursive: true });
    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// POST /api/servers/:id/files/rename - Rename file or directory
router.post('/rename', strictLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { oldPath, newPath } = req.body as { oldPath: string; newPath: string };
  const authReq = req as AuthenticatedRequest;
  try {
    const server = db
      .prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?')
      .get(id as string, authReq.user.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const serverPath = fileSystemService.getInstancePath(id as string);
    const targetOld = path.join(serverPath, oldPath);
    const targetNew = path.join(serverPath, newPath);

    if (!targetOld.startsWith(serverPath) || !targetNew.startsWith(serverPath)) {
      throw new Error('Invalid path');
    }

    await fs.promises.rename(targetOld, targetNew);
    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ message: err.message });
  }
});

// POST /api/servers/:id/files/upload - Upload file
router.post(
  '/upload',
  strictLimiter,
  upload.single('file'),
  async (_req: Request, res: Response) => {
    res.json({ success: true });
  }
);

export default router;
