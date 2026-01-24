import { Router } from "express";
import db from "../db.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.use(authenticateToken);

// GET /api/maps/workshop - Get all saved workshop maps
router.get("/workshop", (req, res) => {
    try {
        const maps = db.prepare("SELECT * FROM workshop_maps ORDER BY created_at DESC").all();
        res.json(maps);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch workshop maps" });
    }
});

// POST /api/maps/workshop - Add a new workshop map
router.post("/workshop", async (req, res) => {
    const { workshop_id } = req.body;
    
    if (!workshop_id) {
        return res.status(400).json({ message: "Workshop ID is required" });
    }

    try {
        // Fetch details from Steam Web API
        let name = `Workshop Map ${workshop_id}`;
        let image_url = null;
        let map_file = null;

        try {
            const steamResponse = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `itemcount=1&publishedfileids[0]=${workshop_id}`
            });

            const data = await steamResponse.json();
            const details = data?.response?.publishedfiledetails?.[0];

            if (details && details.result === 1) {
                name = details.title || name;
                image_url = details.preview_url || null;
                // Extract map filename from Steam data
                map_file = details.filename || null;
                
                // If filename has path, extract just the map name
                if (map_file && map_file.includes('/')) {
                    const parts = map_file.split('/');
                    map_file = parts[parts.length - 1].replace('.vpk', '').replace('.bsp', '');
                }
            }
        } catch (steamErr) {
            console.warn("Failed to fetch Steam workshop details:", steamErr);
        }

        db.prepare(`
            INSERT INTO workshop_maps (workshop_id, name, image_url, map_file)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(workshop_id) DO UPDATE SET
                name = excluded.name,
                image_url = excluded.image_url,
                map_file = excluded.map_file
        `).run(workshop_id, name, image_url, map_file);
        
        res.status(201).json({ 
            message: "Workshop map added successfully",
            details: { name, image_url, map_file }
        });
    } catch (error) {
        console.error("Add workshop map error:", error);
        res.status(500).json({ message: "Failed to add workshop map" });
    }
});

// DELETE /api/maps/workshop/:id - Remove a workshop map
router.delete("/workshop/:id", (req, res) => {
    try {
        db.prepare("DELETE FROM workshop_maps WHERE id = ?").run(req.params.id);
        res.json({ message: "Workshop map removed" });
    } catch (error) {
        res.status(500).json({ message: "Failed to remove workshop map" });
    }
});

export default router;
