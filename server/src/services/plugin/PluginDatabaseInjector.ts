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
          if (ext !== '.json' && ext !== '.toml' && ext !== '.cfg' && ext !== '.ini') continue;

          const content = await fs.readFile(fullPath, 'utf8');
          const contentLower = content.toLowerCase();

          // Check if file potentially contains DB settings (case-insensitive)
          if (
            !contentLower.includes('database') &&
            !contentLower.includes('mysql') &&
            !contentLower.includes('host') &&
            !contentLower.includes('connectionstring')
          ) {
            continue;
          }

          const creds = await getCreds();

          // 1. JSON Injection
          if (ext === '.json') {
            try {
              const config = JSON.parse(content);
              let changed = false;

              // Comprehensive mapping (CamelCase, PascalCase, snake_case)
              const keysMapping: Record<string, string | number> = {
                DatabaseHost: creds.host,
                DatabasePort: creds.port,
                DatabaseUser: creds.user,
                DatabasePassword: creds.password,
                DatabaseName: creds.database,
                Host: creds.host,
                host: creds.host,
                Port: creds.port,
                port: creds.port,
                User: creds.user,
                user: creds.user,
                Password: creds.password,
                password: creds.password,
                Database: creds.database,
                database: creds.database,
                DBHost: creds.host,
                DBPort: creds.port,
                DBUser: creds.user,
                DBPass: creds.password,
                DBName: creds.database,
              };

              // Injector Helper
              const injectInto = (obj: any): boolean => {
                let localChanged = false;
                if (!obj || typeof obj !== 'object') return false;

                for (const [key, val] of Object.entries(keysMapping)) {
                  if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    // Only overwrite if it's a string/number or empty
                    if (typeof obj[key] !== 'object' || obj[key] === null) {
                      if (obj[key] !== val) {
                        obj[key] = val;
                        localChanged = true;
                      }
                    }
                  }
                }
                return localChanged;
              };

              // Try injecting into root
              if (injectInto(config)) changed = true;

              // Try injecting into common sub-objects
              const subObjects = ['Database', 'MySQL', 'mysql', 'database', 'Connection', 'db'];
              for (const subKey of subObjects) {
                if (config[subKey] && typeof config[subKey] === 'object') {
                  if (injectInto(config[subKey])) changed = true;
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
          // 2. TOML / CFG / INI Injection (Regex based)
          else {
            let newContent = content;
            let changed = false;

            const patterns = [
              // Key = "Value"
              { regex: /((?:Database)?Host\s*=\s*")([^"]*)(")/gi, val: creds.host },
              { regex: /((?:Database)?User\s*=\s*")([^"]*)(")/gi, val: creds.user },
              { regex: /((?:Database)?Password\s*=\s*")([^"]*)(")/gi, val: creds.password },
              { regex: /((?:Database|Name)?Name\s*=\s*")([^"]*)(")/gi, val: creds.database },
              { regex: /((?:Database)?Port\s*=\s*)(\d+)/gi, val: creds.port },
              // CFG style (no equals) e.g. DatabaseHost "127.0.0.1"
              { regex: /((?:Database)?Host\s+")([^"]*)(")/gi, val: creds.host },
              { regex: /((?:Database)?User\s+")([^"]*)(")/gi, val: creds.user },
              { regex: /((?:Database)?Password\s+")([^"]*)(")/gi, val: creds.password },
              { regex: /((?:Database)?Name\s+")([^"]*)(")/gi, val: creds.database },
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
