import si from "systeminformation";
import { taskService } from "./TaskService.js";
import { alertService } from "./AlertService.js";

export interface SystemStats {
  cpu: string;
  ram: string;
  memUsed: string;
  memTotal: string;
  netIn: string;
  netOut: string;
  diskRead: string;
  diskWrite: string;
  timestamp: string;
}

class MonitoringService {
  private io: any = null;
  private statsHistory: SystemStats[] = [];
  private readonly MAX_HISTORY = 30;
  private interval: NodeJS.Timeout | null = null;
  
  private lastNetworkStats: any = null;
  private lastDiskStats: any = null;

  public setSocketIO(io: any) {
    this.io = io;
  }

  public start() {
    if (this.interval) return;
    
    this.interval = setInterval(async () => {
      try {
        const stats = await this.collectStats();
        
        // Geçmişi sakla
        this.statsHistory.push(stats);
        if (this.statsHistory.length > this.MAX_HISTORY) {
            this.statsHistory.shift();
        }

        // Socket.io ile yayınla
        if (this.io) {
          this.io.emit("stats", stats);
        }

        // Eşik değer kontrolü
        alertService.check(stats);

      } catch (error) {
        console.error("[MonitoringService] Stats collection error:", error);
      }
    }, 2000);
    
    console.log("\x1b[32m[SYSTEM]\x1b[0m Monitoring Service started.");
  }

  public getStatsHistory(): SystemStats[] {
    return this.statsHistory;
  }

  private async collectStats(): Promise<SystemStats> {
    const [cpu, mem, net, disk, fs] = await Promise.all([
      si.currentLoad().catch(() => ({ currentLoad: 0 })),
      si.mem().catch(() => ({ active: 0, total: 1 })),
      si.networkStats().catch(() => []),
      si.disksIO().catch(() => ({ rIO: 0, wIO: 0 })),
      si.fsStats().catch(() => ({ rx: 0, wx: 0 }))
    ]);

    // Network calculation: Find first active interface with traffic
    let netIn = 0, netOut = 0;
    if (this.lastNetworkStats && Array.isArray(net) && net.length > 0) {
      // Find the interface that was actually used before or has most traffic
      const activeNet = net.find(n => n.operstate === 'up' && (n.rx_bytes > 0 || n.tx_bytes > 0)) || net[0];
      
      if (activeNet) {
        const lastActiveNet = this.lastNetworkStats.find((n: any) => n.iface === activeNet.iface);

        if (lastActiveNet) {
          netIn = Math.max(0, (activeNet.rx_bytes - lastActiveNet.rx_bytes) / 1024 / 1024 / 2);
          netOut = Math.max(0, (activeNet.tx_bytes - lastActiveNet.tx_bytes) / 1024 / 1024 / 2);
        }
      }
    }
    this.lastNetworkStats = net;

    // Disk calculation: Try disksIO first, fallback to fsStats
    let diskRead = 0, diskWrite = 0;
    if (this.lastDiskStats) {
        // Option A: disksIO (Raw Bytes)
        if (disk && disk.rIO > 0) {
            diskRead = Math.max(0, (disk.rIO - this.lastDiskStats.rIO) / 1024 / 1024 / 2);
            diskWrite = Math.max(0, (disk.wIO - this.lastDiskStats.wIO) / 1024 / 1024 / 2);
        } 
        // Option B: fsStats (Filesystem level) - Better on Windows sometimes
        else if (fs && fs.rx > 0) {
            const lastFs = this.lastDiskStats.fs || { rx: 0, wx: 0 };
            diskRead = Math.max(0, (fs.rx - lastFs.rx) / 1024 / 1024 / 2);
            diskWrite = Math.max(0, (fs.wx - lastFs.wx) / 1024 / 1024 / 2);
        }
    }
    this.lastDiskStats = { ...disk, fs };

    // Final result with safety
    const totalMem = mem.total || 1; // Avoid div by zero
    const activeMem = mem.active || 0;

    return {
      cpu: typeof cpu.currentLoad === 'number' ? cpu.currentLoad.toFixed(1) : "0",
      ram: ((activeMem / totalMem) * 100).toFixed(1),
      memUsed: (activeMem / (1024 * 1024 * 1024)).toFixed(1),
      memTotal: (totalMem / (1024 * 1024 * 1024)).toFixed(1),
      netIn: netIn.toFixed(2),
      netOut: netOut.toFixed(2),
      diskRead: diskRead.toFixed(2),
      diskWrite: diskWrite.toFixed(2),
      timestamp: new Date().toISOString()
    };
  }
}

export const monitoringService = new MonitoringService();
