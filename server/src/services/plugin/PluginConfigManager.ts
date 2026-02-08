import path from 'path';
import fs from 'fs/promises';

/**
 * PluginConfigManager Service
 * Responsible for:
 * - Discovering plugin configuration files
 * - Reading and writing plugin configs
 * - Processing example configurations
 */
export class PluginConfigManager {
  /**
   * Discovers all configuration files for a plugin
   * Searches in standard CSS directories and plugin-specific folders
   * @param installDir Server installation directory
   * @param instanceId Server instance ID
   * @param pluginId Plugin identifier
   * @returns Array of config file paths
   */
  async discoverConfigs(
    installDir: string,
    instanceId: string | number,
    pluginId: string
  ): Promise<string[]> {
    const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');
    const cssBase = path.join(csgoDir, 'addons', 'counterstrikesharp');

    const searchPaths = [
      path.join(cssBase, 'configs', 'plugins', pluginId),
      path.join(cssBase, 'plugins', pluginId),
      path.join(cssBase, 'plugins', pluginId, 'configs'),
    ];

    const configFiles: string[] = [];
    const validExtensions = ['.json', '.cfg', '.toml', '.ini', '.txt'];
    const blacklist = ['.deps.json'];

    for (const searchPath of searchPaths) {
      try {
        const items = await fs.readdir(searchPath);
        for (const item of items) {
          const lowerItem = item.toLowerCase();
          const isValidExt = validExtensions.some((ext) => lowerItem.endsWith(ext));
          const isBlacklisted = blacklist.some((bl) => lowerItem.endsWith(bl));

          if (isValidExt && !isBlacklisted) {
            configFiles.push(path.join(searchPath, item));
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return configFiles;
  }

  /**
   * Reads a configuration file
   * @param filePath Absolute path to config file
   * @returns File contents as string
   */
  async readConfig(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }

  /**
   * Writes content to a configuration file
   * Includes security checks to prevent directory traversal
   * @param installDir Server installation directory
   * @param instanceId Server instance ID
   * @param pluginId Plugin identifier
   * @param relativeFilePath Relative file path within plugin config
   * @param content File content to write
   */
  async writeConfig(
    installDir: string,
    instanceId: string | number,
    pluginId: string,
    relativeFilePath: string,
    content: string
  ): Promise<void> {
    // SECURITY: Validate pluginId
    if (!/^[a-zA-Z0-9\-_]+$/.test(pluginId)) {
      throw new Error(`Invalid plugin ID: ${pluginId}`);
    }

    const csgoDir = path.join(installDir, instanceId.toString(), 'game', 'csgo');
    const cssBase = path.join(csgoDir, 'addons', 'counterstrikesharp');

    // Resolve the full path
    const fullPath = path.resolve(cssBase, relativeFilePath);

    // SECURITY: Ensure the resolved path is within the CSS directory
    if (!fullPath.startsWith(path.resolve(cssBase))) {
      throw new Error('Security Error: Path traversal detected');
    }

    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * Processes example configuration files
   * Renames .example. and -example. files to their active versions
   * @param targetDir Directory to search for example configs
   */
  async processExampleConfigs(targetDir: string): Promise<void> {
    try {
      await fs.access(targetDir);
    } catch {
      return; // Directory doesn't exist
    }

    const walk = async (dir: string) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          await walk(fullPath);
        } else if (item.isFile()) {
          const lowerName = item.name.toLowerCase();
          // Support .example. .examle. -example. -examle.
          if (/[.-](example|examle)\./i.test(lowerName)) {
            const newName = item.name.replace(/[.-](example|examle)\./i, '.');
            const newPath = path.join(dir, newName);

            try {
              await fs.access(newPath);
              // File already exists, skip
            } catch {
              console.log('[CONFIG] Activating config:', item.name, '->', newName);
              await fs.copyFile(fullPath, newPath);
              await fs.unlink(fullPath).catch(() => {});
            }
          }
        }
      }
    };

    await walk(targetDir).catch((err) =>
      console.error(`[CONFIG] Example config processing failed:`, err)
    );
  }
}

export const pluginConfigManager = new PluginConfigManager();
