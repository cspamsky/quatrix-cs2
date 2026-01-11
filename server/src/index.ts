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
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET || 'secret', (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // --- API Endpoints ---
  app.get("/api/servers", (req, res) => {
    try {
      const servers = db.prepare("SELECT * FROM servers").all();
      res.json(servers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch servers" });
    }
  });

  app.post("/api/servers", (req, res) => {
    const { name, port, rcon_password } = req.body;
    try {
      const result = db.prepare("INSERT INTO servers (name, port, rcon_password, status) VALUES (?, ?, ?, 'OFFLINE')")
        .run(name, port, rcon_password);
      res.json({ id: result.lastInsertRowid, name, port, status: 'OFFLINE' });
    } catch (error) {
      res.status(500).json({ message: "Failed to create server" });
    }
  });

  app.post("/api/servers/:id/start", async (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Server ID is required" });
    
    try {
      const server: any = db.prepare("SELECT * FROM servers WHERE id = ?").get(id);
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

  app.post("/api/servers/:id/stop", (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Server ID is required" });

    try {
      serverManager.stopServer(id as string);
      db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
      res.json({ message: "Server stopped" });
    } catch (error) {
      res.status(500).json({ message: "Failed to stop server" });
    }
  });

  // RCON Endpoint (Initial version using srcds-rcon)
  app.post("/api/servers/:id/rcon", async (req: Request, res: Response) => {
    const id = req.params.id;
    const { command } = req.body;
    
    if (!id) return res.status(400).json({ message: "Server ID is required" });

    try {
      const server: any = db.prepare("SELECT * FROM servers WHERE id = ?").get(id);
      if (!server || !server.rcon_password) return res.status(400).json({ message: "Invalid server or RCON config" });

      if (!serverManager.isServerRunning(id as string)) return res.status(400).json({ message: "Server is not running" });

      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const RCON = require('srcds-rcon');

      const rcon = RCON({
        address: `127.0.0.1:${server.port}`,
        password: server.rcon_password,
        timeout: 5000
      });

      await rcon.connect();
      const response = await rcon.command(command);
      rcon.disconnect();

      res.json({ success: true, response });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
} catch (error) {
  console.error("Startup error:", error);
}
