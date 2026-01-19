import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import db from '../db.js';

export class SteamManager {
    async ensureSteamCMD(steamCmdExe: string): Promise<boolean> {
        return fs.existsSync(steamCmdExe);
    }

    async downloadSteamCmd(targetExe: string): Promise<void> {
        const steamCmdDir = path.dirname(targetExe);
        if (!fs.existsSync(steamCmdDir)) {
            fs.mkdirSync(steamCmdDir, { recursive: true });
        }

        const tarPath = path.join(steamCmdDir, 'steamcmd_linux.tar.gz');
        const url = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';

        console.log(`Downloading Linux SteamCMD to ${steamCmdDir}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download SteamCMD: ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(tarPath, Buffer.from(arrayBuffer));

        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        console.log(`Extracting Linux SteamCMD...`);
        await execAsync(`tar -xzf "${tarPath}" -C "${steamCmdDir}"`);

        fs.unlinkSync(tarPath);
    }

    async installOrUpdateServer(instanceId: string | number, steamCmdExe: string, installDir: string, onLog?: (data: string) => void): Promise<void> {
        const id = instanceId.toString();
        const serverPath = path.join(installDir, id);
        
        if (!fs.existsSync(serverPath)) {
            fs.mkdirSync(serverPath, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            const steamCmdParams = [
                '+force_install_dir', serverPath,
                '+login', 'anonymous',
                '+app_update', '730', 'validate',
                '+quit'
            ];

            const steamCmdProcess = spawn(steamCmdExe, steamCmdParams);

            let stdoutBuffer = '';
            steamCmdProcess.stdout.on('data', (data) => {
                stdoutBuffer += data.toString();
                const lines = stdoutBuffer.split(/\r?\n|\r/);
                stdoutBuffer = lines.pop() || '';
                lines.forEach(line => {
                    if (line.trim() && onLog) onLog(line.trim());
                });
            });

            steamCmdProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`SteamCMD failed with code ${code}`));
            });
        });
    }
}

export const steamManager = new SteamManager();
