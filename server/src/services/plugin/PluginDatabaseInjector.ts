import path from 'path';
import fs from 'fs/promises';
import { databaseManager } from '../DatabaseManager.js';

/**
 * PluginDatabaseInjector Service
 * Responsible for:
 * - Injecting MySQL credentials into plugin configuration files
 * - Supporting JSON, TOML, and CFG formats
 * - Auto-provisioning databases when needed
 */
export class PluginDatabaseInjector {
  /**
   * Scans configuration files and injects MySQL credentials
   * @param instanceId Server instance ID
   * @param targetDir Directory to scan for config files
   */
  async injectCredentials(instanceId: string | number, targetDir: string): Promise<void> {
    if (!(await databaseManager.isAvailable())) return;

    // Load credentials and check for autoSync setting
    const allCreds = await databaseManager.loadAllCredentials();
    const serverSettings = allCreds[instanceId.toString()];

    // If autoSync is explicitly disabled, skip injection
    if (serverSettings && serverSettings.autoSync === false) {
      console.log('[DB] Auto-sync disabled for server', instanceId, ', skipping injection.');
      return;
    }

    let credentials: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    } | null = null;

    const getCreds = async () => {
      if (!credentials) {
        const raw = await databaseManager.provisionDatabase(instanceId);
        // Deep clean: trim all string values to avoid JSON breakage
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
      try {
        await fs.access(dir);
      } catch {
        return;
      }
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          await walk(fullPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          const content = await fs.readFile(fullPath, 'utf8');
          const creds = await getCreds();

          // 1. JSON Injection
          if (
            ext === '.json' &&
            (content.includes('"Database"') ||
              content.includes('"Host"') ||
              content.includes('"MySQL"'))
          ) {
            try {
              const config = JSON.parse(content);
              let changed = false;

              const keysMapping: Record<string, string | number> = {
                DatabaseHost: creds.host,
                DatabasePort: creds.port,
                DatabaseUser: creds.user,
                DatabasePassword: creds.password,
                DatabaseName: creds.database,
                Host: creds.host,
                Port: creds.port,
                User: creds.user,
                Password: creds.password,
                Database: creds.database,
              };

              // Check top level keys
              for (const [key, val] of Object.entries(keysMapping)) {
                if (
                  Object.prototype.hasOwnProperty.call(config, key) &&
                  typeof config[key] !== 'object'
                ) {
                  config[key] = val;
                  changed = true;
                }
              }

              // Check nested "Database" or "MySQL" objects
              const subObjects = ['Database', 'MySQL', 'mysql', 'database'];
              for (const subKey of subObjects) {
                if (config[subKey] && typeof config[subKey] === 'object') {
                  for (const [k, v] of Object.entries(keysMapping)) {
                    if (Object.prototype.hasOwnProperty.call(config[subKey], k)) {
                      config[subKey][k] = v;
                      changed = true;
                    }
                  }
                }
              }

              if (changed) {
                console.log('[DB] Injected credentials into JSON:', fullPath);
                await fs.writeFile(fullPath, JSON.stringify(config, null, 2));
              }
            } catch {
              // Skip non-valid or non-standard JSON
            }
          }
          // 2. TOML / CFG Injection (Regex based for common formats)
          else if (
            (ext === '.toml' || ext === '.cfg') &&
            (content.includes('Database') || content.includes('MySQL') || content.includes('Host'))
          ) {
            let newContent = content;
            let changed = false;

            const patterns = [
              { regex: /(DatabaseHost\s*=\s*")([^"]*)(")/gi, val: creds.host },
              { regex: /(DatabaseUser\s*=\s*")([^"]*)(")/gi, val: creds.user },
              { regex: /(DatabasePassword\s*=\s*")([^"]*)(")/gi, val: creds.password },
              { regex: /(DatabaseName\s*=\s*")([^"]*)(")/gi, val: creds.database },
              { regex: /(DatabasePort\s*=\s*)(\d+)/gi, val: creds.port },
              // CFG style (no equals)
              { regex: /(DatabaseHost\s+")([^"]*)(")/gi, val: creds.host },
              { regex: /(DatabaseUser\s+")([^"]*)(")/gi, val: creds.user },
              { regex: /(DatabasePassword\s+")([^"]*)(")/gi, val: creds.password },
              { regex: /(DatabaseName\s+")([^"]*)(")/gi, val: creds.database },
            ];

            for (const p of patterns) {
              if (p.regex.test(newContent)) {
                newContent = newContent.replace(p.regex, `$1${p.val}$3`);
                changed = true;
              }
            }

            if (changed) {
              console.log('[DB] Injected credentials into', ext.toUpperCase(), ':', fullPath);
              await fs.writeFile(fullPath, newContent);
            }
          }
        }
      }
    };

    await walk(targetDir).catch((err) => {
      console.error('[DB] Credential injection failed:', err);
    });
  }
}

export const pluginDatabaseInjector = new PluginDatabaseInjector();
