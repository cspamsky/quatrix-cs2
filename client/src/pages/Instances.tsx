import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Play,
  Square,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import socket from '../utils/socket';
import { useConfirmDialog } from '../hooks/useConfirmDialog.js';
import ServerCard from '../components/ServerCard';
import ServerRow from '../components/ServerRow';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

interface Instance {
  id: number;
  name: string;
  map: string;
  status: 'ONLINE' | 'OFFLINE' | 'STARTING' | 'INSTALLING';
  current_players: number;
  max_players: number;
  port: number;
  workshop_map_name?: string;
  workshop_map_image?: string;
  isInstalled?: boolean;
}

const Instances = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showConfirm } = useConfirmDialog();
  const queryClient = useQueryClient();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [localInstances, setLocalInstances] = useState<Instance[]>([]);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [installingId, setInstallingId] = useState<number | null>(null);
  const [restartingId, setRestartingId] = useState<number | null>(null);
  const [startingId, setStartingId] = useState<number | null>(null);
  const [stoppingId, setStoppingId] = useState<number | null>(null);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('instances_view_mode') as 'grid' | 'list') || 'grid';
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [user] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : { permissions: [] };
    } catch {
      return { permissions: [] };
    }
  });

  const hasPerm = (p: string) => user?.permissions?.includes('*') || user?.permissions?.includes(p);

  // System Info Query
  const { data: serverIp = window.location.hostname } = useQuery({
    queryKey: ['system-info-ip'],
    queryFn: () =>
      apiFetch('/api/system-info')
        .then((res) => res.json())
        .then((data) => data.publicIp || window.location.hostname),
  });

  // Servers Query
  const { data: instances = [], isLoading: loading } = useQuery<Instance[]>({
    queryKey: ['servers'],
    queryFn: () => apiFetch('/api/servers').then((res) => res.json()),
  });

  // Synchronize local state with Query data
  useEffect(() => {
    if (instances) {
      setLocalInstances(instances);
    }
  }, [instances]);

  useEffect(() => {
    // Listen for real-time status updates
    socket.on('status_update', ({ serverId, status }: { serverId: number; status: string }) => {
      setLocalInstances((prev) =>
        prev.map((instance) =>
          instance.id === serverId
            ? { ...instance, status: status as Instance['status'] }
            : instance
        )
      );
      // Also update the cache so the status persists
      queryClient.setQueryData(['servers'], (old: Instance[] | undefined) =>
        old?.map((instance) =>
          instance.id === serverId
            ? { ...instance, status: status as Instance['status'] }
            : instance
        )
      );
    });

    // Listen for server updates (map changes, settings, etc.)
    socket.on('server_update', () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    });

    return () => {
      socket.off('status_update');
      socket.off('server_update');
    };
  }, [queryClient]);

  const fetchServers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['servers'] });
  }, [queryClient]);

  const handleDeleteServer = useCallback(
    async (id: number) => {
      const confirmed = await showConfirm({
        title: t('instances.delete_title'),
        message: t('instances.delete_confirm'),
        confirmText: t('common.delete'),
        cancelText: t('common.cancel'),
        type: 'danger',
      });

      if (!confirmed) return;

      setDeletingId(id);
      try {
        const response = await apiFetch(`/api/servers/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          toast.success(t('instances.delete_success'));
          setLocalInstances((prev) => prev.filter((i) => i.id !== id));
          queryClient.setQueryData(['servers'], (old: Instance[] | undefined) =>
            old?.filter((i) => i.id !== id)
          );
        } else {
          toast.error(t('instances.delete_error'));
        }
      } catch (error) {
        console.error('Delete server error:', error);
        toast.error('Connection Error: Unable to reach the server');
      } finally {
        setDeletingId(null);
      }
    },
    [showConfirm, queryClient, t]
  );

  const handleInstall = useCallback(
    async (id: number) => {
      setInstallingId(id);
      try {
        const response = await apiFetch(`/api/servers/${id}/install`, {
          method: 'POST',
        });
        if (response.ok) {
          navigate(`/instances/${id}/console`);
        } else {
          const data = await response.json();
          toast.error(data.message || t('instances.install_error'));
        }
      } catch (error) {
        console.error('Install error:', error);
        toast.error('Connection error');
      } finally {
        setInstallingId(null);
      }
    },
    [navigate, t]
  );

  const handleStartServer = useCallback(
    async (id: number) => {
      setStartingId(id);
      try {
        await toast.promise(
          (async () => {
            const response = await apiFetch(`/api/servers/${id}/start`, { method: 'POST' });
            if (!response.ok) {
              const data = await response.json();
              throw new Error(data.message || 'Failed to start server');
            }
            return response;
          })(),
          {
            loading: t('instances.start_loading'),
            success: t('instances.start_success'),
            error: (err) => err.message || t('instances.start_error'),
          }
        );
        fetchServers();
      } catch (error) {
        console.error('Start server error:', error);
      } finally {
        setStartingId(null);
      }
    },
    [fetchServers, t]
  );

  const handleStopServer = useCallback(
    async (id: number) => {
      setStoppingId(id);
      try {
        await toast.promise(
          (async () => {
            const response = await apiFetch(`/api/servers/${id}/stop`, { method: 'POST' });
            if (!response.ok) {
              const data = await response.json();
              throw new Error(data.message || 'Failed to stop server');
            }
            return response;
          })(),
          {
            loading: t('instances.stop_loading'),
            success: t('instances.stop_success'),
            error: (err) => err.message || t('instances.stop_error'),
          }
        );
        fetchServers();
      } catch (error) {
        console.error('Stop server error:', error);
      } finally {
        setStoppingId(null);
      }
    },
    [fetchServers, t]
  );

  const handleRestartServer = useCallback(
    async (id: number) => {
      setRestartingId(id);
      try {
        await toast.promise(
          (async () => {
            const response = await apiFetch(`/api/servers/${id}/restart`, { method: 'POST' });
            if (!response.ok) {
              const data = await response.json();
              throw new Error(data.message || 'Failed to restart server');
            }
            return response;
          })(),
          {
            loading: t('instances.restart_loading'),
            success: t('instances.restart_success'),
            error: (err) => err.message || t('instances.restart_error'),
          }
        );
        fetchServers();
      } catch (error) {
        console.error('Restart error:', error);
      } finally {
        setRestartingId(null);
      }
    },
    [fetchServers, t]
  );

  const copyToClipboard = useCallback(
    (text: string, id: string) => {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopiedId(id);
            toast.success(t('instances.copy_success'));
            setTimeout(() => setCopiedId(null), 2000);
          })
          .catch((err) => {
            console.error('Failed to copy text: ', err);
            toast.error(t('instances.copy_error'));
          });
      } else {
        try {
          const textArea = document.createElement('textarea');
          textArea.value = text;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          setCopiedId(id);
          toast.success(t('instances.copy_success'));
          setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
          console.error('Fallback copy failed: ', err);
          toast.error(t('instances.copy_unsupported'));
        }
      }
    },
    [t]
  );

  const handleConsoleNavigate = useCallback(
    (id: number) => {
      navigate(`/instances/${id}/console`);
    },
    [navigate]
  );

  const handleSettingsNavigate = useCallback(
    (id: number) => {
      navigate(`/instances/${id}/settings`);
    },
    [navigate]
  );

  const handleFilesNavigate = useCallback(
    (id: number) => {
      navigate(`/instances/${id}/files`);
    },
    [navigate]
  );

  const toggleViewMode = () => {
    const nextMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(nextMode);
    localStorage.setItem('instances_view_mode', nextMode);
  };

  const handleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredInstances.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInstances.map((i) => i.id)));
    }
  };

  const handleBulkAction = async (action: 'start' | 'stop' | 'restart' | 'delete') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (action === 'delete') {
      const confirmed = await showConfirm({
        title: t('instances.delete_title'),
        message: t('instances.bulk_delete_confirm', { count: ids.length }),
        confirmText: t('common.delete'),
        cancelText: t('common.cancel'),
        type: 'danger',
      });
      if (!confirmed) return;
    }

    const toastId = toast.loading(t(`instances.bulk_${action}_loading`, { count: ids.length }));

    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await apiFetch(`/api/servers/${id}/${action}`, { method: 'POST' });
            return { id, ok: res.ok };
          } catch {
            return { id, ok: false };
          }
        })
      );

      const successCount = results.filter((r) => r.ok).length;
      if (successCount === ids.length) {
        toast.success(t(`instances.bulk_${action}_success`, { count: successCount }), {
          id: toastId,
        });
      } else {
        toast.error(
          t(`instances.bulk_${action}_partial`, { success: successCount, total: ids.length }),
          { id: toastId }
        );
      }

      if (action === 'delete') {
        setSelectedIds(new Set());
      }
      fetchServers();
    } catch {
      toast.error(t('common.error'), { id: toastId });
    }
  };

  const filteredInstances = localInstances.filter(
    (instance) =>
      (instance.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (instance.map?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      instance.id?.toString().includes(searchQuery)
  );

  return (
    <div className="p-6 min-h-screen flex flex-col">
      <div className="flex-1">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{t('instances.title')}</h2>
            <p className="text-sm text-gray-400 mt-1">{t('instances.subtitle')}</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex bg-[#111827] border border-gray-800 rounded-xl p-1 shrink-0 shadow-sm shadow-black/20">
              <button
                onClick={() => toggleViewMode()}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-gray-300'}`}
                title="Grid View"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => toggleViewMode()}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-gray-300'}`}
                title="List View"
              >
                <List size={18} />
              </button>
            </div>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <input
                aria-label={t('instances.filter_placeholder')}
                className="w-48 lg:w-64 pl-10 pr-4 py-2 bg-[#111827] border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200"
                placeholder={t('instances.filter_placeholder')}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {hasPerm('servers.create') && (
              <button
                onClick={() => navigate('/instances/create')}
                className="bg-primary hover:bg-blue-600 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center transition-all shadow-lg shadow-blue-500/20 active:scale-95 whitespace-nowrap"
              >
                <Plus className="mr-2 w-4 h-4" />
                {t('instances.create_new')}
              </button>
            )}
          </div>
        </header>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="mb-6 animate-in slide-in-from-top duration-300">
            <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSelectAll}
                  className="bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-blue-600 active:scale-95"
                >
                  {selectedIds.size === filteredInstances.length
                    ? t('common.deselect_all')
                    : t('common.select_all')}
                </button>
                <span className="text-sm font-semibold text-primary">
                  {t('instances.selected_count', { count: selectedIds.size })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hasPerm('servers.update') && (
                  <>
                    <button
                      onClick={() => handleBulkAction('start')}
                      className="p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 transition-all border border-green-500/10"
                      title={t('common.start')}
                    >
                      <Play size={18} className="fill-current" />
                    </button>
                    <button
                      onClick={() => handleBulkAction('stop')}
                      className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-all border border-red-500/10"
                      title={t('common.stop')}
                    >
                      <Square size={18} className="fill-current" />
                    </button>
                    <button
                      onClick={() => handleBulkAction('restart')}
                      className="p-2 bg-amber-500/10 text-amber-500 rounded-lg hover:bg-amber-500/20 transition-all border border-amber-500/10"
                      title={t('common.restart')}
                    >
                      <RefreshCw size={18} />
                    </button>
                    <div className="w-px h-6 bg-primary/20 mx-1" />
                  </>
                )}
                {hasPerm('servers.delete') && (
                  <button
                    onClick={() => handleBulkAction('delete')}
                    className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                    title={t('common.delete')}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {loading && filteredInstances.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400">Loading servers...</div>
          </div>
        ) : filteredInstances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-gray-400 mb-4">{t('instances.no_servers')}</p>
            <button
              onClick={() => navigate('/instances/create')}
              className="px-6 py-2 bg-primary hover:bg-blue-600 text-white rounded-xl font-semibold transition-all"
            >
              {t('instances.create_btn')}
            </button>
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                : 'flex flex-col gap-3'
            }
          >
            {filteredInstances.map((instance) =>
              viewMode === 'grid' ? (
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
                  isSelected={selectedIds.has(instance.id)}
                  onSelect={handleSelect}
                  userPermissions={user.permissions}
                />
              ) : (
                <ServerRow
                  key={instance.id}
                  instance={instance}
                  serverIp={serverIp}
                  isSelected={selectedIds.has(instance.id)}
                  onSelect={handleSelect}
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
                  onConsole={handleConsoleNavigate}
                  onSettings={handleSettingsNavigate}
                  onFiles={handleFilesNavigate}
                  onCopy={copyToClipboard}
                  copiedId={copiedId}
                  userPermissions={user.permissions}
                />
              )
            )}
          </div>
        )}
      </div>

      {!loading && localInstances.length > 0 && (
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-[#111827] rounded-xl border border-gray-800/60 shadow-inner">
          <div className="flex items-center space-x-10">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">
                {t('instances.total_active')}
              </span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl font-bold text-white">
                  {localInstances.filter((i) => i.status === 'ONLINE').length}
                </span>
                <span className="text-gray-500 text-sm">/ {localInstances.length}</span>
              </div>
            </div>
            <div className="w-px h-8 bg-gray-800"></div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">
                {t('instances.player_count')}
              </span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl font-bold text-white">
                  {localInstances.reduce((sum, i) => sum + i.current_players, 0)}
                </span>
                <span className="text-gray-500 text-sm">
                  / {localInstances.reduce((sum, i) => sum + i.max_players, 0)}
                </span>
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
            <button className="w-8 h-8 flex items-center justify-center bg-primary text-white rounded-md text-xs font-bold shadow-sm">
              1
            </button>
            <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-800 rounded-md text-xs font-medium transition-colors border border-transparent">
              2
            </button>
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
  );
};

export default Instances;
