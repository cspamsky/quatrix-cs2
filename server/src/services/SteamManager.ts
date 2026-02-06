import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import db from '../db.js';
import { taskService } from './TaskService.js';

export class SteamManager {
    async ensureSteamCMD(steamCmdExe: string, taskId?: string): Promise<boolean> {
        try {
            await fs.promises.access(steamCmdExe);
            return true;
        } catch {
            return false;
        }
    }

    async downloadSteamCmd(targetExe: string, taskId?: string): Promise<void> {
        const steamCmdDir = path.dirname(targetExe);
        
        try {
            await fs.promises.mkdir(steamCmdDir, { recursive: true });
        } catch (error: any) {
            if (error.code !== 'EEXIST') throw error;
        }

        const archiveName = 'steamcmd_linux.tar.gz';
        const archivePath = path.join(steamCmdDir, archiveName);
        const url = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';

        console.log(`Downloading Linux SteamCMD to ${steamCmdDir}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download SteamCMD: ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        await fs.promises.writeFile(archivePath, Buffer.from(arrayBuffer));

        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        console.log(`Extracting Linux SteamCMD...`);
        await execAsync(`tar -xzf "${archivePath}" -C "${steamCmdDir}"`);

        await fs.promises.unlink(archivePath);
    }

    async installOrUpdateServer(instanceId: string | number, steamCmdExe: string, installDir: string, onLog?: (data: string) => void, taskId?: string): Promise<void> {
        const id = instanceId.toString();
        const serverPath = path.join(installDir, id);
        return this.installToPath(serverPath, steamCmdExe, onLog, taskId);
    }

    async installToPath(targetPath: string, steamCmdExe: string, onLog?: (data: string) => void, taskId?: string): Promise<void> {
        try {
            await fs.promises.mkdir(targetPath, { recursive: true });
        } catch (error: any) {
            if (error.code !== 'EEXIST') throw error;
        }

        return new Promise((resolve, reject) => {
            const steamCmdParams = [
                '+force_install_dir', targetPath,
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
                    if (line.trim()) {
                        const message = line.trim();
                        console.log(`[STEAMCMD] ${message}`);
                        if (onLog) onLog(message);

                        if (taskId) {
                            // Pattern: Update state (0x3) downloading, progress: 1.23 (123456 / 1234567)
                            // Pattern: Update state (0x5) verifying, progress: 50.00 (123456 / 246912)
                            const progressMatch = message.match(/progress: ([\d.]+)/);
                            const currentTaskId = taskId;
                            if (progressMatch && progressMatch[1] && typeof currentTaskId === 'string') {
                                const progress = parseFloat(progressMatch[1]);
                                let statusMsg = "Downloading...";
                                if (message.includes("verifying")) statusMsg = "Verifying...";
                                if (message.includes("preallocating")) statusMsg = "Preallocating...";
                                
                                taskService.updateTask(currentTaskId, { 
                                    progress, 
                                    status: "running",
                                    message: `${statusMsg} (${progress}%)` 
                                });
                            }
                        }
                    }
                });
            });

            steamCmdProcess.on('close', (code) => {
                const finalTaskId = taskId;
                if (code === 0) {
                    if (typeof finalTaskId === 'string') { taskService.completeTask(finalTaskId, "Installation successful"); }
                    resolve();
                } else {
                    const error = `SteamCMD failed with code ${code}`;
                    if (typeof finalTaskId === 'string') { taskService.failTask(finalTaskId, error); }
                    reject(new Error(error));
                }
            });
        });
    }

    async installSteamRuntime(runtimePath: string, steamCmdExe: string, onLog?: (data: string) => void, taskId?: string): Promise<void> {
        try {
            await fs.promises.mkdir(runtimePath, { recursive: true });
        } catch (error: any) {
            if (error.code !== 'EEXIST') throw error;
        }

        return new Promise((resolve, reject) => {
            const steamCmdParams = [
                '+@sSteamCmdForcePlatformType', 'linux',
                '+@sSteamCmdForcePlatformBitness', '64',
                '+force_install_dir', runtimePath,
                '+login', 'anonymous',
                '+app_update', '1628350', 'validate',
                '+quit'
            ];

            const steamCmdProcess = spawn(steamCmdExe, steamCmdParams);

            let stdoutBuffer = '';
            steamCmdProcess.stdout.on('data', (data) => {
                stdoutBuffer += data.toString();
                const lines = stdoutBuffer.split(/\r?\n|\r/);
                stdoutBuffer = lines.pop() || '';
                lines.forEach(line => {
                    if (line.trim()) {
                        const message = line.trim();
                        console.log(`[STEAMCMD:RUNTIME] ${message}`);
                        if (onLog) onLog(message);

                        if (taskId) {
                            const progressMatch = message.match(/progress: ([\d.]+)/);
                            const currentTaskId = taskId;
                            if (progressMatch && progressMatch[1] && typeof currentTaskId === 'string') {
                                const progress = parseFloat(progressMatch[1]);
                                taskService.updateTask(currentTaskId, { 
                                    progress, 
                                    status: "running",
                                    message: `Installing Steam Runtime (${progress}%)` 
                                });
                            }
                        }
                    }
                });
            });

            steamCmdProcess.on('close', (code) => {
                const finalTaskId = taskId;
                if (code === 0) {
                    if (typeof finalTaskId === 'string') { taskService.completeTask(finalTaskId, "Steam Runtime installed"); }
                    resolve();
                } else {
                    const error = `Steam Runtime installation failed with code ${code}`;
                    if (typeof finalTaskId === 'string') { taskService.failTask(finalTaskId, error); }
                    reject(new Error(error));
                }
            });
        });
    }
}

export const steamManager = new SteamManager();
