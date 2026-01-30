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

  private initDirs() {
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
    // cs2.sh -> Core/cs2.sh (or .exe)
    // steamclient.so -> Core/steamclient.so
    const rootItems = ["engine", "bin", "cs2.sh", "cs2.exe", "steamclient.so"];
    await this.createSymlinks(this.coreDir, targetDir, rootItems);

    // 3. GAME Directory Symlinks (Granular)
    const coreGameDir = path.join(this.coreDir, "game");
    const targetGameDir = path.join(targetDir, "game");

    // Symlink game/bin (contains engine binaries for game)
    await this.createSymlink(
      path.join(coreGameDir, "bin"),
      path.join(targetGameDir, "bin")
    );

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
        if (["cfg", "maps", "logs", "addons"].includes(item)) continue;

        // Everything else (bin, resource, scripts, .vpk files) -> SYMLINK from Core
        await this.createSymlink(
          path.join(coreCsgoDir, item),
          path.join(targetCsgoDir, item)
        );
      }
    }

    // 5. Setup Local Directories for excluded items
    // These were skipped in the loop above, so we ensure they exist as real directories
    await fs.promises.mkdir(path.join(targetCsgoDir, "cfg"), { recursive: true });
    await fs.promises.mkdir(path.join(targetCsgoDir, "maps"), { recursive: true });
    await fs.promises.mkdir(path.join(targetCsgoDir, "logs"), { recursive: true });

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
        // Ignore missing source files (e.g. cs2.exe on linux)
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
      const type = stat.isDirectory() ? "junction" : "file"; // 'junction' is better for Windows dirs

      // On Linux 'junction' is ignored and treated as 'dir', but let's be explicit
      const symlinkType = process.platform === "win32" ? type : (stat.isDirectory() ? "dir" : "file");

      await fs.promises.symlink(source, target, symlinkType);
    } catch (e) {
      console.error(`[FileSystem] Failed to link ${source} -> ${target}`, e);
      throw e;
    }
  }
  
  public async ensureExecutable(filePath: string) {
    if (process.platform === 'win32') return;
    try {
      await fs.promises.chmod(filePath, 0o755);
    } catch (error) {
      console.warn(`[FileSystem] Failed to chmod +x ${filePath}`, error);
    }
  }

  public async deleteInstance(id: string | number) {
     const dir = this.getInstancePath(id);
     await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

export const fileSystemService = new FileSystemService();
