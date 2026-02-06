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
    const [cpu, mem, net, disk] = await Promise.all([
      si.currentLoad().catch(() => ({ currentLoad: 0 })),
      si.mem().catch(() => ({ active: 0, total: 1 })),
      si.networkStats().catch(() => []),
      si.disksIO().catch(() => ({ rIO: 0, wIO: 0 }))
    ]);

    // Network calculation
    let netIn = 0, netOut = 0;
    if (this.lastNetworkStats && net?.length > 0) {
      const currentNet = net[0];
      const lastNet = this.lastNetworkStats[0];
      if (currentNet?.rx_bytes !== undefined && lastNet?.rx_bytes !== undefined) {
        netIn = Math.max(0, (currentNet.rx_bytes - lastNet.rx_bytes) / 1024 / 1024 / 2);
        netOut = Math.max(0, (currentNet.tx_bytes - lastNet.tx_bytes) / 1024 / 1024 / 2);
      }
    }
    this.lastNetworkStats = net;

    // Disk calculation
    let diskRead = 0, diskWrite = 0;
    if (this.lastDiskStats && disk) {
        diskRead = Math.max(0, (disk.rIO - this.lastDiskStats.rIO) / 1024 / 1024 / 2);
        diskWrite = Math.max(0, (disk.wIO - this.lastDiskStats.wIO) / 1024 / 1024 / 2);
    }
    this.lastDiskStats = disk;

    return {
      cpu: typeof cpu.currentLoad === 'number' ? cpu.currentLoad.toFixed(1) : "0",
      ram: (mem.total > 0) ? ((mem.active / mem.total) * 100).toFixed(1) : "0",
      memUsed: (mem.active / 1024 / 1024 / 1024).toFixed(1),
      memTotal: (mem.total / 1024 / 1024 / 1024).toFixed(1),
      netIn: netIn.toFixed(2),
      netOut: netOut.toFixed(2),
      diskRead: diskRead.toFixed(2),
      diskWrite: diskWrite.toFixed(2),
      timestamp: new Date().toISOString()
    };
  }
}

export const monitoringService = new MonitoringService();
