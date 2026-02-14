import db from '../db.js';
import type { SystemStats } from './MonitoringService.js';

export interface AlertThresholds {
  cpu: number;
  ram: number;
  disk: number;
}

class AlertService {
  private thresholds: AlertThresholds = {
    cpu: 90,
    ram: 95,
    disk: 90,
  };

  private lastAlerts: Record<string, number> = {};
  private readonly ALERT_COOLDOWN = 10 * 60 * 1000; // 10 minutes (ms)

  public check(stats: SystemStats) {
    const cpuValue = parseFloat(stats.cpu);
    const ramValue = parseFloat(stats.ram);

    // CPU Check
    if (cpuValue > this.thresholds.cpu) {
      this.triggerAlert('CRITICAL_CPU', `Critical CPU Usage: %${cpuValue}`, 'WARNING');
    }

    // RAM Check
    if (ramValue > this.thresholds.ram) {
      this.triggerAlert(
        'CRITICAL_RAM',
        `Critical Memory Usage: %${ramValue} (${stats.memUsed} GB / ${stats.memTotal} GB)`,
        'WARNING'
      );
    }

    // Disk Check (Can be extended when si.fsSize() is added)
  }

  private triggerAlert(
    type: string,
    message: string,
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'
  ) {
    const now = Date.now();
    const lastTime = this.lastAlerts[type] || 0;

    // Cooldown check (To prevent spamming the same alert)
    if (now - lastTime < this.ALERT_COOLDOWN) return;

    try {
      db.prepare(
        `
        INSERT INTO activity_logs (user_id, type, message, severity)
        VALUES (?, ?, ?, ?)
      `
      ).run(1, type, message, severity); // Default admin user_id: 1

      this.lastAlerts[type] = now;
      console.log(`[AlertService] Alert Triggered: ${type} - ${message}`);
    } catch (error) {
      console.error('[AlertService] Log error:', error);
    }
  }

  public setThresholds(newThresholds: Partial<AlertThresholds>) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }
}

export const alertService = new AlertService();
