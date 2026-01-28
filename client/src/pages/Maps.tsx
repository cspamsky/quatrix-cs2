import { useState, useMemo, useEffect } from 'react'
import { 
  Search, 
  Play, 
  RefreshCcw, 
  CheckCircle2,
  Server as ServerIcon,
  Loader2,
  Map as MapIcon,
  Globe,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import { apiFetch } from '../utils/api'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface CS2Map {
  id: string
  workshop_id?: string
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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newWorkshopId, setNewWorkshopId] = useState('')

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

  // 2. Fetch Workshop Maps from DB
  const { data: workshopMaps = [], isLoading: workshopLoading } = useQuery({
    queryKey: ['workshop-maps'],
    queryFn: () => apiFetch('/api/maps/workshop').then(res => res.json()),
  })

  // 3. Combine Static Maps and Workshop Maps
  const maps = useMemo(() => {
    const currentServer = servers.find(s => s.id === selectedServerId)
    const currentMapName = currentServer?.map || 'de_dust2'

    const staticMaps: CS2Map[] = [
      { id: '1', name: 'de_dust2', displayName: 'Dust II', type: 'Defusal', image: '/images/maps/de_dust2.webp', isActive: currentMapName === 'de_dust2' },
      { id: '2', name: 'de_inferno', displayName: 'Inferno', type: 'Defusal', image: '/images/maps/de_inferno.webp', isActive: currentMapName === 'de_inferno' },
      { id: '3', name: 'de_mirage', displayName: 'Mirage', type: 'Defusal', image: '/images/maps/de_mirage.webp', isActive: currentMapName === 'de_mirage' },
      { id: '4', name: 'de_nuke', displayName: 'Nuke', type: 'Defusal', image: '/images/maps/de_nuke_cs2.webp', isActive: currentMapName === 'de_nuke' },
      { id: '5', name: 'de_overpass', displayName: 'Overpass', type: 'Defusal', image: '/images/maps/de_overpass.webp', isActive: currentMapName === 'de_overpass' },
      { id: '6', name: 'de_ancient', displayName: 'Ancient', type: 'Defusal', image: '/images/maps/de_ancient.webp', isActive: currentMapName === 'de_ancient' },
      { id: '7', name: 'de_anubis', displayName: 'Anubis', type: 'Defusal', image: '/images/maps/de_anubis.webp', isActive: currentMapName === 'de_anubis' },
      { id: '8', name: 'de_vertigo', displayName: 'Vertigo', type: 'Defusal', image: '/images/maps/de_vertigo.webp', isActive: currentMapName === 'de_vertigo' },
      { id: '9', name: 'cs_italy', displayName: 'Italy', type: 'Hostage', image: '/images/maps/de_italy.webp', isActive: currentMapName === 'cs_italy' },
      { id: '10', name: 'cs_office', displayName: 'Office', type: 'Hostage', image: '/images/maps/de_office.webp', isActive: currentMapName === 'cs_office' }
    ]

    const wMaps: CS2Map[] = workshopMaps.map((m: any) => ({
      id: `w-${m.id}`,
      workshop_id: m.workshop_id,
      name: m.workshop_id,
      displayName: m.name,
      type: 'Workshop',
      image: m.image_url || '/images/maps/de_dust2.webp',
      isActive: currentMapName === m.workshop_id
    }))

    return [...staticMaps, ...wMaps]
  }, [servers, selectedServerId, workshopMaps])

  // 4. Mutations
  const changeMapMutation = useMutation({
    mutationFn: (map: CS2Map) => {
      const command = map.type === 'Workshop' ? `host_workshop_map ${map.workshop_id}` : `map ${map.name}`
      return apiFetch(`/api/servers/${selectedServerId}/rcon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      }).then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'RCON Failure')
        return data
      })
    },
    onSuccess: () => {
      toast.success('Map change requested!')
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    },
    onError: (error: any) => {
      toast.error(error.message || 'RCON Failure - Is the server online?')
    }
  })

  const addWorkshopMutation = useMutation({
    mutationFn: (workshopId: string) => apiFetch('/api/maps/workshop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshop_id: workshopId })
    }).then(res => res.json()),
    onSuccess: () => {
      toast.success('Workshop map added!')
      setNewWorkshopId('')
      setIsModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['workshop-maps'] })
    },
    onError: () => toast.error('Failed to add workshop map')
  })

  const removeWorkshopMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/maps/workshop/${id.replace('w-', '')}`, {
      method: 'DELETE'
    }).then(res => res.json()),
    onSuccess: () => {
      toast.success('Workshop map removed')
      queryClient.invalidateQueries({ queryKey: ['workshop-maps'] })
    }
  })

  const selectedServer = useMemo(() => servers.find(s => s.id === selectedServerId), [servers, selectedServerId])
  const isServerOnline = selectedServer?.status === 'ONLINE'

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <MapIcon className="text-primary" /> Map Explorer
          </h2>
          <p className="text-sm text-gray-500 mt-1">Deploy battlegrounds or workshop content to your node</p>
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

          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-blue-600 hover:to-primary text-white py-4 rounded-xl font-bold text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={16} /> Add Workshop
          </button>
        </div>

        <div className="lg:col-span-9">
          {activeMap && (
            <div className="mb-8 p-4 bg-primary/5 border border-primary/20 rounded-3xl flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
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
                onClick={() => changeMapMutation.mutate(activeMap)}
                disabled={changeMapMutation.isPending || !isServerOnline}
                className="px-6 py-2 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
              >
                {changeMapMutation.isPending ? <RefreshCcw size={16} className="animate-spin" /> : 'Restart'}
              </button>
            </div>
          )}

          {workshopLoading ? (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-800 rounded-3xl">
              <Loader2 className="animate-spin text-primary mb-4" />
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Connecting to Steam Cloud...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredMaps.map(map => (
                <div 
                  key={map.id} 
                  className={`group relative aspect-[16/10] rounded-2xl overflow-hidden border border-gray-800 transition-all hover:border-primary/50 ${map.isActive ? 'ring-2 ring-primary ring-offset-4 ring-offset-[#0F172A]' : ''}`}
                >
                  <img src={map.image} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  
                  <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                    <div className="truncate mr-2">
                      <h4 className="text-white font-bold text-sm truncate">{map.displayName}</h4>
                      <p className="text-gray-400 text-[9px] font-mono truncate opacity-60">{map.name}</p>
                    </div>
                    <div className="flex gap-2">
                      {map.type === 'Workshop' && (
                        <button 
                          onClick={() => removeWorkshopMutation.mutate(map.id)}
                          className="p-3 bg-red-500/10 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      {!map.isActive && (
                        <button 
                          onClick={() => changeMapMutation.mutate(map)}
                          disabled={changeMapMutation.isPending || !isServerOnline}
                          className="p-3 bg-primary text-white rounded-xl shadow-xl shadow-primary/40 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 disabled:opacity-50"
                        >
                          <Play size={18} fill="white" />
                        </button>
                      )}
                    </div>
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

      {/* Workshop Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Globe className="text-primary" size={20} />
                <h3 className="text-white font-bold">Add Workshop Content</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 ml-1">Workshop Map ID</label>
                <input 
                  type="text" 
                  placeholder="e.g. 3070176466"
                  className="w-full bg-[#0c1424] border border-gray-800 rounded-2xl py-4 px-6 text-white focus:border-primary transition-all outline-none text-lg font-mono placeholder:text-gray-700"
                  value={newWorkshopId}
                  onChange={(e) => setNewWorkshopId(e.target.value)}
                  autoFocus
                />
                <p className="mt-3 text-[10px] text-gray-600 flex items-center gap-2">
                  <Plus size={10} /> Find the ID in the Steam Workshop URL
                </p>
              </div>
              <button 
                onClick={() => addWorkshopMutation.mutate(newWorkshopId)}
                disabled={!newWorkshopId || addWorkshopMutation.isPending}
                className="w-full bg-primary hover:bg-blue-600 disabled:opacity-50 text-white py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-xl shadow-primary/20"
              >
                {addWorkshopMutation.isPending ? 'Verifying...' : 'Link to Server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Maps
