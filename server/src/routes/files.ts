import { Router } from "express";
import db from "../db.js";
import serverManager from "../serverManager.js";
import { authenticateToken } from "../middleware/auth.js";
import { strictLimiter } from "../middleware/rateLimiter.js";
import multer from "multer";
import path from "path";

const router = Router({ mergeParams: true });

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    const { id } = req.params;
    const subDir = req.query.path as string || "";
    try {
      const targetDir = serverManager.getFilePath(id, subDir);
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

        const files = await serverManager.listFiles(id, (subDir as string) || '');
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

        const content = await serverManager.readFile(id, filePath as string);
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

        await serverManager.writeFile(id, filePath, content);
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

        await serverManager.deleteFile(id, filePath as string);
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

        await serverManager.createDirectory(id, dirPath);
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

        await serverManager.renameFile(id, oldPath, newPath);
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
