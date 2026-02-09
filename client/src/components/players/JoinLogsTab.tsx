import { useState } from 'react';
import { Search, RefreshCw, LogIn, LogOut, Clock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { useTranslation } from 'react-i18next';

interface JoinLog {
  id: number;
  player_name: string;
  steam_id: string;
  event_type: 'join' | 'leave';
  created_at: string;
}

interface JoinLogsTabProps {
  selectedServerId: number | null;
}

import { useSteamAvatars } from '../../hooks/useSteamAvatars';

const JoinLogsTab = ({ selectedServerId }: JoinLogsTabProps) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: logs = [],
    isLoading: loading,
    refetch,
  } = useQuery<JoinLog[]>({
    queryKey: ['join-logs', selectedServerId],
    queryFn: () => apiFetch(`/api/logs/${selectedServerId}`).then((res) => res.json()),
    enabled: !!selectedServerId,
  });

  // Fetch Avatars
  const uniqueSteamIds = Array.from(
    new Set(Array.isArray(logs) ? logs.map((l: JoinLog) => l && l.steam_id).filter(Boolean) : [])
  );
  const { data: avatars = {} } = useSteamAvatars(uniqueSteamIds);

  // Helper for date formatting
  const formatFullDate = (dateString: string) => {
    return new Intl.DateTimeFormat('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(dateString));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
    toast.success(t('players.logs_updated'));
  };

  const filteredLogs = Array.isArray(logs)
    ? logs.filter(
        (log: JoinLog) =>
          (log.player_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
          (log.steam_id?.toLowerCase() || '').includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            {t('players.join_leave_history')}
          </h3>
          <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-bold tracking-widest uppercase">
            {t('players.live_feed')}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              className="w-64 pl-10 pr-4 py-2 bg-[#1d1d1d]/30 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200"
              placeholder={t('players.search_history')}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={!selectedServerId || refreshing}
            className="bg-[#111827] hover:bg-gray-800 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold text-sm border border-gray-800 flex items-center transition-all active:scale-95"
          >
            <RefreshCw className={`mr-2 w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {t('players.refresh')}
          </button>
        </div>
      </div>

      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                <th className="px-6 py-4 border-b border-gray-800/50">{t('players.timestamp')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50">{t('players.player')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50">{t('players.steam_id')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-right">
                  {t('players.event')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 text-sm">
                    {t('players.loading_logs')}
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 text-sm">
                    {t('players.no_logs')}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log: JoinLog) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                      {formatFullDate(log.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 text-xs font-bold border border-gray-700 overflow-hidden">
                          {avatars[log.steam_id] ? (
                            <img
                              src={avatars[log.steam_id]}
                              alt={log.player_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User size={14} />
                          )}
                        </div>
                        <span className="font-bold text-white text-sm">{log.player_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-primary font-mono select-all">
                      {log.steam_id}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          log.event_type === 'join'
                            ? 'bg-green-500/10 text-green-500 border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]'
                            : 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                        }`}
                      >
                        {log.event_type === 'join' ? <LogIn size={10} /> : <LogOut size={10} />}
                        {t(`players.${log.event_type}`)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default JoinLogsTab;
