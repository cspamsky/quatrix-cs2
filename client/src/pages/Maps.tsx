import { useState, useMemo, useEffect } from 'react'
import { 
  Search, 
  Play, 
  RefreshCcw, 
  CheckCircle2,
  Server as ServerIcon,
  Loader2,
  Map as MapIcon,
  Globe
} from 'lucide-react'
import { apiFetch } from '../utils/api'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface CS2Map {
  id: string
  name: string
  displayName: string
  type: 'Defusal' | 'Hostage' | 'Workshop'
  image: string
  isActive: boolean
}

interface Instance {
  id: number
  name: string
  status: string
  map: string
}

const Maps = () => {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<'all' | 'Defusal' | 'Hostage' | 'Workshop'>('all')
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)

  // 1. Fetch Servers
  const { data: servers = [] } = useQuery<Instance[]>({
    queryKey: ['servers'],
    queryFn: () => apiFetch('/api/servers').then(res => res.json()),
  })

  useEffect(() => {
    if (servers.length > 0 && !selectedServerId) {
      setSelectedServerId(servers.find(s => s.status === 'ONLINE')?.id || servers[0].id)
    }
  }, [servers, selectedServerId])

  // 2. Fetch Maps
  const { data: maps = [], isLoading: mapsLoading } = useQuery<CS2Map[]>({
    queryKey: ['server-maps', selectedServerId],
    queryFn: async () => {
      const currentServer = servers.find(s => s.id === selectedServerId)
      const currentMapName = currentServer?.map || 'de_dust2'
      
      // Mock Data - In production, this would be an API call
      return [
        { id: '1', name: 'de_dust2', displayName: 'Dust II', type: 'Defusal', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1000' },
        { id: '2', name: 'de_inferno', displayName: 'Inferno', type: 'Defusal', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1000' },
        { id: '3', name: 'de_mirage', displayName: 'Mirage', type: 'Defusal', image: 'https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=1000' },
        { id: '4', name: 'de_nuke', displayName: 'Nuke', type: 'Defusal', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1000' },
        { id: '5', name: 'de_overpass', displayName: 'Overpass', type: 'Defusal', image: 'https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=1000' },
        { id: '6', name: 'de_ancient', displayName: 'Ancient', type: 'Defusal', image: 'https://images.unsplash.com/photo-1533134486753-c833f0ed4866?q=80&w=1000' },
        { id: '7', name: 'cs_italy', displayName: 'Italy', type: 'Hostage', image: 'https://images.unsplash.com/photo-1533134486753-c833f0ed4866?q=80&w=1000' }
      ].map(m => ({ ...m, isActive: m.name === currentMapName })) as CS2Map[]
    },
    enabled: !!selectedServerId
  })

  const changeMapMutation = useMutation({
    mutationFn: (mapName: string) => apiFetch(`/api/servers/${selectedServerId}/rcon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `map ${mapName}` })
    }).then(res => res.json()),
    onSuccess: () => {
      toast.success('Command sent!')
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    },
    onError: () => toast.error('RCON Failure')
  })

  const filteredMaps = useMemo(() => {
    return maps.filter(m => {
      const matchesSearch = m.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCat = activeCategory === 'all' || m.type === activeCategory
      return matchesSearch && matchesCat
    })
  }, [maps, activeCategory, searchQuery])

  const activeMap = maps.find(m => m.isActive)

  return (
    <div className="p-6 font-display max-h-screen overflow-y-auto scrollbar-hide">
      {/* Dynamic Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <MapIcon className="text-primary" /> Map Explorer
          </h2>
          <p className="text-sm text-gray-500 mt-1">Deploy new battlegrounds to your node instantly</p>
        </div>

        <div className="flex items-center gap-3 bg-[#0c1424] p-1.5 rounded-2xl border border-gray-800/50">
          <div className="flex items-center px-4 py-2 text-gray-500 bg-gray-900/50 rounded-xl border border-gray-800">
             <ServerIcon size={14} className="mr-2 text-primary" />
             <span className="text-[10px] font-black uppercase tracking-widest">Target:</span>
          </div>
          <select 
            className="bg-transparent text-white text-sm font-bold outline-none px-4 py-2 cursor-pointer appearance-none min-w-[140px]"
            value={selectedServerId || ''}
            onChange={(e) => setSelectedServerId(Number(e.target.value))}
          >
            {servers.map(s => (
              <option key={s.id} value={s.id} className="bg-[#0c1424]">{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Controls */}
        <div className="lg:col-span-3 space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text" 
              placeholder="Search maps..."
              className="w-full bg-[#111827] border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-primary transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="bg-[#111827] border border-gray-800 rounded-2xl overflow-hidden p-2">
            {['all', 'Defusal', 'Hostage', 'Workshop'].map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat as any)}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${activeCategory === cat ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {cat} Maps
              </button>
            ))}
          </div>

          <button className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-xl font-bold text-xs uppercase tracking-[0.2em] transition-all">
            <Globe size={16} /> Add Workshop
          </button>
        </div>

        {/* Map Grid Area */}
        <div className="lg:col-span-9">
          {activeMap && (
            <div className="mb-8 p-4 bg-primary/5 border border-primary/20 rounded-3xl flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl overflow-hidden border border-primary/30">
                  <img src={activeMap.image} className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest">Active Now</span>
                  </div>
                  <h3 className="text-white font-bold">{activeMap.displayName}</h3>
                </div>
              </div>
              <button 
                onClick={() => changeMapMutation.mutate(activeMap.name)}
                className="px-6 py-2 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
              >
                {changeMapMutation.isPending ? <RefreshCcw size={16} className="animate-spin" /> : 'Restart'}
              </button>
            </div>
          )}

          {mapsLoading ? (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-800 rounded-3xl">
              <Loader2 className="animate-spin text-primary mb-4" />
              <p className="text-xs text-gray-500 font-bold uppercase">Scanning Node Files...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredMaps.map(map => (
                <div 
                  key={map.id} 
                  className={`group relative aspect-[16/10] rounded-2xl overflow-hidden border border-gray-800 transition-all hover:border-primary/50 ${map.isActive ? 'ring-2 ring-primary ring-offset-4 ring-offset-[#0F172A]' : ''}`}
                >
                  <img src={map.image} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  
                  <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                    <div>
                      <h4 className="text-white font-bold text-lg">{map.displayName}</h4>
                      <p className="text-gray-400 text-[10px] font-mono">{map.name}</p>
                    </div>
                    {!map.isActive && (
                      <button 
                        onClick={() => changeMapMutation.mutate(map.name)}
                        className="p-3 bg-primary text-white rounded-xl shadow-xl shadow-primary/40 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0"
                      >
                        <Play size={18} fill="white" />
                      </button>
                    )}
                  </div>

                  {map.isActive && (
                    <div className="absolute top-4 right-4 bg-green-500 p-1.5 rounded-full text-white">
                      <CheckCircle2 size={16} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Maps
