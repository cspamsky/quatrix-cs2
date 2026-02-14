import React, { useState } from 'react';
import {
  Monitor,
  RefreshCw,
  Database,
  Shield,
  Activity,
  FolderOpen,
  Terminal,
  Smartphone,
  AlertTriangle,
  Wrench,
} from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

interface SystemHealthTabProps {
  healthData: {
    cpu?: { model?: string; cores?: number; avx?: boolean };
    ram?: { total: number; status: string };
    disk?: { free: number; status: string; garbage?: { count: number; size: number } };
    runtimes?: {
      dotnet?: { status: string; versions?: string[] };
      steam_sdk?: { status: string };
    };
  } | null;
  healthLoading: boolean;
  onRefresh: () => void;
  onRepair: () => void;
  canEdit?: boolean;
}

const SystemHealthTab: React.FC<SystemHealthTabProps> = ({
  healthData,
  healthLoading,
  onRefresh,
  onRepair,
  canEdit = true,
}) => {
  const { t } = useTranslation();
  const [repairLoading, setRepairLoading] = useState(false);

  const handleRepair = async () => {
    setRepairLoading(true);
    try {
      await onRepair();
    } finally {
      setRepairLoading(false);
    }
  };

  const hasIssues =
    healthData?.runtimes?.dotnet?.status !== 'good' ||
    healthData?.runtimes?.steam_sdk?.status !== 'good' ||
    (healthData?.disk?.garbage?.count ?? 0) > 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Monitor className="text-primary w-6 h-6" />
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              {t('settingsHealth.title')}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('settingsHealth.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasIssues && canEdit && (
            <button
              onClick={handleRepair}
              disabled={repairLoading || healthLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-primary/20"
            >
              <Wrench size={14} className={repairLoading ? 'animate-spin' : ''} />
              {repairLoading ? t('settingsHealth.repairing') : t('settingsHealth.repair_system')}
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={healthLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} />
            {healthLoading ? t('settingsHealth.refreshing') : t('settingsHealth.refresh')}
          </button>
        </div>
      </div>

      {healthLoading && !healthData ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <RefreshCw className="text-primary w-10 h-10 animate-spin mb-4" />
          <p className="text-gray-500 animate-pulse">{t('system_health.scanning')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hardware Specs */}
          <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-6">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Database size={16} className="text-primary" />
              {t('system_health.hardware_cpu')}
            </h4>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-[#0F172A]/50 rounded-xl border border-gray-800/30">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                    {t('system_health.cpu_model')}
                  </p>
                  <p className="text-sm text-gray-200 font-medium truncate max-w-[200px]">
                    {healthData?.cpu?.model || t('serverCard.detecting')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                    {t('system_health.cores')}
                  </p>
                  <p className="text-sm text-white font-bold">{healthData?.cpu?.cores || '--'}</p>
                </div>
              </div>

              <div
                className={`flex items-center justify-between p-4 rounded-xl border ${healthData?.cpu?.avx ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${healthData?.cpu?.avx ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}
                  >
                    <Shield size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{t('system_health.avx')}</p>
                    <p className="text-[10px] text-gray-500">{t('system_health.avx_req')}</p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-black uppercase tracking-widest ${healthData?.cpu?.avx ? 'text-green-500' : 'text-red-500'}`}
                >
                  {healthData?.cpu?.avx ? t('system_health.supported') : t('system_health.missing')}
                </span>
              </div>

              <div
                className={`flex items-center justify-between p-4 rounded-xl border ${healthData?.ram?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : 'bg-orange-500/5 border-orange-500/20'}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${healthData?.ram?.status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}`}
                  >
                    <Activity size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{t('system_health.ram')}</p>
                    <p className="text-[10px] text-gray-500">
                      {((healthData?.ram?.total || 0) / 1024 / 1024 / 1024).toFixed(1)} GB{' '}
                      {t('system_health.total')}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-black uppercase tracking-widest ${healthData?.ram?.status === 'good' ? 'text-green-500' : 'text-orange-500'}`}
                >
                  {healthData?.ram?.status === 'good'
                    ? t('system_health.pass')
                    : t('system_health.low_ram')}
                </span>
              </div>

              <div
                className={`flex items-center justify-between p-4 rounded-xl border ${healthData?.disk?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : 'bg-orange-500/5 border-orange-500/20'}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${healthData?.disk?.status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}`}
                  >
                    <FolderOpen size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{t('system_health.disk')}</p>
                    <p className="text-[10px] text-gray-500">
                      {((healthData?.disk?.free || 0) / 1024 / 1024 / 1024).toFixed(1)} GB{' '}
                      {t('system_health.free')}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-black uppercase tracking-widest ${healthData?.disk?.status === 'good' ? 'text-green-500' : 'text-orange-500'}`}
                >
                  {healthData?.disk?.status === 'good'
                    ? t('system_health.pass')
                    : t('system_health.low_disk')}
                </span>
              </div>
            </div>
          </div>

          {/* Software Runtimes */}
          <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-6">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal size={16} className="text-primary" />
              {t('system_health.runtimes')}
            </h4>

            <div className="space-y-4">
              {/* .NET Runtime Card */}
              <div
                className={`p-4 rounded-xl border ${healthData?.runtimes?.dotnet?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${healthData?.runtimes?.dotnet?.status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}
                    >
                      <Smartphone size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{t('system_health.dotnet')}</p>
                      <p className="text-[10px] text-gray-500">{t('system_health.dotnet_req')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {healthData?.runtimes?.dotnet?.status !== 'good' && (
                      <a
                        href="https://learn.microsoft.com/en-us/dotnet/core/install/linux"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest"
                      >
                        {t('system_health.download')}
                      </a>
                    )}
                    <span
                      className={`text-[10px] font-black uppercase tracking-widest ${healthData?.runtimes?.dotnet?.status === 'good' ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {healthData?.runtimes?.dotnet?.status === 'good'
                        ? t('system_health.installed')
                        : t('system_health.missing')}
                    </span>
                  </div>
                </div>
                {(healthData?.runtimes?.dotnet?.versions?.length || 0) > 0 && (
                  <div className="mt-2 text-[9px] font-mono text-gray-500 max-h-20 overflow-y-auto bg-black/20 p-2 rounded-lg scrollbar-hide">
                    {healthData?.runtimes?.dotnet?.versions?.map((v: string, i: number) => (
                      <div key={i}>{v}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Steam SDK Card */}
              <div
                className={`p-4 rounded-xl border ${healthData?.runtimes?.steam_sdk?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${healthData?.runtimes?.steam_sdk?.status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}
                    >
                      <Activity size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{t('system_health.steam_sdk')}</p>
                      <p className="text-[10px] text-gray-500">
                        {t('system_health.steam_sdk_req')}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase tracking-widest ${healthData?.runtimes?.steam_sdk?.status === 'good' ? 'text-green-500' : 'text-red-500'}`}
                  >
                    {healthData?.runtimes?.steam_sdk?.status === 'good'
                      ? t('system_health.ready')
                      : t('system_health.missing')}
                  </span>
                </div>
              </div>

              {/* Garbage Cleanup Card */}
              <div
                className={`p-4 rounded-xl border ${healthData?.disk?.garbage?.count === 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-orange-500/5 border-orange-500/20'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${healthData?.disk?.garbage?.count === 0 ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}`}
                    >
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{t('system_health.garbage')}</p>
                      <p className="text-[10px] text-gray-500">
                        {healthData?.disk?.garbage?.count || 0} {t('system_health.detected')} (
                        {((healthData?.disk?.garbage?.size || 0) / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase tracking-widest ${healthData?.disk?.garbage?.count === 0 ? 'text-green-500' : 'text-orange-500'}`}
                  >
                    {healthData?.disk?.garbage?.count === 0
                      ? t('system_health.clean')
                      : t('system_health.needs_cleanup')}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                <div className="flex gap-3">
                  <AlertTriangle className="text-primary shrink-0" size={16} />
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    <Trans i18nKey="system_health.warning">
                      If any items are <span className="text-red-500">Missing</span> or{' '}
                      <span className="text-orange-500">Needs Cleanup</span>, the panel performance
                      may degrade. Use the <b>Repair System</b> button to automate the resolution.
                    </Trans>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemHealthTab;
