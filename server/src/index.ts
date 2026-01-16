import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { Server, type Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import si from "systeminformation";
import path from "path";
import fs from "fs";
import { z } from "zod";
import db from "./db.js";
import { serverManager } from "./serverManager.js";
import { authenticateToken } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import { apiLimiter, strictLimiter, createServerLimiter } from "./middleware/rateLimiter.js";

const createServerSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(50, "Name must be less than 50 characters").regex(/^[a-zA-Z0-9\s\-_]+$/, "Name can only contain letters, numbers, spaces, hyphens and underscores"),
  port: z.number().int().min(1024, "Port must be >= 1024").max(65535, "Port must be <= 65535"),
  rcon_password: z.string().min(6, "RCON Password must be at least 6 characters"),
  map: z.string().default("de_dust2"),
  max_players: z.number().int().min(1).max(64).default(10),
  password: z.string().nullable().optional(),
  gslt_token: z.string().nullable().optional(),
  steam_api_key: z.string().nullable().optional(),
  vac_enabled: z.number().min(0).max(1).default(1)
});

// Global cache for public IP
let cachedPublicIp = '127.0.0.1';

// 🛡️ Error shield: Prevent process from dying silently
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // We don't exit here unless it's critical, but we log it
});

// Initial IP fetch
const fetchPublicIp = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json() as { ip: string };
    cachedPublicIp = data.ip;
    console.log(`System Public IP detected: ${cachedPublicIp}`);
  } catch (e) {
    console.warn("Could not fetch public IP, using default.");
  }
};
fetchPublicIp();

// DEPRECATED: ServerManager handles cleanup and recovery intelligently now.
// try {
//   db.prepare("UPDATE servers SET status = 'OFFLINE'").run();
//   console.log("Database: All server statuses reset to OFFLINE.");
// } catch (err) {
//   console.error("Database reset error:", err);
// }

try {
  console.log("Loading environment variables...");
  dotenv.config();

  console.log("Initializing ServerManager...");
  serverManager.ensureSteamCMD().then(success => {
    if (success) console.log("System Ready: SteamCMD is active.");
    else console.warn("Warning: SteamCMD not found.");
  });

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
  });

  const PORT = process.env.PORT || 3001;

  app.use(cors());
  app.use(express.json());
  
  // Rate Limiting
  app.use('/api', apiLimiter);

  // --- Auth & Middlewares ---

  // --- Auth Routes ---
  app.use('/api', authRouter);

  // --- API Endpoints ---
  app.get("/api/servers", authenticateToken, (req: any, res) => {
    try {
      const servers = db.prepare("SELECT *, is_installed as isInstalled FROM servers WHERE user_id = ?").all(req.user.id);
      res.json(servers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch servers" });
    }
  });

  app.get("/api/servers/:id", authenticateToken, (req: any, res) => {
    const { id } = req.params;
    try {
      const server = db.prepare("SELECT *, is_installed as isInstalled FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });
      res.json(server);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch server" });
    }
  });

  app.delete("/api/servers/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      // Stop the server if running
      await serverManager.stopServer(id as string);
      
      // Delete server files from disk
      try {
        await serverManager.deleteServerFiles(id as string);
      } catch (fileError) {
        console.error("Error deleting server files:", fileError);
        // Continue with database deletion even if file deletion fails
      }
      
      // Delete from database
      db.prepare("DELETE FROM servers WHERE id = ?").run(id);
      res.json({ message: "Server deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete server" });
    }
  });



  app.post("/api/servers", authenticateToken, createServerLimiter, (req: any, res) => {
    try {
      // Input Validation
      const validatedData = createServerSchema.parse(req.body);

      // Check for port conflict
      const existing = db.prepare("SELECT id FROM servers WHERE port = ?").get(validatedData.port);
      if (existing) {
          return res.status(400).json({ message: `Port ${validatedData.port} is already in use by another server instance.` });
      }

      const result = db.prepare(`
        INSERT INTO servers (
          user_id, name, port, rcon_password, map, max_players, password, gslt_token, steam_api_key, vac_enabled, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OFFLINE')
      `).run(
        req.user.id, 
        validatedData.name, 
        validatedData.port, 
        validatedData.rcon_password, 
        validatedData.map, 
        validatedData.max_players, 
        validatedData.password, 
        validatedData.gslt_token, 
        validatedData.steam_api_key, 
        validatedData.vac_enabled
      );
      res.json({ id: result.lastInsertRowid, ...validatedData, status: 'OFFLINE' });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
          return res.status(400).json({ message: (error as any).issues.map((e: any) => e.message).join(", ") });
      }
      res.status(500).json({ message: "Failed to create server" });
    }
  });

  // Update server settings (map, players, passwords, etc.)
  app.put("/api/servers/:id", authenticateToken, (req: any, res) => {
    const { id } = req.params;
    const { name, map, max_players, port, password, rcon_password, vac_enabled, gslt_token, steam_api_key } = req.body;
    
    try {
      const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      db.prepare(`
        UPDATE servers 
        SET name = ?, map = ?, max_players = ?, port = ?, password = ?, 
            rcon_password = ?, vac_enabled = ?, gslt_token = ?, steam_api_key = ?
        WHERE id = ?
      `).run(name, map, max_players, port, password, rcon_password, vac_enabled ? 1 : 0, gslt_token, steam_api_key, id);

      // Emit socket event for real-time UI update
      io.emit('server_update', { serverId: parseInt(id) });

      res.json({ message: "Server settings updated successfully" });
    } catch (error) {
      console.error("Update server error:", error);
      res.status(500).json({ message: "Failed to update server settings" });
    }
  });


  app.post("/api/servers/:id/start", authenticateToken, async (req: any, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Server ID is required" });
    
    try {
      const server: any = db.prepare("SELECT * FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      serverManager.startServer(id as string, server, (data: string) => {
        io.emit(`console:${id}`, data);
      });

      db.prepare("UPDATE servers SET status = 'ONLINE' WHERE id = ?").run(id);
      io.emit('status_update', { serverId: parseInt(id), status: 'ONLINE' });
      res.json({ message: "Server starting..." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/servers/:id/stop", authenticateToken, async (req: any, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Server ID is required" });

    try {
      const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      await serverManager.stopServer(id as string);
      db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
      io.emit('status_update', { serverId: parseInt(id), status: 'OFFLINE' });
      res.json({ message: "Server stopped" });
    } catch (error) {
      res.status(500).json({ message: "Failed to stop server" });
    }
  });

  app.post("/api/servers/:id/restart", authenticateToken, async (req: any, res) => {
    const id = req.params.id;
    try {
      const server: any = db.prepare("SELECT * FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      // Stop the server and update UI
      serverManager.stopServer(id as string);
      db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
      io.emit('status_update', { serverId: parseInt(id), status: 'OFFLINE' });

      // Wait a moment for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Start the server and update UI
      await serverManager.startServer(id as string, server, (data: string) => {
        io.emit(`console:${id}`, data);
      });

      db.prepare("UPDATE servers SET status = 'ONLINE' WHERE id = ?").run(id);
      io.emit('status_update', { serverId: parseInt(id), status: 'ONLINE' });
      res.json({ message: "Server restarting..." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // RCON Endpoint
  app.post("/api/servers/:id/rcon", authenticateToken, strictLimiter, async (req: any, res: Response) => {
    const id = req.params.id;
    const { command } = req.body;
    
    if (!id) return res.status(400).json({ message: "Server ID is required" });

    try {
      if (!serverManager.isServerRunning(id as string)) {
        const errorMsg = "Server is not running. Start the server to send RCON commands.";
        io.emit(`console:${id}`, `[ERROR] ${errorMsg}`);
        return res.status(400).json({ message: errorMsg });
      }

      // Log the command to the console socket for everyone to see
      io.emit(`console:${id}`, `> ${command}`);

      const response = await serverManager.sendCommand(id as string, command);
      
      // Emit the response to the socket if it's not empty
      if (response && response.trim()) {
        io.emit(`console:${id}`, response);
      }

      res.json({ success: true, response });
    } catch (error: any) {
      io.emit(`console:${id}`, `[ERROR] RCON Command failed: ${error.message}`);
      res.status(500).json({ message: error.message });
    }
  });

  // --- File Manager Endpoints ---
  app.get("/api/servers/:id/files", authenticateToken, async (req: any, res) => {
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

  app.get("/api/servers/:id/files/read", authenticateToken, async (req: any, res) => {
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

  app.post("/api/servers/:id/files/write", authenticateToken, strictLimiter, async (req: any, res) => {
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

  app.post("/api/servers/:id/install", authenticateToken, strictLimiter, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT * FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      db.prepare("UPDATE servers SET status = 'INSTALLING' WHERE id = ?").run(id);
      io.emit('status_update', { serverId: id, status: 'INSTALLING' });
      
      serverManager.installOrUpdateServer(id, (data) => {
        io.emit(`console:${id}`, data);
      }).then(() => {
        db.prepare("UPDATE servers SET status = 'OFFLINE', is_installed = 1 WHERE id = ?").run(id);
        io.emit('status_update', { serverId: id, status: 'OFFLINE' });
      }).catch((err) => {
        console.error(`Install failed for ${id}:`, err);
        db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
        io.emit('status_update', { serverId: id, status: 'OFFLINE' });
      });

      res.json({ message: "Installation started" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/servers/:id/logs", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      const logs = serverManager.getLastLogs(id);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/servers/:id/plugins/status", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      const status = await serverManager.getPluginStatus(id);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/servers/:id/plugins/updates", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      // Check all plugins for updates
      const updates = await Promise.all([
        serverManager.checkPluginUpdate('metamod'),
        serverManager.checkPluginUpdate('cssharp'),
        serverManager.checkPluginUpdate('matchzy'),
        serverManager.checkPluginUpdate('simpleadmin')
      ]);

      res.json({
        metamod: updates[0],
        cssharp: updates[1],
        matchzy: updates[2],
        simpleadmin: updates[3]
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/servers/:id/plugins/install-matchzy", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      await serverManager.installMatchZy(id);
      res.json({ message: "MatchZy installed successfully" });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/servers/:id/plugins/uninstall-matchzy", authenticateToken, async (req: any, res) => {
      const { id } = req.params;
      try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });
  
        await serverManager.uninstallMatchZy(id);
        res.json({ message: "MatchZy uninstalled successfully" });
      } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message });
      }
    });

  app.post("/api/servers/:id/plugins/install-simpleadmin", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      await serverManager.installSimpleAdmin(id);
      res.json({ message: "CS2-SimpleAdmin installed successfully" });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/servers/:id/plugins/uninstall-simpleadmin", authenticateToken, async (req: any, res) => {
      const { id } = req.params;
      try {
        const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!server) return res.status(404).json({ message: "Server not found" });
  
        await serverManager.uninstallSimpleAdmin(id);
        res.json({ message: "CS2-SimpleAdmin uninstalled successfully" });
      } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message });
      }
    });

  app.post("/api/servers/:id/plugins/update-matchzy", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      await serverManager.updatePlugin(id, 'matchzy');
      res.json({ message: "MatchZy updated successfully" });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/servers/:id/plugins/update-simpleadmin", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      await serverManager.updatePlugin(id, 'simpleadmin');
      res.json({ message: "CS2-SimpleAdmin updated successfully" });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/servers/:id/plugins/install-metamod", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      console.log(`[PLUGIN] Starting Metamod installation for server ${id}`);
      await serverManager.installMetamod(id);
      res.json({ success: true, message: "Metamod installed successfully" });
    } catch (error: any) {
      console.error(`[PLUGIN ERROR] Metamod installation failed for server ${id}:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/servers/:id/plugins/install-cssharp", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      console.log(`[PLUGIN] Starting CounterStrikeSharp installation for server ${id}`);
      await serverManager.installCounterStrikeSharp(id);
      res.json({ success: true, message: "CounterStrikeSharp installed successfully" });
    } catch (error: any) {
      console.error(`[PLUGIN ERROR] CSSharp installation failed for server ${id}:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/servers/:id/plugins/uninstall-metamod", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      console.log(`[PLUGIN] Starting Metamod uninstallation for server ${id}`);
      await serverManager.uninstallMetamod(id);
      res.json({ success: true, message: "Metamod uninstalled successfully" });
    } catch (error: any) {
      console.error(`[PLUGIN ERROR] Metamod uninstallation failed for server ${id}:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/servers/:id/plugins/uninstall-cssharp", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const server: any = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      console.log(`[PLUGIN] Starting CounterStrikeSharp uninstallation for server ${id}`);
      await serverManager.uninstallCounterStrikeSharp(id);
      res.json({ success: true, message: "CounterStrikeSharp uninstalled successfully" });
    } catch (error: any) {
      console.error(`[PLUGIN ERROR] CSSharp uninstallation failed for server ${id}:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/system-info", async (req, res) => {
    try {
      const os = await si.osInfo();
      res.json({
        os: `${os.distro} ${os.release}`,
        arch: os.arch,
        hostname: os.hostname,
        publicIp: cachedPublicIp
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system info" });
    }
  });

  // Dashboard Stats
  app.get("/api/stats", authenticateToken, (req: any, res) => {
    try {
      const servers: any[] = db.prepare("SELECT status, current_players FROM servers WHERE user_id = ?").all(req.user.id);
      const stats = {
        totalServers: servers.length,
        activeServers: servers.filter(s => s.status === 'ONLINE').length,
        totalPlayers: servers.reduce((acc, s) => acc + (s.current_players || 0), 0)
      };
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Settings Endpoints
  app.get("/api/settings", authenticateToken, (req: any, res) => {
    try {
      const settings: any[] = db.prepare("SELECT * FROM settings").all();
      const settingsObj = settings.reduce((acc: any, setting: any) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {});
      res.json(settingsObj);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.get("/api/system/health", authenticateToken, async (req: any, res) => {
    try {
      const health = await serverManager.getSystemHealth();
      res.json(health);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });

  app.put("/api/settings", authenticateToken, (req: any, res) => {
    try {
      const updates = req.body;
      
      // SECURITY VALIDATION: Prevent RCE via Path Manipulation
      // 1. Prevent setting paths to relative values (must be absolute)
      if (updates.steamcmd_path && !path.isAbsolute(updates.steamcmd_path)) {
          return res.status(400).json({ message: "SteamCMD path must be absolute" });
      }
      if (updates.install_dir && !path.isAbsolute(updates.install_dir)) {
          return res.status(400).json({ message: "Install directory must be absolute" });
      }

      // 2. Prevent pointing SteamCMD to a location inside the server instance directory
      // (where users can upload malicious files via File Manager)
      const currentInstallDir = serverManager.getInstallDir(); // We need a getter for this validity
      // Fallback if getter not available (assuming usage of DB directly or known path)
      // Actually simpler: Just check if one path is inside the other if both are provided or mixed.
      
      // Let's assume loose check for now: 
      if (updates.steamcmd_path && updates.steamcmd_path.includes(updates.install_dir || currentInstallDir)) {
           return res.status(400).json({ message: "Security Risk: SteamCMD configuration cannot be inside the Server Installation Directory." });
      }

      Object.keys(updates).forEach(key => {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, updates[key]);
      });
      
      // Refresh ServerManager settings if needed
      serverManager.refreshSettings(); // Ideally ServerManager should reload settings
      
      res.json({ message: "Settings updated successfully" });
    } catch (error: any) {
      console.error("Settings update error:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.post("/api/settings/steamcmd/download", authenticateToken, async (req: any, res) => {
    try {
        const { path: userPath } = req.body;
        
        // 1. Determine target path (User provided -> Stored Setting -> Default)
        let targetPath = userPath || serverManager.getSteamCmdDir();
        if (!targetPath) {
            targetPath = path.resolve(process.cwd(), 'steamcmd');
        }

        // 2. SECURITY VALIDATION
        // Check if absolute
        if (!path.isAbsolute(targetPath)) {
            return res.status(400).json({ message: "Target path must be an absolute path." });
        }

        // Prevent System Root writes (e.g. C:\ or /)
        const pathInfo = path.parse(targetPath);
        if (targetPath === pathInfo.root) {
            return res.status(400).json({ message: "Security Risk: Cannot install SteamCMD directly to the drive root." });
        }

        // Prevent System directory writes (Basic check)
        const systemDirs = ['C:\\Windows', 'C:\\Program Files', '/etc', '/bin', '/usr'];
        if (systemDirs.some(dir => targetPath.toLowerCase().startsWith(dir.toLowerCase()))) {
             return res.status(400).json({ message: "Security Risk: Selected path is a protected system directory." });
        }

        // Prevent RCE: Path must not be inside server instances directory
        const installDir = serverManager.getInstallDir();
        if (targetPath.toLowerCase().includes(installDir.toLowerCase())) {
            return res.status(400).json({ message: "Security Risk: SteamCMD cannot be located inside the Server Instances directory." });
        }

        console.log(`[STEAMCMD] Downloading to user-selected path: ${targetPath}`);
        
        await serverManager.downloadSteamCmd(targetPath);
        
        // Update DB and ServerManager with the validated path
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('steamcmd_path', targetPath);
        serverManager.refreshSettings();
        
        res.json({ message: "SteamCMD download started", path: targetPath });
    } catch (error: any) {
        console.error("SteamCMD download error:", error);
        res.status(500).json({ message: error.message });
    }
  });


  // --- Stats & Socket ---
  let connectedClients = 0;
  
  // Track WebSocket connections
  io.on('connection', (socket: Socket) => {
    connectedClients++;
    console.log(`WebSocket client connected. Total clients: ${connectedClients}`);
    
    socket.on('disconnect', () => {
      connectedClients--;
      console.log(`WebSocket client disconnected. Total clients: ${connectedClients}`);
    });
  });

  let lastNetworkStats: any = null;
  setInterval(async () => {
    // Skip stats collection if no clients are connected
    if (connectedClients === 0) {
      return;
    }

    try {
      const [cpu, mem, net] = await Promise.all([
        si.currentLoad().catch(() => ({ currentLoad: 0 })),
        si.mem().catch(() => ({ active: 0, total: 1 })),
        si.networkStats().catch(() => [])
      ]);
      
      let netIn = 0;
      let netOut = 0;

      if (lastNetworkStats && net && net.length > 0) {
        // Calculate diff over 2 seconds interval
        const seconds = 2;
        const currentNet = net[0];
        const lastNet = lastNetworkStats[0];
        
        if (currentNet && lastNet && currentNet.rx_bytes !== undefined) {
          netIn = Math.max(0, (currentNet.rx_bytes - lastNet.rx_bytes) / 1024 / 1024 / seconds);
          netOut = Math.max(0, (currentNet.tx_bytes - lastNet.tx_bytes) / 1024 / 1024 / seconds);
        }
      }
      lastNetworkStats = net;

      io.emit("stats", {
        cpu: typeof cpu.currentLoad === 'number' ? cpu.currentLoad.toFixed(1) : "0",
        ram: (mem.total > 0) ? ((mem.active / mem.total) * 100).toFixed(1) : "0",
        memUsed: (mem.active / 1024 / 1024 / 1024).toFixed(1),
        memTotal: (mem.total / 1024 / 1024 / 1024).toFixed(1),
        netIn: netIn.toFixed(2),
        netOut: netOut.toFixed(2)
      });
    } catch (err) {
      console.warn("Stats collection error (handled):", err);
    }
  }, 2000);

  // Periodic map check (every 30 seconds) - detects RCON map changes
  setInterval(async () => {
    try {
      const servers = db.prepare("SELECT id, map FROM servers WHERE status = 'ONLINE'").all() as any[];
      if (servers.length === 0) return;

      console.log(`[MAP CHECK] Checking ${servers.length} online servers in parallel...`);
      
      // Check all servers in parallel instead of sequentially
      const checkPromises = servers.map(async (server) => {
        try {
          const currentMap = await serverManager.getCurrentMap(server.id);
          console.log(`[MAP CHECK] Server ${server.id}: DB=${server.map}, Current=${currentMap}`);
          if (currentMap && currentMap !== server.map) {
            // Map changed via RCON - update database
            db.prepare("UPDATE servers SET map = ? WHERE id = ?").run(currentMap, server.id);
            // Emit socket event for real-time UI update
            io.emit('server_update', { serverId: server.id });
            console.log(`✅ Map changed for server ${server.id}: ${server.map} → ${currentMap}`);
          }
        } catch (error) {
          console.log(`[MAP CHECK] Error checking server ${server.id}:`, error);
        }
      });

      // Wait for all checks to complete
      await Promise.all(checkPromises);
    } catch (error) {
      console.error("Map check error:", error);
    }
  }, 30000); // Check every 30 seconds (production setting)


  httpServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ CRITICAL: Port ${PORT} is already in use. Please kill existing node processes.`);
    } else {
      console.error("❌ HTTP Server Error:", err);
    }
    process.exit(1);
  });

  httpServer.listen(PORT, () => {
    console.log(`🚀 Quatrix Backend ready on port ${PORT}`);
  });

  // Catch-all 404 handler
  app.use((req, res) => {
    res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
  });

} catch (error) {
  console.error("Startup error:", error);
}
