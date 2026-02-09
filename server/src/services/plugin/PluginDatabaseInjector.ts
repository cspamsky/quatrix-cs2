import path from 'path';
import fs from 'fs/promises';
import { databaseManager } from '../DatabaseManager.js';

export class PluginDatabaseInjector {
  private readonly EXCLUDED_FOLDERS = ['bin', 'dotnet', 'api', 'core', 'logs', 'metamod', '.git', 'node_modules'];
  
  async injectCredentials(instanceId: string | number, targetDir: string): Promise<void> {
    if (!(await databaseManager.isAvailable())) return;

    const allCreds = await databaseManager.loadAllCredentials();
    const serverSettings = allCreds[instanceId.toString()];

    if (serverSettings && serverSettings.autoSync === false) return;

    let credentials: { host: string; port: number; user: string; password: string; database: string; } | null = null;
    const getCreds = async () => {
      if (!credentials) {
        const raw = await databaseManager.provisionDatabase(instanceId);
        credentials = {
          host: raw.host.trim(),
          port: Number(raw.port),
          user: raw.user.trim(),
          password: raw.password.trim(),
          database: raw.database.trim(),
        };
      }
      return credentials;
    };

    const walk = async (dir: string) => {
      const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const lowerName = item.name.toLowerCase();

        if (item.isDirectory()) {
          if (this.EXCLUDED_FOLDERS.includes(lowerName)) continue;
          await walk(fullPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (!['.json', '.toml', '.cfg', '.ini'].includes(ext)) continue;

          // CRITICAL: Skip any file that is part of the CSS API or runtime
          if (lowerName.includes('api') || lowerName.includes('deps') || lowerName.includes('runtimeconfig')) continue;
          
          const stats = await fs.stat(fullPath).catch(() => null);
          if (stats && stats.size > 256 * 1024) continue; // Skip large files

          const content = await fs.readFile(fullPath, 'utf8');
          const creds = await getCreds();
          let newContent = content;
          let changed = false;

          // SAFE Replacement mapping
          const targets = [
            // JSON/TOML with quotes
            { key: 'Host', val: creds.host, type: 'quote' },
            { key: 'DatabaseHost', val: creds.host, type: 'quote' },
            { key: 'User', val: creds.user, type: 'quote' },
            { key: 'DatabaseUser', val: creds.user, type: 'quote' },
            { key: 'Password', val: creds.password, type: 'quote' },
            { key: 'DatabasePassword', val: creds.password, type: 'quote' },
            { key: 'Database', val: creds.database, type: 'quote' },
            { key: 'DatabaseName', val: creds.database, type: 'quote' },
            { key: 'DBName', val: creds.database, type: 'quote' },
            // Port (Number)
            { key: 'Port', val: creds.port, type: 'num' },
            { key: 'DatabasePort', val: creds.port, type: 'num' },
          ];

          for (const target of targets) {
            let regex: RegExp;
            if (target.type === 'quote') {
              // Matches "Key": "Value" or Key = "Value" or Key "Value"
              regex = new RegExp(`("${target.key}"\\s*[:=]\\s*")([^"]*)(")|(\\b${target.key}\\s*[:=]\\s*")([^"]*)(")|(\\b${target.key}\\s+")([^"]*)(")`, 'gi');
            } else {
              // Matches "Key": 123 or Key = 123
              regex = new RegExp(`("${target.key}"\\s*[:=]\\s*)(\\d+)|(\\b${target.key}\\s*[:=]\\s*)(\\d+)`, 'gi');
            }

            const updated = newContent.replace(regex, (match, p1, p2, p3, p4, p5, p6, p7, p8, p9) => {
              // Return prefix + value + suffix based on which group matched
              if (p1 !== undefined) return p1 + target.val + p3;
              if (p4 !== undefined) return p4 + target.val + p6;
              if (p7 !== undefined) return p7 + target.val + p9;
              return match;
            });

            if (updated !== newContent) {
              newContent = updated;
              changed = true;
            }
          }

          if (changed) {
            console.log('[DB] Safely injected credentials into:', fullPath);
            await fs.writeFile(fullPath, newContent);
          }
        }
      }
    };

    await walk(targetDir).catch((err) => {
      console.error('[DB] SAFE Credential injection failed:', err);
    });
  }
}

export const pluginDatabaseInjector = new PluginDatabaseInjector();
