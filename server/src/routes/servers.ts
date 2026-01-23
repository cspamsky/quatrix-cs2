import { Router } from "express";
import { z } from "zod";
import db from "../db.js";
import { serverManager } from "../serverManager.js";
import { authenticateToken } from "../middleware/auth.js";
import { createServerLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// Schema for validation
export const createServerSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(50, "Name must be less than 50 characters").regex(/^[a-zA-Z0-9\s\-_]+$/, "Name can only contain letters, numbers, spaces, hyphens and underscores"),
  port: z.number().int().min(1024, "Port must be >= 1024").max(65535, "Port must be <= 65535"),
  rcon_password: z.string().min(6, "RCON Password must be at least 6 characters"),
  map: z.string().default("de_dust2"),
  max_players: z.number().int().min(1).max(64).default(10),
  password: z.string().nullable().optional(),
  gslt_token: z.string().nullable().optional(),
  steam_api_key: z.string().nullable().optional(),
  vac_enabled: z.number().min(0).max(1).default(1),
  game_type: z.number().int().min(0).default(0),
  game_mode: z.number().int().min(0).default(0),
  tickrate: z.number().int().min(1).max(128).default(128)
});

// Middleware for this router
router.use(authenticateToken);

// GET /api/servers
router.get("/", (req: any, res) => {
  try {
    const servers = db.prepare("SELECT *, is_installed as isInstalled FROM servers WHERE user_id = ?").all(req.user.id);
    res.json(servers);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch servers" });
  }
});

// GET /api/servers/:id
router.get("/:id", (req: any, res) => {
  try {
    const server = db.prepare("SELECT * FROM servers WHERE id = ?").get(req.params.id);
    if (!server) return res.status(404).json({ message: "Server not found" });
    res.json(server);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch server" });
  }
});

// GET /api/servers/:id/logs
router.get("/:id/logs", (req: any, res) => {
  try {
    const logs = serverManager.getLogs(req.params.id);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch logs" });
  }
});

// DELETE /api/servers/:id
router.delete("/:id", async (req: any, res) => {
  try {
    const server = db.prepare("SELECT * FROM servers WHERE id = ?").get(req.params.id) as any;
    if (!server) return res.status(404).json({ message: "Server not found" });

    // Stop server if running
    if (server.status === "ONLINE") {
      await serverManager.stopServer(server.id);
    }

    // Physically delete server folder
    await serverManager.deleteServerFiles(server.id);

    db.prepare("DELETE FROM servers WHERE id = ?").run(req.params.id);
    res.json({ message: "Server deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete server" });
  }
});

// PUT /api/servers/:id
router.put("/:id", (req: any, res) => {
  const { id } = req.params;
  const { name, map, max_players, port, password, rcon_password, vac_enabled, gslt_token, steam_api_key, game_type, game_mode, tickrate } = req.body;
  
  try {
    const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
    if (!server) return res.status(404).json({ message: "Server not found" });

    db.prepare(`
      UPDATE servers 
      SET name = ?, map = ?, max_players = ?, port = ?, password = ?, 
          rcon_password = ?, vac_enabled = ?, gslt_token = ?, steam_api_key = ?,
          game_type = ?, game_mode = ?, tickrate = ?
      WHERE id = ?
    `).run(name, map, max_players, port, password, rcon_password, vac_enabled ? 1 : 0, gslt_token, steam_api_key, game_type || 0, game_mode || 0, tickrate || 128, id);

    // Emit socket event for real-time UI update
    const io = req.app.get('io');
    if (io) io.emit('server_update', { serverId: parseInt(id) });

    res.json({ message: "Server settings updated successfully" });
  } catch (error) {
    console.error("Update server error:", error);
    res.status(500).json({ message: "Failed to update server settings" });
  }
});

// POST /api/servers
router.post("/", createServerLimiter, (req: any, res) => {
  try {
    const result = createServerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: result.error.issues[0]?.message || "Validation failed" });
    }

    const { name, port, rcon_password, map, max_players, password, gslt_token, steam_api_key, vac_enabled, game_type, game_mode, tickrate } = result.data;
    
    const result_count = db.prepare("SELECT count(*) as count FROM servers WHERE port = ?").get(port) as { count: number } | undefined;
    if (result_count && result_count.count > 0) {
      return res.status(400).json({ message: "Port is already in use" });
    }

    const info = db.prepare(`
      INSERT INTO servers (name, port, rcon_password, status, is_installed, user_id, map, max_players, password, gslt_token, steam_api_key, vac_enabled, game_type, game_mode, tickrate)
      VALUES (?, ?, ?, 'OFFLINE', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, port, rcon_password, req.user.id, map, max_players, password, gslt_token, steam_api_key, vac_enabled, game_type || 0, game_mode || 0, tickrate || 128);

    res.status(201).json({ id: info.lastInsertRowid, ...result.data });
  } catch (error) {
    console.error("Server creation error:", error);
    res.status(500).json({ message: "Failed to create server" });
  }
});

// POST /api/servers/health/repair
router.post("/health/repair", async (req: any, res) => {
  try {
    const result = await serverManager.repairSystemHealth();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: "System health repair failed", 
      details: { error: error.message } 
    });
  }
});

export default router;
