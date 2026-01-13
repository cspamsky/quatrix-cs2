import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from './db.js';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerManager {
    private runningServers: Map<string, any> = new Map();
    private pluginMeta = [
        { id: 'metamod', name: 'Metamod:Source', version: '2.0 (Build 1380)', url: 'https://mms.alliedmods.net/mmsdrop/2.0/mmsource-2.0.0-git1380-windows.zip' },
        { id: 'cssharp', name: 'CounterStrikeSharp', version: 'v1.0.355', url: 'https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v1.0.355/counterstrikesharp-with-runtime-windows-1.0.355.zip' }
    ];

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

        const bufferSize = 4096; // Read in 4KB chunks
        const buffer = Buffer.alloc(bufferSize);
        let fd: number | null = null;

        try {
            fd = fs.openSync(logFile, 'r');
            const stats = fs.statSync(logFile);
            const fileSize = stats.size;
            let position = fileSize;
            let lines: string[] = [];
            let leftOver = '';

            // ⚡ Bolt: Read file backwards in chunks to avoid loading entire file into memory
            while (position > 0 && lines.length <= limit) {
                const readSize = Math.min(position, bufferSize);
                position -= readSize;

                fs.readSync(fd, buffer, 0, readSize, position);
                const chunk = buffer.toString('utf8', 0, readSize);
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
                    // Only skip empty lines (like the original implementation), but preserve indentation
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
            if (fd !== null) {
                fs.closeSync(fd);
            }
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
        const server: any = db.prepare("SELECT * FROM servers WHERE id = ?").get(id);
        if (!server || !server.rcon_password) throw new Error("Server not found or RCON password not set");

        if (!this.isServerRunning(id)) throw new Error("Server is not running");
    
        const { Rcon } = await import('rcon-client');
        
        try {
            const rcon = await Rcon.connect({
                host: '127.0.0.1',
                port: server.port,
                password: server.rcon_password,
                timeout: 5000
            });

            const response = await rcon.send(command);
            await rcon.end();
            return response;
        } catch (error: any) {
            console.error(`[RCON ERROR Instance ${id}]`, error);
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
        const cs2Exe = path.join(serverPath, 'game', 'bin', 'win64', 'cs2.exe');
        const binDir = path.dirname(cs2Exe);

        if (!fs.existsSync(cs2Exe)) {
            throw new Error('CS2 executable not found.');
        }

        // --- Steamworks SDK Fixes ---
        // 1. Ensure steamclient64.dll is in binDir
        const steamCmdDir = path.dirname(this.steamCmdExe);
        const sourceDll = path.join(steamCmdDir, 'steamclient64.dll');
        const targetDll = path.join(binDir, 'steamclient64.dll');

        if (fs.existsSync(sourceDll) && !fs.existsSync(targetDll)) {
            console.log(`Copying steamclient64.dll to ${binDir}...`);
            fs.copyFileSync(sourceDll, targetDll);
        }

        // 2. Create steam_appid.txt
        fs.writeFileSync(path.join(binDir, 'steam_appid.txt'), '730');
        fs.writeFileSync(path.join(serverPath, 'steam_appid.txt'), '730');

        const args = [
            '-dedicated',
            '+map', options.map || 'de_dust2',
            '-port', (options.port || 27015).toString(),
            '-nosteamclient',
            '-noconsole'
        ];

        if (options.vac_enabled) {
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
        if (options.name) args.push('+hostname', options.name);
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

    deleteServerFiles(instanceId: string | number): void {
        const serverDir = path.join(this.installDir, instanceId.toString());
        
        if (fs.existsSync(serverDir)) {
            try {
                // Recursively delete the entire server directory
                fs.rmSync(serverDir, { recursive: true, force: true });
                console.log(`Deleted server files for instance ${instanceId} at ${serverDir}`);
            } catch (error) {
                console.error(`Failed to delete server files for instance ${instanceId}:`, error);
                throw new Error(`Failed to delete server files: ${error}`);
            }
        }
    }

    async listFiles(instanceId: string | number, subDir: string = ''): Promise<any[]> {
        const id = instanceId.toString();
        const baseDir = path.join(this.installDir, id, 'game', 'csgo');
        const serverPath = path.resolve(baseDir, subDir);

        if (!serverPath.startsWith(baseDir)) {
            throw new Error("Access denied: Path outside of server directory");
        }
        
        if (!fs.existsSync(serverPath)) return [];
        
        const entries = fs.readdirSync(serverPath, { withFileTypes: true });
        return entries.map(entry => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            size: entry.isFile() ? fs.statSync(path.join(serverPath, entry.name)).size : 0,
            mtime: fs.statSync(path.join(serverPath, entry.name)).mtime
        }));
    }

    async readFile(instanceId: string | number, filePath: string): Promise<string> {
        const id = instanceId.toString();
        // Security check: Normalize path and ensure it doesn't escape the server directory
        const baseDir = path.join(this.installDir, id, 'game', 'csgo');
        const absolutePath = path.resolve(baseDir, filePath);
        
        if (!absolutePath.startsWith(baseDir)) {
            throw new Error("Access denied: Path outside of server directory");
        }

        if (!fs.existsSync(absolutePath)) throw new Error("File not found");
        return fs.readFileSync(absolutePath, 'utf8');
    }

    async writeFile(instanceId: string | number, filePath: string, content: string): Promise<void> {
        const id = instanceId.toString();
        const baseDir = path.join(this.installDir, id, 'game', 'csgo');
        const absolutePath = path.resolve(baseDir, filePath);
        
        if (!absolutePath.startsWith(baseDir)) {
            throw new Error("Access denied: Path outside of server directory");
        }

        fs.writeFileSync(absolutePath, content);
    }
    async downloadAndExtract(url: string, targetDir: string): Promise<void> {
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const zipPath = path.join(targetDir, 'temp_plugin.zip');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download from ${url}: ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));

        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();
        console.log(`Extracting ${zipEntries.length} files from ${url}`);
        // Log first few entries to see structure
        zipEntries.slice(0, 5).forEach(entry => console.log(`Entry: ${entry.entryName}`));
        
        zip.extractAllTo(targetDir, true);
        fs.unlinkSync(zipPath);
    }

    async installMetamod(instanceId: string | number): Promise<void> {
        const id = instanceId.toString();
        const csgoDir = path.join(this.installDir, id, 'game', 'csgo');
        const metamodUrl = this.pluginMeta.find(p => p.id === 'metamod')?.url;
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
        const cssUrl = this.pluginMeta.find(p => p.id === 'cssharp')?.url;
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
        // Path: game/csgo/addons/counterstrikesharp/plugins/CS2-SimpleAdmin
        const simpleAdminDir = path.join(this.installDir, id, 'game', 'csgo', 'addons', 'counterstrikesharp', 'plugins', 'CS2-SimpleAdmin');

        console.log(`Uninstalling CS2-SimpleAdmin for instance ${id}...`);
        if (fs.existsSync(simpleAdminDir)) {
             fs.rmSync(simpleAdminDir, { recursive: true, force: true });
             console.log(`CS2-SimpleAdmin directory removed for instance ${id}`);
        }
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
}

export const serverManager = new ServerManager();
