import { 
  Search, 
  Plus, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { apiFetch } from '../utils/api'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../utils/socket'
import { useNotification } from '../contexts/NotificationContext'
import { useConfirmDialog } from '../contexts/ConfirmDialogContext'
import ServerCard from '../components/ServerCard'

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
  const { showNotification } = useNotification()
  const { showConfirm } = useConfirmDialog()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [instances, setInstances] = useState<Instance[]>([])
  const [serverIp, setServerIp] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [installingId, setInstallingId] = useState<number | null>(null)
  const [restartingId, setRestartingId] = useState<number | null>(null)
  const [startingId, setStartingId] = useState<number | null>(null)
  const [stoppingId, setStoppingId] = useState<number | null>(null)

  const fetchSystemInfo = useCallback(async () => {
    try {
      const response = await apiFetch('/api/system-info')

      if (response.ok) {
        const data = await response.json()
        setServerIp(data.publicIp || window.location.hostname)
      }
    } catch (error) {
      console.error('Failed to fetch system info:', error)
      setServerIp(window.location.hostname)
    }
  }, [])

  const fetchServers = useCallback(async () => {
    try {
      const response = await apiFetch('/api/servers')

      const data = await response.json()
      setInstances(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch servers:', error)
    } finally {
      setLoading(false)
    }
  }, [])

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

    // Listen for server updates (map changes, settings, etc.)
    socket.on('server_update', () => {
      // Refresh the specific server data
      fetchServers()
    })

    return () => {
      socket.off('status_update')
      socket.off('server_update')
    }
  }, [fetchServers, fetchSystemInfo])

  const handleDeleteServer = useCallback(async (id: number) => {
    const confirmed = await showConfirm({
      title: 'Delete Server Instance',
      message: 'Are you sure you want to delete this server instance? All data will be permanently removed.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    })
    
    if (!confirmed) return
    
    setDeletingId(id)
    try {
      const response = await apiFetch(`/api/servers/${id}`, {

        method: 'DELETE'
      })
      if (response.ok) {
        showNotification('success', 'Server Deleted', 'Server and all associated files have been permanently removed')
        setInstances(prev => prev.filter(i => i.id !== id))
      } else {
        showNotification('error', 'Delete Failed', 'Failed to delete server')
      }
    } catch (error) {
      console.error('Delete server error:', error)
      showNotification('error', 'Connection Error', 'Unable to reach the server')
    } finally {
      setDeletingId(null)
    }
  }, [showConfirm, showNotification])

  const handleInstall = useCallback(async (id: number) => {
    setInstallingId(id)
    try {
      const response = await apiFetch(`/api/servers/${id}/install`, {

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
  }, [navigate])

  const handleStartServer = useCallback(async (id: number) => {
    setStartingId(id)
    try {
      const response = await apiFetch(`/api/servers/${id}/start`, {

        method: 'POST'
      })
      if (response.ok) {
        showNotification('success', 'Server Starting', 'Your server is now booting up...')
        fetchServers()
      } else {
        const data = await response.json()
        showNotification('error', 'Start Failed', data.message || 'Failed to start server')
      }
    } catch (error) {
      console.error('Start server error:', error)
      showNotification('error', 'Connection Error', 'Unable to reach the server')
    } finally {
      setStartingId(null)
    }
  }, [fetchServers, showNotification])

  const handleStopServer = useCallback(async (id: number) => {
    setStoppingId(id)
    try {
      const response = await apiFetch(`/api/servers/${id}/stop`, {

        method: 'POST'
      })
      if (response.ok) {
        showNotification('success', 'Server Stopped', 'Server has been shut down successfully')
        fetchServers()
      } else {
        const data = await response.json()
        showNotification('error', 'Stop Failed', data.message || 'Failed to stop server')
      }
    } catch (error) {
      console.error('Stop server error:', error)
      showNotification('error', 'Connection Error', 'Unable to reach the server')
    } finally {
      setStoppingId(null)
    }
  }, [fetchServers, showNotification])

  const handleRestartServer = useCallback(async (id: number) => {
    setRestartingId(id)
    try {
      const response = await apiFetch(`/api/servers/${id}/restart`, {

        method: 'POST'
      })
      if (response.ok) {
        showNotification('info', 'Server Restarting', 'Server will be back online shortly...')
        fetchServers()
      } else {
        const data = await response.json()
        showNotification('error', 'Restart Failed', data.message || 'Failed to restart server')
      }
    } catch (error) {
      console.error('Restart error:', error)
      showNotification('error', 'Connection Error', 'Unable to reach the server')
    } finally {
      setRestartingId(null)
    }
  }, [fetchServers, showNotification])

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const handleConsoleNavigate = useCallback((id: number) => {
      navigate(`/instances/${id}/console`)
  }, [navigate]);

  const handleSettingsNavigate = useCallback((id: number) => {
      navigate(`/instances/${id}/settings`)
  }, [navigate]);

   const handleFilesNavigate = useCallback((id: number) => {
      navigate(`/instances/${id}/files`)
  }, [navigate]);


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
                aria-label="Filter instances"
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
              <ServerCard
                key={instance.id}
                instance={instance}
                serverIp={serverIp}
                copiedId={copiedId}
                installingId={installingId}
                startingId={startingId}
                stoppingId={stoppingId}
                restartingId={restartingId}
                deletingId={deletingId}
                onInstall={handleInstall}
                onStart={handleStartServer}
                onStop={handleStopServer}
                onRestart={handleRestartServer}
                onDelete={handleDeleteServer}
                onCopy={copyToClipboard}
                onConsole={handleConsoleNavigate}
                onSettings={handleSettingsNavigate}
                onFiles={handleFilesNavigate}
              />
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
