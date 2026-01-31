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
        
        // 1. Resolve Executable (Linux Only)
        const relativeBinPath = path.join("game", "bin", "linuxsteamrt64", "cs2");
        const cs2Exe = path.join(instancePath, relativeBinPath);

        // 2. Prepare Arguments
        const args = [
            "-dedicated",
            "-usercon",
            "-console",
            "+ip", "0.0.0.0",
            "+port", options.port.toString(),
            "-maxplayers", (options.max_players || 16).toString(),
            "-tickrate", (options.tickrate || 128).toString(),
            "+map", options.map || "de_dust2"
        ];
        
        if (options.vac_enabled === false) args.push("-insecure");
        if (options.steam_api_key) args.push("-authkey", options.steam_api_key);
        if (options.gslt_token) args.push("+sv_setsteamaccount", options.gslt_token);
        if (options.name) args.push("+hostname", options.name);
        if (options.password) args.push("+sv_password", options.password);
        if (options.rcon_password) args.push("+rcon_password", options.rcon_password);

        // Feature Parity: Hibernate
        if (options.hibernate !== undefined) {
             args.push("+sv_hibernate_when_empty", options.hibernate.toString());
        }

        // Feature Parity: SourceTV
        // Assuming database has a field or we check for specific arg? 
        // For now, if passed in options (checked later in ServerManager)
        if (options.tv_enabled) {
            args.push("+tv_enable", "1");
            args.push("+tv_port", (options.port + 1).toString()); // Default convention: ServerPort + 1
            args.push("+tv_autorecord", "0");
        }

        // Feature Parity: Additional Launch Arguments
        if (options.additional_args) {
            // Regex to respect quoted arguments like +hostname "My Server"
            // Matches either non-whitespace characters OR text within quotes
            const extraArgs = options.additional_args.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            if (extraArgs.length > 0) {
                args.push(...extraArgs);
            }
        }

        // 3. Environment (Linux Only)
        const env: NodeJS.ProcessEnv = { ...process.env };
        const binDir = path.dirname(cs2Exe);
        // CS2 Linux needs LD_LIBRARY_PATH set to its bin directory
        env.LD_LIBRARY_PATH = `${binDir}:${path.join(binDir, "linux64")}:${process.env.LD_LIBRARY_PATH || ""}`;

        // 4. Spawn
        console.log(`[Runtime] Spawning instance ${id}: ${cs2Exe} ${args.join(" ")}`);
        
        const proc = spawn(cs2Exe, args, {
            cwd: instancePath,
            env,
            detached: true, // Detached on Linux
            stdio: ['ignore', 'pipe', 'pipe']
        });

        if (!proc.pid) throw new Error("Failed to spawn process");

        // 5. State Management
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

        // 6. DB Update
        db.prepare("UPDATE servers SET status = 'ONLINE', pid = ? WHERE id = ?").run(proc.pid, id);

        // 7. Event Listeners
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
