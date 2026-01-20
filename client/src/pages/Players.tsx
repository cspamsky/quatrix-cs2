import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api'
import { 
  Users, 
  Activity, 
  Search, 
  RefreshCw, 
  UserMinus, 
  ShieldAlert, 
  ChevronLeft, 
  ChevronRight,
  MoreHorizontal,
  Server
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Player {
  userId: string
  name: string
  steamId: string
  connected: string
  ping: number
  state: string
  avatar?: string
}

interface ServerInfo {
  id: number
  name: string
  status: string
}

const Players = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [servers, setServers] = useState<ServerInfo[]>([])
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [averagePing, setAveragePing] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const response = await apiFetch('/api/servers')
        if (response.ok) {
          const data = await response.json()
          const runningServers = data.filter((s: any) => s.status === 'ONLINE')
          setServers(runningServers)
          if (runningServers.length > 0 && !selectedServerId) {
            setSelectedServerId(runningServers[0].id)
          }
        }
      } catch (error) {
        console.error('Failed to fetch servers:', error)
      }
    }
    fetchServers()
  }, [])

  const fetchPlayers = useCallback(async (isManual = false) => {
    if (!selectedServerId) {
      setPlayers([])
      setAveragePing(0)
      return
    }
    
    // Sadece manuel yenilemede refreshing göster
    if (isManual) {
      setRefreshing(true)
    }
    // Loading state'i otomatik yenilemelerde gösterme (arayüz bozulmasın)

    try {
      const response = await apiFetch(`/api/servers/${selectedServerId}/players`)
      if (response.ok) {
        const data = await response.json()
        setPlayers(data.players || data)
        setAveragePing(data.averagePing || 0)
        // İlk başarılı yüklemeden sonra loading'i kapat
        if (loading) setLoading(false)
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch players' }))
        if (isManual) {
          toast.error(errorData.message || 'Server might be starting or unreachable')
        }
      }
    } catch (error) {
      console.error('Failed to fetch players:', error)
      if (isManual) toast.error('Connection Error: Unable to reach the panel backend')
    } finally {
      setRefreshing(false)
    }
  }, [selectedServerId, loading])

  useEffect(() => {
    if (!selectedServerId) return
    
    fetchPlayers()
    // 10 saniyede bir otomatik yenile
    const interval = setInterval(() => fetchPlayers(false), 10000)
    return () => clearInterval(interval)
  }, [selectedServerId, fetchPlayers])

  const handleAction = async (action: 'kick' | 'ban', userId: string) => {
    if (!selectedServerId) return
    
    const reason = action === 'kick' ? 'Kicked by admin' : 'Banned by admin'
    try {
      const response = await apiFetch(`/api/servers/${selectedServerId}/players/${userId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })
      if (response.ok) {
        toast.success(`Player ${action}ed successfully`)
        fetchPlayers(true)
      }
    } catch (error) {
      toast.error(`Failed to ${action} player`)
    }
  }

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.steamId.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="p-6 font-display">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Player Management</h2>
          <p className="text-sm text-gray-400 mt-1">Monitor live player statistics and manage server discipline.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {/* Server Selector */}
          <div className="relative group">
            <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <select 
              className="bg-[#111827] border border-gray-800 text-white pl-10 pr-4 py-2 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none text-sm"
              value={selectedServerId || ''}
              onChange={(e) => setSelectedServerId(Number(e.target.value))}
            >
              <option value="" disabled>Select active server...</option>
              {servers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              className="w-64 pl-10 pr-4 py-2 bg-[#111827] border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200" 
              placeholder="Search by name or SteamID..." 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => fetchPlayers(true)}
            disabled={!selectedServerId || refreshing}
            className="bg-primary hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center transition-all shadow-lg shadow-blue-500/20 active:scale-95"
          >
            <RefreshCw className={`mr-2 w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh List
          </button>
        </div>
      </header>

      {/* Stats Summary */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="bg-[#111827] px-8 py-4 rounded-2xl border border-gray-800 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Active Players</p>
            <p className="text-2xl font-bold text-white tracking-tight">{players.length}</p>
          </div>
        </div>
        <div className="bg-[#111827] px-8 py-4 rounded-2xl border border-gray-800 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Average Ping</p>
            <p className="text-2xl font-bold text-white tracking-tight">{averagePing} <span className="text-sm font-normal text-gray-600">ms</span></p>
          </div>
        </div>
      </div>

      {/* Players Table */}
      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                <th className="px-6 py-4 border-b border-gray-800/50">Player Information</th>
                <th className="px-6 py-4 border-b border-gray-800/50">Steam ID</th>
                <th className="px-6 py-4 border-b border-gray-800/50">Latency</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-center">Connected</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {loading ? (
                <tr>
                   <td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">Loading players...</td>
                </tr>
              ) : filteredPlayers.length === 0 ? (
                <tr>
                   <td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">
                     {!selectedServerId ? 'Select an active server to see players' : 'No players found on this server'}
                   </td>
                </tr>
              ) : (
                filteredPlayers.map((player) => (
                  <tr key={player.userId} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {player.avatar ? (
                          <img 
                            src={player.avatar} 
                            alt={player.name}
                            className="w-10 h-10 rounded-xl border border-gray-700"
                            onError={(e) => {
                              // Avatar yüklenemezse fallback göster
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-primary font-bold border border-gray-700 ${player.avatar ? 'hidden' : ''}`}>
                          {player.name[0].toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-white text-sm block">{player.name}</span>
                          <span className="text-[10px] text-primary font-mono opacity-60 uppercase">{player.state}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-primary font-mono select-all">
                      {player.steamId}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${player.ping < 50 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-yellow-500'}`}></div>
                        <span className="text-sm font-bold text-gray-300">{player.ping}ms</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-center text-gray-400">
                      {player.connected}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleAction('kick', player.userId)}
                          className="p-2 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-white rounded-lg transition-all" title="Kick Player">
                          <UserMinus size={14} />
                        </button>
                        <button 
                          onClick={() => handleAction('ban', player.userId)}
                          className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all" title="Ban Player">
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
        
        {/* Pagination Info */}
        <div className="px-6 py-4 border-t border-gray-800/50 bg-[#1d1d1d]/10 flex items-center justify-between">
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
            Showing {filteredPlayers.length} players
          </span>
          <div className="flex gap-2">
            <button disabled className="p-2 border border-gray-800 rounded-lg text-gray-700 disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <button disabled className="p-2 border border-gray-800 rounded-lg text-gray-700 disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Players
