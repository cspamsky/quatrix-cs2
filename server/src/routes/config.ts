import { Router } from "express";
import db from "../db.js";
import { serverManager } from "../serverManager.js";
import { authenticateToken } from "../middleware/auth.js";
import si from "systeminformation";

const router = Router();

// Cache for public IP - Passed from index.ts or handled locally
let cachedPublicIp = '127.0.0.1';
const fetchPublicIp = async () => {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json() as { ip: string };
        cachedPublicIp = data.ip;
    } catch (e) {
        console.warn("Could not fetch public IP in route, using default.");
    }
};
fetchPublicIp();

router.use(authenticateToken);

// GET /api/settings
router.get("/settings", (req: any, res) => {
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

// GET /api/stats - Global dashboard stats
router.get("/stats", (req: any, res) => {
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

// PUT /api/settings
router.put("/settings", (req: any, res) => {
    try {
        const updates = req.body;
        const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
        
        const transaction = db.transaction((items) => {
            for (const [key, value] of Object.entries(items)) {
                stmt.run(key, value);
            }
        });

        transaction(updates);
        
        // Refresh manager settings to pick up changes
        serverManager.refreshSettings();
        
        res.json({ message: "Settings updated successfully" });
    } catch (error: any) {
        console.error("Settings update error:", error);
        res.status(500).json({ message: "Failed to update settings", error: error.message });
    }
});

// GET /api/system/health
router.get("/system/health", async (req: any, res) => {
    try {
        const health = await serverManager.getSystemHealth();
        res.json(health);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch system health" });
    }
});

// GET /api/system-info
router.get("/system-info", async (req: any, res) => {
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

// POST /api/settings/steamcmd/download
router.post("/settings/steamcmd/download", async (req: any, res) => {
    try {
        const { path: steamPath } = req.body;
        if (!steamPath) return res.status(400).json({ message: "Path is required" });
        
        // Update DB
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('steamcmd_path', steamPath);
        
        // Refresh manager settings to pick up new path
        serverManager.refreshSettings();

        // Simple validation or trigger download
        const success = await serverManager.ensureSteamCMD();
        if (success) {
            res.json({ message: "SteamCMD is ready" });
        } else {
            res.status(500).json({ message: "SteamCMD download/verification failed" });
        }
    } catch (error) {
        res.status(500).json({ message: "Failed to process SteamCMD download" });
    }
});

export default router;
