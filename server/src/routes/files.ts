import { Router } from "express";
import db from "../db.js";
import { serverManager } from "../serverManager.js";
import { authenticateToken } from "../middleware/auth.js";
import { strictLimiter } from "../middleware/rateLimiter.js";
import { fileSystemService } from "../services/FileSystemService.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router({ mergeParams: true });

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    const { id } = req.params;
    const subDir = req.query.path as string || "";
    try {
      const serverPath = fileSystemService.getInstancePath(id);
      const targetDir = path.join(serverPath, subDir);
      // Security check: ensure targetDir is within serverPath
      if (!targetDir.startsWith(serverPath)) throw new Error("Invalid path");
      
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      cb(null, targetDir);
    } catch (error: any) {
      cb(error, "");
    }
  },
  filename: (req: any, file: any, cb: any) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

router.use(authenticateToken);

// GET /api/servers/:id/files - List files
router.get("/", async (req: any, res) => {
    const { id } = req.params;
    const { path: subDir } = req.query;
    try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const serverPath = fileSystemService.getInstancePath(id);
        const targetDir = path.join(serverPath, (subDir as string) || '');
        if (!targetDir.startsWith(serverPath)) throw new Error("Invalid path");

        const items = await fs.promises.readdir(targetDir, { withFileTypes: true });
        const files = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            size: item.isDirectory() ? 0 : 0, // Simplified for now
            path: path.relative(serverPath, path.join(targetDir, item.name)).replace(/\\/g, '/')
        }));
        res.json(files);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/servers/:id/files/read - Read file content
router.get("/read", async (req: any, res) => {
    const { id } = req.params;
    const { path: filePath } = req.query;
    try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const serverPath = fileSystemService.getInstancePath(id);
        const targetPath = path.join(serverPath, filePath as string);
        if (!targetPath.startsWith(serverPath)) throw new Error("Invalid path");

        const content = await fs.promises.readFile(targetPath, 'utf-8');
        res.json({ content });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/servers/:id/files/write - Write file content
router.post("/write", strictLimiter, async (req: any, res) => {
    const { id } = req.params;
    const { path: filePath, content } = req.body;
    try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const serverPath = fileSystemService.getInstancePath(id);
        const targetPath = path.join(serverPath, filePath);
        if (!targetPath.startsWith(serverPath)) throw new Error("Invalid path");

        await fs.promises.writeFile(targetPath, content);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/servers/:id/files - Delete file or directory
router.delete("/", strictLimiter, async (req: any, res) => {
    const { id } = req.params;
    const { path: filePath } = req.query;
    try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const serverPath = fileSystemService.getInstancePath(id);
        const targetPath = path.join(serverPath, filePath as string);
        if (!targetPath.startsWith(serverPath)) throw new Error("Invalid path");

        await fs.promises.rm(targetPath, { recursive: true, force: true });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/servers/:id/files/mkdir - Create directory
router.post("/mkdir", strictLimiter, async (req: any, res) => {
    const { id } = req.params;
    const { path: dirPath } = req.body;
    try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const serverPath = fileSystemService.getInstancePath(id);
        const targetPath = path.join(serverPath, dirPath);
        if (!targetPath.startsWith(serverPath)) throw new Error("Invalid path");

        await fs.promises.mkdir(targetPath, { recursive: true });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/servers/:id/files/rename - Rename file or directory
router.post("/rename", strictLimiter, async (req: any, res) => {
    const { id } = req.params;
    const { oldPath, newPath } = req.body;
    try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });

        const serverPath = fileSystemService.getInstancePath(id);
        const targetOld = path.join(serverPath, oldPath);
        const targetNew = path.join(serverPath, newPath);
        
        if (!targetOld.startsWith(serverPath) || !targetNew.startsWith(serverPath)) {
            throw new Error("Invalid path");
        }

        await fs.promises.rename(targetOld, targetNew);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/servers/:id/files/upload - Upload file
router.post("/upload", strictLimiter, upload.single("file"), async (req: any, res) => {
    res.json({ success: true });
});

export default router;
