import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import db from '../db.js';

export class SteamManager {
    async ensureSteamCMD(steamCmdExe: string): Promise<boolean> {
        try {
            await fs.promises.access(steamCmdExe);
            return true;
        } catch {
            return false;
        }
    }

    async downloadSteamCmd(targetExe: string): Promise<void> {
        const steamCmdDir = path.dirname(targetExe);
        const isWin = process.platform === 'win32';
        
        try {
            await fs.promises.mkdir(steamCmdDir, { recursive: true });
        } catch (error: any) {
            if (error.code !== 'EEXIST') throw error;
        }

        const archiveName = isWin ? 'steamcmd.zip' : 'steamcmd_linux.tar.gz';
        const archivePath = path.join(steamCmdDir, archiveName);
        const url = isWin 
            ? 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'
            : 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';

        console.log(`Downloading ${isWin ? 'Windows' : 'Linux'} SteamCMD to ${steamCmdDir}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download SteamCMD: ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        await fs.promises.writeFile(archivePath, Buffer.from(arrayBuffer));

        if (isWin) {
            console.log(`Extracting Windows SteamCMD...`);
            const { default: AdmZip } = await import('adm-zip');
            const zip = new AdmZip(archivePath);
            zip.extractAllTo(steamCmdDir, true);
        } else {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            console.log(`Extracting Linux SteamCMD...`);
            await execAsync(`tar -xzf "${archivePath}" -C "${steamCmdDir}"`);
        }

        await fs.promises.unlink(archivePath);
    }

    async installOrUpdateServer(instanceId: string | number, steamCmdExe: string, installDir: string, onLog?: (data: string) => void): Promise<void> {
        const id = instanceId.toString();
        const serverPath = path.join(installDir, id);
        
        try {
            await fs.promises.mkdir(serverPath, { recursive: true });
        } catch (error: any) {
            if (error.code !== 'EEXIST') throw error;
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
