import si from 'systeminformation';
import { alertService } from './AlertService.js';
import type { Server } from 'socket.io';
import db from '../db.js';

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
  private io: Server | null = null;
  private statsHistory: SystemStats[] = [];
  private readonly MAX_HISTORY = 120; // 2 minutes of history
  private interval: NodeJS.Timeout | null = null;
  private saveInterval: NodeJS.Timeout | null = null;
  private readonly SAVE_PERIOD = 5 * 60 * 1000; // 5 minutes

  private lastNetworkStats: si.Systeminformation.NetworkStatsData[] | null = null;
  private lastDiskStats: {
    disks: si.Systeminformation.DisksIoData | si.Systeminformation.DisksIoData[];
    fs: si.Systeminformation.FsStatsData;
  } | null = null;

  public setSocketIO(io: Server) {
    this.io = io;
  }

  public start() {
    if (this.interval) return;

    // Real-time interval (1s)
    this.interval = setInterval(async () => {
      try {
        const stats = await this.collectStats();

        // Keep in-memory history
        this.statsHistory.push(stats);
        if (this.statsHistory.length > this.MAX_HISTORY) {
          this.statsHistory.shift();
        }

        // Broadcast via Socket.io
        if (this.io) {
          this.io.emit('stats', stats);
        }

        // Check thresholds
        alertService.check(stats);
      } catch (error) {
        console.error('[MonitoringService] Stats collection error:', error);
      }
    }, 1000);

    // Snapshot interval (5m)
    this.saveInterval = setInterval(async () => {
      try {
        const stats = await this.collectStats();
        this.saveSnapshot(stats);
        this.cleanupOldStats();
      } catch (error) {
        console.error('[MonitoringService] Periodic save error:', error);
      }
    }, this.SAVE_PERIOD);

    console.log('\x1b[32m[SYSTEM]\x1b[0m Monitoring Service started.');
  }

  private saveSnapshot(stats: SystemStats) {
    try {
      db.prepare(
        `INSERT INTO system_analytics (cpu, ram, net_in, net_out, disk_read, disk_write) 
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        parseFloat(stats.cpu),
        parseFloat(stats.ram),
        parseFloat(stats.netIn),
        parseFloat(stats.netOut),
        parseFloat(stats.diskRead),
        parseFloat(stats.diskWrite)
      );
    } catch (err) {
      console.error('[MonitoringService] Failed to save snapshot:', err);
    }
  }

  private cleanupOldStats() {
    try {
      // Keep only last 30 days
      db.prepare(
        `DELETE FROM system_analytics WHERE timestamp < datetime('now', '-30 days')`
      ).run();
    } catch (err) {
      console.error('[MonitoringService] Failed to cleanup old stats:', err);
    }
  }

  public getStatsHistory(): SystemStats[] {
    return this.statsHistory;
  }

  private async collectStats(): Promise<SystemStats & { healthScore: number; uptime: string }> {
    const [cpu, mem, net, disk, fs] = await Promise.all([
      si.currentLoad().catch(() => ({ currentLoad: 0 })),
      si.mem().catch(() => ({ active: 0, total: 1 })),
      si.networkStats().catch(() => []),
      si.disksIO().catch(() => ({ rIO: 0, wIO: 0 }) as unknown as si.Systeminformation.DisksIoData),
      si.fsStats().catch(
        () =>
          ({
            rx: 0,
            wx: 0,
            tx: 0,
            rx_sec: 0,
            wx_sec: 0,
            tx_sec: 0,
            ms: 0,
          }) as si.Systeminformation.FsStatsData
      ),
    ]);

    const time = si.time(); // Synchronous call

    // Format Uptime (e.g. 2d 5h 30m)
    const formatUptime = (seconds: number) => {
      const days = Math.floor(seconds / (3600 * 24));
      const hours = Math.floor((seconds % (3600 * 24)) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${days > 0 ? days + 'd ' : ''}${hours}h ${minutes}m`;
    };

    // Calculate Health Score (Basic logic)
    let healthScore = 100;
    if (cpu.currentLoad > 80) healthScore -= 20;
    if (mem.active / mem.total > 0.9) healthScore -= 20;
    // Lower score based on load
    healthScore -= cpu.currentLoad / 10;
    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    // Network calculation: Find first active interface with traffic
    let netIn = 0,
      netOut = 0;
    if (this.lastNetworkStats && Array.isArray(net) && net.length > 0) {
      // Find the interface that was actually used before or has most traffic
      const activeNet =
        net.find((n) => n.operstate === 'up' && (n.rx_bytes > 0 || n.tx_bytes > 0)) || net[0];

      if (activeNet) {
        const lastActiveNet = this.lastNetworkStats.find(
          (n: si.Systeminformation.NetworkStatsData) => n.iface === activeNet.iface
        );

        if (lastActiveNet) {
          // Division by 1 since interval is now 1000ms (1s)
          netIn = Math.max(0, (activeNet.rx_bytes - lastActiveNet.rx_bytes) / 1024 / 1024);
          netOut = Math.max(0, (activeNet.tx_bytes - lastActiveNet.tx_bytes) / 1024 / 1024);
        }
      }
    }
    this.lastNetworkStats = net;

    // Disk calculation: Robust check for Windows/Linux
    let diskRead = 0,
      diskWrite = 0;

    const getDiskSum = (
      d: si.Systeminformation.DisksIoData | si.Systeminformation.DisksIoData[],
      f: si.Systeminformation.FsStatsData
    ) => {
      let rIO = 0,
        wIO = 0,
        f_rx = 0,
        f_wx = 0;

      if (!d) return { rIO, wIO, f_rx, f_wx };

      // Sum disksIO
      if (Array.isArray(d)) {
        d.forEach((item) => {
          rIO += item.rIO || 0;
          wIO += item.wIO || 0;
        });
      } else {
        rIO = (d as si.Systeminformation.DisksIoData).rIO || 0;
        wIO = (d as si.Systeminformation.DisksIoData).wIO || 0;
      }

      // Sum fsStats
      if (f) {
        f_rx = f.rx || 0;
        f_wx = f.wx || 0;
      }

      return { rIO, wIO, f_rx, f_wx };
    };

    if (this.lastDiskStats) {
      const current = getDiskSum(
        disk as si.Systeminformation.DisksIoData,
        fs as si.Systeminformation.FsStatsData
      );
      const last = getDiskSum(this.lastDiskStats.disks, this.lastDiskStats.fs);

      const d_r = current.rIO - last.rIO;
      const d_w = current.wIO - last.wIO;
      const f_r = current.f_rx - last.f_rx;
      const f_w = current.f_wx - last.f_wx;

      // Use whichever source provides data (non-zero delta)
      diskRead = Math.max(0, Math.max(d_r, f_r) / 1024 / 1024);
      diskWrite = Math.max(0, Math.max(d_w, f_w) / 1024 / 1024);
    }
    this.lastDiskStats = {
      disks: disk as si.Systeminformation.DisksIoData,
      fs: fs as si.Systeminformation.FsStatsData,
    };

    // Final result with safety
    const totalMem = mem.total || 1; // Avoid div by zero
    const activeMem = mem.active || 0;

    return {
      cpu: typeof cpu.currentLoad === 'number' ? cpu.currentLoad.toFixed(1) : '0',
      ram: ((activeMem / totalMem) * 100).toFixed(1),
      memUsed: (activeMem / (1024 * 1024 * 1024)).toFixed(1),
      memTotal: (totalMem / (1024 * 1024 * 1024)).toFixed(1),
      netIn: netIn.toFixed(2),
      netOut: netOut.toFixed(2),
      diskRead: diskRead.toFixed(2),
      diskWrite: diskWrite.toFixed(2),
      timestamp: new Date().toISOString(),
      healthScore,
      uptime: formatUptime(time.uptime),
    };
  }
}

export const monitoringService = new MonitoringService();
