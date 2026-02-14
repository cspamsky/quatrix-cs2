import { useState, useEffect } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/api';
import socket from '../utils/socket';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Settings as GlobalSettings } from '../types';

// Sub-components
import GeneralTab from '../components/settings/GeneralTab';
// SecurityTab removed - integrated into Profile page
import ServerEngineTab from '../components/settings/ServerEngineTab';
import SystemHealthTab from '../components/settings/SystemHealthTab';
import { useTranslation } from 'react-i18next';

type TabType = 'general' | 'notifications' | 'api_keys' | 'server_engine' | 'system_health';

const Settings = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [user] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : { permissions: [] };
    } catch {
      return { permissions: [] };
    }
  });

  const canManage = user?.permissions?.includes('*') || user?.permissions?.includes('users.manage');

  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // --- Local States for Forms (Controlled Inputs) ---
  const [panelName, setPanelName] = useState('Quatrix Panel');
  const [defaultPort, setDefaultPort] = useState('27015');
  const [steamCmdPath, setSteamCmdPath] = useState('');
  const [installDir, setInstallDir] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [engineMessage, setEngineMessage] = useState({ type: '', text: '' });

  // --- Queries ---

  // 1. Fetch Global Settings
  useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await apiFetch('/api/settings');
      const data = await res.json();
      // Sync local state when data arrives
      setSteamCmdPath(data.steamcmd_path || '');
      setInstallDir(data.install_dir || '');
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // 2. Fetch System Health
  const {
    data: healthData,
    isLoading: healthLoading,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => apiFetch('/api/system/health').then((res) => res.json()),
    enabled: activeTab === 'system_health' || activeTab === 'general',
  });

  // 3. Fetch Timezones
  const { data: timezoneData } = useQuery({
    queryKey: ['system-timezones'],
    queryFn: async () => {
      const res = await apiFetch('/api/system/timezones');
      const data = await res.json();
      if (data.current) setTimezone(data.current);
      return data;
    },
    enabled: activeTab === 'general',
  });

  // --- Mutations ---

  // 1. Update Global Settings
  const updateSettingsMutation = useMutation({
    mutationFn: (updates: Partial<GlobalSettings>) =>
      apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).then((res) => res.json()),
    onSuccess: () => {
      toast.success(t('settings.save_success'));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setEngineMessage({ type: 'success', text: t('settings.engine_save_success') });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('settings.save_error'));
      setEngineMessage({ type: 'error', text: t('settings.engine_save_error') });
    },
  });

  // 2. Download SteamCMD
  const downloadSteamCmdMutation = useMutation({
    mutationFn: (path: string) =>
      apiFetch('/api/settings/steamcmd/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      }).then((res) => {
        if (!res.ok)
          return res.json().then((d) => {
            throw new Error(d.message);
          });
        return res.json();
      }),
    onMutate: () => {
      setEngineMessage({ type: 'info', text: t('settingsEngine.downloading') });
    },
    onSuccess: () => {
      setEngineMessage({
        type: 'success',
        text: t('settingsEngine.extracted'),
      });
      toast.success(t('settingsEngine.installed'));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => {
      setEngineMessage({
        type: 'error',
        text: error.message || t('settingsEngine.failed_download'),
      });
      toast.error(error.message || t('settingsEngine.failed'));
    },
  });

  // 3. Repair System Health
  const repairHealthMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/system/health/repair', { method: 'POST' }).then((res) => res.json()),
    onSuccess: (result: { success: boolean; message?: string }) => {
      if (result.success) {
        toast.success(result.message || t('settingsRepair.success'));
        queryClient.invalidateQueries({ queryKey: ['system-health'] });
      } else {
        toast.error(result.message || t('settingsRepair.fail_generic'));
      }
    },
    onError: () => toast.error(t('settingsRepair.fail_generic')),
  });

  // 4. Update Timezone
  const updateTimezoneMutation = useMutation({
    mutationFn: (newTz: string) =>
      apiFetch('/api/system/timezone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: newTz }),
      }).then((res) => res.json()),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        queryClient.invalidateQueries({ queryKey: ['system-timezones'] });
      } else {
        toast.error(data.message);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tabs: { key: TabType; label: string }[] = [
    { key: 'general', label: t('settings.tab_general') },
    { key: 'server_engine', label: t('settings.tab_server_engine') },
    { key: 'system_health', label: t('settings.tab_system_health') },
    { key: 'notifications', label: t('settings.tab_notifications') },
    { key: 'api_keys', label: t('settings.tab_api_keys') },
  ];

  const handleSaveEngineSettings = () => {
    updateSettingsMutation.mutate({ steamcmd_path: steamCmdPath, install_dir: installDir });
  };

  const handleDownloadSteamCmd = () => {
    downloadSteamCmdMutation.mutate(steamCmdPath);
  };

  return (
    <div className="p-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('settings.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('settings.subtitle')}</p>
        </div>
        <div
          className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border transition-all duration-300 ${
            isConnected
              ? 'bg-green-500/10 border-green-500/20 text-green-500'
              : 'bg-red-500/10 border-red-500/20 text-red-500'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
          ></span>
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">
            {isConnected ? t('dashboard.ws_connected') : t('dashboard.ws_disconnected')}
          </span>
        </div>
      </header>

      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="flex border-b border-gray-800 bg-[#111827] overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-4 text-xs sm:text-sm font-semibold transition-all relative whitespace-nowrap text-center ${
                activeTab === tab.key
                  ? 'text-primary bg-primary/5'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-lg shadow-primary/50"></div>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 p-6 sm:p-8 min-h-[750px] flex flex-col">
          <div className="flex-1">
            {activeTab === 'general' && (
              <GeneralTab
                panelName={panelName}
                setPanelName={setPanelName}
                defaultPort={defaultPort}
                setDefaultPort={setDefaultPort}
                timezone={timezone}
                setTimezone={setTimezone}
                timezones={timezoneData?.timezones || ['UTC']}
                systemInfo={healthData}
                isLoading={healthLoading}
                canEdit={canManage}
              />
            )}

            {activeTab === 'server_engine' && (
              <ServerEngineTab
                steamCmdPath={steamCmdPath}
                setSteamCmdPath={setSteamCmdPath}
                installDir={installDir}
                setInstallDir={setInstallDir}
                engineLoading={
                  updateSettingsMutation.isPending || downloadSteamCmdMutation.isPending
                }
                engineMessage={engineMessage}
                onDownloadSteamCmd={handleDownloadSteamCmd}
                canEdit={canManage}
              />
            )}

            {activeTab === 'system_health' && (
              <SystemHealthTab
                healthData={healthData}
                healthLoading={healthLoading || repairHealthMutation.isPending}
                onRefresh={() => refetchHealth()}
                onRepair={() => repairHealthMutation.mutate()}
                canEdit={canManage}
              />
            )}

            {!['general', 'server_engine', 'system_health'].includes(activeTab) && (
              <div className="py-20 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-300">
                <RefreshCw className="text-primary w-12 h-12 animate-spin-slow opacity-20 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">
                  {tabs.find((t) => t.key === activeTab)?.label} {t('settings.section_title')}
                </h3>
                <p className="text-gray-500 max-w-sm">{t('settings.coming_soon')}</p>
              </div>
            )}
          </div>

          {/* Persistent Action Footer */}
          {canManage && ['general', 'server_engine'].includes(activeTab) && (
            <div className="mt-8 flex justify-end border-t border-gray-800/50 pt-6">
              <button
                onClick={
                  activeTab === 'general'
                    ? () => {
                        updateSettingsMutation.mutate({});
                        if (timezoneData?.current !== timezone) {
                          updateTimezoneMutation.mutate(timezone);
                        }
                      }
                    : handleSaveEngineSettings
                }
                disabled={updateSettingsMutation.isPending || updateTimezoneMutation.isPending}
                className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-10 py-3.5 rounded-xl font-bold text-sm transition-all shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50"
                type="button"
              >
                {updateSettingsMutation.isPending || updateTimezoneMutation.isPending ? (
                  <RefreshCw size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {t('settingsGeneral.save_changes')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
