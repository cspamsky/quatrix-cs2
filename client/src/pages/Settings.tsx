import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiFetch } from '../utils/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Sub-components
import GeneralTab from '../components/settings/GeneralTab'
// SecurityTab removed - integrated into Profile page
import ServerEngineTab from '../components/settings/ServerEngineTab'
import SystemHealthTab from '../components/settings/SystemHealthTab'
import ActivityLogTab from '../components/settings/ActivityLogTab'
import { useTranslation } from 'react-i18next'

type TabType = 'general' | 'notifications' | 'api_keys' | 'activity_log' | 'server_engine' | 'system_health'

const Settings = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('general')
  
  // --- Local States for Forms (Controlled Inputs) ---
  const [panelName, setPanelName] = useState('Quatrix Panel')
  const [defaultPort, setDefaultPort] = useState('27015')
  const [autoBackup, setAutoBackup] = useState(true)
  const [autoPluginUpdates, setAutoPluginUpdates] = useState(false)
  const [steamCmdPath, setSteamCmdPath] = useState('')
  const [installDir, setInstallDir] = useState('')
  const [engineMessage, setEngineMessage] = useState({ type: '', text: '' })

  // --- Queries ---
  
  // 1. Fetch Global Settings
  useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await apiFetch('/api/settings')
      const data = await res.json()
      // Sync local state when data arrives
      setSteamCmdPath(data.steamcmd_path || '')
      setInstallDir(data.install_dir || '')
      // You could sync other fields here if they were in API
      return data
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // 2. Fetch System Health
  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => apiFetch('/api/system/health').then(res => res.json()),
    enabled: activeTab === 'system_health',
  })

  // --- Mutations ---

  // 1. Update Global Settings
  const updateSettingsMutation = useMutation({
    mutationFn: (updates: any) => apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    }).then(res => res.json()),
    onSuccess: () => {
      toast.success(t('settings.save_success'))
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setEngineMessage({ type: 'success', text: t('settings.engine_save_success') })
    },
    onError: (error: any) => {
      toast.error(error.message || t('settings.save_error'))
      setEngineMessage({ type: 'error', text: t('settings.engine_save_error') })
    }
  })

  // 2. Download SteamCMD
  const downloadSteamCmdMutation = useMutation({
    mutationFn: (path: string) => apiFetch('/api/settings/steamcmd/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    }).then(res => {
      if (!res.ok) return res.json().then(d => { throw new Error(d.message) })
      return res.json()
    }),
    onMutate: () => {
      setEngineMessage({ type: 'info', text: 'Downloading SteamCMD... Please wait.' })
    },
    onSuccess: () => {
      setEngineMessage({ type: 'success', text: 'SteamCMD downloaded and extracted successfully!' })
      toast.success('SteamCMD installed successfully!')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: any) => {
      setEngineMessage({ type: 'error', text: error.message || 'Failed to download SteamCMD.' })
      toast.error(error.message || 'Download failed')
    }
  })

  // 3. Repair System Health
  const repairHealthMutation = useMutation({
    mutationFn: () => apiFetch('/api/servers/health/repair', { method: 'POST' }).then(res => res.json()),
    onSuccess: (result: any) => {
      if (result.success) {
        toast.success(result.message || 'System repaired successfully')
        queryClient.invalidateQueries({ queryKey: ['system-health'] })
      } else {
        toast.error(result.message || t('settings.repair_fail'))
      }
    },
    onError: () => toast.error(t('settings.repair_fail_generic'))
  })

  const tabs: { key: TabType; label: string }[] = [
    { key: 'general', label: t('settings.tab_general') },
    { key: 'server_engine', label: t('settings.tab_server_engine') },
    { key: 'system_health', label: t('settings.tab_system_health') },
    { key: 'activity_log', label: t('settings.tab_activity_log') },
    { key: 'notifications', label: t('settings.tab_notifications') },
    { key: 'api_keys', label: t('settings.tab_api_keys') }
  ]

  const handleSaveEngineSettings = () => {
    updateSettingsMutation.mutate({ steamcmd_path: steamCmdPath, install_dir: installDir })
  }

  const handleDownloadSteamCmd = () => {
    downloadSteamCmdMutation.mutate(steamCmdPath)
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('settings.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('settings.subtitle')}</p>
        </div>
        <div className="flex items-center px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-500 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
          {t('settings.websocket_connected')}
        </div>
      </div>

      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="px-6 border-b border-gray-800 flex space-x-8 bg-[#111827] overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-4 text-sm font-semibold transition-all relative whitespace-nowrap ${
                activeTab === tab.key ? 'text-primary' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-lg shadow-primary/50"></div>}
            </button>
          ))}
        </div>

        <div className="p-8">
          {activeTab === 'general' && (
            <GeneralTab 
              panelName={panelName} setPanelName={setPanelName}
              defaultPort={defaultPort} setDefaultPort={setDefaultPort}
              autoBackup={autoBackup} setAutoBackup={setAutoBackup}
              autoPluginUpdates={autoPluginUpdates} setAutoPluginUpdates={setAutoPluginUpdates}
              onSave={() => toast.success(t('settings.local_save_success'))}
            />
          )}

          {activeTab === 'server_engine' && (
            <ServerEngineTab 
              steamCmdPath={steamCmdPath} setSteamCmdPath={setSteamCmdPath}
              installDir={installDir} setInstallDir={setInstallDir}
              engineLoading={updateSettingsMutation.isPending || downloadSteamCmdMutation.isPending} 
              engineMessage={engineMessage}
              onDownloadSteamCmd={handleDownloadSteamCmd}
              onSave={handleSaveEngineSettings}
            />
          )}

          {activeTab === 'system_health' && (
            <SystemHealthTab 
              healthData={healthData} 
              healthLoading={healthLoading || repairHealthMutation.isPending} 
              onRefresh={() => refetchHealth()}
              onRepair={() => repairHealthMutation.mutate()}
            />
          )}



          {activeTab === 'activity_log' && <ActivityLogTab />}

          {!['general', 'server_engine', 'system_health', 'activity_log'].includes(activeTab) && (
            <div className="py-20 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-300">
              <RefreshCw className="text-primary w-12 h-12 animate-spin-slow opacity-20 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">{tabs.find(t => t.key === activeTab)?.label} {t('settings.section_title')}</h3>
              <p className="text-gray-500 max-w-sm">{t('settings.coming_soon')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Settings
