import { useMemo, useState } from 'react';
import { Users, Search, RefreshCw, UserMinus, ShieldAlert, MoreHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { useTranslation } from 'react-i18next';
import { useSteamAvatars } from '../../hooks/useSteamAvatars';
import type { LivePlayer } from '../../types';

interface LivePlayersTabProps {
  selectedServerId: number | null;
}

const LivePlayersTab = ({ selectedServerId }: LivePlayersTabProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [banDialog, setBanDialog] = useState<{ show: boolean; player: LivePlayer | null }>({
    show: false,
    player: null,
  });
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('0');

  // 2. Fetch Players for selected server
  const {
    data: playerData = { players: [], averagePing: 0 },
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: ['players', selectedServerId],
    queryFn: () => apiFetch(`/api/servers/${selectedServerId}/players`).then((res) => res.json()),
    enabled: !!selectedServerId,
    refetchInterval: 10000, // 10s auto-refresh
  });

  // Fetch Avatars
  const uniqueSteamIds = Array.from(
    new Set(playerData.players?.map((p: LivePlayer) => p.steamId) || [])
  );
  const { data: avatars = {} } = useSteamAvatars(uniqueSteamIds as string[]);

  const players = useMemo(() => playerData.players || [], [playerData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
    toast.success(t('players.player_list_updated'));
  };

  const handleAction = async (action: 'kick' | 'ban', userId: string, player?: LivePlayer) => {
    if (!selectedServerId) return;

    // Show ban dialog for ban action
    if (action === 'ban' && player) {
      setBanDialog({ show: true, player });
      setBanReason('');
      setBanDuration('0');
      return;
    }

    // Kick action
    const reason = 'Kicked by admin';
    const body: Record<string, string> = { reason };

    try {
      const response = await apiFetch(
        `/api/servers/${selectedServerId}/players/${userId}/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (response.ok) {
        toast.success(t(`players.player_${action}ed`));
        queryClient.invalidateQueries({ queryKey: ['players', selectedServerId] });
      }
    } catch {
      toast.error(t(`players.${action}_failed`));
    }
  };

  const confirmBan = async () => {
    if (!banDialog.player || !selectedServerId) return;

    const body = {
      reason: banReason || 'No reason provided',
      playerName: banDialog.player.name,
      steamId: banDialog.player.steamId,
      ipAddress: banDialog.player.ipAddress || '',
      duration: parseInt(banDuration) || 0,
    };

    try {
      const response = await apiFetch(
        `/api/servers/${selectedServerId}/players/${banDialog.player.userId}/ban`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (response.ok) {
        toast.success(t('players.player_banned'));
        queryClient.invalidateQueries({ queryKey: ['players', selectedServerId] });
        setBanDialog({ show: false, player: null });
      } else {
        toast.error(t('players.ban_failed'));
      }
    } catch {
      toast.error(t('players.ban_failed'));
    }
  };

  const filteredPlayers = players.filter(
    (p: LivePlayer) =>
      p &&
      ((p.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (p.steamId?.toLowerCase() || '').includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="bg-[#111827] px-6 py-3 rounded-xl border border-gray-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Users size={18} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">
                {t('players.active_players')}
              </p>
              <p className="text-xl font-bold text-white tracking-tight">{players.length}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              className="w-64 pl-10 pr-4 py-2 bg-[#1d1d1d]/30 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200"
              placeholder={t('players.search_placeholder')}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={!selectedServerId || refreshing}
            className="bg-primary hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center transition-all shadow-lg shadow-blue-500/20 active:scale-95"
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
                <th className="px-6 py-4 border-b border-gray-800/50">
                  {t('players.player_info')}
                </th>
                <th className="px-6 py-4 border-b border-gray-800/50">{t('players.steam_id')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50">
                  {t('serverCard.ip_address')}
                </th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-center">
                  {t('players.connected')}
                </th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-right">
                  {t('players.moderation')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {loading && players.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">
                    {t('players.loading_players')}
                  </td>
                </tr>
              ) : filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">
                    {!selectedServerId
                      ? t('players.select_active_server')
                      : t('players.no_players')}
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player: LivePlayer) => (
                  <tr key={player.userId} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {avatars[player.steamId] ? (
                          <img
                            src={avatars[player.steamId]}
                            alt={player.name}
                            className="w-10 h-10 rounded-xl border border-gray-700 object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback =
                                e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div
                          className={`avatar-fallback w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-primary font-bold border border-gray-700 ${avatars[player.steamId] ? 'hidden' : ''}`}
                        >
                          {player.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-white text-sm block">{player.name}</span>
                          <span className="text-[10px] text-primary font-mono opacity-60 uppercase">
                            {player.state}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-primary font-mono select-all font-semibold">
                      {player.steamId}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-primary font-bold">
                      {player.ipAddress || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-center text-gray-400">
                      {player.connected}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleAction('kick', player.userId)}
                          className="p-2 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-white rounded-lg transition-all"
                          title={t('players.kick_player')}
                        >
                          <UserMinus size={14} />
                        </button>
                        <button
                          onClick={() => handleAction('ban', player.userId, player)}
                          className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                          title={t('players.ban_player')}
                        >
                          <ShieldAlert size={14} />
                        </button>
                        <button className="p-2 bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-all">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ban Confirmation Dialog */}
      {banDialog.show && banDialog.player && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-red-500/10 text-red-500">
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{t('players.ban_dialog_title')}</h3>
                <p className="text-sm text-gray-400">{t('players.ban_dialog_subtitle')}</p>
              </div>
            </div>

            <div className="mb-4 p-4 bg-white/5 rounded-xl border border-gray-800">
              <div className="flex items-center gap-3">
                {banDialog.player.avatar ? (
                  <img
                    src={banDialog.player.avatar}
                    alt={banDialog.player.name}
                    className="w-10 h-10 rounded-xl border border-gray-700"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const fallback =
                        e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                      if (fallback) fallback.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div
                  className={`avatar-fallback w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-red-500 font-bold border border-gray-700 ${banDialog.player.avatar ? 'hidden' : ''}`}
                >
                  {banDialog.player.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-white">{banDialog.player.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{banDialog.player.steamId}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">
                  {t('players.ban_reason')}
                </label>
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder={t('players.ban_reason_placeholder')}
                  className="w-full px-4 py-2 bg-[#0F172A] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">
                  {t('players.ban_duration')}
                </label>
                <select
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value)}
                  className="w-full px-4 py-2 bg-[#0F172A] border border-gray-800 rounded-xl text-white focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
                >
                  <option value="0">{t('players.permanent')}</option>
                  <option value="60">{t('players.1_hour')}</option>
                  <option value="360">{t('players.6_hours')}</option>
                  <option value="720">{t('players.12_hours')}</option>
                  <option value="1440">{t('players.1_day')}</option>
                  <option value="10080">{t('players.1_week')}</option>
                  <option value="43200">{t('players.1_month')}</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setBanDialog({ show: false, player: null })}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold transition-all"
              >
                {t('players.cancel')}
              </button>
              <button
                onClick={confirmBan}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-500/20"
              >
                {t('players.confirm_ban')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LivePlayersTab;
