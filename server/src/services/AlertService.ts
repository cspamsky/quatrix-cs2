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
  private readonly ALERT_COOLDOWN = 10 * 60 * 1000; // 10 dakika (ms)

  public check(stats: SystemStats) {
    const cpuValue = parseFloat(stats.cpu);
    const ramValue = parseFloat(stats.ram);

    // CPU Kontrolü
    if (cpuValue > this.thresholds.cpu) {
      this.triggerAlert('CRITICAL_CPU', `Kritik CPU Kullanımı: %${cpuValue}`, 'WARNING');
    }

    // RAM Kontrolü
    if (ramValue > this.thresholds.ram) {
      this.triggerAlert(
        'CRITICAL_RAM',
        `Kritik Bellek Kullanımı: %${ramValue} (${stats.memUsed} GB / ${stats.memTotal} GB)`,
        'WARNING'
      );
    }

    // Disk Kontrolü (Gelecekte si.fsSize() eklendiğinde genişletilebilir)
  }

  private triggerAlert(
    type: string,
    message: string,
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'
  ) {
    const now = Date.now();
    const lastTime = this.lastAlerts[type] || 0;

    // Cooldown kontrolü (Sürekli aynı uyarıyı basmamak için)
    if (now - lastTime < this.ALERT_COOLDOWN) return;

    try {
      db.prepare(
        `
        INSERT INTO activity_logs (user_id, type, message, severity)
        VALUES (?, ?, ?, ?)
      `
      ).run(1, type, message, severity); // Varsayılan admin user_id: 1

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
