import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { Server, type Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import si from "systeminformation";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "./db.js";
import { serverManager } from "./serverManager.js";

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

// Reset all server statuses to OFFLINE on startup since no processes are running yet
try {
  db.prepare("UPDATE servers SET status = 'OFFLINE'").run();
  console.log("Database: All server statuses reset to OFFLINE.");
} catch (err) {
  console.error("Database reset error:", err);
}

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

  // --- Auth & Middlewares ---
  const authenticateToken = (req: any, res: any, next: any) => {
    if (!process.env.JWT_SECRET) {
      console.error("CRITICAL: JWT_SECRET is not defined.");
      return res.status(500).json({ message: "Server configuration error" });
    }
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Authentication required" });
    jwt.verify(token, process.env.JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ message: "Invalid or expired token" });
      req.user = user;
      next();
    });
  };

  // --- Auth Routes ---
  app.post("/api/register", async (req, res) => {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server configuration error" });
    }
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = db.prepare(
        "INSERT INTO users (username, password) VALUES (?, ?)"
      ).run(username, hashedPassword);

      const token = jwt.sign(
        { id: result.lastInsertRowid, username },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        token,
        user: { id: result.lastInsertRowid, username }
      });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ message: "Username or email already exists" });
      }
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/login", async (req, res) => {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server configuration error" });
    }
    const { identity, password } = req.body;
    if (!identity || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    try {
      const user: any = db.prepare(
        "SELECT * FROM users WHERE username = ?"
      ).get(identity);

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: { id: user.id, username: user.username }
      });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

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

  app.put("/api/servers/:id", authenticateToken, (req: any, res) => {
    const { id } = req.params;
    const { name, map, max_players, port, password, rcon_password, gslt_token, steam_api_key, vac_enabled } = req.body;
    try {
      const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      db.prepare(`
        UPDATE servers SET 
          name = ?, 
          map = ?, 
          max_players = ?, 
          port = ?, 
          password = ?, 
          rcon_password = ?, 
          gslt_token = ?, 
          steam_api_key = ?, 
          vac_enabled = ?
        WHERE id = ?
      `).run(name, map, max_players, port, password, rcon_password, gslt_token, steam_api_key, vac_enabled ? 1 : 0, id);

      res.json({ message: "Server updated successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/servers/:id", authenticateToken, (req: any, res) => {
    const { id } = req.params;
    try {
      const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      // Stop the server if running
      serverManager.stopServer(id as string);
      
      // Delete server files from disk
      try {
        serverManager.deleteServerFiles(id as string);
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

  app.post("/api/servers", authenticateToken, (req: any, res) => {
    const { name, port, rcon_password } = req.body;
    try {
      const result = db.prepare("INSERT INTO servers (user_id, name, port, rcon_password, status) VALUES (?, ?, ?, ?, 'OFFLINE')")
        .run(req.user.id, name, port, rcon_password);
      res.json({ id: result.lastInsertRowid, name, port, status: 'OFFLINE' });
    } catch (error) {
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
      res.json({ message: "Server starting..." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/servers/:id/stop", authenticateToken, (req: any, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Server ID is required" });

    try {
      const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.user.id);
      if (!server) return res.status(404).json({ message: "Server not found" });

      serverManager.stopServer(id as string);
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
  app.post("/api/servers/:id/rcon", authenticateToken, async (req: any, res: Response) => {
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

  app.post("/api/servers/:id/files/write", authenticateToken, async (req: any, res) => {
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

  app.post("/api/servers/:id/install", authenticateToken, async (req: any, res) => {
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

  app.put("/api/settings", authenticateToken, (req: any, res) => {
    try {
      const updates = req.body;
      Object.keys(updates).forEach(key => {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, updates[key]);
      });
      res.json({ message: "Settings updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.post("/api/settings/steamcmd/download", authenticateToken, async (req: any, res) => {
    try {
        console.log("Received download request body:", req.body);
        const { path: customPath } = req.body;
        console.log("Extracted path:", customPath);
        await serverManager.downloadSteamCmd(customPath);
        res.json({ message: "SteamCMD downloaded and installed successfully." });
    } catch (error: any) {
        console.error("SteamCMD download error:", error);
        res.status(500).json({ message: error.message || "Failed to download SteamCMD" });
    }
  });

  // --- Stats & Socket ---
  let lastNetworkStats: any = null;
  setInterval(async () => {
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

  // Periodic map check (every 10 seconds) - detects RCON map changes
  setInterval(async () => {
    try {
      const servers = db.prepare("SELECT id, map FROM servers WHERE status = 'ONLINE'").all() as any[];
      if (servers.length === 0) return;

      console.log(`[MAP CHECK] Checking ${servers.length} online servers...`);
      
      for (const server of servers) {
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
      }
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
