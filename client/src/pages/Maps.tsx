import { useState, useMemo, useEffect } from 'react'
import { 
  Search, 
  Play, 
  RefreshCcw, 
  CheckCircle2,
  Server as ServerIcon,
  Loader2,
  Globe,
  Plus,
  Trash2,
  X,
  Settings
} from 'lucide-react'
import { apiFetch } from '../utils/api'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<'all' | 'Defusal' | 'Hostage' | 'Workshop'>('all')
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newWorkshopId, setNewWorkshopId] = useState('')
  const [newMapFile, setNewMapFile] = useState('')
  const [editingMapConfig, setEditingMapConfig] = useState<CS2Map | null>(null)
  const [currentConfig, setCurrentConfig] = useState('')
  const [isSavingConfig, setIsSavingConfig] = useState(false)

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

  const openConfigEditor = async (map: CS2Map) => {
    if (!selectedServerId) return
    setEditingMapConfig(map)
    try {
      const response = await apiFetch(`/api/maps/config/${selectedServerId}/${map.name}`)
      if (response.ok) {
        const data = await response.json()
        setCurrentConfig(data.content)
      }
    } catch (error) {
      toast.error(t('maps.config_load_error'))
    }
  }

  const saveConfig = async () => {
    if (!selectedServerId || !editingMapConfig) return
    setIsSavingConfig(true)
    try {
      const response = await apiFetch(`/api/maps/config/${selectedServerId}/${editingMapConfig.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentConfig })
      })
      if (response.ok) {
        toast.success(t('maps.config_save_success'))
        setEditingMapConfig(null)
      } else {
        toast.error(t('maps.config_save_error'))
      }
    } catch (error) {
      toast.error(t('maps.connection_error'))
    } finally {
      setIsSavingConfig(false)
    }
  }

  // 3. Combine Static Maps and Workshop Maps
  const maps = useMemo(() => {
    const currentServer = servers.find(s => s.id === selectedServerId)
    const currentMapName = currentServer?.map || ''
    const normalizedCurrent = currentMapName.toLowerCase()

    const staticMaps: CS2Map[] = [
      { id: '1', name: 'de_dust2', displayName: 'Dust II', type: 'Defusal', image: '/images/maps/de_dust2.webp', isActive: normalizedCurrent.includes('de_dust2') },
      { id: '2', name: 'de_inferno', displayName: 'Inferno', type: 'Defusal', image: '/images/maps/de_inferno.webp', isActive: normalizedCurrent.includes('de_inferno') },
      { id: '3', name: 'de_mirage', displayName: 'Mirage', type: 'Defusal', image: '/images/maps/de_mirage.webp', isActive: normalizedCurrent.includes('de_mirage') },
      { id: '4', name: 'de_nuke', displayName: 'Nuke', type: 'Defusal', image: '/images/maps/de_nuke_cs2.webp', isActive: normalizedCurrent.includes('de_nuke') },
      { id: '5', name: 'de_overpass', displayName: 'Overpass', type: 'Defusal', image: '/images/maps/de_overpass.webp', isActive: normalizedCurrent.includes('de_overpass') },
      { id: '6', name: 'de_ancient', displayName: 'Ancient', type: 'Defusal', image: '/images/maps/de_ancient.webp', isActive: normalizedCurrent.includes('de_ancient') },
      { id: '7', name: 'de_anubis', displayName: 'Anubis', type: 'Defusal', image: '/images/maps/de_anubis.webp', isActive: normalizedCurrent.includes('de_anubis') },
      { id: '8', name: 'de_vertigo', displayName: 'Vertigo', type: 'Defusal', image: '/images/maps/de_vertigo.webp', isActive: normalizedCurrent.includes('de_vertigo') },
      { id: '9', name: 'cs_italy', displayName: 'Italy', type: 'Hostage', image: '/images/maps/de_italy.webp', isActive: normalizedCurrent.includes('cs_italy') || normalizedCurrent.includes('de_italy') },
      { id: '10', name: 'cs_office', displayName: 'Office', type: 'Hostage', image: '/images/maps/de_office.webp', isActive: normalizedCurrent.includes('cs_office') || normalizedCurrent.includes('de_office') }
    ]

    const wMaps: CS2Map[] = workshopMaps.map((m: any) => ({
      id: `w-${m.id}`,
      workshop_id: m.workshop_id,
      name: m.map_file || m.workshop_id,
      displayName: m.name,
      type: 'Workshop',
      image: m.image_url || '/images/maps/de_dust2.webp',
      isActive: normalizedCurrent.includes(m.workshop_id)
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
      toast.success(t('maps.map_change_success'))
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    },
    onError: (error: any) => {
      toast.error(error.message || t('maps.map_change_error'))
    }
  })

  const addWorkshopMutation = useMutation({
    mutationFn: ({ workshopId, mapFile }: { workshopId: string, mapFile: string }) => apiFetch('/api/maps/workshop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshop_id: workshopId, map_file: mapFile })
    }).then(res => res.json()),
    onSuccess: () => {
      toast.success(t('maps.workshop_added'))
      setNewWorkshopId('')
      setNewMapFile('')
      setIsModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['workshop-maps'] })
    },
    onError: () => toast.error(t('maps.workshop_add_error'))
  })

  const removeWorkshopMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/maps/workshop/${id.replace('w-', '')}`, {
      method: 'DELETE'
    }).then(res => res.json()),
    onSuccess: () => {
      toast.success(t('maps.workshop_removed'))
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
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {t('maps.title')}
          </h2>
          <p className="text-sm text-gray-400 mt-1">{t('maps.subtitle')}</p>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">{t('maps.switch_server')}</span>
          <div className="relative group">
            <ServerIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <select 
              className="bg-[#111827] border border-gray-800 text-white pl-10 pr-4 py-2 rounded-xl focus:ring-2 focus:ring-primary/50 transition-all outline-none text-sm min-w-[200px]"
              value={selectedServerId || ''}
              onChange={(e) => setSelectedServerId(Number(e.target.value))}
            >
              <option value="" disabled>{t('maps.select_server')}</option>
              {servers.map(s => (
                <option key={s.id} value={s.id} className="bg-[#0c1424]">{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text" 
              placeholder={t('maps.search_placeholder')}
              className="w-full bg-[#111827] border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-primary transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="bg-[#111827] border border-gray-800 rounded-2xl overflow-hidden p-2">
            {[{key: 'all', label: t('maps.all_maps')}, {key: 'Defusal', label: t('maps.defusal_maps')}, {key: 'Hostage', label: t('maps.hostage_maps')}, {key: 'Workshop', label: t('maps.workshop_maps')}].map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key as any)}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${activeCategory === cat.key ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-blue-600 hover:to-primary text-white py-4 rounded-xl font-bold text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={16} /> {t('maps.add_workshop')}
          </button>
        </div>

        <div className="lg:col-span-9">
          {selectedServer && (
            <div className="mb-8 p-4 bg-primary/5 border border-primary/20 rounded-3xl flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl overflow-hidden border border-primary/30 bg-gray-900">
                  <img 
                    src={activeMap?.image || '/images/maps/de_dust2.webp'} 
                    className={`w-full h-full object-cover ${!activeMap ? 'opacity-40 grayscale' : ''}`} 
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full animate-pulse ${isServerOnline ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                      {isServerOnline ? t('maps.active_now') : t('maps.server_offline')}
                    </span>
                  </div>
                  <h3 className="text-white font-bold">
                    {activeMap?.displayName || selectedServer.map || 'Unknown Map'}
                  </h3>
                </div>
              </div>
              {isServerOnline && activeMap && (
                <button 
                  onClick={() => changeMapMutation.mutate(activeMap)}
                  disabled={changeMapMutation.isPending}
                  className="px-6 py-2 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                >
                  {changeMapMutation.isPending ? <RefreshCcw size={16} className="animate-spin" /> : t('maps.restart')}
                </button>
              )}
            </div>
          )}

          {workshopLoading ? (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-800 rounded-3xl">
              <Loader2 className="animate-spin text-primary mb-4" />
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{t('maps.connecting_steam')}</p>
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
                      <button 
                        onClick={() => openConfigEditor(map)}
                        className="p-3 bg-gray-900/80 text-gray-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:text-white"
                      >
                        <Settings size={16} />
                      </button>
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
                <h3 className="text-white font-bold">{t('maps.add_workshop_title')}</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 ml-1">{t('maps.workshop_id_label')}</label>
                <input 
                  type="text" 
                  placeholder={t('maps.workshop_id_placeholder')}
                  className="w-full bg-[#0c1424] border border-gray-800 rounded-2xl py-4 px-6 text-white focus:border-primary transition-all outline-none text-lg font-mono placeholder:text-gray-700"
                  value={newWorkshopId}
                  onChange={(e) => setNewWorkshopId(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 ml-1">{t('maps.map_name_label')}</label>
                <input 
                  type="text" 
                  placeholder={t('maps.map_name_placeholder')}
                  className="w-full bg-[#0c1424] border border-gray-800 rounded-2xl py-4 px-6 text-white focus:border-primary transition-all outline-none text-lg font-mono placeholder:text-gray-700"
                  value={newMapFile}
                  onChange={(e) => setNewMapFile(e.target.value)}
                />
                <p className="mt-3 text-[10px] text-gray-600 flex items-center gap-2">
                  <Plus size={10} /> {t('maps.map_name_hint')}
                </p>
              </div>

              <button 
                onClick={() => addWorkshopMutation.mutate({ workshopId: newWorkshopId, mapFile: newMapFile })}
                disabled={!newWorkshopId || addWorkshopMutation.isPending}
                className="w-full bg-primary hover:bg-blue-600 disabled:opacity-50 text-white py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-xl shadow-primary/20"
              >
                {addWorkshopMutation.isPending ? t('maps.verifying') : t('maps.link_to_server')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Map Config Editor Modal */}
      {editingMapConfig && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-6">
          <div className="bg-[#111827] border border-gray-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#0d1421]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <Settings size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{t('maps.config_editor_title')} {editingMapConfig.displayName}</h3>
                  <p className="text-[10px] text-gray-500 font-mono tracking-widest mt-0.5 uppercase">quatrix_maps/{editingMapConfig.name}.cfg</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingMapConfig(null)} 
                className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 bg-black/40 p-1">
              <textarea 
                className="w-full h-full min-h-[400px] bg-transparent text-primary/90 p-8 font-mono text-sm outline-none resize-none leading-relaxed selection:bg-primary/20"
                spellCheck={false}
                placeholder={t('maps.config_placeholder')}
                value={currentConfig}
                onChange={(e) => setCurrentConfig(e.target.value)}
                autoFocus
              />
            </div>

            <div className="p-6 bg-[#0d1421] border-t border-gray-800 flex justify-between items-center">
              <div className="text-[10px] text-gray-500 flex items-center gap-2 font-bold uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                {t('maps.auto_executed')}
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setEditingMapConfig(null)}
                  className="px-6 py-2.5 text-xs font-bold text-gray-400 hover:text-white transition-all capitalize"
                >
                  {t('maps.discard')}
                </button>
                <button 
                  onClick={saveConfig}
                  disabled={isSavingConfig}
                  className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-8 py-2.5 rounded-xl text-xs font-black tracking-[0.1em] transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
                 >
                  {isSavingConfig ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                  {t('maps.save_configuration')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Maps
