import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Cpu, 
  Zap, 
  Server as ServerIcon,
  Download,
  Loader2,
  Trash2,
  Box,
  Layers,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Tag
} from 'lucide-react'
import { apiFetch } from '../utils/api'
import toast from 'react-hot-toast'
import { useConfirmDialog } from '../contexts/ConfirmDialogContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface Instance {
    id: number;
    name: string;
    status: string;
}

interface PluginInfo {
    name: string;
    githubRepo?: string;
    category: 'core' | 'metamod' | 'cssharp';
    description?: string;
    tags?: string[];
}

const Plugins = () => {
  const navigate = useNavigate()
  const { showConfirm } = useConfirmDialog()
  const queryClient = useQueryClient()
  
  const [selectedServer, setSelectedServer] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  
  // Filtering state
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<'all' | 'core' | 'metamod' | 'cssharp'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'installed' | 'not-installed' | 'update'>('all')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // 1. Fetch Plugin Registry (Global Pool)
  const { data: registry = {}, isLoading: registryLoading } = useQuery<Record<string, PluginInfo>>({
    queryKey: ['plugin-registry'],
    queryFn: () => apiFetch('/api/servers/plugins/registry').then(res => res.json())
  })

  // 2. Fetch Server Instances (Dropdown)
  const { data: instances = [], isLoading: instancesLoading } = useQuery<Instance[]>({
    queryKey: ['servers'],
    queryFn: () => apiFetch('/api/servers').then(res => res.json()),
  })

  // Set default selected server
  useEffect(() => {
    if (instances.length > 0 && !selectedServer) {
        setSelectedServer(instances[0].id.toString());
    }
  }, [instances, selectedServer]);

  // 3. Fetch Plugin Status for selected server
  const { data: pluginStatus = {} } = useQuery<Record<string, boolean>>({
    queryKey: ['plugin-status', selectedServer],
    queryFn: () => apiFetch(`/api/servers/${selectedServer}/plugins/status`).then(res => res.json()),
    enabled: !!selectedServer,
    refetchInterval: 15000 // Automatic polling every 15s
  })

  // 4. Fetch Plugin Updates for selected server
  const { data: pluginUpdates = null } = useQuery<any>({
    queryKey: ['plugin-updates', selectedServer],
    queryFn: () => apiFetch(`/api/servers/${selectedServer}/plugins/updates`).then(res => res.json()),
    enabled: !!selectedServer
  })

  const handleAction = async (plugin: string, action: 'install' | 'uninstall' | 'update') => {
    if (!selectedServer) return;

    const pluginInfo = registry[plugin];
    const pluginName = pluginInfo?.name || plugin;

    // Logic guards
    if (action === 'install') {
        if (pluginInfo.category === 'cssharp' && !pluginStatus.metamod) {
            return toast.error('Metamod:Source is required before installing C# plugins');
        }
        if (pluginInfo.category === 'cssharp' && plugin !== 'cssharp' && !pluginStatus.cssharp) {
            return toast.error('CounterStrikeSharp is required first');
        }
    }

    const confirmed = await showConfirm({
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} ${pluginName}?`,
      message: `Are you sure you want to ${action} ${pluginName}? Sub-dependencies will be handled automatically. ${action === 'uninstall' ? 'This may impact other plugins.' : 'The server should be OFFLINE for a safe installation.'}`,
      confirmText: `${action.charAt(0).toUpperCase() + action.slice(1)} Now`,
      type: action === 'uninstall' ? 'danger' : 'warning'
    });

    if (!confirmed) return;

    setActionLoading(plugin);
    try {
      const response = await apiFetch(`/api/servers/${selectedServer}/plugins/${plugin}/${action}`, { method: 'POST' });
      const data = await response.json();

      if (response.ok) {
        toast.success(`${pluginName} ${action}ed successfully!`);
        // Invalidate queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ['plugin-status', selectedServer] });
        queryClient.invalidateQueries({ queryKey: ['plugin-updates', selectedServer] });
      } else {
        toast.error(data.message || 'Action failed');
      }
    } catch (error) {
      toast.error('Network or Server failure.');
    } finally {
      setActionLoading(null);
    }
  };

  const allPlugins = useMemo(() => 
    Object.entries(registry).map(([id, info]) => ({ ...(info as PluginInfo), id })), 
  [registry]);

  const filteredPlugins = useMemo(() => {
    return allPlugins.filter(plugin => {
        // Search filter
        const matchesSearch = plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             plugin.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             plugin.id.toLowerCase().includes(searchQuery.toLowerCase());
        
        // Category filter
        const matchesCategory = activeCategory === 'all' || plugin.category === activeCategory;
        
        // Status filter
        const isInstalled = pluginStatus[plugin.id];
        const hasUpdate = pluginUpdates?.[plugin.id]?.hasUpdate;
        let matchesStatus = true;
        if (statusFilter === 'installed') matchesStatus = isInstalled;
        if (statusFilter === 'not-installed') matchesStatus = !isInstalled;
        if (statusFilter === 'update') matchesStatus = isInstalled && hasUpdate;
        
        // Tag filter
        const matchesTag = !selectedTag || plugin.tags?.includes(selectedTag);
        
        return matchesSearch && matchesCategory && matchesStatus && matchesTag;
    });
  }, [allPlugins, searchQuery, activeCategory, statusFilter, selectedTag, pluginStatus, pluginUpdates]);

  const allTags = useMemo(() => 
    Array.from(new Set(allPlugins.flatMap(p => p.tags || []))).sort(),
  [allPlugins]);

  const renderUnifiedPluginTable = () => {
    const sections = [
        { id: 'core', name: 'Core Foundations', icon: <Layers size={14} className="text-primary" /> },
        { id: 'metamod', name: 'Metamod Plugin', icon: <Cpu size={14} className="text-primary" /> },
        { id: 'cssharp', name: 'CounterStrikeSharp Plugin', icon: <Zap size={14} className="text-primary" /> }
    ];
    
    const categories = ['all', 'core', 'metamod', 'cssharp'] as const;
    const statuses = [
        { id: 'all', label: 'All Status', icon: <Box size={14} /> },
        { id: 'installed', label: 'Installed', icon: <CheckCircle2 size={14} className="text-green-500" /> },
        { id: 'not-installed', label: 'Not Installed', icon: <XCircle size={14} className="text-gray-500" /> },
        { id: 'update', label: 'Updates', icon: <AlertCircle size={14} className="text-yellow-500" /> }
    ] as const;

    return (
      <div className="flex flex-col gap-6 max-h-[calc(100vh-250px)]">
        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row gap-4 shrink-0">
            <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors" size={18} />
                <input 
                    type="text" 
                    placeholder="Search plugins by name, description or ID..."
                    className="w-full bg-[#111827]/40 border border-gray-800/50 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:bg-primary/[0.02] transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            
            <div className="flex items-center gap-2 bg-[#111827]/40 border border-gray-800/50 p-1.5 rounded-2xl overflow-x-auto scrollbar-hide w-full lg:w-auto min-w-0">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${activeCategory === cat ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2 bg-[#111827]/40 border border-gray-800/50 p-1.5 rounded-2xl overflow-x-auto scrollbar-hide w-full lg:w-auto min-w-0">
                {statuses.map(s => (
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
                All Tags
            </button>
            {allTags.map(tag => (
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
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 w-1/4">Plugin</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 hidden lg:table-cell">Description / Tags</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 w-1/6">Version</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 text-right w-1/6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/20">
            {sections.map(section => {
              const sectionPlugins = filteredPlugins.filter(p => p.category === section.id);
              if (sectionPlugins.length === 0) return null;

              return (
                <React.Fragment key={section.id}>
                  <tr className="bg-primary/[0.03] border-y border-gray-800/40">
                    <td colSpan={4} className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
                          {section.icon}
                        </div>
                        <span className="text-[11px] font-black text-gray-300 uppercase tracking-[0.2em]">{section.name}</span>
                        {section.id === 'metamod' && !pluginStatus['metamod'] && (
                            <span className="text-[8px] font-bold text-yellow-500/60 bg-yellow-500/5 px-2 py-0.5 rounded border border-yellow-500/10 uppercase ml-2">Req. Metamod:Source</span>
                        )}
                        {section.id === 'cssharp' && !pluginStatus['cssharp'] && (
                            <span className="text-[8px] font-bold text-yellow-500/60 bg-yellow-500/5 px-2 py-0.5 rounded border border-yellow-500/10 uppercase ml-2">Req. CounterStrikeSharp</span>
                        )}
                        <span className="ml-auto text-[10px] text-gray-600 font-bold uppercase tracking-widest">{sectionPlugins.length} found</span>
                      </div>
                    </td>
                  </tr>
                  
                  {sectionPlugins.map((info) => {
                    const pid = info.id;
                    const isInstalled = !!pluginStatus[pid];
                    const hasUpdate = !!pluginUpdates?.[pid]?.hasUpdate;
                    const isLoading = actionLoading === pid;
                    const updates = pluginUpdates?.[pid];

                    return (
                      <tr key={pid} className="group hover:bg-primary/[0.01] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${isInstalled ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-gray-800/40 text-gray-500 border border-gray-800/40'}`}>
                              {pid === 'metamod' || info.category === 'metamod' ? <Cpu size={18} /> : 
                               pid === 'cssharp' || info.category === 'cssharp' ? <Zap size={18} /> : 
                               <Layers size={18} />}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-white group-hover:text-primary transition-colors">{info.name}</div>
                              <span className={`text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded mt-1 inline-block ${isInstalled ? 'bg-green-500/10 text-green-500' : 'bg-gray-800/60 text-gray-500'}`}>
                                {isInstalled ? 'Installed' : 'Not Loaded'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 hidden lg:table-cell">
                          <p className="text-xs text-gray-500 max-w-sm line-clamp-1 mb-2">
                            {info.description || `High-performance module.`}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {info.tags?.map((t: string) => (
                                <span key={t} className="text-[8px] font-bold text-primary/40 group-hover:text-primary/70 transition-colors uppercase tracking-tight">#{t}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-mono font-bold text-gray-400">
                              {isInstalled ? `v${updates?.currentVersion || '?.?.?'}` : '--'}
                            </span>
                            {hasUpdate && isInstalled && (
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-[9px] font-black text-yellow-500 animate-pulse uppercase">Update</span>
                                <span className="text-[9px] text-yellow-500/50 font-medium">→ v{updates.latestVersion}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {isInstalled ? (
                              <>
                                {hasUpdate && (
                                  <button 
                                    disabled={actionLoading !== null}
                                    onClick={() => handleAction(pid, 'update')}
                                    className="p-1.5 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                  </button>
                                )}
                                <button 
                                  disabled={actionLoading !== null}
                                  onClick={() => handleAction(pid, 'uninstall')}
                                  className="p-1.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                </button>
                              </>
                            ) : (
                              <button 
                                disabled={
                                  actionLoading !== null || 
                                  (pid !== 'metamod' && !pluginStatus['metamod']) || 
                                  (info.category === 'cssharp' && pid !== 'cssharp' && !pluginStatus['cssharp'])
                                }
                                onClick={() => handleAction(pid, 'install')}
                                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-primary/10 disabled:bg-gray-800/50 disabled:text-gray-500 disabled:shadow-none disabled:cursor-not-allowed"
                              >
                                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                Install
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {filteredPlugins.length === 0 && (
                <tr>
                    <td colSpan={4} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center">
                                <Search size={24} className="text-gray-700" />
                            </div>
                            <div>
                                <h4 className="text-gray-400 font-bold uppercase tracking-widest text-sm">No Signal Found</h4>
                                <p className="text-xs text-gray-600 mt-1">Try adjusting your filters or search query.</p>
                                <button 
                                    onClick={() => {
                                        setSearchQuery('');
                                        setActiveCategory('all');
                                        setStatusFilter('all');
                                        setSelectedTag(null);
                                    }}
                                    className="mt-4 text-primary text-[10px] font-black uppercase tracking-widest hover:underline"
                                >
                                    Clear all filters
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
            <p className="text-gray-400 font-bold animate-pulse uppercase tracking-[0.2em] text-xs">Synchronizing Galaxy...</p>
        </div>
    );
  }

  return (
    <div className="p-6 font-display overflow-y-auto max-h-[calc(100vh-64px)] scrollbar-hide">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Plugin Galaxy</h2>
            <p className="text-sm text-gray-400 mt-1">One-click deployment for professional CS2 server environments</p>
        </div>
        
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Switch Server</span>
          <div className="relative group">
            <ServerIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <select 
              className="bg-[#111827] border border-gray-800 text-white pl-10 pr-4 py-2 rounded-xl focus:ring-2 focus:ring-primary/50 transition-all outline-none text-sm min-w-[200px]"
              value={selectedServer || ''}
              onChange={(e) => setSelectedServer(e.target.value)}
            >
              <option value="" disabled>Select server...</option>
              {instances.map((inst: Instance) => (
                <option key={inst.id} value={inst.id} className="bg-[#0c1424]">{inst.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {renderUnifiedPluginTable()}

      {instances.length === 0 && !instancesLoading && (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-900/30 rounded-3xl border-2 border-dashed border-gray-800">
            <Box size={60} className="text-gray-700 mb-6" />
            <h3 className="text-xl font-bold text-gray-400">Atmosphere is Empty</h3>
            <p className="text-sm text-gray-500 mt-2 mb-8">Create your first server instance to begin modding.</p>
            <button onClick={() => navigate('/instances')} className="bg-primary text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:scale-105 transition-all">Command Center</button>
        </div>
      )}
    </div>
  )
}

export default Plugins
