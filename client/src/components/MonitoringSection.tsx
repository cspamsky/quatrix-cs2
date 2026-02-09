import React from 'react';
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { Cpu, Database, Globe, HardDrive, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface MonitoringStats {
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

interface MonitoringSectionProps {
  data: MonitoringStats[];
  systemInfo: {
    cpuModel?: string;
    totalMemory?: number;
  };
  currentStats: MonitoringStats;
}

interface ChartEntry {
  name: string;
  value: number;
  color?: string;
  payload: MonitoringStats;
}

const MonitoringSection: React.FC<MonitoringSectionProps> = ({
  data,
  systemInfo,
  currentStats,
}) => {
  const { t } = useTranslation();

  const chartData = (Array.isArray(data) ? data : []).filter(Boolean).map((item) => ({
    ...item,
    cpu: parseFloat(item.cpu || '0'),
    ram: parseFloat(item.ram || '0'),
    netIn: parseFloat(item.netIn || '0'),
    netOut: parseFloat(item.netOut || '0'),
    diskRead: parseFloat(item.diskRead || '0'),
    diskWrite: parseFloat(item.diskWrite || '0'),
    time: item.timestamp
      ? new Date(item.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '--:--:--',
  }));

  const CustomTooltip = ({
    active,
    payload,
    label,
    unit,
  }: {
    active?: boolean;
    payload?: ChartEntry[];
    label?: string;
    unit?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1f2937] border border-gray-700 p-3 rounded-lg shadow-xl backdrop-blur-md min-w-[120px]">
          <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase tracking-widest border-b border-gray-700 pb-1">
            {label}
          </p>
          {payload.map((entry: ChartEntry, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4 mb-0.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                ></div>
                <span className="text-[10px] font-bold text-gray-300 uppercase">{entry.name}</span>
              </div>
              <span className="text-xs font-black text-white">
                {entry.value} {unit || '%'}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {/* CPU Mega Card */}
      <div className="p-6 bg-[#111827] rounded-2xl border border-gray-800/60 shadow-lg shadow-black/20 overflow-hidden relative group transition-all hover:border-blue-500/30">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 transition-colors">
                <Cpu size={20} />
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  {t('dashboard.cpu_usage')}
                </h3>
                <p className="text-[9px] text-gray-500 font-bold truncate max-w-[120px]">
                  {systemInfo?.cpuModel || 'Processor'}
                </p>
              </div>
            </div>
            <div className="text-2xl font-black text-blue-500">{currentStats.cpu}%</div>
          </div>

          <div className="relative h-32 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip content={<CustomTooltip unit="%" />} />
                <Area
                  name="CPU"
                  type="monotone"
                  dataKey="cpu"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCpu)"
                  animationDuration={800}
                  isAnimationActive={true}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-blue-500/5 blur-2xl rounded-full group-hover:bg-blue-500/10 transition-all"></div>
      </div>

      {/* RAM Mega Card */}
      <div className="p-6 bg-[#111827] rounded-2xl border border-gray-800/60 shadow-lg shadow-black/20 overflow-hidden relative group transition-all hover:border-purple-500/30">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500 group-hover:bg-purple-500/20 transition-colors">
                <Database size={20} />
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  {t('dashboard.ram_usage')}
                </h3>
                <p className="text-[9px] text-gray-500 font-bold">
                  {parseFloat(currentStats.memUsed || '0').toFixed(1)} /{' '}
                  {((systemInfo?.totalMemory || 0) / 1024).toFixed(1)} GB
                </p>
              </div>
            </div>
            <div className="text-2xl font-black text-purple-500">{currentStats.ram}%</div>
          </div>

          <div className="relative h-32 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip content={<CustomTooltip unit="%" />} />
                <Area
                  name="RAM"
                  type="monotone"
                  dataKey="ram"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRam)"
                  animationDuration={800}
                  isAnimationActive={true}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-purple-500/5 blur-2xl rounded-full group-hover:bg-purple-500/10 transition-all"></div>
      </div>

      {/* Network Mega Card */}
      <div className="p-6 bg-[#111827] rounded-2xl border border-gray-800/60 shadow-lg shadow-black/20 overflow-hidden relative group transition-all hover:border-emerald-500/30">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20 transition-colors">
                <Globe size={20} />
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  {t('dashboard.net_traffic')}
                </h3>
                <div className="flex items-center gap-2 text-[9px] font-bold text-gray-500">
                  <span className="flex items-center gap-0.5">
                    <ArrowDownLeft size={10} className="text-emerald-500" /> {currentStats.netIn}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <ArrowUpRight size={10} className="text-blue-500" /> {currentStats.netOut}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-sm font-black text-emerald-500 mt-1 uppercase tracking-tighter">
              MB/s
            </div>
          </div>

          <div className="relative h-32 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip content={<CustomTooltip unit="MB/s" />} />
                <Area
                  name="Network"
                  type="monotone"
                  dataKey="netIn"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorNet)"
                  animationDuration={800}
                  isAnimationActive={true}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full group-hover:bg-emerald-500/10 transition-all"></div>
      </div>

      {/* Disk Mega Card */}
      <div className="p-6 bg-[#111827] rounded-2xl border border-gray-800/60 shadow-lg shadow-black/20 overflow-hidden relative group transition-all hover:border-orange-500/30">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20 transition-colors">
                <HardDrive size={20} />
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  {t('dashboard.disk_io')}
                </h3>
                <p className="text-[9px] text-gray-500 font-bold uppercase">
                  {currentStats.diskRead} READ / {currentStats.diskWrite} WRITE
                </p>
              </div>
            </div>
            <div className="text-sm font-black text-orange-500 mt-1 uppercase tracking-tighter">
              MB/s
            </div>
          </div>

          <div className="relative h-32 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip content={<CustomTooltip unit="MB/s" />} />
                <Area
                  name="Disk"
                  type="monotone"
                  dataKey="diskRead"
                  stroke="#f97316"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorDisk)"
                  animationDuration={800}
                  isAnimationActive={true}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-orange-500/5 blur-2xl rounded-full group-hover:bg-orange-500/10 transition-all"></div>
      </div>
    </div>
  );
};

export default MonitoringSection;
