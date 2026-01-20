import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiFetch } from '../utils/api'

// Sub-components
import GeneralTab from '../components/settings/GeneralTab'
import SecurityTab from '../components/settings/SecurityTab'
import ServerEngineTab from '../components/settings/ServerEngineTab'
import SystemHealthTab from '../components/settings/SystemHealthTab'
import ActivityLogTab from '../components/settings/ActivityLogTab'

type TabType = 'General' | 'Security' | 'Notifications' | 'API Keys' | 'Activity Log' | 'Server Engine' | 'System Health'

const Settings = () => {
  const [activeTab, setActiveTab] = useState<TabType>('General')
  
  // State for General
  const [panelName, setPanelName] = useState('Quatrix Panel')
  const [defaultPort, setDefaultPort] = useState('27015')
  const [autoBackup, setAutoBackup] = useState(true)
  const [autoPluginUpdates, setAutoPluginUpdates] = useState(false)

  // State for Server Engine
  const [steamCmdPath, setSteamCmdPath] = useState('')
  const [installDir, setInstallDir] = useState('')
  const [engineLoading, setEngineLoading] = useState(false)
  const [engineMessage, setEngineMessage] = useState({ type: '', text: '' })

  // State for System Health
  const [healthData, setHealthData] = useState<any>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const tabs: TabType[] = ['General', 'Server Engine', 'System Health', 'Security', 'Notifications', 'API Keys', 'Activity Log']

  useEffect(() => {
    const saved = localStorage.getItem('autoPluginUpdates');
    if (saved !== null) setAutoPluginUpdates(saved === 'true');
    
    if (activeTab === 'Server Engine') fetchSettings()
    else if (activeTab === 'System Health') fetchHealth()
  }, [activeTab])

  const fetchHealth = async () => {
    setHealthLoading(true)
    try {
      const response = await apiFetch('/api/system/health')
      setHealthData(await response.json())
    } catch (error) {
      console.error('Failed to fetch health data:', error)
    } finally {
      setHealthLoading(false)
    }
  }

  const repairSystemHealth = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiFetch('/api/servers/health/repair', { method: 'POST' });
      const result = await response.json();
      
      if (result.success) {
        toast.success(result.message || 'System repaired successfully');
        // Refresh health data after repair
        await fetchHealth();
      } else {
        toast.error(result.message || 'Repair failed');
      }
      
      return result;
    } catch (error: any) {
      const errorMsg = 'Failed to repair system health';
      toast.error(errorMsg);
      return { success: false, message: errorMsg };
    }
  }

  const fetchSettings = async () => {
    try {
      const response = await apiFetch('/api/settings')
      const data = await response.json()
      setSteamCmdPath(data.steamcmd_path || '')
      setInstallDir(data.install_dir || '')
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    }
  }

  const saveEngineSettings = async () => {
    if (engineLoading) return
    setEngineLoading(true)
    try {
      const response = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamcmd_path: steamCmdPath, install_dir: installDir })
      })
      if (response.ok) {
        toast.success('Settings updated successfully!')
        setEngineMessage({ type: 'success', text: 'Cloud Engine settings saved.' })
      } else {
        const errorData = await response.json().catch(() => ({}));
        setEngineMessage({ type: 'error', text: errorData.message || 'Server error while saving settings.' })
        toast.error(errorData.message || 'Failed to update settings')
      }
    } catch (error) {
      setEngineMessage({ type: 'error', text: 'Connection error while saving settings.' })
      toast.error('Connection error: Could not reach the server')
    } finally {
      setEngineLoading(false)
    }
  }

  const downloadSteamCmd = async () => {
    setEngineLoading(true)
    setEngineMessage({ type: 'info', text: 'Downloading SteamCMD... Please wait.' })
    try {
      const response = await apiFetch('/api/settings/steamcmd/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: steamCmdPath })
      })
      if (response.ok) {
        setEngineMessage({ type: 'success', text: 'SteamCMD downloaded and extracted successfully!' })
        toast.success('SteamCMD installed successfully!')
      } else {
        const data = await response.json()
        setEngineMessage({ type: 'error', text: data.message || 'Failed to download SteamCMD.' })
      }
    } catch (error) {
      setEngineMessage({ type: 'error', text: 'Network error while downloading SteamCMD.' })
    } finally {
      setEngineLoading(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Settings</h2>
          <p className="text-sm text-gray-400 mt-1">Configure your panel settings and security preferences</p>
        </div>
        <div className="flex items-center px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-500 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
          WebSocket Connected
        </div>
      </div>

      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="px-6 border-b border-gray-800 flex space-x-8 bg-[#111827] overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 text-sm font-semibold transition-all relative whitespace-nowrap ${
                activeTab === tab ? 'text-primary' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab}
              {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-lg shadow-primary/50"></div>}
            </button>
          ))}
        </div>

        <div className="p-8">
          {activeTab === 'General' && (
            <GeneralTab 
              panelName={panelName} setPanelName={setPanelName}
              defaultPort={defaultPort} setDefaultPort={setDefaultPort}
              autoBackup={autoBackup} setAutoBackup={setAutoBackup}
              autoPluginUpdates={autoPluginUpdates} setAutoPluginUpdates={setAutoPluginUpdates}
              onSave={() => toast.success('Local settings saved')}
            />
          )}

          {activeTab === 'Server Engine' && (
            <ServerEngineTab 
              steamCmdPath={steamCmdPath} setSteamCmdPath={setSteamCmdPath}
              installDir={installDir} setInstallDir={setInstallDir}
              engineLoading={engineLoading} engineMessage={engineMessage}
              onDownloadSteamCmd={downloadSteamCmd}
              onSave={saveEngineSettings}
            />
          )}

          {activeTab === 'System Health' && (
            <SystemHealthTab 
              healthData={healthData} 
              healthLoading={healthLoading} 
              onRefresh={fetchHealth}
              onRepair={repairSystemHealth}
            />
          )}

          {activeTab === 'Security' && <SecurityTab />}

          {activeTab === 'Activity Log' && <ActivityLogTab />}

          {!['General', 'Server Engine', 'System Health', 'Security', 'Activity Log'].includes(activeTab) && (
            <div className="py-20 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-300">
              <RefreshCw className="text-primary w-12 h-12 animate-spin-slow opacity-20 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">{activeTab} Section</h3>
              <p className="text-gray-500 max-w-sm">Coming soon in the next update.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Settings
