import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { Users, Clock, ShieldAlert, Server } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

// Sub-components
import LivePlayersTab from '../components/players/LivePlayersTab';
import JoinLogsTab from '../components/players/JoinLogsTab';
import BanHistoryTab from '../components/players/BanHistoryTab';
import { useTranslation } from 'react-i18next';

interface ServerInfo {
  id: number;
  name: string;
  status: string;
}

type TabType = 'live' | 'logs' | 'bans';

const Players = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('live');
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);

  // 1. Fetch Servers
  const { data: servers = [] } = useQuery<ServerInfo[]>({
    queryKey: ['servers'],
    queryFn: () => apiFetch('/api/servers').then((res) => res.json()),
    select: (data: ServerInfo[]) => data.filter((s: ServerInfo) => s.status === 'ONLINE'),
  });

  // Auto-select first server
  useEffect(() => {
    if (servers.length > 0 && !selectedServerId) {
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId]);

  const tabs = [
    { id: 'live' as const, label: t('players.live_players'), icon: Users },
    { id: 'logs' as const, label: t('players.join_logs'), icon: Clock },
    { id: 'bans' as const, label: t('players.ban_history'), icon: ShieldAlert },
  ];

  return (
    <div className="p-6 font-display h-full flex flex-col">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('players.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('players.subtitle')}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <select
              className="bg-[#111827] border border-gray-800 text-white pl-10 pr-8 py-2 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none text-sm appearance-none cursor-pointer"
              value={selectedServerId || ''}
              onChange={(e) => setSelectedServerId(Number(e.target.value))}
            >
              <option value="" disabled>
                {t('players.select_server')}
              </option>
              {servers.map((s: ServerInfo) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl flex-1 flex flex-col">
        <div className="px-6 border-b border-gray-800 flex space-x-8 bg-[#111827] overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 text-sm font-semibold transition-all relative whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.id ? 'text-primary' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-lg shadow-primary/50"></div>
              )}
            </button>
          ))}
        </div>

        <div className="p-8 flex-1 overflow-y-auto scrollbar-hide">
          {activeTab === 'live' && <LivePlayersTab selectedServerId={selectedServerId} />}

          {activeTab === 'logs' && <JoinLogsTab selectedServerId={selectedServerId} />}

          {activeTab === 'bans' && <BanHistoryTab selectedServerId={selectedServerId} />}
        </div>
      </div>
    </div>
  );
};

export default Players;
