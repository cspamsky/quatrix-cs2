import React, { useState, useEffect, useCallback } from 'react'
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
  ChevronRight
} from 'lucide-react'
import { apiFetch } from '../utils/api'
import toast from 'react-hot-toast'
import { useConfirmDialog } from '../contexts/ConfirmDialogContext'

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
}

const Plugins = () => {
  const navigate = useNavigate()
  const { showConfirm } = useConfirmDialog()
  const [instances, setInstances] = useState<Instance[]>([])
  const [selectedServer, setSelectedServer] = useState<string | null>(null)
  const [registry, setRegistry] = useState<Record<string, PluginInfo>>({})
  const [pluginStatus, setPluginStatus] = useState<Record<string, boolean>>({})
  const [pluginUpdates, setPluginUpdates] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [registryLoading, setRegistryLoading] = useState(true)

  const fetchRegistry = async () => {
      try {
          setRegistryLoading(true);
          const res = await apiFetch('/api/servers/plugins/registry');
          const data = await res.json();
          setRegistry(data);
      } catch (e) { 
          console.error("Failed to fetch registry", e);
          toast.error('Could not load plugin list from server');
      } finally {
          setRegistryLoading(false);
      }
  };

  const fetchInstances = useCallback(async () => {
    try {
        setLoading(true);
        const response = await apiFetch('/api/servers');
        const data = await response.json();
        if (Array.isArray(data)) {
            setInstances(data);
            if (data.length > 0 && !selectedServer) {
                setSelectedServer(data[0].id.toString());
            }
        }
    } catch (error) {
        console.error('Failed to fetch instances:', error);
    } finally {
        setLoading(false);
    }
  }, [selectedServer]);

  const fetchPluginStatus = useCallback(async (id: string) => {
    try {
        const response = await apiFetch(`/api/servers/${id}/plugins/status`);
        if (response.ok) {
            const data = await response.json();
            setPluginStatus(data);
        }
    } catch (error) { console.error('Failed to fetch plugin status:', error); }
  }, []);

  const fetchPluginUpdates = useCallback(async (id: string) => {
    try {
        const response = await apiFetch(`/api/servers/${id}/plugins/updates`);
        if (response.ok) {
            const data = await response.json();
            setPluginUpdates(data);
        }
    } catch (error) { console.error('Failed to fetch plugin updates:', error); }
  }, []);

  useEffect(() => {
    fetchRegistry();
  }, []);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  useEffect(() => {
    if (selectedServer) {
        fetchPluginStatus(selectedServer);
        fetchPluginUpdates(selectedServer);

        // Automatic polling for status every 15 seconds
        const interval = setInterval(() => {
            fetchPluginStatus(selectedServer);
        }, 15000);
        
        return () => clearInterval(interval);
    }
  }, [selectedServer, fetchPluginStatus, fetchPluginUpdates]);

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
        await fetchPluginStatus(selectedServer);
        await fetchPluginUpdates(selectedServer);
      } else {
        toast.error(data.message || 'Action failed');
      }
    } catch (error) {
      toast.error('Network or Server failure.');
    } finally {
      setActionLoading(null);
    }
  };

  const renderUnifiedPluginTable = () => {
    const sections = [
        { id: 'core', name: 'Core Foundations', icon: <Layers size={14} className="text-primary" /> },
        { id: 'metamod', name: 'Metamod Plugin', icon: <Cpu size={14} className="text-primary" /> },
        { id: 'cssharp', name: 'CounterStrikeSharp Plugin', icon: <Zap size={14} className="text-primary" /> }
    ];

    return (
      <div className="bg-[#111827]/40 border border-gray-800/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[calc(100vh-250px)]">
        <div className="overflow-y-auto scrollbar-hide">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-30 bg-[#0c1424] border-b border-gray-800/80">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Plugin</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 hidden lg:table-cell">Description</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Version</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/20">
            {sections.map(section => {
              const sectionPlugins = Object.entries(registry).filter(([_, info]) => info.category === section.id);
              if (sectionPlugins.length === 0) return null;

              return (
                <React.Fragment key={section.id}>
                  {/* Category Header Row */}
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
                      </div>
                    </td>
                  </tr>
                  
                  {/* Plugin Rows */}
                  {sectionPlugins.map(([pid, info]) => {
                    const isInstalled = pluginStatus[pid];
                    const hasUpdate = pluginUpdates?.[pid]?.hasUpdate;
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
                          <p className="text-xs text-gray-500 max-w-sm line-clamp-1">
                            {info.description || `High-performance module.`}
                          </p>
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
          </tbody>
        </table>
        </div>
      </div>
    );
  };

  if ((loading || registryLoading) && instances.length === 0) {
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
        
        <div className="flex items-center space-x-4 bg-[#0c1424] border border-gray-800/50 p-2 rounded-2xl shadow-2xl">
            <div className="flex items-center px-4 py-2 text-gray-400 bg-gray-900/50 rounded-xl border border-gray-800">
                <ServerIcon size={16} className="mr-3 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Target Node:</span>
            </div>
            <select 
                className="bg-transparent text-white text-sm font-bold outline-none px-4 py-2 cursor-pointer appearance-none min-w-[150px]"
                value={selectedServer || ''}
                onChange={(e) => setSelectedServer(e.target.value)}
            >
                {instances.map((inst: Instance) => (
                    <option key={inst.id} value={inst.id} className="bg-[#0c1424]">{inst.name}</option>
                ))}
            </select>
            <ChevronRight size={16} className="text-gray-600 mr-2" />
        </div>
      </header>

      {renderUnifiedPluginTable()}

      {instances.length === 0 && !loading && (
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
