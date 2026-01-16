import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import db from './db.js';
import AdmZip from 'adm-zip';
import { pluginRegistry, type PluginId } from './config/plugins.js';
import si from 'systeminformation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerManager {
    private runningServers: Map<string, any> = new Map();
    private pluginRegistry = pluginRegistry;
    private installDir!: string;
    private steamCmdDir!: string;
    private steamCmdExe!: string;
    private rconConnections: Map<string, any> = new Map();
    private isWindows = process.platform === 'win32';

    recoverOrphanedServers() {
        console.log("🔍 [STEWARDSHIP] Checking for orphaned game processes...");
        const servers = db.prepare("SELECT id, pid, status FROM servers WHERE status != 'OFFLINE'").all() as { id: number, pid: number | null, status: string }[];
        
        let recovered = 0;
        let cleaned = 0;

        for (const server of servers) {
            let isAlive = false;
            
            if (server.pid) {
                try {
                    process.kill(server.pid, 0); 
                    isAlive = true;
                } catch (e) {
                    isAlive = false;
                }
            }

            if (isAlive) {
                console.log(`✨ [RECOVERY] Server ${server.id} is still running with PID ${server.pid}. Marked as managed.`);
                recovered++;
            } else {
                console.log(`🧹 [CLEANUP] Server ${server.id} was marked ${server.status} but PID ${server.pid} is dead. Resetting to OFFLINE.`);
                db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(server.id);
                cleaned++;
            }
        }
        
        console.log(`✅ [STEWARDSHIP] Complete: ${recovered} running, ${cleaned} cleaned.`);
    }

    constructor() {
        this.refreshSettings(); 
        this.recoverOrphanedServers();
    }

    refreshSettings() {
        this.installDir = this.getSetting('install_dir') || path.resolve(__dirname, '../../instances');
        const steamCmdPath = this.getSetting('steamcmd_path');
        
        if (steamCmdPath) {
             // Use user provided path logic
             if (steamCmdPath.endsWith('.exe') || steamCmdPath.endsWith('.sh')) {
                 this.steamCmdExe = steamCmdPath;
                 this.steamCmdDir = path.dirname(steamCmdPath);
             } else {
                 this.steamCmdDir = steamCmdPath;
                 this.steamCmdExe = path.join(steamCmdPath, this.isWindows ? 'steamcmd.exe' : 'steamcmd.sh');
             }
        } else {
            this.steamCmdDir = path.resolve(process.cwd(), 'steamcmd');
            this.steamCmdExe = path.join(this.steamCmdDir, this.isWindows ? 'steamcmd.exe' : 'steamcmd.sh');
        }

        if (!fs.existsSync(this.installDir)) {
            fs.mkdirSync(this.installDir, { recursive: true });
        }
    }

    getInstallDir(): string {
        return this.installDir;
    }

    getSteamCmdDir(): string {
        return this.steamCmdDir;
    }

    getSteamCmdExe(): string {
        return this.steamCmdExe;
    }


    private getSetting(key: string): string {
        const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string };
        return row ? row.value : '';
    }

    async checkPluginUpdate(pluginId: PluginId): Promise<{
        name: string;
        currentVersion: string;
        latestVersion: string | null;
        hasUpdate: boolean;
        downloadUrl: string | null;
        error: string | null;
    }> {
        const plugin = this.pluginRegistry[pluginId];
        
        // Metamod doesn't have GitHub API
        if (!plugin.githubRepo) {
            return {
                name: plugin.name,
                currentVersion: plugin.currentVersion,
                latestVersion: null,
                hasUpdate: false,
                downloadUrl: ('downloadUrl' in plugin) ? plugin.downloadUrl : null,
                error: 'No GitHub repository available'
            };
        }

        try {
            const apiUrl = `https://api.github.com/repos/${plugin.githubRepo}/releases/latest`;
            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Quatrix-CS2-Manager',
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`GitHub API returned ${response.status}`);
            }

            const data = await response.json() as any;
            const latestVersion = data.tag_name;
            
            // Find matching asset
            let downloadUrl = null;
            if (data.assets && Array.isArray(data.assets)) {
                const asset = data.assets.find((a: any) => {
                    if (pluginId === 'cssharp') {
                        return a.name.includes('counterstrikesharp-with-runtime-windows');
                    } else if (pluginId === 'matchzy') {
                        return a.name.startsWith('MatchZy-') && a.name.endsWith('.zip');
                    } else if (pluginId === 'simpleadmin') {
                        return a.name.startsWith('CS2-SimpleAdmin-') && a.name.endsWith('.zip');
                    }
                    return false;
                });
                downloadUrl = asset?.browser_download_url || null;
            }

            const hasUpdate = latestVersion !== plugin.currentVersion;

            return {
                name: plugin.name,
                currentVersion: plugin.currentVersion,
                latestVersion,
                hasUpdate,
                downloadUrl,
                error: null
            };
        } catch (error: any) {
            console.error(`Failed to check updates for ${plugin.name}:`, error.message);
            return {
                name: plugin.name,
                currentVersion: plugin.currentVersion,
                latestVersion: null,
                hasUpdate: false,
                downloadUrl: null,
                error: error.message
            };
        }
    }



    private logToFile(instanceId: string | number, message: string) {
        const logDir = path.join(this.installDir, instanceId.toString(), 'logs');
        // This can remain sync for now as it's a simple append, but ideally should be asyncstream
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, 'console.log');
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    }

    async getLastLogs(instanceId: string | number, limit: number = 200): Promise<string[]> {
        const logFile = path.join(this.installDir, instanceId.toString(), 'logs', 'console.log');
        
        try {
            await fs.promises.access(logFile);
        } catch {
            return [];
        }

        const bufferSize = 4096;
        const buffer = Buffer.alloc(bufferSize);
        let fd: fs.promises.FileHandle | null = null;

        try {
            fd = await fs.promises.open(logFile, 'r');
            const stats = await fd.stat();
            const fileSize = stats.size;
            let position = fileSize;
            let lines: string[] = [];
            let leftOver = '';

            while (position > 0 && lines.length <= limit) {
                const readSize = Math.min(position, bufferSize);
                position -= readSize;

                const { bytesRead } = await fd.read(buffer, 0, readSize, position);
                const chunk = buffer.toString('utf8', 0, bytesRead);
                const content = chunk + leftOver;
                const chunkLines = content.split('\n');

                if (position > 0) {
                    leftOver = chunkLines.shift() || '';
                } else {
                    leftOver = '';
                }

                for (let i = chunkLines.length - 1; i >= 0; i--) {
                    const lineChunk = chunkLines[i];
                    if (lineChunk === undefined) continue;
                    if (lineChunk.trim()) {
                        lines.unshift(lineChunk);
                        if (lines.length >= limit) break;
                    }
                }
            }

            if (leftOver.trim() && lines.length < limit) {
                lines.unshift(leftOver.trim());
            }

            return lines.slice(-limit);
        } catch (error) {
            console.error(`Error reading logs for instance ${instanceId}:`, error);
            return [];
        } finally {
            if (fd) await fd.close();
        }
    }



    async ensureSteamCMD(): Promise<boolean> {
        const steamcmdExe = this.steamCmdExe;
        if (fs.existsSync(steamcmdExe)) {
            return true;
        }
        return false;
    }

    async downloadSteamCmd(customPath?: string): Promise<void> {
        let steamCmdDir: string;
        
        if (customPath) {
            // Smart detection: did user provide a folder or a full .exe path?
            if (customPath.toLowerCase().endsWith('.exe')) {
                steamCmdDir = path.dirname(customPath);
            } else {
                // Assume it's a folder, append steamcmd.exe for the setting
                steamCmdDir = customPath;
                customPath = path.join(customPath, 'steamcmd.exe');
            }
            
            // Update the setting in DB
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('steamcmd_path', customPath);
        } else {
            steamCmdDir = path.dirname(this.steamCmdExe);
        }

        if (!fs.existsSync(steamCmdDir)) {
            fs.mkdirSync(steamCmdDir, { recursive: true });
        }

        const zipPath = path.join(steamCmdDir, 'steamcmd.zip');
        const url = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';

        console.log(`Downloading SteamCMD to ${steamCmdDir} from ${url}`);
        
        // 1. Download the zip file
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download SteamCMD: ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));

        console.log('Download complete. Extracting...');

        // 2. Extract using AdmZip
        const AdmZip = (await import('adm-zip')).default;
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(steamCmdDir, true);

        // 3. Cleanup
        fs.unlinkSync(zipPath);
        console.log('SteamCMD installed successfully.');
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

            const steamCmdProcess = spawn(this.steamCmdExe, steamCmdParams);

            let stdoutBuffer = '';
            steamCmdProcess.stdout.on('data', (data) => {
                stdoutBuffer += data.toString();
                const lines = stdoutBuffer.split(/\r?\n|\r/);
                stdoutBuffer = lines.pop() || '';
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed) log(trimmed);
                });
            });

            let stderrBuffer = '';
            steamCmdProcess.stderr.on('data', (data) => {
                stderrBuffer += data.toString();
                const lines = stderrBuffer.split(/\r?\n|\r/);
                stderrBuffer = lines.pop() || '';
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed) log(`[ERROR] ${trimmed}`);
                });
            });

            steamCmdProcess.on('close', (code) => {
                // Handle remaining buffer
                if (stdoutBuffer.trim()) log(stdoutBuffer.trim());
                if (stderrBuffer.trim()) log(`[ERROR] ${stderrBuffer.trim()}`);

                if (code === 0) {
                    resolve();
                } else {
                    let errorMsg = `SteamCMD failed with code ${code}`;
                    if (code === 8) {
                        errorMsg = "SteamCMD error: App update failed. This is often due to insufficient disk space (Error 0x202), network issues, or Steam service downtime. Please ensure you have at least 40GB free on your drive.";
                    }
                    reject(new Error(errorMsg));
                }
            });
        });
    }

    async sendCommand(instanceId: string | number, command: string): Promise<string> {
        const id = instanceId.toString();
        
        // 1. Check if server is theoretically running locally
        if (!this.isServerRunning(id)) {
             // If we have a lingering RCON connection, clean it up
             if (this.rconConnections.has(id)) {
                 try {
                     await this.rconConnections.get(id).end();
                 } catch {}
                 this.rconConnections.delete(id);
             }
             throw new Error("Server is not running");
        }

        const server: any = db.prepare("SELECT * FROM servers WHERE id = ?").get(id);
        if (!server || !server.rcon_password) throw new Error("Server not found or RCON password not set");

        const { Rcon } = await import('rcon-client');
        
        let rcon = this.rconConnections.get(id);

        try {
            if (!rcon) {
                // Not connected, establish new connection
                // console.log(`[RCON] Establishing new connection for server ${id}`);
                rcon = await Rcon.connect({
                    host: '127.0.0.1',
                    port: server.port,
                    password: server.rcon_password,
                    timeout: 5000
                });
                
                rcon.on('error', (err: any) => {
                    console.error(`[RCON Connection Error ${id}]:`, err);
                    this.rconConnections.delete(id);
                });

                rcon.on('end', () => {
                    // console.log(`[RCON] Connection closed for server ${id}`);
                    this.rconConnections.delete(id);
                });

                this.rconConnections.set(id, rcon);
            }

            const response = await rcon.send(command);
            return response;

        } catch (error: any) {
            console.error(`[RCON ERROR Instance ${id}]`, error.message);
            // If error occurs, assume connection is dead and remove it
            this.rconConnections.delete(id);
            throw new Error(`RCON Error: ${error.message}`);
        }
    }

    async getCurrentMap(instanceId: string | number): Promise<string | null> {
        try {
            const response = await this.sendCommand(instanceId, 'status');
            
            // CS2 format: "loaded spawngroup(  1)  : SV:  [1: de_mirage | main lump | mapload]"
            const mapMatch = response.match(/loaded spawngroup\(\s*1\)\s*:\s*SV:\s*\[1:\s*(\w+_\w+)/i);
            
            if (mapMatch && mapMatch[1]) {
                console.log(`[MAP DETECTED]: ${mapMatch[1]}`);
                return mapMatch[1];
            }
            
            console.log('[MAP DETECTION FAILED] - No spawngroup pattern matched');
            console.log('[DEBUG] First 500 chars of status:', response.substring(0, 500));
            return null;
        } catch (error) {
            console.error(`Failed to get current map for instance ${instanceId}:`, error);
            return null;
        }
    }

    async startServer(instanceId: string | number, options: any, onLog?: (data: string) => void) {
        const id = instanceId.toString();
        
        if (this.runningServers.has(id)) {
            throw new Error('Server is already running');
        }

        const serverPath = path.join(this.installDir, id);

        
        // Platform specific binary path
        let relativeBinPath = '';
        if (this.isWindows) {
            relativeBinPath = path.join('game', 'bin', 'win64', 'cs2.exe');
        } else {
            // Linux path
            relativeBinPath = path.join('game', 'bin', 'linuxsteamrt64', 'cs2');
        }

        const cs2Exe = path.join(serverPath, relativeBinPath);
        const binDir = path.dirname(cs2Exe);

        if (!fs.existsSync(cs2Exe)) {
            // Try fallback for linux
            if (!this.isWindows) {
               // unexpected path?
            }
            throw new Error(`CS2 executable not found at ${cs2Exe}`);
        }

        // --- Steamworks SDK Fixes ---
        const steamCmdDir = path.dirname(this.steamCmdExe);

        if (this.isWindows) {
            // 1. Ensure steamclient64.dll is in binDir (Windows Only)
            const sourceDll = path.join(steamCmdDir, 'steamclient64.dll');
            const targetDll = path.join(binDir, 'steamclient64.dll');

            if (fs.existsSync(sourceDll) && !fs.existsSync(targetDll)) {
                console.log(`Copying steamclient64.dll to ${binDir}...`);
                fs.copyFileSync(sourceDll, targetDll);
            }
        } else {
             // Linux: Might need to link steamclient.so from steamcmd to game/bin/linuxsteamrt64
             // For now let's assume SteamCMD handled deps, or user has LD_LIBRARY_PATH set.
             // We can check and copy if needed later.
             const steamCmdDir = path.dirname(this.steamCmdExe);
             const sourceSo = path.join(steamCmdDir, 'linux64', 'steamclient.so');
             const targetSo = path.join(binDir, 'steamclient.so'); // Check if CS2 needs .so in binDir
             
             if (fs.existsSync(sourceSo) && !fs.existsSync(targetSo)) {
                  try {
                      fs.copyFileSync(sourceSo, targetSo);
                  } catch (e) {
                      // ignore permission errors
                  }
             }
        }

        // 2. Create steam_appid.txt
        fs.writeFileSync(path.join(binDir, 'steam_appid.txt'), '730');
        fs.writeFileSync(path.join(serverPath, 'steam_appid.txt'), '730');

        // 3. Secure Configuration (Prevent CLI Leakage)
        const cfgDir = path.join(serverPath, 'game', 'csgo', 'cfg');
        if (!fs.existsSync(cfgDir)) {
             fs.mkdirSync(cfgDir, { recursive: true });
        }
        
        
        const serverCfgPath = path.join(cfgDir, 'server.cfg');
        let cfgContent = '';
        
        if (fs.existsSync(serverCfgPath)) {
            cfgContent = fs.readFileSync(serverCfgPath, 'utf8');
        }

        // Helper to update/add config key
        const updateConfigKey = (content: string, key: string, value: string) => {
            const regex = new RegExp(`^${key}\\s+.*$`, 'm');
            const newLine = `${key} "${value}"`;
            if (regex.test(content)) {
                return content.replace(regex, newLine);
            } else {
                return content + `\n${newLine}`;
            }
        };

        if (options.password) {
            cfgContent = updateConfigKey(cfgContent, 'sv_password', options.password);
        } else {
            // If no password, ensure it's cleared
            cfgContent = updateConfigKey(cfgContent, 'sv_password', '');
        }

        if (options.rcon_password) {
            cfgContent = updateConfigKey(cfgContent, 'rcon_password', options.rcon_password);
        }
        
        // Write to server.cfg
        fs.writeFileSync(serverCfgPath, cfgContent, 'utf8');
        console.log(`[SECURE] Wrote configuration to ${serverCfgPath}`);


        const args = [
            '-dedicated',
            '+map', options.map || 'de_dust2',
            '-maxplayers', (options.max_players || 64).toString(),
            '-port', (options.port || 27015).toString(),
            '-nosteamclient',
            '-noconsole'
        ];

        if (options.vac_enabled) {
            args.push('+sv_lan', '0');
        } else {
            args.push('-insecure', '+sv_lan', '1');
        }

        if (options.gslt_token && options.gslt_token.length > 5) {
             args.push('+sv_setsteamaccount', options.gslt_token);
        } else {
            args.push('+sv_setsteamaccount', 'anonymous');
        }

        if (options.name) args.push('+hostname', options.name);
        
        if (options.steam_api_key && options.steam_api_key.length > 10) {
            args.push('-authkey', options.steam_api_key);
        }

        args.push('+ip', '0.0.0.0');


        console.log(`Starting CS2 Server ${id}...`);

        const env = {
            ...process.env,
            SteamAppId: '730',
            Breakpad_IgnoreSharedMemory: '1',
            SteamClientLaunch: '1',
            PATH: `${steamCmdDir};${process.env.PATH}`
        };

        const serverProcess = spawn(cs2Exe, args, { cwd: serverPath, env });

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
            db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);
        });

        this.runningServers.set(id, serverProcess);
        
        // Save PID to database for process stewardship
        if (serverProcess.pid) {
             try {
                db.prepare("UPDATE servers SET pid = ? WHERE id = ?").run(serverProcess.pid, id);
                console.log(`[CS2 ${id}]: PID ${serverProcess.pid} tracked in database.`);
             } catch (err) {
                 console.error(`[CS2 ${id}]: Failed to track PID in database:`, err);
             }
        }
    }

    async stopServer(instanceId: string | number): Promise<boolean> {
        const id = instanceId.toString();
        
        // Clean up RCON connection
        if (this.rconConnections.has(id)) {
            try {
                await this.rconConnections.get(id).end();
            } catch (e) {
                // Ignore error on close
            }
            this.rconConnections.delete(id);
        }

        let stopped = false;

        // 1. Try stopping via in-memory ChildProcess
        const proc = this.runningServers.get(id);
        if (proc) {
            proc.kill();
            this.runningServers.delete(id);
            stopped = true;
        }

        // 2. Try stopping via Database PID (Zombie/Recovery handling)
        if (!stopped) {
             try {
                const server = db.prepare("SELECT pid FROM servers WHERE id = ?").get(id) as { pid: number | null };
                if (server && server.pid) {
                    try {
                        process.kill(server.pid);
                        console.log(`[CS2 ${id}]: Killed orphan process with PID ${server.pid}`);
                        stopped = true;
                    } catch (e: any) {
                        if (e.code === 'ESRCH') {
                            // Process doesn't exist anymore
                        } else {
                            console.error(`[CS2 ${id}]: Failed to kill process ${server.pid}:`, e);
                        }
                    }
                }
             } catch (dbError) {
                 console.error(`[CS2 ${id}]: DB Error during stop:`, dbError);
             }
        }

        // 3. Always ensure DB state is clean
        db.prepare("UPDATE servers SET status = 'OFFLINE', pid = NULL WHERE id = ?").run(id);

        return stopped;
    }

    isServerRunning(instanceId: string | number): boolean {
        return this.runningServers.has(instanceId.toString());
    }

    async deleteServerFiles(instanceId: string | number): Promise<void> {
        const serverDir = path.join(this.installDir, instanceId.toString());
        
        try {
            await fs.promises.access(serverDir);
            try {
                // Recursively delete the entire server directory asynchronously
                await fs.promises.rm(serverDir, { recursive: true, force: true });
                console.log(`Deleted server files for instance ${instanceId} at ${serverDir}`);
            } catch (error) {
                console.error(`Failed to delete server files for instance ${instanceId}:`, error);
                throw new Error(`Failed to delete server files: ${error}`);
            }
        } catch {
            // Directory doesn't exist, nothing to do
        }
    }

    private isPathSafe(baseDir: string, targetPath: string): boolean {
        const relative = path.relative(baseDir, targetPath);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
    }

    async listFiles(instanceId: string | number, subDir: string = ''): Promise<any[]> {
        const id = instanceId.toString();
        const baseDir = path.join(this.installDir, id, 'game', 'csgo');
        const serverPath = path.resolve(baseDir, subDir);

        if (!this.isPathSafe(baseDir, serverPath)) {
            throw new Error("Access denied: Path outside of server directory");
        }
        
        try {
            await fs.promises.access(serverPath);
        } catch {
            return [];
        }
        
        try {
            const entries = await fs.promises.readdir(serverPath, { withFileTypes: true });
            
            const statsPromises = entries.map(async (entry) => {
                const entryPath = path.join(serverPath, entry.name);
                let size = 0;
                let mtime = new Date();
                
                if (entry.isFile()) {
                    try {
                        const stats = await fs.promises.stat(entryPath);
                        size = stats.size;
                        mtime = stats.mtime;
                    } catch (e) {
                        // Ignore stat errors (file might be deleted/locked)
                    }
                }
                
                return {
                    name: entry.name,
                    isDirectory: entry.isDirectory(),
                    size,
                    mtime
                };
            });

            return await Promise.all(statsPromises);
        } catch (error) {
            console.error(`Error listing files:`, error);
            throw error;
        }
    }

    async readFile(instanceId: string | number, filePath: string): Promise<string> {
        const id = instanceId.toString();
        // Security check: Normalize path and ensure it doesn't escape the server directory
        const baseDir = path.join(this.installDir, id, 'game', 'csgo');
        const absolutePath = path.resolve(baseDir, filePath);
        
        if (!this.isPathSafe(baseDir, absolutePath)) {
            throw new Error("Access denied: Path outside of server directory");
        }

        try {
            await fs.promises.access(absolutePath);
        } catch {
            throw new Error("File not found");
        }

        return fs.promises.readFile(absolutePath, 'utf8');
    }

    async writeFile(instanceId: string | number, filePath: string, content: string): Promise<void> {
        const id = instanceId.toString();
        const baseDir = path.join(this.installDir, id, 'game', 'csgo');
        const absolutePath = path.resolve(baseDir, filePath);
        
        if (!this.isPathSafe(baseDir, absolutePath)) {
            throw new Error("Access denied: Path outside of server directory");
        }

        await fs.promises.writeFile(absolutePath, content);
    }
    async downloadAndExtract(url: string, targetDir: string): Promise<void> {
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const zipPath = path.join(targetDir, 'temp_plugin.zip');
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to download from ${url}: ${response.statusText}`);
            if (!response.body) throw new Error(`Response body is empty for ${url}`);
            
            // ⚡ Bolt: Stream download to disk to avoid OOM on large files
            // @ts-ignore - Readable.fromWeb matches standard Web Streams
            await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(zipPath));

            const zip = new AdmZip(zipPath);
            const zipEntries = zip.getEntries();
            console.log(`Extracting ${zipEntries.length} files from ${url}`);
            // Log first few entries to see structure
            zipEntries.slice(0, 5).forEach(entry => console.log(`Entry: ${entry.entryName}`));
            
            // AdmZip extractAllTo is synchronous, nothing we can do about that easily without switching lib
            // but the biggest memory issue was the download buffer.
            zip.extractAllTo(targetDir, true);
        } finally {
            if (fs.existsSync(zipPath)) {
                await fs.promises.unlink(zipPath);
            }
        }
    }

    async installMetamod(instanceId: string | number): Promise<void> {
        const id = instanceId.toString();
        const csgoDir = path.join(this.installDir, id, 'game', 'csgo');
        const metamodUrl = this.pluginRegistry.metamod.downloadUrl;
        if (!metamodUrl) throw new Error("Metamod URL not found");

        console.log(`Installing Metamod for instance ${id}...`);
        await this.downloadAndExtract(metamodUrl, csgoDir);

        // 📝 Patch gameinfo.gi
        const gameinfoPath = path.join(csgoDir, 'gameinfo.gi');
        if (fs.existsSync(gameinfoPath)) {
            let content = fs.readFileSync(gameinfoPath, 'utf8');
            
            // Check if already patched to avoid corruption or duplication
            if (!content.includes('csgo/addons/metamod')) {
                // Try to insert after Game_LowViolence first (User preference)
                if (content.match(/Game_LowViolence\s+csgo_lv/)) {
                     content = content.replace(
                        /(Game_LowViolence\s+csgo_lv[^\r\n]*)/,
                        '$1\n\t\t\tGame\tcsgo/addons/metamod'
                    );
                    fs.writeFileSync(gameinfoPath, content);
                    console.log(`Patched gameinfo.gi (after Game_LowViolence) for instance ${id}`);
                }
                // Fallback: Find SearchPaths block and inject at top if LowViolence not found
                else if (content.includes('SearchPaths')) {
                    content = content.replace(
                        /(SearchPaths\s*\{)/,
                        '$1\n\t\t\tGame\tcsgo/addons/metamod'
                    );
                    fs.writeFileSync(gameinfoPath, content);
                    console.log(`Patched gameinfo.gi (at SearchPaths start) for instance ${id}`);
                } else {
                     console.warn(`Warning: SearchPaths not found in gameinfo.gi for instance ${id}`);
                }
            } else {
                console.log(`gameinfo.gi already patched for instance ${id}`);
            }
        }
    }

    async installCounterStrikeSharp(instanceId: string | number): Promise<void> {
        const id = instanceId.toString();
        const csgoDir = path.join(this.installDir, id, 'game', 'csgo');
        const cssUrl = this.pluginRegistry.cssharp.downloadUrlPattern.replace('{version}', this.pluginRegistry.cssharp.currentVersion).replace('{version_clean}', this.pluginRegistry.cssharp.currentVersion.replace('v', ''));
        if (!cssUrl) throw new Error("CounterStrikeSharp URL not found");

        console.log(`Installing CounterStrikeSharp for instance ${id}...`);
        await this.downloadAndExtract(cssUrl, csgoDir);
    }

    async uninstallMetamod(instanceId: string | number): Promise<void> {
        const id = instanceId.toString();
        const csgoDir = path.join(this.installDir, id, 'game', 'csgo');
        const metamodDir = path.join(csgoDir, 'addons', 'metamod');
        const vdfPath = path.join(csgoDir, 'addons', 'metamod.vdf');

        console.log(`Uninstalling Metamod for instance ${id}...`);

        // 1. Remove files
        if (fs.existsSync(metamodDir)) {
            fs.rmSync(metamodDir, { recursive: true, force: true });
        }
        if (fs.existsSync(vdfPath)) {
            fs.unlinkSync(vdfPath);
        }

        // 2. Revert gameinfo.gi
        const gameinfoPath = path.join(csgoDir, 'gameinfo.gi');
        if (fs.existsSync(gameinfoPath)) {
            let content = fs.readFileSync(gameinfoPath, 'utf8');
            if (content.includes('csgo/addons/metamod')) {
                // Remove the line containing the metamod path (handling tabs/spaces)
                content = content.replace(/^\s*Game\s+csgo\/addons\/metamod\s*$/gm, '');
                // Also clean up if it was inserted with specific formatting in previous versions
                content = content.replace(/SearchPaths\s*{\s*Game\s+csgo\/addons\/metamod/g, 'SearchPaths\n\t\t{');
                // General cleanup for the specific line we added
                content = content.replace(/\s*Game\tcsgo\/addons\/metamod/g, '');
                
                fs.writeFileSync(gameinfoPath, content);
                console.log(`Reverted gameinfo.gi for instance ${id}`);
            }
        }
    }

    async uninstallCounterStrikeSharp(instanceId: string | number): Promise<void> {
        const id = instanceId.toString();
        const cssDir = path.join(this.installDir, id, 'game', 'csgo', 'addons', 'counterstrikesharp');

        console.log(`Uninstalling CounterStrikeSharp for instance ${id}...`);
        if (fs.existsSync(cssDir)) {
             fs.rmSync(cssDir, { recursive: true, force: true });
             console.log(`CounterStrikeSharp directory removed for instance ${id}`);
        }
    }

    async updatePlugin(instanceId: string | number, pluginId: PluginId): Promise<void> {
        const id = instanceId.toString();
        console.log(`Updating ${pluginId} for instance ${id}...`);

        // Get latest version info
        const updateInfo = await this.checkPluginUpdate(pluginId);
        
        if (!updateInfo.hasUpdate) {
            console.log(`${pluginId} is already up to date (${updateInfo.currentVersion})`);
            return;
        }

        if (!updateInfo.downloadUrl) {
            throw new Error(`No download URL found for ${pluginId} update`);
        }

        console.log(`Updating ${pluginId} from ${updateInfo.currentVersion} to ${updateInfo.latestVersion}...`);

        // Uninstall old version
        if (pluginId === 'matchzy') {
            await this.uninstallMatchZy(instanceId);
        } else if (pluginId === 'simpleadmin') {
            await this.uninstallSimpleAdmin(instanceId);
        }

        // Install new version
        const csgoDir = path.join(this.installDir, id, 'game', 'csgo');
        const addonsDir = path.join(csgoDir, 'addons');

        if (pluginId === 'simpleadmin') {
            // SimpleAdmin needs dependencies too
            const anyBaseLibUrl = 'https://github.com/NickFox007/AnyBaseLibCS2/releases/latest/download/AnyBaseLib.zip';
            const playerSettingsUrl = 'https://github.com/NickFox007/PlayerSettingsCS2/releases/latest/download/PlayerSettings.zip';
            const menuManagerUrl = 'https://github.com/NickFox007/MenuManagerCS2/releases/latest/download/MenuManager.zip';

            console.log('Installing dependencies...');
            await this.downloadAndExtract(anyBaseLibUrl, csgoDir);
            await this.downloadAndExtract(playerSettingsUrl, csgoDir);
            await this.downloadAndExtract(menuManagerUrl, csgoDir);
            
            await this.downloadAndExtract(updateInfo.downloadUrl, addonsDir);
        } else {
            await this.downloadAndExtract(updateInfo.downloadUrl, csgoDir);
        }

        // Update registry with new version
        this.pluginRegistry[pluginId].currentVersion = updateInfo.latestVersion!;

        console.log(`${pluginId} updated successfully to ${updateInfo.latestVersion}`);
    }

    async installMatchZy(instanceId: string | number): Promise<void> {
        const id = instanceId.toString();
        const csgoDir = path.join(this.installDir, id, 'game', 'csgo');
        // Using specific version 0.8.15 for stability
        const matchZyUrl = 'https://github.com/shobhit-pathak/MatchZy/releases/download/0.8.15/MatchZy-0.8.15.zip';

        console.log(`Installing MatchZy for instance ${id}...`);
        await this.downloadAndExtract(matchZyUrl, csgoDir);
        console.log(`MatchZy installed successfully for instance ${id}`);
    }

    async uninstallMatchZy(instanceId: string | number): Promise<void> {
        const id = instanceId.toString();
        // Path: game/csgo/addons/counterstrikesharp/plugins/MatchZy
        const matchZyDir = path.join(this.installDir, id, 'game', 'csgo', 'addons', 'counterstrikesharp', 'plugins', 'MatchZy');

        console.log(`Uninstalling MatchZy for instance ${id}...`);
        if (fs.existsSync(matchZyDir)) {
             fs.rmSync(matchZyDir, { recursive: true, force: true });
             console.log(`MatchZy directory removed for instance ${id}`);
        }
    }

    async installSimpleAdmin(instanceId: string | number): Promise<void> {
        const id = instanceId.toString();
        const csgoDir = path.join(this.installDir, id, 'game', 'csgo');
        const addonsDir = path.join(csgoDir, 'addons');
        
        // URLs
        const anyBaseLibUrl = 'https://github.com/NickFox007/AnyBaseLibCS2/releases/latest/download/AnyBaseLib.zip';
        const playerSettingsUrl = 'https://github.com/NickFox007/PlayerSettingsCS2/releases/latest/download/PlayerSettings.zip';
        const menuManagerUrl = 'https://github.com/NickFox007/MenuManagerCS2/releases/latest/download/MenuManager.zip';
        const simpleAdminUrl = 'https://github.com/daffyyyy/CS2-SimpleAdmin/releases/latest/download/CS2-SimpleAdmin-1.7.8-beta-8.zip';

        console.log(`Installing CS2-SimpleAdmin and dependencies for instance ${id}...`);

        // 1. Install AnyBaseLib
        console.log('Installing AnyBaseLib (Dependency 1/3)...');
        await this.downloadAndExtract(anyBaseLibUrl, csgoDir); // Usually formatted as addons/counterstrikesharp

        // 2. Install PlayerSettings
        console.log('Installing PlayerSettings (Dependency 2/3)...');
        await this.downloadAndExtract(playerSettingsUrl, csgoDir); // Usually formatted as addons/counterstrikesharp

        // 3. Install MenuManager
        console.log('Installing MenuManager (Dependency 3/3)...');
        await this.downloadAndExtract(menuManagerUrl, csgoDir); // Usually formatted as addons/counterstrikesharp

        // Cleanup previous incorrect SimpleAdmin installation if exists
        const incorrectPath = path.join(csgoDir, 'counterstrikesharp');
        if (fs.existsSync(incorrectPath)) {
            console.log('Removing incorrectly placed counterstrikesharp folder...');
            fs.rmSync(incorrectPath, { recursive: true, force: true });
        }

        console.log(`Installing CS2-SimpleAdmin...`);
        // SimpleAdmin zip has 'counterstrikesharp' at root, so extract to 'addons'
        await this.downloadAndExtract(simpleAdminUrl, addonsDir);
        
        console.log(`CS2-SimpleAdmin and all dependencies installed successfully for instance ${id}`);
    }

    async uninstallSimpleAdmin(instanceId: string | number): Promise<void> {
        const id = instanceId.toString();
        const basePluginsDir = path.join(this.installDir, id, 'game', 'csgo', 'addons', 'counterstrikesharp', 'plugins');
        const sharedDir = path.join(this.installDir, id, 'game', 'csgo', 'addons', 'counterstrikesharp', 'shared');

        console.log(`Uninstalling CS2-SimpleAdmin and dependencies for instance ${id}...`);

        const pluginsToRemove = [
            'CS2-SimpleAdmin',
            'CS2-SimpleAdmin_FunCommands',
            'CS2-SimpleAdmin_StealthModule',
            'MenuManagerCore',
            'PlayerSettings'
        ];

        // 1. Remove Plugin Folders
        for (const plugin of pluginsToRemove) {
            const pluginDir = path.join(basePluginsDir, plugin);
            if (fs.existsSync(pluginDir)) {
                 fs.rmSync(pluginDir, { recursive: true, force: true });
                 console.log(`Removed plugin directory: ${plugin}`);
            }
        }

        // 2. Remove Shared Libraries
        const sharedLibsToRemove = [
            'AnyBaseLib',
            'CS2-SimpleAdminApi',
            'MenuManagerApi',
            'PlayerSettingsApi'
        ];

        for (const lib of sharedLibsToRemove) {
            const libDir = path.join(sharedDir, lib);
            if (fs.existsSync(libDir)) {
                fs.rmSync(libDir, { recursive: true, force: true });
                console.log(`Removed shared library: ${lib}`);
            }
        }

        // 3. Remove Configs (game/csgo/addons/counterstrikesharp/configs/plugins/...)
        const configsPluginsDir = path.join(this.installDir, id, 'game', 'csgo', 'addons', 'counterstrikesharp', 'configs', 'plugins');
        const configsToRemove = [
             'CS2-SimpleAdmin',
             'CS2-SimpleAdmin_FunCommands',
             'CS2-SimpleAdmin_StealthModule',
             'MenuManagerCore',
             'PlayerSettings'
        ];

        for (const config of configsToRemove) {
            const configDir = path.join(configsPluginsDir, config);
            if (fs.existsSync(configDir)) {
                fs.rmSync(configDir, { recursive: true, force: true });
                console.log(`Removed config directory: ${config}`);
            }
        }

        console.log(`CS2-SimpleAdmin and all traces uninstalled successfully for instance ${id}`);
    }

    async getPluginStatus(instanceId: string | number): Promise<{ metamod: boolean, cssharp: boolean, matchzy: boolean, simpleadmin: boolean }> {
        const id = instanceId.toString();
        const csgoDir = path.join(this.installDir, id, 'game', 'csgo');
        
        const metamodValues = path.join(csgoDir, 'addons', 'metamod.vdf');
        const metamodBin = path.join(csgoDir, 'addons', 'metamod', 'bin');
        const hasMetamod = fs.existsSync(metamodValues) && fs.existsSync(metamodBin);

        const cssharpDir = path.join(csgoDir, 'addons', 'counterstrikesharp');
        const hasCssharp = fs.existsSync(cssharpDir);

        const matchZyDir = path.join(csgoDir, 'addons', 'counterstrikesharp', 'plugins', 'MatchZy');
        const hasMatchZy = fs.existsSync(matchZyDir);

        const simpleAdminDir = path.join(csgoDir, 'addons', 'counterstrikesharp', 'plugins', 'CS2-SimpleAdmin');
        const hasSimpleAdmin = fs.existsSync(simpleAdminDir);

        return { metamod: hasMetamod, cssharp: hasCssharp, matchzy: hasMatchZy, simpleadmin: hasSimpleAdmin };
    }

    async getSystemHealth(): Promise<any> {
        const result: any = {
            os: { platform: process.platform, arch: process.arch },
            cpu: { avx: false, model: '', cores: 0 },
            ram: { total: 0, free: 0, status: 'unknown' },
            disk: { total: 0, free: 0, status: 'unknown' },
            runtimes: {
                dotnet: { status: 'missing', versions: [] as string[] },
                vcruntime: { status: 'missing' }
            }
        };

        try {
            // CPU & AVX
            const cpu = await si.cpu();
            result.cpu.model = cpu.brand;
            result.cpu.cores = cpu.cores;
            result.cpu.avx = cpu.flags.toLowerCase().includes('avx');

            // RAM
            const mem = await si.mem();
            result.ram.total = mem.total;
            result.ram.free = mem.free;
            result.ram.status = (mem.total / 1024 / 1024 / 1024) >= 8 ? 'good' : 'warning';

            // Disk for the install dir
            const disk = await si.fsSize();
            const root = disk.find(d => this.installDir.startsWith(d.mount)) || disk[0];
            if (root) {
                result.disk.total = root.size;
                result.disk.free = root.available;
                result.disk.status = (root.available / 1024 / 1024 / 1024) >= 40 ? 'good' : 'warning';
            }

            // Dotnet Runtimes
            await new Promise<void>((resolve) => {
                exec('dotnet --list-runtimes', (error, stdout) => {
                    if (!error && stdout) {
                        result.runtimes.dotnet.versions = stdout.split('\n').filter(l => l.trim());
                        const hasNet8 = stdout.includes('Microsoft.NETCore.App 8') || stdout.includes('Microsoft.AspNetCore.App 8');
                        result.runtimes.dotnet.status = hasNet8 ? 'good' : 'warning';
                    } else {
                        result.runtimes.dotnet.status = 'missing';
                    }
                    resolve();
                });
            });

            // VC++ Redist (Simple DLL check for Windows)
            if (process.platform === 'win32') {
                const sys32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
                const hasVc = fs.existsSync(path.join(sys32, 'vcruntime140.dll'));
                result.runtimes.vcruntime.status = hasVc ? 'good' : 'missing';
            } else {
                result.runtimes.vcruntime.status = 'skipped';
            }

        } catch (error) {
            console.error("System health check error:", error);
        }

        return result;
    }
}

export const serverManager = new ServerManager();
