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
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // --- Auth Routes ---
  app.post("/api/register", async (req, res) => {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server configuration error" });
    }
    const { username, fullname, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = db.prepare(
        "INSERT INTO users (username, fullname, email, password) VALUES (?, ?, ?, ?)"
      ).run(username, fullname || '', email, hashedPassword);

      const token = jwt.sign(
        { id: result.lastInsertRowid, username, email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        token,
        user: { id: result.lastInsertRowid, username, email, fullname }
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
        "SELECT * FROM users WHERE username = ? OR email = ?"
      ).get(identity, identity);

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email, fullname: user.fullname }
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

      serverManager.stopServer(id as string);
      await serverManager.startServer(id as string, server, (data: string) => {
        io.emit(`console:${id}`, data);
      });

      db.prepare("UPDATE servers SET status = 'ONLINE' WHERE id = ?").run(id);
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
      const response = await serverManager.sendCommand(id as string, command);
      res.json({ success: true, response });
    } catch (error: any) {
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
      
      serverManager.installOrUpdateServer(id, (data) => {
        io.emit(`console:${id}`, data);
      }).then(() => {
        db.prepare("UPDATE servers SET status = 'OFFLINE', is_installed = 1 WHERE id = ?").run(id);
      }).catch((err) => {
        console.error(`Install failed for ${id}:`, err);
        db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
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

  app.get("/api/system-info", async (req, res) => {
    try {
      const os = await si.osInfo();
      res.json({
        os: `${os.distro} ${os.release}`,
        arch: os.arch,
        hostname: os.hostname
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

  // --- Stats & Socket ---
  setInterval(async () => {
    const cpu = await si.currentLoad();
    const mem = await si.mem();
    io.emit("stats", {
      cpu: cpu.currentLoad.toFixed(1),
      ram: ((mem.active / mem.total) * 100).toFixed(1)
    });
  }, 2000);

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Catch-all 404 handler
  app.use((req, res) => {
    res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
  });
} catch (error) {
  console.error("Startup error:", error);
}
