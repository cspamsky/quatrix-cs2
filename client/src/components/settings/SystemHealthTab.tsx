import React, { useState } from 'react'
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
  Wrench
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface SystemHealthTabProps {
  healthData: any
  healthLoading: boolean
  onRefresh: () => void
  onRepair: () => void
}

const SystemHealthTab: React.FC<SystemHealthTabProps> = ({ healthData, healthLoading, onRefresh, onRepair }) => {
  const { t } = useTranslation()
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
    healthData?.runtimes?.steam_runtime?.status !== 'good' ||
    healthData?.runtimes?.namespaces?.status === 'warning' ||
    (healthData?.disk?.garbage?.count > 0);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Monitor className="text-primary w-6 h-6" />
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">{t('settingsHealth.title')}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('settingsHealth.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {(hasIssues) && (
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
          <p className="text-gray-500 animate-pulse">Scanning system environment...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hardware Specs */}
          <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-6">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Database size={16} className="text-primary" />
              Hardware & CPU
            </h4>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-[#0F172A]/50 rounded-xl border border-gray-800/30">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">CPU Model</p>
                  <p className="text-sm text-gray-200 font-medium truncate max-w-[200px]">{healthData?.cpu?.model || 'Detecting...'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Cores</p>
                  <p className="text-sm text-white font-bold">{healthData?.cpu?.cores || '--'}</p>
                </div>
              </div>

              <div className={`flex items-center justify-between p-4 rounded-xl border ${healthData?.cpu?.avx ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${healthData?.cpu?.avx ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                    <Shield size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">AVX Instruction Set</p>
                    <p className="text-[10px] text-gray-500">Required for CS2 Dedicated Server</p>
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${healthData?.cpu?.avx ? 'text-green-500' : 'text-red-500'}`}>
                  {healthData?.cpu?.avx ? 'Supported' : 'Missing'}
                </span>
              </div>

              <div className={`flex items-center justify-between p-4 rounded-xl border ${healthData?.ram?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : 'bg-orange-500/5 border-orange-500/20'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${healthData?.ram?.status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}`}>
                    <Activity size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">System RAM</p>
                    <p className="text-[10px] text-gray-500">{(healthData?.ram?.total / 1024 / 1024 / 1024).toFixed(1)} GB Total</p>
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${healthData?.ram?.status === 'good' ? 'text-green-500' : 'text-orange-500'}`}>
                  {healthData?.ram?.status === 'good' ? 'Pass' : 'Low (<8GB)'}
                </span>
              </div>

              <div className={`flex items-center justify-between p-4 rounded-xl border ${healthData?.disk?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : 'bg-orange-500/5 border-orange-500/20'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${healthData?.disk?.status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}`}>
                    <FolderOpen size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Available Disk Space</p>
                    <p className="text-[10px] text-gray-500">{(healthData?.disk?.free / 1024 / 1024 / 1024).toFixed(1)} GB Free</p>
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${healthData?.disk?.status === 'good' ? 'text-green-500' : 'text-orange-500'}`}>
                  {healthData?.disk?.status === 'good' ? 'Pass' : 'Low (<40GB)'}
                </span>
              </div>
            </div>
          </div>

          {/* Software Runtimes */}
          <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-6">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal size={16} className="text-primary" />
              Software Runtimes
            </h4>

            <div className="space-y-4">
              {/* .NET Runtime Card */}
              <div className={`p-4 rounded-xl border ${healthData?.runtimes?.dotnet?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${healthData?.runtimes?.dotnet?.status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      <Smartphone size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">.NET 8.0 Runtime</p>
                      <p className="text-[10px] text-gray-500">Required for CounterStrikeSharp</p>
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
                        Download
                      </a>
                    )}
                    <span className={`text-[10px] font-black uppercase tracking-widest ${healthData?.runtimes?.dotnet?.status === 'good' ? 'text-green-500' : 'text-red-500'}`}>
                      {healthData?.runtimes?.dotnet?.status === 'good' ? 'Installed' : 'Missing'}
                    </span>
                  </div>
                </div>
                {healthData?.runtimes?.dotnet?.versions?.length > 0 && (
                  <div className="mt-2 text-[9px] font-mono text-gray-500 max-h-20 overflow-y-auto bg-black/20 p-2 rounded-lg scrollbar-hide">
                    {healthData.runtimes.dotnet.versions.map((v: string, i: number) => (
                      <div key={i}>{v}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Steam SDK Card */}
              <div className={`p-4 rounded-xl border ${healthData?.runtimes?.steam_sdk?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${healthData?.runtimes?.steam_sdk?.status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      <Activity size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{t('settingsHealth.so_files')}</p>
                      <p className="text-[10px] text-gray-500">Required for server initialization</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${healthData?.runtimes?.steam_sdk?.status === 'good' ? 'text-green-500' : 'text-red-500'}`}>
                    {healthData?.runtimes?.steam_sdk?.status === 'good' ? 'Ready' : 'Missing'}
                  </span>
                </div>
              </div>

              {/* Steam Runtime Card */}
              <div className={`p-4 rounded-xl border ${healthData?.runtimes?.steam_runtime?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${healthData?.runtimes?.steam_runtime?.status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      <Terminal size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{t('settingsHealth.steam_runtime')}</p>
                      <p className="text-[10px] text-gray-500">Cross-distro compatibility wrapper</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${healthData?.runtimes?.steam_runtime?.status === 'good' ? 'text-green-500' : 'text-red-500'}`}>
                    {healthData?.runtimes?.steam_runtime?.status === 'good' ? 'Installed' : 'Missing'}
                  </span>
                </div>
              </div>

              {/* Unprivileged Namespaces Card */}
              <div className={`p-4 rounded-xl border ${healthData?.runtimes?.namespaces?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : healthData?.runtimes?.namespaces?.status === 'warning' ? 'bg-orange-500/5 border-orange-500/20' : 'bg-gray-500/5 border-gray-800/20'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${healthData?.runtimes?.namespaces?.status === 'good' ? 'bg-green-500/10 text-green-500' : healthData?.runtimes?.namespaces?.status === 'warning' ? 'bg-orange-500/10 text-orange-500' : 'bg-gray-500/10 text-gray-400'}`}>
                      <Shield size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{t('settingsHealth.unprivileged_namespaces')}</p>
                      <p className="text-[10px] text-gray-500">{healthData?.runtimes?.namespaces?.message || 'Check manually'}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${healthData?.runtimes?.namespaces?.status === 'good' ? 'text-green-500' : healthData?.runtimes?.namespaces?.status === 'warning' ? 'text-orange-500' : 'text-gray-500'}`}>
                    {healthData?.runtimes?.namespaces?.status === 'good' ? 'Enabled' : healthData?.runtimes?.namespaces?.status === 'warning' ? 'Action Req' : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Garbage Cleanup Card */}
              <div className={`p-4 rounded-xl border ${healthData?.disk?.garbage?.count === 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-orange-500/5 border-orange-500/20'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${healthData?.disk?.garbage?.count === 0 ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}`}>
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Disk Garbage (Core Dumps)</p>
                      <p className="text-[10px] text-gray-500">
                        {healthData?.disk?.garbage?.count || 0} files found 
                        ({((healthData?.disk?.garbage?.size || 0) / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${healthData?.disk?.garbage?.count === 0 ? 'text-green-500' : 'text-orange-500'}`}>
                    {healthData?.disk?.garbage?.count === 0 ? 'Clean' : 'Needs Cleanup'}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                <div className="flex gap-3">
                  <AlertTriangle className="text-primary shrink-0" size={16} />
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    If any items are <span className="text-red-500">Missing</span> or <span className="text-orange-500">Needs Cleanup</span>, the panle performance may degrade. Use the <b>Repair System</b> button to automate the resolution.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SystemHealthTab;
