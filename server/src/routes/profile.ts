import { Router } from "express";
import bcrypt from "bcryptjs";
import { generateSecret, verify, generateURI } from "otplib";
import QRCode from "qrcode";
import multer from "multer";
import path from "path";
import fs from "fs";
import db from "../db.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// --- Multer Configuration for Avatar Upload ---
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/avatars';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req: any, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.user.id}-${Date.now()}${ext}`);
  }
});

const upload = multer({ 
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// Middleware to ensure user is authenticated
router.use(authenticateToken);

// GET /api/profile
router.get("/", (req: any, res) => {
  try {
    const user = db.prepare("SELECT id, username, avatar_url, two_factor_enabled, created_at FROM users WHERE id = ?").get(req.user.id) as any;
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ ...user, currentJti: req.user.jti });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

// POST /api/profile/avatar/upload
router.post("/avatar/upload", authenticateToken, upload.single('avatar'), (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    
    // Convert backslashes to forward slashes for URL
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    
    db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatarUrl, req.user.id);
    
    res.json({ message: "Avatar uploaded successfully", avatarUrl });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to upload avatar" });
  }
});

// PUT /api/profile/password
router.put("/password", async (req: any, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Current and new passwords are required" });
  }

  try {
    const user = db.prepare("SELECT password FROM users WHERE id = ?").get(req.user.id) as any;
    
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashedNewPassword, req.user.id);
    
    // Security: Terminate all active sessions
    db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(req.user.id);

    res.json({ message: "Password updated successfully. Please log in again." });
  } catch (error) {
    res.status(500).json({ message: "Failed to update password" });
  }
});

// PUT /api/profile/avatar
router.put("/avatar", (req: any, res) => {
  const { avatarUrl } = req.body;
  try {
    db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatarUrl, req.user.id);
    res.json({ message: "Avatar updated successfully", avatarUrl });
  } catch (error) {
    res.status(500).json({ message: "Failed to update avatar" });
  }
});

// GET /api/profile/sessions
router.get("/sessions", (req: any, res) => {
  try {
    const sessions = db.prepare("SELECT * FROM user_sessions WHERE user_id = ? ORDER BY last_active DESC").all(req.user.id);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch sessions" });
  }
});

// DELETE /api/profile/sessions
router.delete("/sessions", (req: any, res) => {
  try {
    // Terminate all sessions EXCEPT the current one
    db.prepare("DELETE FROM user_sessions WHERE user_id = ? AND token_id != ?").run(req.user.id, req.user.jti);
    res.json({ message: "All other sessions terminated" });
  } catch (error) {
    res.status(500).json({ message: "Failed to terminate sessions" });
  }
});

// DELETE /api/profile/sessions/:tokenId
router.delete("/sessions/:tokenId", (req: any, res) => {
  try {
    db.prepare("DELETE FROM user_sessions WHERE user_id = ? AND token_id = ?").run(req.user.id, req.params.tokenId);
    res.json({ message: "Session terminated" });
  } catch (error) {
    res.status(500).json({ message: "Failed to terminate session" });
  }
});

// --- 2FA Routes ---

// POST /api/profile/2fa/setup
router.post("/2fa/setup", async (req: any, res) => {
  try {
    const user = db.prepare("SELECT username, two_factor_enabled FROM users WHERE id = ?").get(req.user.id) as any;
    if (user.two_factor_enabled) {
      return res.status(400).json({ message: "2FA is already enabled" });
    }

    const secret = generateSecret();
    const otpauth = generateURI({ 
      issuer: "Quatrix Panel",
      label: user.username, 
      secret 
    });
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    // Temporarily store secret in user record (not enabled yet)
    db.prepare("UPDATE users SET two_factor_secret = ? WHERE id = ?").run(secret, req.user.id);

    res.json({ secret, qrCodeUrl });
  } catch (error) {
    res.status(500).json({ message: "Failed to setup 2FA" });
  }
});

// POST /api/profile/2fa/verify
router.post("/2fa/verify", async (req: any, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: "Verification code is required" });

  try {
    const user = db.prepare("SELECT two_factor_secret FROM users WHERE id = ?").get(req.user.id) as any;
    
    const isValid = verify({
      token: code,
      secret: user.two_factor_secret
    });

    if (!isValid) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    db.prepare("UPDATE users SET two_factor_enabled = 1 WHERE id = ?").run(req.user.id);
    res.json({ message: "2FA enabled successfully" });
  } catch (error) {
    res.status(500).json({ message: "Verification failed" });
  }
});

// POST /api/profile/2fa/disable
router.post("/2fa/disable", async (req: any, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: "Password is required" });

  try {
    const user = db.prepare("SELECT password FROM users WHERE id = ?").get(req.user.id) as any;
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid password" });
    }

    db.prepare("UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?").run(req.user.id);
    res.json({ message: "2FA disabled successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to disable 2FA" });
  }
});

export default router;
