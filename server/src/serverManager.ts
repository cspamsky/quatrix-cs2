import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerManager {
    private runningServers: Map<string, any> = new Map();

    private getSetting(key: string): string {
        const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string };
        return row ? row.value : '';
    }

    private logToFile(instanceId: string | number, message: string) {
        const logDir = path.join(this.installDir, instanceId.toString(), 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, 'console.log');
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    }

    getLastLogs(instanceId: string | number, limit: number = 200): string[] {
        const logFile = path.join(this.installDir, instanceId.toString(), 'logs', 'console.log');
        if (!fs.existsSync(logFile)) return [];

        try {
            const content = fs.readFileSync(logFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim() !== '');
            return lines.slice(-limit);
        } catch (error) {
            console.error(`Error reading logs for instance ${instanceId}:`, error);
            return [];
        }
    }

    get steamCmdExe() {
        return this.getSetting('steamcmd_path');
    }

    get installDir() {
        return this.getSetting('install_dir');
    }

    constructor() {
        this.ensureDirectories();
    }

    private ensureDirectories() {
        if (!fs.existsSync(this.installDir)) {
            fs.mkdirSync(this.installDir, { recursive: true });
        }
    }

    async ensureSteamCMD(): Promise<boolean> {
        const steamcmdExe = this.steamCmdExe;
        if (fs.existsSync(steamcmdExe)) {
            return true;
        }
        return false;
    }

    async installOrUpdateServer(instanceId: string | number, onLog?: (data: string) => void): Promise<void> {
        const id = instanceId.toString();
        const serverPath = path.join(this.installDir, id);
        
        if (!fs.existsSync(serverPath)) {
            fs.mkdirSync(serverPath, { recursive: true });
        }

        const log = (msg: string) => {
            if (onLog) onLog(msg);
            console.log(`[Install ${id}]: ${msg}`);
        };

        return new Promise((resolve, reject) => {
            const steamCmdParams = [
                '+force_install_dir', serverPath,
                '+login', 'anonymous',
                '+app_update', '730', 'validate',
                '+quit'
            ];

            const process = spawn(this.steamCmdExe, steamCmdParams);

            process.stdout.on('data', (data) => log(data.toString()));
            process.stderr.on('data', (data) => log(`[ERROR] ${data.toString()}`));

            process.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`SteamCMD failed with code ${code}`));
            });
        });
    }

    startServer(instanceId: string | number, options: any, onLog?: (data: string) => void) {
        const id = instanceId.toString();
        
        if (this.runningServers.has(id)) {
            throw new Error('Server is already running');
        }

        const serverPath = path.join(this.installDir, id);
        const cs2Exe = path.join(serverPath, 'game', 'bin', 'win64', 'cs2.exe');

        if (!fs.existsSync(cs2Exe)) {
            throw new Error('CS2 executable not found.');
        }

        const args = [
            '-dedicated',
            '+map', options.map || 'de_dust2',
            '-port', (options.port || 27015).toString()
        ];

        if (options.vac) {
            args.push('+sv_lan', '0');
        } else {
            args.push('-insecure', '+sv_lan', '1');
        }

        if (options.gslt_token) {
            args.push('+sv_setsteamaccount', options.gslt_token);
        } else {
            args.push('+sv_setsteamaccount', 'anonymous');
        }

        if (options.password) args.push('+sv_password', options.password);
        if (options.rcon_password) args.push('+rcon_password', options.rcon_password);
        if (options.hostname) args.push('+hostname', options.hostname);
        args.push('+ip', '0.0.0.0');

        console.log(`Starting CS2 Server ${id}...`);

        const serverProcess = spawn(cs2Exe, args, { cwd: serverPath });

        let serverBuffer = '';
        serverProcess.stdout.on('data', (data) => {
            serverBuffer += data.toString();
            const lines = serverBuffer.split(/\r?\n|\r/);
            serverBuffer = lines.pop() || '';

            lines.forEach((line: string) => {
                const trimmed = line.trim();
                if (trimmed) {
                    if (trimmed.includes('CTextConsoleWin::GetLine') || trimmed.includes('!GetNumberOfConsoleInputEvents')) return;
                    this.logToFile(id, trimmed);
                    if (onLog) onLog(trimmed);
                    console.log(`[CS2 ${id}]:`, trimmed);
                }
            });
        });

        serverProcess.stderr.on('data', (data) => {
            const error = data.toString();
            if (error.includes('CTextConsoleWin::GetLine') || error.includes('!GetNumberOfConsoleInputEvents')) return;
            this.logToFile(id, `[ERROR] ${error}`);
            if (onLog) onLog(`[ERROR] ${error}`);
        });

        serverProcess.on('exit', (code) => {
            console.log(`[CS2 ${id}]: Process exited with code ${code}`);
            this.runningServers.delete(id);
            db.prepare("UPDATE servers SET status = 'OFFLINE' WHERE id = ?").run(id);
        });

        this.runningServers.set(id, serverProcess);
    }

    stopServer(instanceId: string | number): boolean {
        const id = instanceId.toString();
        const process = this.runningServers.get(id);
        if (process) {
            process.kill();
            this.runningServers.delete(id);
            return true;
        }
        return false;
    }

    isServerRunning(instanceId: string | number): boolean {
        return this.runningServers.has(instanceId.toString());
    }
}

export const serverManager = new ServerManager();
