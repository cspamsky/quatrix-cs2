import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cpu,
  Zap,
  Server as ServerIcon,
  Loader2,
  Box,
  Layers,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Tag,
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import toast from 'react-hot-toast';
import { useConfirmDialog } from '../hooks/useConfirmDialog.js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ConfigEditor from '../components/plugins/ConfigEditor.js';
import UploadModal from '../components/plugins/UploadModal.js';
import PoolTable from '../components/plugins/PoolTable.js';
import PluginRow from '../components/plugins/PluginRow.js';

interface Instance {
  id: number;
  name: string;
  status: string;
}

interface PluginInfo {
  id: string;
  name: string;
  githubRepo?: string;
  category: 'core' | 'metamod' | 'cssharp';
  description?: string;
  tags?: string[];
  inPool: boolean;
  isCustom?: boolean;
}

const Plugins = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showConfirm } = useConfirmDialog();
  const queryClient = useQueryClient();

  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'core' | 'metamod' | 'cssharp'>(
    'all'
  );
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'installed' | 'not-installed' | 'update'
  >('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Config Editor State
  const [configModalPlugin, setConfigModalPlugin] = useState<{ id: string; name: string } | null>(
    null
  );
  const [configFiles, setConfigFiles] = useState<{ name: string; path: string }[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
  const [activeTab, setActiveTab] = useState<'instances' | 'pool'>('instances');

  // Upload Modal State
  const [uploadModalPlugin, setUploadModalPlugin] = useState<{ id: string; name: string } | null>(
    null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // 1. Fetch Plugin Registry (Global Pool)
  const { data: registry = {}, isLoading: registryLoading } = useQuery<Record<string, PluginInfo>>({
    queryKey: ['plugin-registry'],
    queryFn: () => apiFetch('/api/servers/plugins/registry').then((res) => res.json()),
  });

  // 2. Fetch Server Instances (Dropdown)
  const { data: instances = [], isLoading: instancesLoading } = useQuery<Instance[]>({
    queryKey: ['servers'],
    queryFn: () => apiFetch('/api/servers').then((res) => res.json()),
  });

  // Set default selected server
  useEffect(() => {
    if (instances.length > 0 && !selectedServer) {
      setSelectedServer(instances[0].id.toString());
    }
  }, [instances, selectedServer]);

  // 3. Fetch Plugin Status for selected server
  const { data: pluginStatus = {} } = useQuery<
    Record<string, { installed: boolean; hasConfigs: boolean }>
  >({
    queryKey: ['plugin-status', selectedServer],
    queryFn: () =>
      apiFetch(`/api/servers/${selectedServer}/plugins/status`).then((res) => res.json()),
    enabled: !!selectedServer,
    refetchInterval: 15000, // Automatic polling every 15s
  });

  // 4. Fetch Plugin Updates for selected server
  const { data: pluginUpdates = null } = useQuery<Record<
    string,
    { hasUpdate: boolean; currentVersion?: string; latestVersion?: string }
  > | null>({
    queryKey: ['plugin-updates', selectedServer],
    queryFn: () =>
      apiFetch(`/api/servers/${selectedServer}/plugins/updates`).then((res) => res.json()),
    enabled: !!selectedServer,
  });

  const handleAction = async (plugin: string, action: 'install' | 'uninstall' | 'update') => {
    if (!selectedServer) return;

    const pluginInfo = registry[plugin];
    const pluginName = pluginInfo?.name || plugin;

    // Logic guards
    if (action === 'install') {
      if (pluginInfo.category === 'cssharp' && !pluginStatus.metamod?.installed) {
        return toast.error(t('plugins.metamod_required'));
      }
      if (
        pluginInfo.category === 'cssharp' &&
        plugin !== 'cssharp' &&
        !pluginStatus.cssharp?.installed
      ) {
        return toast.error(t('plugins.cssharp_required'));
      }
    }

    const confirmed = await showConfirm({
      title: `${t(`plugins.${action}_confirm_title`)} ${pluginName}?`,
      message: `${t(`plugins.${action}_confirm_message`)}`,
      confirmText: `${t(`plugins.${action}_confirm_title`)} ${t('plugins.confirm_action')}`,
      type: action === 'uninstall' ? 'danger' : 'warning',
    });

    if (!confirmed) return;

    setActionLoading(plugin);
    try {
      const response = await apiFetch(
        `/api/servers/${selectedServer}/plugins/${plugin}/${action}`,
        { method: 'POST' }
      );
      const data = await response.json();

      if (response.ok) {
        toast.success(`${pluginName} ${t('plugins.action_success')}`);
        // Invalidate queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ['plugin-status', selectedServer] });
        queryClient.invalidateQueries({ queryKey: ['plugin-updates', selectedServer] });
      } else {
        if (data.message === 'ERR_SERVER_RUNNING') {
          toast.error(t('plugins.server_running_error'));
        } else {
          toast.error(data.message || t('plugins.action_failed'));
        }
      }
    } catch {
      toast.error(t('plugins.network_error'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('pluginId', uploadModalPlugin?.id || 'unknown');
    formData.append('pluginZip', selectedFile);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || ''}/api/servers/plugins/pool/upload`,
        {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      const data = await response.json();

      if (response.ok) {
        toast.success(t('plugins.upload_success'));
        setUploadModalPlugin(null);
        setSelectedFile(null);
        queryClient.invalidateQueries({ queryKey: ['plugin-registry'] });
      } else {
        toast.error(data.message || t('plugins.upload_failed'));
      }
    } catch {
      toast.error(t('plugins.network_error'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePool = async (pluginId: string) => {
    const confirmed = await showConfirm({
      title: t('plugins.remove_from_pool_title'),
      message: t('plugins.remove_from_pool_message', { pluginId }),
      confirmText: t('plugins.delete'),
      type: 'danger',
    });
    if (!confirmed) return;

    try {
      const response = await apiFetch(`/api/servers/plugins/pool/${pluginId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        toast.success(t('plugins.delete_success'));
        queryClient.invalidateQueries({ queryKey: ['plugin-registry'] });
      } else {
        const data = await response.json();
        toast.error(data.message || t('plugins.delete_failed'));
      }
    } catch {
      toast.error(t('plugins.network_error'));
    }
  };

  const allPlugins = useMemo(
    () => Object.entries(registry).map(([id, info]) => ({ ...(info as PluginInfo), id })),
    [registry]
  );

  const openConfigEditor = async (pluginId: string, pluginName: string) => {
    if (!selectedServer) return;

    setConfigModalPlugin({ id: pluginId, name: pluginName });
    setIsLoadingConfigs(true);
    setConfigFiles([]);
    setSelectedFilePath(null);
    setEditingContent('');

    try {
      const res = await apiFetch(`/api/servers/${selectedServer}/plugins/${pluginId}/configs`);
      const files = await res.json();
      setConfigFiles(files);

      if (files.length > 0) {
        handleFileSelect(files[0].path);
      }
    } catch {
      toast.error(t('plugins.config_load_failed'));
    } finally {
      setIsLoadingConfigs(false);
    }
  };

  const handleFileSelect = async (filePath: string) => {
    if (!selectedServer) return;
    setSelectedFilePath(filePath);
    setEditingContent('');

    try {
      const res = await apiFetch(
        `/api/servers/${selectedServer}/files/read?path=${encodeURIComponent(filePath)}`
      );
      const data = await res.json();
      if (data.content !== undefined) {
        setEditingContent(data.content);
      }
    } catch {
      toast.error(t('plugins.config_load_failed'));
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedServer || !selectedFilePath || !configModalPlugin) return;

    setIsSaving(true);
    try {
      const res = await apiFetch(
        `/api/servers/${selectedServer}/plugins/${configModalPlugin.id}/configs`,
        {
          method: 'POST',
          body: JSON.stringify({
            filePath: selectedFilePath,
            content: editingContent,
          }),
        }
      );

      if (res.ok) {
        toast.success(t('plugins.config_saved'));
      } else {
        const data = await res.json();
        toast.error(data.message || t('plugins.config_save_failed'));
      }
    } catch {
      toast.error(t('plugins.network_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPlugins = useMemo(() => {
    return allPlugins.filter((plugin) => {
      // Search filter
      const matchesSearch =
        (plugin.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (plugin.description?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (plugin.id?.toLowerCase() || '').includes(searchQuery.toLowerCase());

      // Category filter
      const matchesCategory = activeCategory === 'all' || plugin.category === activeCategory;

      // Status filter
      const isInstalled = !!pluginStatus[plugin.id]?.installed;
      const hasUpdate = pluginUpdates?.[plugin.id]?.hasUpdate;
      let matchesStatus = true;
      if (statusFilter === 'installed') matchesStatus = isInstalled;
      if (statusFilter === 'not-installed') matchesStatus = !isInstalled;
      if (statusFilter === 'update') matchesStatus = isInstalled && hasUpdate === true;

      // Tag filter
      const matchesTag = !selectedTag || plugin.tags?.includes(selectedTag);

      return matchesSearch && matchesCategory && matchesStatus && matchesTag;
    });
  }, [
    allPlugins,
    searchQuery,
    activeCategory,
    statusFilter,
    selectedTag,
    pluginStatus,
    pluginUpdates,
  ]);

  const allTags = useMemo(
    () => Array.from(new Set(allPlugins.flatMap((p) => p.tags || []))).sort(),
    [allPlugins]
  );

  // Filters for Pool Tab
  const poolPlugins = useMemo(() => {
    return allPlugins.filter((plugin) => {
      const matchesSearch =
        (plugin.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (plugin.id?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === 'all' || plugin.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [allPlugins, searchQuery, activeCategory]);

  const TabSwitcher = () => (
    <div className="flex items-center gap-1 bg-[#111827]/40 p-1 rounded-2xl border border-gray-800/50 shrink-0">
      <button
        onClick={() => setActiveTab('instances')}
        className={`flex items-center gap-3 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'instances' ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
      >
        <ServerIcon size={14} />
        {t('plugins.server_management')}
      </button>
      <button
        onClick={() => setActiveTab('pool')}
        className={`flex items-center gap-3 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'pool' ? 'bg-orange-500 text-white shadow-xl shadow-orange-500/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
      >
        <Box size={14} />
        {t('plugins.global_repository')}
      </button>
    </div>
  );

  const renderUnifiedPluginTable = () => {
    const sections = [
      {
        id: 'core',
        name: t('plugins.core_foundations'),
        icon: <Layers size={14} className="text-primary" />,
      },
      {
        id: 'metamod',
        name: t('plugins.metamod_plugin'),
        icon: <Cpu size={14} className="text-primary" />,
      },
      {
        id: 'cssharp',
        name: t('plugins.cssharp_plugin'),
        icon: <Zap size={14} className="text-primary" />,
      },
    ];

    const categories = ['all', 'core', 'metamod', 'cssharp'] as const;
    const statuses = [
      { id: 'all', label: t('plugins.all_status'), icon: <Box size={14} /> },
      {
        id: 'installed',
        label: t('plugins.installed'),
        icon: <CheckCircle2 size={14} className="text-green-500" />,
      },
      {
        id: 'not-installed',
        label: t('plugins.not_installed'),
        icon: <XCircle size={14} className="text-gray-500" />,
      },
      {
        id: 'update',
        label: t('plugins.updates_available'),
        icon: <AlertCircle size={14} className="text-yellow-500" />,
      },
    ] as const;

    return (
      <div className="flex flex-col gap-6 max-h-[calc(100vh-250px)]">
        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row gap-4 shrink-0">
          <TabSwitcher />
          <div className="relative flex-1 group">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors"
              size={18}
            />
            <input
              type="text"
              placeholder={t('plugins.search_plugins')}
              className="w-full bg-[#111827]/40 border border-gray-800/50 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:bg-primary/[0.02] transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 bg-[#111827]/40 border border-gray-800/50 p-1.5 rounded-2xl overflow-x-auto scrollbar-hide w-full lg:w-auto min-w-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${activeCategory === cat ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {t(`plugins.${cat === 'all' ? 'all_categories' : cat}`)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-[#111827]/40 border border-gray-800/50 p-1.5 rounded-2xl overflow-x-auto scrollbar-hide w-full lg:w-auto min-w-0">
            {statuses.map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${statusFilter === s.id ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tag Cloud */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 pb-2 scrollbar-hide w-full min-w-0 shrink-0">
          <Tag size={14} className="text-primary mr-2 shrink-0" />
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all border shrink-0 ${!selectedTag ? 'bg-primary/10 border-primary text-primary' : 'border-gray-800 text-gray-500 hover:border-gray-700'}`}
          >
            {t('plugins.all_tags')}
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all border shrink-0 ${selectedTag === tag ? 'bg-primary/20 border-primary/50 text-primary' : 'border-gray-800 text-gray-500 hover:border-gray-700'}`}
            >
              #{tag}
            </button>
          ))}
        </div>

        <div className="bg-[#111827]/40 border border-gray-800/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="overflow-y-auto scrollbar-hide">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-30 bg-[#0c1424] border-b border-gray-800/80">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 w-1/4">
                    {t('plugins.plugin')}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 hidden lg:table-cell">
                    {t('plugins.status')}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 w-1/6">
                    {t('plugins.version')}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 text-right w-1/6">
                    {t('plugins.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/20">
                {instances.length > 0
                  ? sections.map((section) => {
                      const sectionPlugins = filteredPlugins.filter(
                        (p) => p.category === section.id
                      );
                      if (sectionPlugins.length === 0) return null;

                      return (
                        <React.Fragment key={section.id}>
                          <tr className="bg-primary/[0.03] border-y border-gray-800/40">
                            <td colSpan={4} className="px-6 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
                                  {section.icon}
                                </div>
                                <span className="text-[11px] font-black text-gray-300 uppercase tracking-[0.2em]">
                                  {section.name}
                                </span>
                                {section.id === 'metamod' &&
                                  !pluginStatus['metamod']?.installed && (
                                    <span className="text-[8px] font-bold text-yellow-500/60 bg-yellow-500/5 px-2 py-0.5 rounded border border-yellow-500/10 uppercase ml-2">
                                      {t('plugins.requires_metamod')}
                                    </span>
                                  )}
                                {section.id === 'cssharp' &&
                                  !pluginStatus['cssharp']?.installed && (
                                    <span className="text-[8px] font-bold text-yellow-500/60 bg-yellow-500/5 px-2 py-0.5 rounded border border-yellow-500/10 uppercase ml-2">
                                      {t('plugins.requires_cssharp')}
                                    </span>
                                  )}
                                <span className="ml-auto text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                                  {sectionPlugins.length} {t('plugins.found')}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {sectionPlugins.map((info) => (
                            <PluginRow
                              key={info.id}
                              id={info.id}
                              info={info}
                              status={pluginStatus[info.id]}
                              updates={pluginUpdates?.[info.id]}
                              actionLoading={actionLoading}
                              onAction={handleAction}
                              onOpenConfig={openConfigEditor}
                              onOpenUpload={(id, name) => setUploadModalPlugin({ id, name })}
                              metamodInstalled={!!pluginStatus['metamod']?.installed}
                              cssharpInstalled={!!pluginStatus['cssharp']?.installed}
                            />
                          ))}
                        </React.Fragment>
                      );
                    })
                  : !instancesLoading && (
                      <tr>
                        <td colSpan={4} className="px-6 py-20 text-center">
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                              <Box size={24} />
                            </div>
                            <div>
                              <h4 className="text-white font-bold uppercase tracking-widest text-sm italic">
                                {t('plugins.no_instances_title')}
                              </h4>
                              <p className="text-xs text-gray-500 mt-1">
                                {t('plugins.no_instances_message')}
                              </p>
                              <button
                                onClick={() => navigate('/instances')}
                                className="mt-6 px-8 py-3 bg-primary/10 text-primary border border-primary/20 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-primary/20 transition-all"
                              >
                                {t('plugins.go_to_instances')}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                {filteredPlugins.length === 0 && instances.length > 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center">
                          <Search size={24} className="text-gray-700" />
                        </div>
                        <div>
                          <h4 className="text-gray-400 font-bold uppercase tracking-widest text-sm">
                            {t('plugins.no_results_title')}
                          </h4>
                          <p className="text-xs text-gray-600 mt-1">
                            {t('plugins.no_results_message')}
                          </p>
                          <button
                            onClick={() => {
                              setSearchQuery('');
                              setActiveCategory('all');
                              setStatusFilter('all');
                              setSelectedTag(null);
                            }}
                            className="mt-4 text-primary text-[10px] font-black uppercase tracking-widest hover:underline"
                          >
                            {t('plugins.clear_filters')}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if ((instancesLoading || registryLoading) && instances.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-gray-400 font-bold animate-pulse uppercase tracking-[0.2em] text-xs">
          {t('plugins.synchronizing')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 font-display overflow-y-auto max-h-[calc(100vh-64px)] scrollbar-hide">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {activeTab === 'instances'
              ? t('plugins.instance_plugins')
              : t('plugins.plugin_repository')}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {activeTab === 'instances'
              ? t('plugins.instance_subtitle')
              : t('plugins.repository_subtitle')}
          </p>
        </div>

        <div className="flex items-end gap-4">
          <button
            onClick={() => setUploadModalPlugin({ id: 'unknown', name: 'New Custom Plugin' })}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-500 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-500/20 transition-all border border-orange-500/20"
          >
            <Layers size={14} />
            {t('plugins.upload_zip')}
          </button>

          {activeTab === 'instances' && (
            <div className="flex flex-col items-end animate-in fade-in slide-in-from-right-4 duration-300">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">
                {t('plugins.switch_server')}
              </span>
              <div className="relative group">
                <ServerIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                <select
                  className="bg-[#111827] border border-gray-800 text-white pl-10 pr-4 py-2 rounded-xl focus:ring-2 focus:ring-primary/50 transition-all outline-none text-sm min-w-[200px]"
                  value={selectedServer || ''}
                  onChange={(e) => setSelectedServer(e.target.value)}
                >
                  <option value="" disabled>
                    {t('plugins.select_server')}
                  </option>
                  {instances.map((inst: Instance) => (
                    <option key={inst.id} value={inst.id} className="bg-[#0c1424]">
                      {inst.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </header>

      {activeTab === 'instances' ? (
        renderUnifiedPluginTable()
      ) : (
        <PoolTable
          plugins={poolPlugins}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={(cat) => setActiveCategory(cat as any)}
          onDelete={handleDeletePool}
          onUpload={(id, name) => setUploadModalPlugin({ id, name })}
          tabSwitcher={<TabSwitcher />}
        />
      )}

      <ConfigEditor
        plugin={configModalPlugin}
        onClose={() => setConfigModalPlugin(null)}
        isLoading={isLoadingConfigs}
        configFiles={configFiles}
        selectedFilePath={selectedFilePath}
        onFileSelect={handleFileSelect}
        editingContent={editingContent}
        onContentChange={setEditingContent}
        isSaving={isSaving}
        onSave={handleSaveConfig}
      />

      <UploadModal
        plugin={uploadModalPlugin}
        onClose={() => setUploadModalPlugin(null)}
        isUploading={isUploading}
        selectedFile={selectedFile}
        onFileChange={setSelectedFile}
        onSubmit={handleUpload}
      />
    </div>
  );
};

export default Plugins;
