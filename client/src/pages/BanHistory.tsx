import { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api'
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  ShieldCheck,
  Server,
  Calendar,
  User,
  Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface BanRecord {
  id: number
  server_id: number
  player_name: string
  steam_id: string | null
  ip_address: string | null
  reason: string
  duration: number
  banned_by: string
  banned_at: string
  expires_at: string | null
  unbanned_at: string | null
  unbanned_by: string | null
  is_active: number
}

interface ServerInfo {
  id: number
  name: string
}

const BanHistory = () => {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)
  const [showActiveOnly, setShowActiveOnly] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch Servers
  const { data: servers = [] } = useQuery<ServerInfo[]>({
    queryKey: ['servers'],
    queryFn: () => apiFetch('/api/servers').then(res => res.json())
  })

  // Auto-select first server
  useEffect(() => {
    if (servers.length > 0 && !selectedServerId) {
      setSelectedServerId(servers[0].id)
    }
  }, [servers, selectedServerId])

  // Fetch Ban History
  const { 
    data: bans = [], 
    isLoading: loading,
    refetch 
  } = useQuery<BanRecord[]>({
    queryKey: ['bans', selectedServerId, showActiveOnly],
    queryFn: () => {
      const url = `/api/servers/${selectedServerId}/bans${showActiveOnly ? '?active_only=true' : ''}`
      return apiFetch(url).then(res => res.json())
    },
    enabled: !!selectedServerId
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
    toast.success('Ban history updated')
  }

  const handleUnban = async (banId: number, playerName: string) => {
    if (!confirm(`Are you sure you want to unban ${playerName}?`)) return

    try {
      const response = await apiFetch(`/api/servers/${selectedServerId}/bans/${banId}/unban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unbanned_by: 'Admin' })
      })

      if (response.ok) {
        toast.success(`${playerName} has been unbanned`)
        queryClient.invalidateQueries({ queryKey: ['bans', selectedServerId] })
      } else {
        toast.error('Failed to unban player')
      }
    } catch (error) {
      toast.error('Failed to unban player')
    }
  }

  const filteredBans = bans.filter((ban: BanRecord) => 
    ban.player_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (ban.steam_id && ban.steam_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
    ban.reason.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (minutes: number) => {
    if (minutes === 0) return 'Permanent'
    if (minutes < 60) return `${minutes}m`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
    return `${Math.floor(minutes / 1440)}d`
  }

  return (
    <div className="p-6 font-display">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Ban History</h2>
          <p className="text-sm text-gray-400 mt-1">View and manage player bans across all servers.</p>
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
              <option value="" disabled>Select server...</option>
              {servers.map((s: ServerInfo) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              className="w-64 pl-10 pr-4 py-2 bg-[#111827] border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200" 
              placeholder="Search bans..." 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showActiveOnly}
              onChange={(e) => setShowActiveOnly(e.target.checked)}
              className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary/20"
            />
            Active only
          </label>

          <button 
            onClick={handleRefresh}
            disabled={!selectedServerId || refreshing}
            className="bg-primary hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center transition-all shadow-lg shadow-blue-500/20 active:scale-95"
          >
            <RefreshCw className={`mr-2 w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Stats Summary */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="bg-[#111827] px-8 py-4 rounded-2xl border border-gray-800 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-red-500/10 text-red-500">
            <ShieldAlert size={24} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Total Bans</p>
            <p className="text-2xl font-bold text-white tracking-tight">{bans.length}</p>
          </div>
        </div>
        <div className="bg-[#111827] px-8 py-4 rounded-2xl border border-gray-800 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Active Bans</p>
            <p className="text-2xl font-bold text-white tracking-tight">{bans.filter(b => b.is_active).length}</p>
          </div>
        </div>
      </div>

      {/* Bans Table */}
      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                <th className="px-6 py-4 border-b border-gray-800/50">Player</th>
                <th className="px-6 py-4 border-b border-gray-800/50">Steam ID</th>
                <th className="px-6 py-4 border-b border-gray-800/50">Reason</th>
                <th className="px-6 py-4 border-b border-gray-800/50">Duration</th>
                <th className="px-6 py-4 border-b border-gray-800/50">Banned By</th>
                <th className="px-6 py-4 border-b border-gray-800/50">Date</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-center">Status</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {loading && bans.length === 0 ? (
                <tr>
                   <td colSpan={8} className="px-6 py-12 text-center text-gray-500 text-sm">Loading ban history...</td>
                </tr>
              ) : filteredBans.length === 0 ? (
                <tr>
                   <td colSpan={8} className="px-6 py-12 text-center text-gray-500 text-sm">
                     {!selectedServerId ? 'Select a server to view ban history' : 'No bans found'}
                   </td>
                </tr>
              ) : (
                filteredBans.map((ban: BanRecord) => (
                  <tr key={ban.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-red-500 font-bold border border-gray-700">
                          {ban.player_name[0].toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-white text-sm block">{ban.player_name}</span>
                          <span className="text-[10px] text-gray-500 font-mono">ID: {ban.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-primary font-mono select-all">
                      {ban.steam_id || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300 max-w-xs truncate">
                      {ban.reason}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        ban.duration === 0 
                          ? 'bg-red-500/10 text-red-500' 
                          : 'bg-yellow-500/10 text-yellow-500'
                      }`}>
                        {formatDuration(ban.duration)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      <div className="flex items-center gap-2">
                        <User size={14} />
                        {ban.banned_by}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} />
                        {formatDate(ban.banned_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {ban.is_active ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-500">
                          Active
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-500">
                          Unbanned
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {ban.is_active && (
                        <button 
                          onClick={() => handleUnban(ban.id, ban.player_name)}
                          className="px-4 py-2 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white rounded-lg transition-all text-xs font-bold"
                        >
                          Unban
                        </button>
                      )}
                      {!ban.is_active && ban.unbanned_at && (
                        <div className="text-xs text-gray-500">
                          <div className="flex items-center gap-1 justify-end">
                            <Clock size={12} />
                            {formatDate(ban.unbanned_at)}
                          </div>
                          <div className="text-[10px]">by {ban.unbanned_by}</div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800/50 bg-[#1d1d1d]/10">
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
            Showing {filteredBans.length} of {bans.length} bans
          </span>
        </div>
      </div>
    </div>
  )
}

export default BanHistory
