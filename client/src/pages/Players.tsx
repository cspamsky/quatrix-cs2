import { useState, useEffect } from 'react'
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
  Server,
  Skull
} from 'lucide-react'
import { useNotification } from '../contexts/NotificationContext'

interface Player {
  userId: string
  name: string
  steamId: string
  connected: string
  ping: number
  loss: string
  state: string
  rate: string
}

interface ServerInfo {
  id: number
  name: string
  status: string
}

const Players = () => {
  const { showNotification } = useNotification()
  const [searchQuery, setSearchQuery] = useState('')
  const [servers, setServers] = useState<ServerInfo[]>([])
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch servers on mount
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

  // Fetch players for selected server
  const fetchPlayers = async (isManual = false) => {
    if (!selectedServerId) return
    if (isManual) setRefreshing(true)
    else setLoading(true)

    try {
      const response = await apiFetch(`/api/servers/${selectedServerId}/players`)
      if (response.ok) {
        const data = await response.json()
        setPlayers(data)
      }
    } catch (error) {
      console.error('Failed to fetch players:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchPlayers()
    const interval = setInterval(fetchPlayers, 5000)
    return () => clearInterval(interval)
  }, [selectedServerId])

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
        showNotification('success', 'Action Successful', `Player has been ${action}ed`)
        fetchPlayers(true)
      }
    } catch (error) {
      showNotification('error', 'Action Failed', `Failed to ${action} player`)
    }
  }

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.steamId.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const avgPing = players.length > 0 ? Math.round(players.reduce((acc, p) => acc + p.ping, 0) / players.length) : 0

  return (
    <div className="p-6 font-display min-h-screen bg-[#0d121d]">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3 italic uppercase">
            <Users className="text-primary w-8 h-8" />
            Player Central
          </h2>
          <p className="text-xs text-gray-500 mt-1 font-bold uppercase tracking-widest">Real-time battlefield monitoring & administration</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          {/* Server Selector */}
          <div className="relative group">
            <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-primary w-4 h-4" />
            <select 
              className="bg-[#111827] border border-gray-800 text-white pl-10 pr-8 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none text-sm font-bold min-w-[200px]"
              value={selectedServerId || ''}
              onChange={(e) => setSelectedServerId(Number(e.target.value))}
            >
              {servers.length === 0 && <option value="">No Active Servers</option>}
              {servers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-primary transition-colors" />
            <input 
              className="w-64 pl-10 pr-4 py-2.5 bg-[#111827] border border-gray-800 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200" 
              placeholder="Filter names or IDs..." 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button 
            disabled={!selectedServerId || refreshing}
            onClick={() => fetchPlayers(true)}
            className="bg-primary hover:bg-blue-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase flex items-center transition-all shadow-xl shadow-blue-500/20 active:scale-95"
          >
            <RefreshCw className={`mr-2 w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </header>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-[#111827] to-[#1a2234] p-6 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
           <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
             <Users size={120} />
           </div>
           <p className="text-[10px] text-primary uppercase font-black tracking-widest mb-1">Live Combatants</p>
           <h3 className="text-4xl font-black text-white italic">{players.length} <span className="text-sm border-l border-gray-700 pl-3 ml-3 not-italic text-gray-500 uppercase">Total Active</span></h3>
        </div>

        <div className="bg-gradient-to-br from-[#111827] to-[#1a2234] p-6 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
           <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500 text-green-500">
             <Activity size={120} />
           </div>
           <p className="text-[10px] text-green-500 uppercase font-black tracking-widest mb-1">Network Health</p>
           <h3 className="text-4xl font-black text-white italic">{avgPing} <span className="text-sm not-italic text-gray-500 uppercase font-bold">MS AVG</span></h3>
        </div>

        <div className="bg-gradient-to-br from-[#111827] to-[#1a2234] p-6 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
           <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500 text-red-500">
             <Skull size={120} />
           </div>
           <p className="text-[10px] text-red-500 uppercase font-black tracking-widest mb-1">Moderation Status</p>
           <h3 className="text-4xl font-black text-white italic">0 <span className="text-sm not-italic text-gray-500 uppercase font-bold">Bans Today</span></h3>
        </div>
      </div>

      {/* Players Table */}
      <div className="bg-[#111827]/80 backdrop-blur-xl rounded-3xl border border-gray-800/50 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">
                <th className="px-8 py-5 border-b border-gray-800/50">Soldier</th>
                <th className="px-8 py-5 border-b border-gray-800/50">Unique Identifier</th>
                <th className="px-8 py-5 border-b border-gray-800/50">Latency</th>
                <th className="px-8 py-5 border-b border-gray-800/50 text-center">Service Time</th>
                <th className="px-8 py-5 border-b border-gray-800/50 text-right">Direct Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                     <div className="flex flex-col items-center gap-4">
                        <RefreshCw className="w-10 h-10 text-primary animate-spin opacity-20" />
                        <span className="text-xs font-black uppercase text-gray-600 tracking-widest">Interrogating Server...</span>
                     </div>
                  </td>
                </tr>
              ) : filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                     <div className="flex flex-col items-center gap-4">
                        <Users className="w-10 h-10 text-gray-800" />
                        <span className="text-xs font-black uppercase text-gray-600 tracking-widest">No life detected on this frequency</span>
                     </div>
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player) => (
                  <tr key={player.userId} className="hover:bg-white/[0.03] transition-all group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-blue-900/20 flex items-center justify-center text-primary font-black text-xl border border-primary/20 group-hover:scale-105 transition-transform">
                            {player.name[0].toUpperCase()}
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-4 border-[#111827]"></div>
                        </div>
                        <div>
                          <span className="font-black text-white text-base block group-hover:text-primary transition-colors italic">{player.name}</span>
                          <span className="text-[10px] text-gray-500 font-bold uppercase">Status: <span className="text-green-500">{player.state}</span></span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                       <span className="px-3 py-1 bg-gray-900 border border-gray-800 rounded-lg text-[10px] text-primary font-mono select-all">
                        {player.steamId}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-0.5">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className={`w-1 h-3 rounded-full ${player.ping < (i * 40) ? (player.ping < 50 ? 'bg-green-500' : 'bg-yellow-500') : 'bg-gray-800'}`}></div>
                            ))}
                        </div>
                        <span className="text-sm font-black text-white italic">{player.ping}<span className="text-[10px] text-gray-600 not-italic ml-1">MS</span></span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-sm font-bold text-center text-gray-400 font-mono">
                      {player.connected}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                        <button 
                          onClick={() => handleAction('kick', player.userId)}
                          className="p-2.5 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-white rounded-xl transition-all shadow-lg hover:shadow-yellow-500/40" title="Neutralize Target (Kick)">
                          <UserMinus size={18} />
                        </button>
                        <button 
                          onClick={() => handleAction('ban', player.userId)}
                          className="p-2.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-lg hover:shadow-red-500/40" title="Terminal Discipline (Ban)">
                          <ShieldAlert size={18} />
                        </button>
                        <div className="w-px h-10 bg-gray-800 mx-1"></div>
                        <button className="p-2.5 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-all">
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer info */}
        <div className="px-8 py-5 bg-black/20 flex items-center justify-between border-t border-gray-800/30">
          <div className="flex items-center gap-6">
              <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">
                Detection Count: <span className="text-white">{filteredPlayers.length}</span> / {players.length}
              </span>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                 <span className="text-[10px] text-gray-600 uppercase font-black tracking-widest">Signal Locked</span>
              </div>
          </div>
          <div className="flex gap-2">
            <button className="p-2 bg-gray-800/50 rounded-lg text-gray-500 cursor-not-allowed">
              <ChevronLeft size={16} />
            </button>
            <button className="p-2 bg-gray-800/50 rounded-lg text-gray-500 cursor-not-allowed">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Players
