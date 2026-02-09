import { useState, useMemo, useEffect } from 'react';
import { Search, RefreshCcw, Server as ServerIcon, Loader2, Plus } from 'lucide-react';
import { apiFetch } from '../utils/api';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import MapCard from '../components/maps/MapCard.js';
import WorkshopModal from '../components/maps/WorkshopModal.js';
import MapConfigEditor from '../components/maps/MapConfigEditor.js';

interface CS2Map {
  id: string;
  workshop_id?: string;
  name: string;
  displayName: string;
  type: 'Defusal' | 'Hostage' | 'Workshop';
  image: string;
  isActive: boolean;
}

interface Instance {
  id: number;
  name: string;
  status: string;
  map: string;
}

interface WorkshopMapData {
  id: number;
  workshop_id: string;
  map_file?: string;
  name: string;
  image_url?: string;
}

const Maps = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'Defusal' | 'Hostage' | 'Workshop'>(
    'all'
  );
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWorkshopId, setNewWorkshopId] = useState('');
  const [newMapFile, setNewMapFile] = useState('');
  const [editingMapConfig, setEditingMapConfig] = useState<CS2Map | null>(null);
  const [currentConfig, setCurrentConfig] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // 1. Fetch Servers
  const { data: servers = [] } = useQuery<Instance[]>({
    queryKey: ['servers'],
    queryFn: () => apiFetch('/api/servers').then((res) => res.json()),
  });

  useEffect(() => {
    if (servers && servers.length > 0 && !selectedServerId) {
      setSelectedServerId(servers.find((s) => s.status === 'ONLINE')?.id || servers[0].id);
    }
  }, [servers, selectedServerId]);

  // 2. Fetch Workshop Maps from DB
  const { data: workshopMaps = [], isLoading: workshopLoading } = useQuery({
    queryKey: ['workshop-maps'],
    queryFn: () => apiFetch('/api/maps/workshop').then((res) => res.json()),
  });

  const openConfigEditor = async (map: CS2Map) => {
    if (!selectedServerId) return;
    setEditingMapConfig(map);
    try {
      const response = await apiFetch(`/api/maps/config/${selectedServerId}/${map.name}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentConfig(data.content);
      }
    } catch {
      toast.error(t('maps.config_load_error'));
    }
  };

  const saveConfig = async () => {
    if (!selectedServerId || !editingMapConfig) return;
    setIsSavingConfig(true);
    try {
      const response = await apiFetch(
        `/api/maps/config/${selectedServerId}/${editingMapConfig.name}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: currentConfig }),
        }
      );
      if (response.ok) {
        toast.success(t('maps.config_save_success'));
        setEditingMapConfig(null);
      } else {
        toast.error(t('maps.config_save_error'));
      }
    } catch {
      toast.error(t('maps.connection_error'));
    } finally {
      setIsSavingConfig(false);
    }
  };

  // 3. Combine Static Maps and Workshop Maps
  const maps = useMemo(() => {
    const currentServer = servers.find((s) => s.id === selectedServerId);
    const currentMapName = currentServer?.map || '';
    const normalizedCurrent = currentMapName.toLowerCase();

    const staticMaps: CS2Map[] = [
      {
        id: '1',
        name: 'de_dust2',
        displayName: 'Dust II',
        type: 'Defusal',
        image: '/images/maps/de_dust2.webp',
        isActive: normalizedCurrent.includes('de_dust2'),
      },
      {
        id: '2',
        name: 'de_inferno',
        displayName: 'Inferno',
        type: 'Defusal',
        image: '/images/maps/de_inferno.webp',
        isActive: normalizedCurrent.includes('de_inferno'),
      },
      {
        id: '3',
        name: 'de_mirage',
        displayName: 'Mirage',
        type: 'Defusal',
        image: '/images/maps/de_mirage.webp',
        isActive: normalizedCurrent.includes('de_mirage'),
      },
      {
        id: '4',
        name: 'de_nuke',
        displayName: 'Nuke',
        type: 'Defusal',
        image: '/images/maps/de_nuke_cs2.webp',
        isActive: normalizedCurrent.includes('de_nuke'),
      },
      {
        id: '5',
        name: 'de_overpass',
        displayName: 'Overpass',
        type: 'Defusal',
        image: '/images/maps/de_overpass.webp',
        isActive: normalizedCurrent.includes('de_overpass'),
      },
      {
        id: '6',
        name: 'de_ancient',
        displayName: 'Ancient',
        type: 'Defusal',
        image: '/images/maps/de_ancient.webp',
        isActive: normalizedCurrent.includes('de_ancient'),
      },
      {
        id: '7',
        name: 'de_anubis',
        displayName: 'Anubis',
        type: 'Defusal',
        image: '/images/maps/de_anubis.webp',
        isActive: normalizedCurrent.includes('de_anubis'),
      },
      {
        id: '8',
        name: 'de_vertigo',
        displayName: 'Vertigo',
        type: 'Defusal',
        image: '/images/maps/de_vertigo.webp',
        isActive: normalizedCurrent.includes('de_vertigo'),
      },
      {
        id: '9',
        name: 'cs_italy',
        displayName: 'Italy',
        type: 'Hostage',
        image: '/images/maps/de_italy.webp',
        isActive: normalizedCurrent.includes('cs_italy') || normalizedCurrent.includes('de_italy'),
      },
      {
        id: '10',
        name: 'cs_office',
        displayName: 'Office',
        type: 'Hostage',
        image: '/images/maps/de_office.webp',
        isActive:
          normalizedCurrent.includes('cs_office') || normalizedCurrent.includes('de_office'),
      },
    ];

    const wMaps: CS2Map[] = workshopMaps.map((m: WorkshopMapData) => ({
      id: `w-${m.id}`,
      workshop_id: m.workshop_id,
      name: m.map_file || m.workshop_id,
      displayName: m.name,
      type: 'Workshop',
      image: m.image_url || '/images/maps/de_dust2.webp',
      isActive: normalizedCurrent.includes(m.workshop_id),
    }));

    return [...staticMaps, ...wMaps];
  }, [servers, selectedServerId, workshopMaps]);

  // 4. Mutations
  const changeMapMutation = useMutation({
    mutationFn: (map: CS2Map) => {
      const command =
        map.type === 'Workshop' ? `host_workshop_map ${map.workshop_id}` : `map ${map.name}`;
      return apiFetch(`/api/servers/${selectedServerId}/rcon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'RCON Failure');
        return data;
      });
    },
    onSuccess: () => {
      toast.success(t('maps.map_change_success'));
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('maps.map_change_error'));
    },
  });

  const addWorkshopMutation = useMutation({
    mutationFn: ({ workshopId, mapFile }: { workshopId: string; mapFile: string }) =>
      apiFetch('/api/maps/workshop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: workshopId, map_file: mapFile }),
      }).then((res) => res.json()),
    onSuccess: () => {
      toast.success(t('maps.workshop_added'));
      setNewWorkshopId('');
      setNewMapFile('');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['workshop-maps'] });
    },
    onError: () => toast.error(t('maps.workshop_add_error')),
  });

  const removeWorkshopMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/maps/workshop/${id.replace('w-', '')}`, {
        method: 'DELETE',
      }).then((res) => res.json()),
    onSuccess: () => {
      toast.success(t('maps.workshop_removed'));
      queryClient.invalidateQueries({ queryKey: ['workshop-maps'] });
    },
  });

  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedServerId),
    [servers, selectedServerId]
  );
  const isServerOnline = selectedServer?.status === 'ONLINE';

  const filteredMaps = useMemo(() => {
    return maps.filter((m) => {
      const matchesSearch = (m.displayName?.toLowerCase() || '').includes(
        searchQuery.toLowerCase()
      );
      const matchesCat = activeCategory === 'all' || m.type === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [maps, activeCategory, searchQuery]);

  const activeMap = maps.find((m) => m.isActive);

  return (
    <div className="p-6 font-display max-h-screen overflow-y-auto scrollbar-hide">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('maps.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('maps.subtitle')}</p>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">
            {t('maps.switch_server')}
          </span>
          <div className="relative group">
            <ServerIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <select
              className="bg-[#111827] border border-gray-800 text-white pl-10 pr-4 py-2 rounded-xl focus:ring-2 focus:ring-primary/50 transition-all outline-none text-sm min-w-[200px]"
              value={selectedServerId || ''}
              onChange={(e) => setSelectedServerId(Number(e.target.value))}
            >
              <option value="" disabled>
                {t('maps.select_server')}
              </option>
              {servers.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#0c1424]">
                  {s.name}
                </option>
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
            {[
              { key: 'all', label: t('maps.all_maps') },
              { key: 'Defusal', label: t('maps.defusal_maps') },
              { key: 'Hostage', label: t('maps.hostage_maps') },
              { key: 'Workshop', label: t('maps.workshop_maps') },
            ].map((cat) => (
              <button
                key={cat.key}
                onClick={() =>
                  setActiveCategory(cat.key as 'all' | 'Defusal' | 'Hostage' | 'Workshop')
                }
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
                    <span
                      className={`w-2 h-2 rounded-full animate-pulse ${isServerOnline ? 'bg-green-500' : 'bg-gray-500'}`}
                    ></span>
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
                  {changeMapMutation.isPending ? (
                    <RefreshCcw size={16} className="animate-spin" />
                  ) : (
                    t('maps.restart')
                  )}
                </button>
              )}
            </div>
          )}

          {workshopLoading ? (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-800 rounded-3xl">
              <Loader2 className="animate-spin text-primary mb-4" />
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                {t('maps.connecting_steam')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredMaps.map((map) => (
                <MapCard
                  key={map.id}
                  map={map}
                  onOpenConfig={openConfigEditor}
                  onRemoveWorkshop={(id) => removeWorkshopMutation.mutate(id)}
                  onChangeMap={(m) => changeMapMutation.mutate(m)}
                  isServerOnline={isServerOnline}
                  isChanging={changeMapMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <WorkshopModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        workshopId={newWorkshopId}
        onWorkshopIdChange={setNewWorkshopId}
        mapFile={newMapFile}
        onMapFileChange={setNewMapFile}
        onSubmit={() =>
          addWorkshopMutation.mutate({ workshopId: newWorkshopId, mapFile: newMapFile })
        }
        isPending={addWorkshopMutation.isPending}
      />

      <MapConfigEditor
        map={editingMapConfig}
        onClose={() => setEditingMapConfig(null)}
        configContent={currentConfig}
        onConfigChange={setCurrentConfig}
        onSave={saveConfig}
        isSaving={isSavingConfig}
      />
    </div>
  );
};

export default Maps;
