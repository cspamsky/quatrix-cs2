import { useState } from 'react';
import {
  Search,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User,
  Calendar,
  Clock,
  Unlock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { useTranslation } from 'react-i18next';

interface BanRecord {
  id: number;
  player_name: string;
  steam_id: string;
  ip_address: string;
  reason: string;
  duration: number;
  banned_by: string;
  banned_at: string;
  expires_at: string | null;
  unbanned_at: string | null;
  is_active: number;
}

interface BanHistoryTabProps {
  selectedServerId: number | null;
}

import { useSteamAvatars } from '../../hooks/useSteamAvatars';

const BanHistoryTab = ({ selectedServerId }: BanHistoryTabProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  const {
    data: bans = [],
    isLoading: loading,
    refetch,
  } = useQuery<BanRecord[]>({
    queryKey: ['bans', selectedServerId, showActiveOnly],
    queryFn: () => {
      const url = `/api/servers/${selectedServerId}/bans${showActiveOnly ? '?active_only=true' : ''}`;
      return apiFetch(url).then((res) => res.json());
    },
    enabled: !!selectedServerId,
  });

  // Fetch Avatars
  const uniqueSteamIds = Array.from(
    new Set(Array.isArray(bans) ? bans.map((b: BanRecord) => b.steam_id) : [])
  );
  const { data: avatars = {} } = useSteamAvatars(uniqueSteamIds as string[]);

  // Helper for date formatting
  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(dateString));
  };

  const unbanMutation = useMutation({
    mutationFn: (banId: number) =>
      apiFetch(`/api/servers/${selectedServerId}/bans/${banId}/unban`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('players.player_unbanned'));
      queryClient.invalidateQueries({ queryKey: ['bans', selectedServerId] });
    },
    onError: () => toast.error(t('players.unban_failed')),
  });

  const handleRefresh = async () => {
    await refetch();
    toast.success(t('players.ban_history_updated'));
  };

  const filteredBans = Array.isArray(bans)
    ? bans.filter(
        (ban: BanRecord) =>
          ban.player_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ban.steam_id?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              {t('players.incident_records')}
            </h3>
          </div>

          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={showActiveOnly}
                onChange={(e) => setShowActiveOnly(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-gray-800 rounded-full peer peer-checked:bg-primary transition-all duration-300"></div>
              <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-all duration-300"></div>
            </div>
            <span className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors uppercase tracking-widest">
              {t('players.active_bans_only')}
            </span>
          </label>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              className="w-64 pl-10 pr-4 py-2 bg-[#1d1d1d]/30 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200"
              placeholder={t('players.search_bans')}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={!selectedServerId || loading}
            className="p-2.5 bg-[#111827] hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl border border-gray-800 transition-all active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                <th className="px-6 py-4 border-b border-gray-800/50">{t('players.player')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50">{t('players.reason')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50">{t('players.ban_date')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50">{t('players.status')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-right">
                  {t('players.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">
                    {t('players.loading_records')}
                  </td>
                </tr>
              ) : filteredBans.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">
                    {t('players.no_ban_records')}
                  </td>
                </tr>
              ) : (
                filteredBans.map((ban: BanRecord) => (
                  <tr key={ban.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-red-500 font-bold border border-gray-700 overflow-hidden">
                          {avatars[ban.steam_id] ? (
                            <img
                              src={avatars[ban.steam_id]}
                              alt={ban.player_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            ban.player_name[0].toUpperCase()
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-white text-sm block">
                            {ban.player_name}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono tracking-tighter">
                            {ban.steam_id}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-gray-300 font-medium">{ban.reason}</span>
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold uppercase">
                          <User size={10} />
                          {t('players.by')} {ban.banned_by}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-xs text-gray-300 font-mono">
                          <Calendar size={12} className="text-gray-600" />
                          {formatDate(ban.banned_at)}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold uppercase">
                          <Clock size={10} />
                          {ban.duration === 0 ? t('players.permanent') : `${ban.duration}m`}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {ban.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                          <ShieldAlert size={10} />
                          {t('players.active')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-500 border border-green-500/20">
                          <ShieldCheck size={10} />
                          {t('players.expired')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {ban.is_active ? (
                        <button
                          onClick={() => unbanMutation.mutate(ban.id)}
                          disabled={unbanMutation.isPending}
                          className="px-4 py-2 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 ml-auto border border-green-500/20"
                        >
                          <Unlock size={14} />
                          {t('players.unban')}
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-600 font-bold uppercase">
                          {t('players.resolved')}{' '}
                          {ban.unbanned_at ? formatDate(ban.unbanned_at) : ''}
                        </span>
                      )}
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

export default BanHistoryTab;
