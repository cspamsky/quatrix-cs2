import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../utils/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { RefreshCcw, Info } from 'lucide-react';

interface AnalyticsData {
  timestamp: string;
  cpu: number;
  ram: number;
  net_in: number;
  disk_read: number;
}

const Analytics = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState('24h');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const {
    data: stats,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<AnalyticsData[]>({
    queryKey: ['analytics', range],
    queryFn: async () => {
      const response = await apiFetch(`/api/analytics?range=${range}`);
      return response.json();
    },
  });

  const chartData = (stats || []).map((item) => ({
    ...item,
    time: new Date(item.timestamp).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));

  interface ChartPayloadEntry {
    name: string;
    value: number;
    color: string;
    dataKey: string;
    payload: AnalyticsData;
  }

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: ChartPayloadEntry[];
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1e293b] border border-gray-700 p-4 rounded-xl shadow-2xl backdrop-blur-md">
          <p className="text-xs font-bold text-gray-400 mb-3 border-b border-gray-700 pb-2">
            {label}
          </p>
          {payload.map((entry, index: number) => (
            <div key={index} className="flex items-center justify-between gap-6 mb-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                ></div>
                <span className="text-[11px] font-bold text-gray-300 uppercase">{entry.name}</span>
              </div>
              <span className="text-xs font-black text-white">
                {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}{' '}
                {['CPU', 'RAM'].includes(entry.name) ? '%' : 'MB/s'}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {t('nav.analytics') || 'System Analytics'}
          </h1>
          <p className="text-gray-400 mt-1 font-medium">
            {t('analytics.subtitle') ||
              'Historical system performance and resource utilization insights'}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#111827] p-1.5 rounded-xl border border-gray-800 shadow-sm">
          {['24h', '7d', '30d'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-tighter ${
                range === r
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-gray-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-800 mx-1"></div>
          <button
            onClick={() => refetch()}
            className={`p-1.5 text-gray-500 hover:text-white transition-all ${isFetching ? 'text-primary' : ''}`}
            title={t('common.refresh')}
          >
            <RefreshCcw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="bg-[#111827] p-8 rounded-2xl border border-gray-800 shadow-xl min-h-[600px] flex flex-col">
        <div className="flex items-center gap-2 mb-8 bg-blue-500/5 p-3 rounded-xl border border-blue-500/10 max-w-fit">
          <Info size={16} className="text-blue-500" />
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            All metrics are unified in a single high-fidelity timeframe.
          </p>
        </div>

        <div className="flex-1 w-full h-[500px] relative">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <RefreshCcw size={32} className="text-primary animate-spin" />
            </div>
          ) : chartData.length > 0 ? (
            <div className="absolute inset-0">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                    <XAxis
                      dataKey="time"
                      stroke="#4b5563"
                      fontSize={10}
                      tickMargin={10}
                      interval="preserveStartEnd"
                    />
                    <YAxis stroke="#4b5563" fontSize={10} tickMargin={10} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{
                        fontSize: '10px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                      }}
                    />
                    <Line
                      name="CPU"
                      type="monotone"
                      dataKey="cpu"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                      animationDuration={1000}
                    />
                    <Line
                      name="RAM"
                      type="monotone"
                      dataKey="ram"
                      stroke="#a855f7"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                      animationDuration={1000}
                    />
                    <Line
                      name="NET IN"
                      type="monotone"
                      dataKey="net_in"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      animationDuration={1000}
                    />
                    <Line
                      name="DISK READ"
                      type="monotone"
                      dataKey="disk_read"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      animationDuration={1000}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4">
              <Info size={48} />
              <p className="text-sm font-bold uppercase tracking-widest text-center">
                No analytics data collected yet. <br />
                <span className="text-[10px] text-gray-700">
                  Data snapshots are taken every 5 minutes.
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
