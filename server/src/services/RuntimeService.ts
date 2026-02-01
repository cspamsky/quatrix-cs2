import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import db from "../db.js";
import { fileSystemService } from "./FileSystemService.js";
import { lockService } from "./LockService.js";

type ServerStatus = "ONLINE" | "OFFLINE" | "STARTING" | "CRASHED";

interface InstanceState {
    process?: ChildProcess;
    pid?: number;
    logStream?: fs.WriteStream;
    logBuffer: string[];
    status: ServerStatus;
    startedAt?: Date;
}

class RuntimeService {
    private instances: Map<string, InstanceState> = new Map();

    constructor() {
        // Periodic check for crashed/zombie processes could go here
    }

    public getInstanceStatus(id: string): ServerStatus {
        return this.instances.get(id)?.status || "OFFLINE";
    }

    public getLogBuffer(id: string): string[] {
        return this.instances.get(id)?.logBuffer || [];
    }

    public async startInstance(id: string, options: any, onLog?: (line: string) => void): Promise<void> {
        if (!await lockService.acquireInstanceLock(id, 'RUN')) {
            throw new Error(`Instance ${id} is locked.`);
        }

        const instancePath = fileSystemService.getInstancePath(id);
        
        // 1. Safety Check: If 'game/bin' is a symlink or critical mods are missing, re-prepare
        try {
            const gameDir = path.join(instancePath, "game");
            const gameBinDir = path.join(gameDir, "bin");
            const csgoImportedDir = path.join(gameDir, "csgo_imported");
            const csgoBinDir = path.join(gameDir, "csgo", "bin");
            const csgoMapsDir = path.join(gameDir, "csgo", "maps");
            const csgoCfgDir = path.join(gameDir, "csgo", "cfg");
            
            let needsPrepare = false;
            
            // 1. Check game/bin (must be a directory, not a symlink)
            if (fs.existsSync(gameBinDir)) {
                const stats = await fs.promises.lstat(gameBinDir);
                if (stats.isSymbolicLink()) needsPrepare = true;
            } else {
                needsPrepare = true;
            }

            // 2. Check game/csgo/bin (must be a directory, not a symlink)
            if (!needsPrepare && fs.existsSync(csgoBinDir)) {
                const stats = await fs.promises.lstat(csgoBinDir);
                if (stats.isSymbolicLink()) needsPrepare = true;
            }

            // 3. Check for critical symlinks (csgo_imported, core, etc.)
            if (!needsPrepare && !fs.existsSync(csgoImportedDir)) {
                needsPrepare = true;
            }

            // 4. Check if maps are missing (should have more than just '.' and '..')
            if (!needsPrepare && (!fs.existsSync(csgoMapsDir) || (await fs.promises.readdir(csgoMapsDir)).length === 0)) {
                needsPrepare = true;
            }

            // 5. Check if CFG is empty or missing
            if (!needsPrepare && (!fs.existsSync(csgoCfgDir) || (await fs.promises.readdir(csgoCfgDir)).length <= 1)) {
                needsPrepare = true;
            }

            // Check if gameinfo.gi is patched for Metamod
            if (!needsPrepare) {
                const gameinfoPath = path.join(gameDir, "csgo", "gameinfo.gi");
                if (fs.existsSync(gameinfoPath)) {
                    const content = await fs.promises.readFile(gameinfoPath, 'utf8');
                    if (!content.includes("csgo/addons/metamod")) {
                        needsPrepare = true;
                    }
                } else {
                    needsPrepare = true;
                }
            }

            if (needsPrepare) {
                console.log(`[Runtime] Instance ${id} has incomplete or old structure. Re-preparing...`);
                await fileSystemService.prepareInstance(id);
            }
        } catch (e) {
            console.warn(`[Runtime] Auto-prepare check failed for instance ${id}:`, e);
        }

        // 2. Resolve Executable (Linux Only)
        // Now that FileSystemService COPIES the binary instead of symlinking,
        // using the absolute path of the local copy preserves the instance root.
        const relativeBinPath = path.join("game", "bin", "linuxsteamrt64", "cs2");
        const cs2Exe = path.join(instancePath, relativeBinPath);

        // 3. Prepare Arguments
        const mapName = options.map || "de_dust2";
        const isWorkshopID = (m: string) => /^\d+$/.test(m);
        
        // Group 1: Engine/Dash Parameters (Order matters for some engine initializations)
        const args = [
            "-dedicated",
            "-usercon",
            "-console"
        ];

        if (options.steam_api_key) args.push("-authkey", options.steam_api_key);
        args.push("-maxplayers", (options.max_players || 16).toString());
        args.push("-tickrate", (options.tickrate || 128).toString());
        if (options.vac_enabled === false) args.push("-insecure");

        // Group 2: Console Variables / Plus Parameters
        args.push("+ip", "0.0.0.0");
        args.push("+port", options.port.toString());
        
        if (options.gslt_token) args.push("+sv_setsteamaccount", options.gslt_token);
        if (options.name) args.push("+hostname", options.name);
        if (options.password) args.push("+sv_password", options.password);
        if (options.rcon_password) args.push("+rcon_password", options.rcon_password);

        if (options.hibernate !== undefined) {
             args.push("+sv_hibernate_when_empty", options.hibernate.toString());
        }

        if (options.tv_enabled) {
            args.push("+tv_enable", "1");
            args.push("+tv_port", (options.port + 1).toString());
            args.push("+tv_autorecord", "0");
        }

        // Feature Parity: Additional Launch Arguments (mixed, usually best late)
        if (options.additional_args) {
            const extraArgs = options.additional_args.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            if (extraArgs.length > 0) {
                args.push(...extraArgs);
            }
        }

        // Map parameter - usually best last to ensure all cvars are set
        args.push(isWorkshopID(mapName) ? "+host_workshop_map" : "+map", mapName);

        // 4. Environment (Linux Only)
        const env: NodeJS.ProcessEnv = { ...process.env };
        const binDir = path.dirname(cs2Exe);
        
        // CS2 Linux needs LD_LIBRARY_PATH set to its bin directory
        // Fix: Add ~/.steam/sdk64 for Steam client initialization (fixes "Universe is invalid")
        const homeDir = process.env.HOME || "/home/quatrix";
        const steamSdk64 = path.join(homeDir, ".steam", "sdk64");
        
        const libraryPaths = [
            binDir,
            path.join(binDir, "linux64"),
            steamSdk64,
            process.env.LD_LIBRARY_PATH || ""
        ].filter(Boolean);
        
        env.LD_LIBRARY_PATH = libraryPaths.join(":");

        // 5. Spawn
        console.log(`[Runtime] Spawning instance ${id}: ${cs2Exe} ${args.join(" ")}`);
        
        const proc = spawn(cs2Exe, args, {
            cwd: instancePath,
            env,
            detached: true, // Detached on Linux
            stdio: ['ignore', 'pipe', 'pipe']
        });

        if (!proc.pid) throw new Error("Failed to spawn process");

        // 6. State Management
        const logStream = fs.createWriteStream(path.join(instancePath, "console.log"), { flags: 'a' });
        
        const state: InstanceState = {
            process: proc,
            pid: proc.pid,
            logStream,
            logBuffer: [],
            status: "STARTING",
            startedAt: new Date()
        };
        this.instances.set(id, state);

        // 7. DB Update
        db.prepare("UPDATE servers SET status = 'ONLINE', pid = ? WHERE id = ?").run(proc.pid, id);

        // 8. Event Listeners
        proc.stdout?.on('data', (data) => this.handleOutput(id, data, false, onLog));
        proc.stderr?.on('data', (data) => this.handleOutput(id, data, true, onLog));

        proc.on('exit', (code) => this.handleExit(id, code));
    }

    public async init() {
        console.log("[Runtime] Initializing and recovering orphans...");
        const onlineServers = db.prepare("SELECT id, pid FROM servers WHERE status = 'ONLINE' OR status = 'STARTING'").all() as {id: number, pid: number}[];
        
        for (const s of onlineServers) {
            const id = s.id.toString();
            if (s.pid) {
                try {
                    // Check if process is alive
                    process.kill(s.pid, 0);
                    console.log(`[Runtime] Adopted orphan process for server ${id} (PID: ${s.pid})`);
                    
                    // Reconstruct state (without logs/process handle)
                    this.instances.set(id, {
                        pid: s.pid,
                        logBuffer: ["[SYSTEM] Process adopted after backend restart."],
                        status: "ONLINE",
                        startedAt: new Date() // Approximate
                    });
                } catch (e) {
                    console.log(`[Runtime] Server ${id} (PID: ${s.pid}) is dead. Marking OFFLINE.`);
                    db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);
                    // Clean stale lock
                    await lockService.releaseInstanceLock(id);
                }
            } else {
                 db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);
                 // Clean stale lock
                 await lockService.releaseInstanceLock(id);
            }
        }
    }

    public async stopInstance(id: string): Promise<boolean> {
        const state = this.instances.get(id);
        if (!state || !state.pid) return false;

        console.log(`[Runtime] Stopping instance ${id} (PID: ${state.pid})`);
        
        try {
            // Try to use process object if available, otherwise raw kill
            if (state.process) {
                state.process.kill('SIGTERM');
            } else {
                process.kill(state.pid, 'SIGTERM');
            }

            // Force kill fallback
            setTimeout(() => {
                try {
                    if (state.process) state.process.kill('SIGKILL');
                    else process.kill(state.pid!, 'SIGKILL');
                } catch {}
            }, 5000);
        } catch (e) {
            console.warn(`[Runtime] Error stopping ${id}:`, e);
        }

        // Clean up immediately from DB perspective
        this.instances.delete(id);
        db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);
        
        // Release lock
        await lockService.releaseInstanceLock(id);
        
        return true;
    }

    private handleOutput(id: string, chunk:  Buffer, isError: boolean, onLog?: (l: string) => void) {
        const state = this.instances.get(id);
        if (!state) return;

        const lines = chunk.toString().split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if(!trimmed) continue;

            const logLine = `[${new Date().toISOString()}] ${trimmed}`;
            
            // File Log (Async)
            state.logStream?.write(logLine + '\n');

            // Memory Buffer
            state.logBuffer.push(logLine);
            if (state.logBuffer.length > 200) state.logBuffer.shift();

            // Callback
            if (onLog) onLog(trimmed);
        }
    }

    private handleExit(id: string, code: number | null) {
        console.log(`[Runtime] Instance ${id} exited with code ${code}`);
        const state = this.instances.get(id);
        
        if (state) {
            state.logStream?.end();
            lockService.releaseInstanceLock(id);
        }

        this.instances.delete(id);
        
        // Crash Detection
        const isCrash = code !== 0 && code !== null && code !== 137 && code !== 143; // 137/143 are SIGKILL/SIGTERM
        const status = isCrash ? 'CRASHED' : 'OFFLINE';
        
        if (isCrash) console.warn(`[Runtime] CRASH DETECTED for instance ${id} (Code: ${code})`);

        db.prepare("UPDATE servers SET status = ?, pid = NULL WHERE id = ?").run(status, id);
    }
}

export const runtimeService = new RuntimeService();
