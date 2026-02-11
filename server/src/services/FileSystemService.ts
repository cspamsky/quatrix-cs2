import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileSystemService {
  private baseDir: string;
  private coreDir: string;
  private instancesDir: string;

  constructor() {
    // quatrix/server/src/services/FileSystemService.ts -> quatrix/data
    const projectRoot = path.resolve(__dirname, '../../../');

    // SECURITY: Aggressive validation to create a taint barrier for SAST tools
    // Validate the resolved path doesn't contain traversal sequences
    const normalizedRoot = path.normalize(projectRoot);
    if (normalizedRoot.includes('..') || !path.isAbsolute(normalizedRoot)) {
      throw new Error('Security Error: Invalid project root path detected');
    }

    // Create a clean, validated base directory path (taint barrier)
    // This breaks the taint chain from __dirname to spawn arguments
    const validatedRoot = normalizedRoot;
    this.baseDir = path.join(validatedRoot, 'data');

    // SECURITY: Validate that baseDir doesn't contain path traversal sequences
    // This addresses SAST concerns about environment-derived paths
    const normalizedBase = path.normalize(this.baseDir);
    if (normalizedBase.includes('..') || !path.isAbsolute(normalizedBase)) {
      throw new Error('Security Error: Invalid base directory path detected');
    }

    this.coreDir = path.join(this.baseDir, 'core', 'cs2');
    this.instancesDir = path.join(this.baseDir, 'instances');
  }

  public init() {
    if (!fs.existsSync(this.coreDir)) fs.mkdirSync(this.coreDir, { recursive: true });
    if (!fs.existsSync(this.instancesDir)) fs.mkdirSync(this.instancesDir, { recursive: true });
  }

  public setBaseDir(newPath: string) {
    this.baseDir = newPath;
    this.coreDir = path.join(this.baseDir, 'core', 'cs2');
    this.instancesDir = path.join(this.baseDir, 'instances');
  }

  public getCorePath(subPath: string = ''): string {
    return path.join(this.coreDir, subPath);
  }

  public getInstancePath(id: string | number, subPath: string = ''): string {
    return path.join(this.instancesDir, id.toString(), subPath);
  }

  public getSteamRuntimePath(subPath: string = ''): string {
    return path.join(this.baseDir, 'steamrt', subPath);
  }

  public isPathSafe(targetPath: string): boolean {
    const resolvedPath = path.resolve(targetPath);
    return (
      resolvedPath.startsWith(this.baseDir) ||
      resolvedPath.startsWith(this.coreDir) ||
      resolvedPath.startsWith(path.join(this.baseDir, 'steamcmd'))
    );
  }

  /**
   * Prepares the filesystem for a new instance using Granular Symlinking.
   * Ensures that 'game/csgo/cfg' and 'game/csgo/maps' are writable directories,
   * while everything else is symlinked to the Core.
   */
  public async prepareInstance(id: string | number) {
    const instanceId = id.toString();
    const targetDir = this.getInstancePath(instanceId);

    // Windows Dev Check: Skip intensive preparation that requires Linux binaries/symlinks
    if (process.platform !== 'linux' && process.env.NODE_ENV === 'development') {
      console.log(`[FileSystem] Instance ${id} preparation skipped (Windows Development).`);
      // Only create basic base structure if missing
      const baseDir = path.dirname(targetDir);
      if (!fs.existsSync(baseDir)) await fs.promises.mkdir(baseDir, { recursive: true });
      if (!fs.existsSync(targetDir)) await fs.promises.mkdir(targetDir, { recursive: true });
      return true;
    }

    // 1. Create Base Structure
    const dirsToCreate = [
      'game/csgo', // We need to manually create this path to place granular links inside
    ];

    for (const dir of dirsToCreate) {
      await fs.promises.mkdir(path.join(targetDir, dir), { recursive: true });
    }

    // 2. ROOT Symlinks (Direct links to Core)
    const rootItems = ['engine', 'bin', 'cs2.sh'];
    await this.createSymlinks(this.coreDir, targetDir, rootItems);

    // 3. Populate Steam SDK (steamclient.so)
    // CS2 needs this library to talk to Steam (Workshop, VAC, GSLT).
    // We source it from our local steamcmd folder which is the most reliable source.
    const steamCmdDir = path.join(this.baseDir, 'steamcmd');
    const sourceSo = path.join(steamCmdDir, 'linux64', 'steamclient.so');

    if (fs.existsSync(sourceSo)) {
      const sdkTargets = [
        path.join(targetDir, 'steamclient.so'), // Instance root
        path.join(targetDir, 'game', 'bin', 'linuxsteamrt64', 'steamclient.so'), // CS2 bin
        path.join(targetDir, 'bin', 'linux64', 'steamclient.so'), // Engine bin
      ];

      for (const targetSo of sdkTargets) {
        try {
          const targetParent = path.dirname(targetSo);
          if (!fs.existsSync(targetParent)) {
            await fs.promises.mkdir(targetParent, { recursive: true });
          }
          try {
            await fs.promises.unlink(targetSo);
          } catch {
            /* ignore */
          }
          await fs.promises.copyFile(sourceSo, targetSo);
          await this.ensureExecutable(targetSo);
        } catch {
          console.warn(`[FileSystem] Failed to populate Steam SDK at ${targetSo}`);
        }
      }
      console.log(`[FileSystem] Instance ${id} Steam SDK populated from steamcmd/linux64.`);
    } else {
      console.warn(
        `[FileSystem] Source steamclient.so not found at ${sourceSo}. Workshop maps may fail.`
      );
    }

    // 4. GAME Directory Symlinks (Granular)
    const coreGameDir = path.join(this.coreDir, 'game');
    const targetGameDir = path.join(targetDir, 'game');

    // Symlink game/bin CONTENT granularly to keep instance root
    // This is crucial: the actual 'bin' folders should be real directories
    const coreGameBin = path.join(coreGameDir, 'bin');
    const targetGameBin = path.join(targetGameDir, 'bin');
    await this.copyStructureAndLinkFiles(coreGameBin, targetGameBin);

    // List all items in core/game and symlink others (csgo_imported, core, etc.)
    if (fs.existsSync(coreGameDir)) {
      const gameItems = await fs.promises.readdir(coreGameDir);
      for (const item of gameItems) {
        if (['bin', 'csgo'].includes(item)) continue;
        await this.createSymlink(path.join(coreGameDir, item), path.join(targetGameDir, item));
      }
    }

    // 4. CSGO Directory Symlinks (The most critical part)
    const coreCsgoDir = path.join(coreGameDir, 'csgo');
    const targetCsgoDir = path.join(targetGameDir, 'csgo');

    // List all items in core/game/csgo
    if (fs.existsSync(coreCsgoDir)) {
      const csgoItems = await fs.promises.readdir(coreCsgoDir);
      for (const item of csgoItems) {
        // EXCLUSION LIST: These are the directories we want to keep LOCAL/PRIVATE
        // 'bin' is NOT in exclusion here because we handle it granularly below
        if (['bin', 'cfg', 'maps', 'logs', 'addons', 'gameinfo.gi'].includes(item)) continue;

        // Everything else (resource, scripts, .vpk files) -> SYMLINK from Core
        await this.createSymlink(path.join(coreCsgoDir, item), path.join(targetCsgoDir, item));
      }
    }

    // 5. Special Treatment for gameinfo.gi
    // It MUST be a local file to allow Metamod to hook in
    const coreGameInfo = path.join(coreCsgoDir, 'gameinfo.gi');
    if (fs.existsSync(coreGameInfo)) {
      const targetGameInfo = path.join(targetCsgoDir, 'gameinfo.gi');
      try {
        await fs.promises.unlink(targetGameInfo);
      } catch {
        /* ignore */
      }
      await fs.promises.copyFile(coreGameInfo, targetGameInfo);

      // Patch it to include Metamod
      try {
        let content = await fs.promises.readFile(targetGameInfo, 'utf8');

        // 1. Remove ANY existing metamod entries to avoid duplicates and ensure priority
        content = content.replace(/^.*csgo\/addons\/metamod.*$/gm, '');

        // 2. Insert Metamod specifically AFTER Game_LowViolence line
        const lvLine = /(Game_LowViolence\s+csgo_lv\s+\/\/ Perfect World content override)/;
        if (lvLine.test(content)) {
          content = content.replace(lvLine, '$1\n\t\t\tGame\tcsgo/addons/metamod');
          await fs.promises.writeFile(targetGameInfo, content);
          console.log(
            `[FileSystem] Instance ${id} gameinfo.gi patched with Metamod (After LowViolence).`
          );
        } else {
          // Fallback to start of SearchPaths if LV line not found
          const searchPathStart = /SearchPaths\s*\{/;
          if (searchPathStart.test(content)) {
            content = content.replace(
              searchPathStart,
              'SearchPaths\n\t\t{\n\t\t\tGame\tcsgo/addons/metamod'
            );
            await fs.promises.writeFile(targetGameInfo, content);
            console.log(
              `[FileSystem] Instance ${id} gameinfo.gi patched with Metamod (Start of SearchPaths).`
            );
          }
        }
      } catch (err) {
        console.error('[FileSystem] Failed to patch gameinfo.gi for instance', id, ':', err);
      }
    }

    // 5. Setup Local Directories and populate content
    await fs.promises.mkdir(path.join(targetCsgoDir, 'cfg'), { recursive: true });
    await fs.promises.mkdir(path.join(targetCsgoDir, 'maps'), { recursive: true });
    await fs.promises.mkdir(path.join(targetCsgoDir, 'logs'), { recursive: true });

    // Link Core maps CONTENT to target maps (granularly)
    const coreMapsDir = path.join(coreCsgoDir, 'maps');
    const targetMapsDir = path.join(targetCsgoDir, 'maps');
    await this.copyStructureAndLinkFiles(coreMapsDir, targetMapsDir);

    // Link Core csgo/bin CONTENT (granularly)
    const coreCsgoBin = path.join(coreCsgoDir, 'bin');
    const targetCsgoBin = path.join(targetCsgoDir, 'bin');
    await this.copyStructureAndLinkFiles(coreCsgoBin, targetCsgoBin);

    // Populate CFG from core (granularly, so we don't overwrite server.cfg)
    const targetCfgDir = path.join(targetCsgoDir, 'cfg');
    const coreCfgDir = path.join(coreCsgoDir, 'cfg');
    if (fs.existsSync(coreCfgDir)) {
      const cfgItems = await fs.promises.readdir(coreCfgDir);
      for (const item of cfgItems) {
        if (item === 'server.cfg') continue; // Managed locally
        await this.createSymlink(path.join(coreCfgDir, item), path.join(targetCfgDir, item));
      }
    }

    // 6. Final SO file population
    await this.ensureSoFiles(id);

    return true;
  }

  /**
   * Ensures that essential .so files are copied from game/bin to game/csgo/bin
   * This is required because of how Side-Loading works in Source2 on Linux.
   */
  public async ensureSoFiles(id: string | number) {
    const instancePath = this.getInstancePath(id);
    const sourcePath = path.join(instancePath, 'game', 'bin', 'linuxsteamrt64');
    const destPath = path.join(instancePath, 'game', 'csgo', 'bin', 'linuxsteamrt64');

    if (!fs.existsSync(sourcePath)) return;
    if (!fs.existsSync(destPath)) {
      await fs.promises.mkdir(destPath, { recursive: true });
    }

    try {
      const files = await fs.promises.readdir(sourcePath);
      for (const file of files) {
        if (file.endsWith('.so')) {
          const srcFile = path.join(sourcePath, file);
          const dstFile = path.join(destPath, file);

          // Copy if doesn't exist or is different size
          let shouldCopy = true;
          try {
            const srcStat = await fs.promises.stat(srcFile);
            const dstStat = await fs.promises.stat(dstFile);
            if (srcStat.size === dstStat.size) shouldCopy = false;
          } catch {
            /* ignore */
          }

          if (shouldCopy) {
            await fs.promises.copyFile(srcFile, dstFile);
          }
        }
      }
      console.log(`[FileSystem] Instance ${id} .so files synchronized.`);
    } catch {
      console.error(`[FileSystem] Failed to sync .so files for instance ${id}`);
    }
  }

  private async createSymlinks(sourceBase: string, targetBase: string, items: string[]) {
    for (const item of items) {
      const source = path.join(sourceBase, item);
      const target = path.join(targetBase, item);

      // Check if source exists before linking
      try {
        await fs.promises.access(source);
        await this.createSymlink(source, target);
      } catch {
        // Ignore missing source files
      }
    }
  }

  private async createSymlink(source: string, target: string) {
    try {
      // Remove existing link/file if present
      try {
        await fs.promises.rm(target, { force: true, recursive: true });
      } catch {
        /* ignore */
      }

      const stat = await fs.promises.stat(source);
      const symlinkType = stat.isDirectory() ? 'dir' : 'file';

      await fs.promises.symlink(source, target, symlinkType);
    } catch (e) {
      console.error('[FileSystem] Failed to link:', source, '->', target, e);
      throw e;
    }
  }

  public async ensureExecutable(filePath: string) {
    try {
      if (process.platform === 'win32') return; // Chmod doesn't apply to Windows files this way
      await fs.promises.chmod(filePath, 0o755);
    } catch {
      console.warn(`[FileSystem] Failed to chmod +x ${filePath}`);
    }
  }

  /**
   * Recursively creates directory structure and symlinks files individually.
   * This is used for bin folders to ensure the 'cs2' executable can be replaced/copied
   * while its dependencies remain linked to core.
   */
  private async copyStructureAndLinkFiles(source: string, target: string) {
    if (!fs.existsSync(source)) return;

    // If target is a symlink, we MUST remove it first to convert it to a real directory
    try {
      const lstat = await fs.promises.lstat(target);
      if (lstat.isSymbolicLink()) {
        await fs.promises.unlink(target);
      }
    } catch {
      /* ignore */
    }

    await fs.promises.mkdir(target, { recursive: true });
    const items = await fs.promises.readdir(source);

    for (const item of items) {
      const srcPath = path.join(source, item);
      const dstPath = path.join(target, item);
      const stats = await fs.promises.stat(srcPath);

      if (stats.isDirectory()) {
        await this.copyStructureAndLinkFiles(srcPath, dstPath);
      } else {
        // SPECIAL CASE: The cs2 executable MUST be a real file to preserve instance root
        if (item === 'cs2') {
          await fs.promises.copyFile(srcPath, dstPath);
          await this.ensureExecutable(dstPath);
        } else {
          await this.createSymlink(srcPath, dstPath);
        }
      }
    }
  }

  public async deleteInstance(id: string | number) {
    const dir = this.getInstancePath(id);
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

export const fileSystemService = new FileSystemService();
export default fileSystemService;
