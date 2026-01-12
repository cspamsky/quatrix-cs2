import { 
  Search, 
  Plus, 
  Users, 
  Hash, 
  Play, 
  Square, 
  Terminal, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Trash2,
  Download,
  RefreshCw,
  RotateCcw,
  FileText
} from 'lucide-react'
import { apiFetch } from '../utils/api'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'

const socket = io('http://localhost:3001')

interface Instance {
  id: number
  name: string
  map: string
  status: 'ONLINE' | 'OFFLINE' | 'STARTING' | 'INSTALLING'
  current_players: number
  max_players: number
  port: number
  image?: string
  isInstalled?: boolean
}

const Instances = () => {
  const navigate = useNavigate()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [instances, setInstances] = useState<Instance[]>([])
  const [serverIp, setServerIp] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [installingId, setInstallingId] = useState<number | null>(null)
  const [restartingId, setRestartingId] = useState<number | null>(null)

  useEffect(() => {
    fetchServers()
    fetchSystemInfo()

    // Listen for real-time status updates
    socket.on('status_update', ({ serverId, status }: { serverId: number, status: string }) => {
      setInstances(prev => 
        prev.map(instance => 
          instance.id === serverId 
            ? { ...instance, status: status as Instance['status'] }
            : instance
        )
      )
    })

    return () => {
      socket.off('status_update')
    }
  }, [])

  const fetchSystemInfo = async () => {
    try {
      const response = await apiFetch('http://localhost:3001/api/system-info')
      if (response.ok) {
        const data = await response.json()
        setServerIp(data.publicIp || window.location.hostname)
      }
    } catch (error) {
      console.error('Failed to fetch system info:', error)
      setServerIp(window.location.hostname)
    }
  }

  const fetchServers = async () => {
    try {
      const response = await apiFetch('http://localhost:3001/api/servers')
      const data = await response.json()
      setInstances(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch servers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteServer = async (id: number) => {
    if (!confirm('Are you sure you want to delete this server instance? All data will be permanently removed.')) return
    
    setDeletingId(id)
    try {
      const response = await apiFetch(`http://localhost:3001/api/servers/${id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setInstances(prev => prev.filter(i => i.id !== id))
      } else {
        alert('Failed to delete server')
      }
    } catch (error) {
      console.error('Delete server error:', error)
      alert('Connection error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleInstall = async (id: number) => {
    setInstallingId(id)
    try {
      const response = await apiFetch(`http://localhost:3001/api/servers/${id}/install`, {
        method: 'POST'
      })
      if (response.ok) {
        navigate(`/instances/${id}/console`)
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to start installation')
      }
    } catch (error) {
      console.error('Install error:', error)
      alert('Connection error')
    } finally {
      setInstallingId(null)
    }
  }

  const handleStartServer = async (id: number) => {
    try {
      const response = await apiFetch(`http://localhost:3001/api/servers/${id}/start`, {
        method: 'POST'
      })
      if (response.ok) {
        fetchServers()
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to start server')
      }
    } catch (error) {
      console.error('Start server error:', error)
      alert('Connection error')
    }
  }

  const handleStopServer = async (id: number) => {
    try {
      const response = await apiFetch(`http://localhost:3001/api/servers/${id}/stop`, {
        method: 'POST'
      })
      if (response.ok) {
        fetchServers()
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to stop server')
      }
    } catch (error) {
      console.error('Stop server error:', error)
      alert('Connection error')
    }
  }

  const handleRestartServer = async (id: number) => {
    setRestartingId(id)
    try {
      const response = await apiFetch(`http://localhost:3001/api/servers/${id}/restart`, {
        method: 'POST'
      })
      if (response.ok) {
        fetchServers()
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to restart server')
      }
    } catch (error) {
      console.error('Restart error:', error)
      alert('Connection error')
    } finally {
      setRestartingId(null)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="p-6 min-h-screen flex flex-col">
      <div className="flex-1">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Server Instances</h2>
            <p className="text-sm text-gray-400 mt-1">Manage and monitor your dedicated CS2 server instances in real-time.</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <input 
                className="w-64 pl-10 pr-4 py-2 bg-[#111827] border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200" 
                placeholder="Filter instances..." 
                type="text"
              />
            </div>
            <button 
              onClick={() => navigate('/instances/create')}
              className="bg-primary hover:bg-blue-600 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center transition-all shadow-lg shadow-blue-500/20 active:scale-95"
            >
              <Plus className="mr-2 w-4 h-4" />
              Create New Instance
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400">Loading servers...</div>
          </div>
        ) : instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-gray-400 mb-4">No servers found. Create your first server to get started!</p>
            <button 
              onClick={() => navigate('/instances/create')}
              className="px-6 py-2 bg-primary hover:bg-blue-600 text-white rounded-xl font-semibold transition-all"
            >
              Create Server
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {instances.map((instance) => (
            <div 
              key={instance.id} 
              className={`bg-[#111827] rounded-xl border border-gray-800/50 overflow-hidden flex flex-col group hover:border-primary/50 transition-all duration-300 ${
                instance.status === 'OFFLINE' ? 'opacity-70 grayscale-[0.5]' : ''
              }`}
            >
              <div className="relative h-32 overflow-hidden bg-gray-900">
                <img 
                  alt={`Map ${instance.map}`} 
                  className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500" 
                  src={instance.image || "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=400"}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111827] to-transparent"></div>
                
                <div className="absolute top-3 left-3 flex items-center">
                  {instance.status === 'ONLINE' && (
                    <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20 flex items-center backdrop-blur-md shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
                      ONLINE
                    </div>
                  )}
                  {instance.status === 'OFFLINE' && (
                    <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20 flex items-center backdrop-blur-md shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 mr-1.5"></span>
                      OFFLINE
                    </div>
                  )}
                  {instance.status === 'STARTING' && (
                     <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 flex items-center backdrop-blur-md shadow-sm">
                      <div className="w-2 h-2 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin mr-1.5"></div>
                      STARTING
                    </div>
                  )}
                  {instance.status === 'INSTALLING' && (
                     <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20 flex items-center backdrop-blur-md shadow-sm">
                      <div className="w-2 h-2 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mr-1.5"></div>
                      INSTALLING
                    </div>
                  )}
                </div>

                <div className="absolute bottom-3 left-3">
                  <p className="text-white text-[10px] font-bold tracking-widest uppercase opacity-80">{instance.map}</p>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-white truncate text-sm">{instance.name}</h3>
                  <span className="text-[10px] text-gray-500 font-mono">ID: {instance.id}</span>
                </div>
                
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 flex items-center">
                      <Users className="w-3.5 h-3.5 mr-2 opacity-70" /> Players
                    </span>
                    <span className="text-white font-medium">{instance.current_players} / {instance.max_players}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 flex items-center">
                      <Hash className="w-3.5 h-3.5 mr-2 opacity-70" /> IP Address
                    </span>
                    <button
                      type="button"
                      aria-label="Copy server address"
                      title="Copy server address"
                      className="flex items-center gap-1.5 text-primary hover:text-blue-400 transition-colors group/ip bg-transparent border-0 p-0"
                      onClick={() => copyToClipboard(`${serverIp}:${instance.port}`, instance.id.toString())}
                    >
                      <span className="font-mono">{serverIp || 'Detecting...'}{serverIp ? `:${instance.port}` : ''}</span>
                      {copiedId === instance.id.toString() ? (
                        <Check size={12} />
                      ) : (
                        <Copy
                          size={12}
                          className="opacity-0 group-hover/ip:opacity-100 group-focus-visible/ip:opacity-100 transition-opacity"
                        />
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-2 pt-4 border-t border-gray-800/60">
                  {!instance.isInstalled ? (
                    <button 
                      onClick={() => handleInstall(instance.id)}
                      disabled={installingId === instance.id || instance.status === 'INSTALLING'}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded text-[11px] font-semibold transition-all flex items-center justify-center shadow-lg shadow-orange-500/10 disabled:opacity-50"
                    >
                      {installingId === instance.id || instance.status === 'INSTALLING' ? (
                        <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3 mr-1.5" />
                      )}
                      {instance.status === 'INSTALLING' ? 'Installing...' : 'Install Server'}
                    </button>
                  ) : (
                    <>
                      {instance.status === 'OFFLINE' ? (
                        <button 
                          onClick={() => handleStartServer(instance.id)}
                          className="flex-1 bg-primary hover:bg-blue-600 text-white py-2 rounded text-[11px] font-semibold transition-all flex items-center justify-center shadow-lg shadow-primary/10"
                        >
                          <Play className="w-3 h-3 mr-1.5" /> Start
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={() => handleStopServer(instance.id)}
                            className="flex-1 bg-gray-800/40 hover:bg-red-500/10 hover:text-red-500 py-2 rounded text-[11px] font-semibold transition-all flex items-center justify-center border border-gray-800/40"
                          >
                            <Square className="w-3 h-3 mr-1.5 fill-current" /> Stop
                          </button>
                          <button 
                            onClick={() => handleRestartServer(instance.id)}
                            disabled={restartingId === instance.id}
                            className="p-2 bg-gray-800/40 hover:bg-amber-500/10 hover:text-amber-500 rounded transition-all border border-gray-800/40 disabled:opacity-50"
                            title="Restart Server"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${restartingId === instance.id ? 'animate-spin' : ''}`} />
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => navigate(`/instances/${instance.id}/console`)}
                        className="flex-1 bg-gray-800/40 hover:bg-primary/10 hover:text-primary py-2 rounded text-[11px] font-semibold transition-all flex items-center justify-center border border-gray-800/40"
                      >
                        <Terminal className="w-3 h-3 mr-1.5" /> Console
                      </button>
                    </>
                  )}
                  <button 
                    aria-label="Server settings"
                    onClick={() => navigate(`/instances/${instance.id}/settings`)}
                    className="p-2 bg-gray-800/40 hover:bg-gray-700/40 rounded transition-all border border-gray-800/40 text-gray-400 hover:text-white"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    aria-label="File Manager"
                    onClick={() => navigate(`/instances/${instance.id}/files`)}
                    disabled={!instance.isInstalled}
                    className="p-2 bg-gray-800/40 hover:bg-gray-700/40 rounded transition-all border border-gray-800/40 text-gray-400 hover:text-white disabled:opacity-30"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    aria-label="Delete server"
                    onClick={() => handleDeleteServer(instance.id)}
                    disabled={deletingId === instance.id}
                    className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded transition-all border border-red-500/20 text-red-500 flex items-center justify-center disabled:opacity-50"
                  >
                    {deletingId === instance.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            ))}
          </div>
        )}
      </div>

      {!loading && instances.length > 0 && (
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-[#111827] rounded-xl border border-gray-800/60">
          <div className="flex items-center space-x-10">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Total Active</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl font-bold text-white">{instances.filter(i => i.status === 'ONLINE').length}</span>
                <span className="text-gray-500 text-sm">/ {instances.length}</span>
              </div>
            </div>
            <div className="w-px h-8 bg-gray-800"></div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Player Count</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl font-bold text-white">{instances.reduce((sum, i) => sum + i.current_players, 0)}</span>
                <span className="text-gray-500 text-sm">/ {instances.reduce((sum, i) => sum + i.max_players, 0)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              aria-label="Previous page"
              className="p-2 border border-gray-800 rounded-md hover:bg-gray-800 text-gray-500 disabled:opacity-30 disabled:hover:bg-transparent transition-colors" 
              disabled
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center bg-primary text-white rounded-md text-xs font-bold shadow-sm">1</button>
            <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-800 rounded-md text-xs font-medium transition-colors">2</button>
            <button 
              aria-label="Next page"
              className="p-2 border border-gray-800 rounded-md hover:bg-gray-800 text-gray-500 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Instances
