import { useState } from 'react'
import { 
  Users, 
  Activity, 
  Search, 
  RefreshCw, 
  VolumeX, 
  UserMinus, 
  ShieldAlert, 
  ChevronLeft, 
  ChevronRight,
  MoreHorizontal
} from 'lucide-react'

interface Player {
  id: string
  name: string
  steamId: string
  ping: number
  score: string
  kd: string
  avatar: string
}

const Players = () => {
  const [searchQuery, setSearchQuery] = useState('')

  const players: Player[] = [
    {
      id: '1',
      name: 'SilverSurfer_99',
      steamId: 'STEAM_1:0:12345678',
      ping: 18,
      score: '2,450',
      kd: '1.45',
      avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&q=80&w=100'
    },
    {
      id: '2',
      name: 'FragMaster_DK',
      steamId: 'STEAM_1:1:87654321',
      ping: 32,
      score: '3,120',
      kd: '2.10',
      avatar: 'https://images.unsplash.com/photo-1542103749-8ef59b94f4b3?auto=format&fit=crop&q=80&w=100'
    },
    {
      id: '3',
      name: 'RushB_NoStop',
      steamId: 'STEAM_1:0:11223344',
      ping: 85,
      score: '1,100',
      kd: '0.82',
      avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=100'
    },
    {
      id: '4',
      name: 'GlobalEliteSmurf',
      steamId: 'STEAM_1:0:99887766',
      ping: 12,
      score: '4,890',
      kd: '3.45',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100'
    }
  ]

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
        <div className="flex items-center space-x-4">
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
          <button className="bg-primary hover:bg-blue-600 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center transition-all shadow-lg shadow-blue-500/20 active:scale-95">
            <RefreshCw className="mr-2 w-4 h-4" />
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
            <p className="text-2xl font-bold text-white tracking-tight">12 <span className="text-sm font-normal text-gray-600">/ 24</span></p>
          </div>
        </div>
        <div className="bg-[#111827] px-8 py-4 rounded-2xl border border-gray-800 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Average Ping</p>
            <p className="text-2xl font-bold text-white tracking-tight">24 <span className="text-sm font-normal text-gray-600">ms</span></p>
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
                <th className="px-6 py-4 border-b border-gray-800/50 text-center">Score</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-center">K/D Ratio</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {filteredPlayers.map((player) => (
                <tr key={player.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img 
                          alt={player.name} 
                          className="w-10 h-10 rounded-xl object-cover border border-gray-800 group-hover:border-primary/50 transition-colors" 
                          src={player.avatar}
                        />
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#111827]"></div>
                      </div>
                      <div>
                        <span className="font-bold text-white text-sm block">{player.name}</span>
                        <span className="text-[10px] text-gray-500 font-mono">#ID:{player.id}</span>
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
                  <td className="px-6 py-4 text-sm font-mono text-center text-gray-100">
                    {player.score}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-sm font-black ${parseFloat(player.kd) > 2 ? 'text-primary' : 'text-gray-400'}`}>
                      {player.kd}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-all" title="Mute Player">
                        <VolumeX size={14} />
                      </button>
                      <button className="p-2 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-white rounded-lg transition-all" title="Kick Player">
                        <UserMinus size={14} />
                      </button>
                      <button className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all" title="Ban Player">
                        <ShieldAlert size={14} />
                      </button>
                      <button className="p-2 bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-all">
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-800/50 bg-[#1d1d1d]/10 flex items-center justify-between">
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
            Showing {filteredPlayers.length} / 12 players
          </span>
          <div className="flex gap-2">
            <button className="p-2 border border-gray-800 rounded-lg text-gray-500 hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all">
              <ChevronLeft size={16} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center bg-primary text-white rounded-lg text-xs font-bold shadow-lg shadow-primary/20">1</button>
            <button className="w-8 h-8 flex items-center justify-center border border-gray-800 text-gray-400 hover:bg-gray-800 rounded-lg text-xs font-bold transition-all">2</button>
            <button className="p-2 border border-gray-800 rounded-lg text-gray-500 hover:bg-gray-800 transition-all">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Players
