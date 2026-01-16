import { useState, useEffect } from 'react'
import { 
  Settings as SettingsIcon, 
  Shield, 
  Lock, 
  Smartphone, 
  AlertTriangle,
  Save,
  RefreshCw,
  Terminal,
  Server,
  Database,
  Monitor,
  Download,
  FolderOpen,
  Activity
} from 'lucide-react'
import { apiFetch } from '../utils/api'
import { useNotification } from '../contexts/NotificationContext'


type TabType = 'General' | 'Security' | 'Notifications' | 'API Keys' | 'Activity Log' | 'Server Engine' | 'System Health'

const Settings = () => {
  const { showNotification } = useNotification()
  const [activeTab, setActiveTab] = useState<TabType>('General')
  const [panelName, setPanelName] = useState('CS2 Server Manager')
  const [defaultPort, setDefaultPort] = useState('27015')
  const [autoBackup, setAutoBackup] = useState(true)
  const [autoPluginUpdates, setAutoPluginUpdates] = useState(false)

  // Server Engine Settings
  const [steamCmdPath, setSteamCmdPath] = useState('')
  const [installDir, setInstallDir] = useState('')
  const [engineLoading, setEngineLoading] = useState(false)
  const [engineMessage, setEngineMessage] = useState({ type: '', text: '' })

  const tabs: TabType[] = ['General', 'Server Engine', 'System Health', 'Security', 'Notifications', 'API Keys', 'Activity Log']

  useEffect(() => {
    // Load settings from localStorage
    const savedAutoPluginUpdates = localStorage.getItem('autoPluginUpdates');
    if (savedAutoPluginUpdates !== null) {
      setAutoPluginUpdates(savedAutoPluginUpdates === 'true');
    }
  }, []);

  const [healthData, setHealthData] = useState<any>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  useEffect(() => {
    if (activeTab === 'Server Engine') {
      fetchSettings()
    } else if (activeTab === 'System Health') {
      fetchHealth()
    }
  }, [activeTab])

  const fetchHealth = async () => {
    setHealthLoading(true)
    try {
      const response = await apiFetch('/api/system/health')
      const data = await response.json()
      setHealthData(data)
    } catch (error) {
      console.error('Failed to fetch health data:', error)
    } finally {
      setHealthLoading(false)
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
    if (engineLoading) return; // Guard against multiple clicks
    setEngineLoading(true)
    // Don't clear message immediately to prevent sudden layout jump
    try {
      const response = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          steamcmd_path: steamCmdPath,
          install_dir: installDir
        })
      })

      if (response.ok) {
        setEngineMessage({ type: 'success', text: 'Settings saved successfully' })
      } else {
        setEngineMessage({ type: 'error', text: 'Failed to save settings' })
      }
    } catch (error) {
      setEngineMessage({ type: 'error', text: 'Connection error' })
    } finally {
      setEngineLoading(false)
    }
  }

  const downloadSteamCmd = async () => {
    if (engineLoading) return; // Guard against multiple clicks
    setEngineLoading(true)
    setEngineMessage({ type: 'info', text: 'Downloading SteamCMD... Please wait.' })
    try {
      const response = await apiFetch('/api/settings/steamcmd/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: steamCmdPath })
      })

      const data = await response.json()
      if (response.ok) {
        setEngineMessage({ type: 'success', text: data.message })
      } else {
        setEngineMessage({ type: 'error', text: data.message })
      }
    } catch (error) {
      setEngineMessage({ type: 'error', text: 'Download failed' })
    } finally {
      setEngineLoading(false)
    }
  }

  return (
    <div className="p-6 font-display">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Settings</h2>
          <p className="text-sm text-gray-400 mt-1">Configure your panel settings and security preferences</p>
        </div>
        <div className="flex space-x-3">
          <div className="flex items-center px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-500 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
            WebSocket Connected
          </div>
        </div>
      </div>

      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        {/* Tabs Navigation */}
        <div className="px-6 border-b border-gray-800 flex space-x-8 bg-[#111827] overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 text-sm font-semibold transition-all relative whitespace-nowrap ${
                activeTab === tab 
                  ? 'text-primary' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-lg shadow-primary/50"></div>
              )}
            </button>
          ))}
        </div>

        <div className="p-8">
          {activeTab === 'General' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-8">
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <SettingsIcon className="text-primary w-5 h-5" />
                    <h3 className="text-lg font-bold text-white tracking-tight">General Configuration</h3>
                  </div>
                  <form className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Panel Name</label>
                      <input 
                        className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                        type="text" 
                        value={panelName}
                        onChange={(e) => setPanelName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Default Server Port</label>
                      <input 
                        className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                        type="number" 
                        value={defaultPort}
                        onChange={(e) => setDefaultPort(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-5 bg-[#0d1624] rounded-2xl border border-gray-800/50">
                      <div>
                        <p className="text-sm font-bold text-white">Automatic Backups</p>
                        <p className="text-xs text-gray-500 mt-1">Backup server data every 24 hours</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={autoBackup}
                          onChange={(e) => setAutoBackup(e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-5 bg-[#0d1624] rounded-2xl border border-gray-800/50">
                      <div>
                        <p className="text-sm font-bold text-white">Auto Plugin Updates</p>
                        <p className="text-xs text-gray-500 mt-1">Automatically update MatchZy & SimpleAdmin when new versions are available</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={autoPluginUpdates}
                          onChange={(e) => setAutoPluginUpdates(e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                    <button 
                      onClick={() => {
                        localStorage.setItem('autoPluginUpdates', autoPluginUpdates.toString());
                        showNotification('success', 'Settings saved successfully!');
                      }}
                      className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 active:scale-95" 
                      type="button"
                    >
                      <Save size={18} />
                      Save Changes
                    </button>
                  </form>
                </div>
              </div>

              <div className="space-y-10">
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <Shield className="text-primary w-5 h-5" />
                    <h3 className="text-lg font-bold text-white tracking-tight">Quick Security Overview</h3>
                  </div>
                  <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-4">
                    <div className="flex items-center space-x-2 mb-2 text-primary">
                      <Lock className="text-lg w-4 h-4" />
                      <span className="text-xs font-black uppercase tracking-widest">Change Account Password</span>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Current Password</label>
                        <input className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm transition-all" placeholder="••••••••" type="password"/>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">New Password</label>
                        <input className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm transition-all" placeholder="••••••••" type="password"/>
                      </div>
                      <button className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-bold border border-gray-700 transition-all active:scale-[0.98]">
                        Update Password
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="p-2.5 bg-primary/10 rounded-xl">
                        <Smartphone className="text-primary w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-white font-bold">Two-Factor Authentication</h4>
                        <p className="text-xs text-gray-500 mt-1 max-w-[280px] leading-relaxed">Add an extra layer of security to your account by enabling 2FA using Google Authenticator.</p>
                      </div>
                    </div>
                    <button className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-widest">Enable</button>
                  </div>
                </div>

                <div className="pt-4 px-2">
                  <h3 className="text-xs font-black text-red-500 mb-4 uppercase tracking-[0.2em] flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Danger Zone
                  </h3>
                  <div className="p-6 border border-red-900/20 bg-red-950/10 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-200">Factory Reset Panel</p>
                      <p className="text-xs text-gray-500 mt-1">This will clear all settings and instance data.</p>
                    </div>
                    <button className="px-5 py-2.5 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-[10px] font-black transition-all uppercase tracking-widest active:scale-95">
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Server Engine' && (
            <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-2 mb-8">
                <Monitor className="text-primary w-6 h-6" />
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Server Engine Configuration</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Manage SteamCMD and core game installation paths.</p>
                </div>
              </div>

              {engineMessage.text && (
                <div className={`mb-6 p-4 rounded-xl border ${
                  engineMessage.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
                  engineMessage.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                  'bg-blue-500/10 border-blue-500/20 text-blue-500'
                } text-sm flex items-center gap-2`}>
                  {engineMessage.type === 'success' && <Shield size={16} />}
                  {engineMessage.type === 'error' && <AlertTriangle size={16} />}
                  {engineMessage.type === 'info' && <RefreshCw size={16} className="animate-spin" />}
                  {engineMessage.text}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-400">SteamCMD Executable Path</label>
                        <button 
                          onClick={downloadSteamCmd}
                          disabled={engineLoading}
                          className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"
                        >
                          <Download size={12} />
                          Download Online
                        </button>
                      </div>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors">
                          <Terminal size={18} />
                        </div>
                        <input 
                          className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-700 text-sm" 
                          type="text" 
                          placeholder="C:\steamcmd\steamcmd.exe"
                          value={steamCmdPath}
                          onChange={(e) => setSteamCmdPath(e.target.value)}
                        />
                      </div>
                      <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
                        Absolute path to your <b>steamcmd.exe</b>. If you don't have it, click 'Download Online'.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Game Library Path</label>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors">
                          <FolderOpen size={18} />
                        </div>
                        <input 
                          className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-700 text-sm" 
                          type="text" 
                          placeholder="D:\CS2_Servers"
                          value={installDir}
                          onChange={(e) => setInstallDir(e.target.value)}
                        />
                      </div>
                      <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
                        Where individual CS2 server instances will be installed. Make sure you have enough disk space (avg. 35GB per instance).
                      </p>
                    </div>

                    <button 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        saveEngineSettings();
                      }}
                      disabled={engineLoading}
                      className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
                    >
                      {engineLoading ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                      Update Cloud Engine
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-8 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl border border-primary/20">
                    <h4 className="text-primary font-black uppercase tracking-widest text-xs mb-4">Pro Tip: Space Management</h4>
                    <p className="text-gray-400 text-sm leading-relaxed mb-6">
                      Running multiple CS2 servers can consume significant disk space. 
                      We recommend using an <b>SSD</b> for game files to ensure fast loading times and better server performance.
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-xs text-gray-300">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                        One instance: ~35 GB
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-300">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                        Five instances: ~175 GB
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="p-2.5 bg-orange-500/10 rounded-xl">
                          <AlertTriangle className="text-orange-500 w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-white font-bold">Automatic Updates</h4>
                          <p className="text-xs text-gray-500 mt-1 max-w-[280px] leading-relaxed">
                            Should servers automatically check for Steam updates on startup?
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-10 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'System Health' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <Monitor className="text-primary w-6 h-6" />
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">System Environment Check</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Verify your server meets all requirements for CS2 and plugins.</p>
                  </div>
                </div>
                <button 
                  onClick={fetchHealth}
                  disabled={healthLoading}
                  className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors"
                >
                  <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} />
                  Refresh Check
                </button>
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
                                href="https://dotnet.microsoft.com/en-us/download/dotnet/8.0" 
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

                      <div className={`flex items-center justify-between p-4 rounded-xl border ${healthData?.runtimes?.vcruntime?.status === 'good' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${healthData?.runtimes?.vcruntime?.status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            <Lock size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">Visual C++ Redistributable</p>
                            <p className="text-[10px] text-gray-500">vcruntime140.dll check</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {healthData?.runtimes?.vcruntime?.status !== 'good' && (
                            <a 
                              href="https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest"
                            >
                              Download
                            </a>
                          )}
                          <span className={`text-[10px] font-black uppercase tracking-widest ${healthData?.runtimes?.vcruntime?.status === 'good' ? 'text-green-500' : 'text-red-500'}`}>
                            {healthData?.runtimes?.vcruntime?.status === 'good' ? 'Installed' : 'Missing'}
                          </span>
                        </div>
                      </div>

                      <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                        <div className="flex gap-3">
                          <AlertTriangle className="text-primary shrink-0" size={16} />
                          <p className="text-[10px] text-gray-400 leading-relaxed">
                            If any items are <span className="text-red-500">Missing</span>, the CS2 server or certain plugins may fail to load. Please install the required packages from the Microsoft website and restart the panel.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Activity Log' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-2 mb-6">
                <Terminal className="text-[#1890ff]" size={20} />
                <h3 className="text-lg font-bold text-white">Recent Activities</h3>
              </div>
              <div className="space-y-4 max-h-[600px] overflow-y-auto scrollbar-hide">
                {/* Activity Item */}
                <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
                  <div className="p-2 rounded-lg bg-green-500/10 text-green-500 shrink-0">
                    <Server size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">Server Started</p>
                    <p className="text-xs text-gray-400 mt-1">CS2-Server-01 has been successfully started</p>
                    <p className="text-xs text-gray-500 mt-2">2 minutes ago</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                    <Terminal size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">Console Command Executed</p>
                    <p className="text-xs text-gray-400 mt-1 font-mono">mp_roundtime 5</p>
                    <p className="text-xs text-gray-500 mt-2">15 minutes ago</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
                    <Database size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">Map Changed</p>
                    <p className="text-xs text-gray-400 mt-1">Changed to de_dust2</p>
                    <p className="text-xs text-gray-500 mt-2">1 hour ago</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
                    <Monitor size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">System Update</p>
                    <p className="text-xs text-gray-400 mt-1">Server configuration updated successfully</p>
                    <p className="text-xs text-gray-500 mt-2">3 hours ago</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
                  <div className="p-2 rounded-lg bg-red-500/10 text-red-500 shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">Security Alert</p>
                    <p className="text-xs text-gray-400 mt-1">Failed login attempt detected</p>
                    <p className="text-xs text-gray-500 mt-2">5 hours ago</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
                  <div className="p-2 rounded-lg bg-green-500/10 text-green-500 shrink-0">
                    <Shield size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">Password Changed</p>
                    <p className="text-xs text-gray-400 mt-1">Account password was successfully updated</p>
                    <p className="text-xs text-gray-500 mt-2">1 day ago</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'General' && activeTab !== 'Activity Log' && activeTab !== 'Server Engine' && activeTab !== 'System Health' && (
            <div className="py-20 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-300">
              <div className="p-4 bg-primary/5 rounded-full mb-4">
                <RefreshCw className="text-primary w-12 h-12 animate-spin-slow opacity-20" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{activeTab} Section</h3>
              <p className="text-gray-500 max-w-sm">We're currently implementing this settings module. It will be available in the next stable update.</p>
              <button 
                onClick={() => setActiveTab('General')}
                className="mt-6 text-primary text-sm font-bold hover:underline"
              >
                Back to General
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

export default Settings
