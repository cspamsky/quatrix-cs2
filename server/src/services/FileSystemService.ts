import fs from "fs";
import path from "path";

class FileSystemService {
  private baseDir: string;
  private coreDir: string;
  private instancesDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), "data"); // Default path matching db.ts
    this.coreDir = path.join(this.baseDir, "core", "cs2");
    this.instancesDir = path.join(this.baseDir, "instances");
  }

  public init() {
    if (!fs.existsSync(this.coreDir)) fs.mkdirSync(this.coreDir, { recursive: true });
    if (!fs.existsSync(this.instancesDir)) fs.mkdirSync(this.instancesDir, { recursive: true });
  }

  public setBaseDir(newPath: string) {
    this.baseDir = newPath;
    this.coreDir = path.join(this.baseDir, "core", "cs2");
    this.instancesDir = path.join(this.baseDir, "instances");
  }

  public getCorePath(subPath: string = ""): string {
    return path.join(this.coreDir, subPath);
  }

  public getInstancePath(id: string | number, subPath: string = ""): string {
    return path.join(this.instancesDir, id.toString(), subPath);
  }

  /**
   * Prepares the filesystem for a new instance using Granular Symlinking.
   * Ensures that 'game/csgo/cfg' and 'game/csgo/maps' are writable directories,
   * while everything else is symlinked to the Core.
   */
  public async prepareInstance(id: string | number) {
    const instanceId = id.toString();
    const targetDir = this.getInstancePath(instanceId);
    
    // 1. Create Base Structure
    const dirsToCreate = [
      "cfg", // Top level cfg (custom)
      "logs",
      "data",
      "game/csgo", // We need to manually create this path to place granular links inside
    ];

    for (const dir of dirsToCreate) {
      await fs.promises.mkdir(path.join(targetDir, dir), { recursive: true });
    }

    // 2. ROOT Symlinks (Direct links to Core)
    // engine -> Core/engine
    // bin -> Core/bin
    // cs2.sh -> Core/cs2.sh
    const rootItems = ["engine", "bin", "cs2.sh"];
    await this.createSymlinks(this.coreDir, targetDir, rootItems);
    
    // steamclient.so -> We need this to NOT be a broken link
    const coreSo = path.join(this.coreDir, "steamclient.so");
    if (fs.existsSync(coreSo)) {
        const targetSo = path.join(targetDir, "steamclient.so");
        try { await fs.promises.unlink(targetSo); } catch {}
        await fs.promises.copyFile(coreSo, targetSo);
    }

    // 3. GAME Directory Symlinks (Granular)
    const coreGameDir = path.join(this.coreDir, "game");
    const targetGameDir = path.join(targetDir, "game");

    // Symlink game/bin CONTENT granularly to keep instance root
    // This is crucial: the actual 'bin' folders should be real directories
    const coreGameBin = path.join(coreGameDir, "bin");
    const targetGameBin = path.join(targetGameDir, "bin");
    await this.copyStructureAndLinkFiles(coreGameBin, targetGameBin);

    // List all items in core/game and symlink others (csgo_imported, core, etc.)
    if (fs.existsSync(coreGameDir)) {
      const gameItems = await fs.promises.readdir(coreGameDir);
      for (const item of gameItems) {
        if (["bin", "csgo"].includes(item)) continue;
        await this.createSymlink(
          path.join(coreGameDir, item),
          path.join(targetGameDir, item)
        );
      }
    }

    // 4. CSGO Directory Symlinks (The most critical part)
    const coreCsgoDir = path.join(coreGameDir, "csgo");
    const targetCsgoDir = path.join(targetGameDir, "csgo");

    // List all items in core/game/csgo
    // If it's 'cfg' or 'maps' -> DO NOT LINK (We already made dirs or will make them)
    // If it's anything else -> LINK
    if (fs.existsSync(coreCsgoDir)) {
      const csgoItems = await fs.promises.readdir(coreCsgoDir);
      for (const item of csgoItems) {
        // EXCLUSION LIST: These are the directories we want to keep LOCAL/PRIVATE
        if (["cfg", "maps", "logs", "addons", "gameinfo.gi"].includes(item)) continue;

        // Everything else (bin, resource, scripts, .vpk files) -> SYMLINK from Core
        await this.createSymlink(
          path.join(coreCsgoDir, item),
          path.join(targetCsgoDir, item)
        );
      }
    }

    // 5. Special Treatment for gameinfo.gi
    // It MUST be a local file to allow Metamod to hook in
    const coreGameInfo = path.join(coreCsgoDir, "gameinfo.gi");
    if (fs.existsSync(coreGameInfo)) {
        const targetGameInfo = path.join(targetCsgoDir, "gameinfo.gi");
        try { await fs.promises.unlink(targetGameInfo); } catch {}
        await fs.promises.copyFile(coreGameInfo, targetGameInfo);
    }

    // 5. Setup Local Directories and populate CFG
    const targetCfgDir = path.join(targetCsgoDir, "cfg");
    await fs.promises.mkdir(targetCfgDir, { recursive: true });
    await fs.promises.mkdir(path.join(targetCsgoDir, "maps"), { recursive: true });
    await fs.promises.mkdir(path.join(targetCsgoDir, "logs"), { recursive: true });

    // Populate CFG with links from Core CFG (except for managed files like server.cfg)
    const coreCfgDir = path.join(coreCsgoDir, "cfg");
    if (fs.existsSync(coreCfgDir)) {
      const cfgItems = await fs.promises.readdir(coreCfgDir);
      for (const item of cfgItems) {
        if (item === "server.cfg") continue; // Managed locally
        await this.createSymlink(
          path.join(coreCfgDir, item),
          path.join(targetCfgDir, item)
        );
      }
    }

    return true;
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
      } catch {}

      const stat = await fs.promises.stat(source);
      const symlinkType = stat.isDirectory() ? "dir" : "file";

      await fs.promises.symlink(source, target, symlinkType);
    } catch (e) {
      console.error(`[FileSystem] Failed to link ${source} -> ${target}`, e);
      throw e;
    }
  }
  
  public async ensureExecutable(filePath: string) {
    try {
      await fs.promises.chmod(filePath, 0o755);
    } catch (error) {
      console.warn(`[FileSystem] Failed to chmod +x ${filePath}`, error);
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
    } catch {}

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
            if (item === "cs2") {
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
