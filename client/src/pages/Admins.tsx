import { useState, useEffect, useMemo } from 'react'
import { apiFetch } from '../utils/api'
import {
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Server,
  ShieldCheck,
  UserPlus,
  AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

interface Admin {
  Name: string;
  identity: string;
  flags?: string[];
  immunity?: number;
  groups?: string[];
}

interface ServerInfo {
  id: number;
  name: string;
  status: string;
}

const Admins = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient();
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  // New Admin Form State
  const [newAdmin, setNewAdmin] = useState({
    steamId: '',
    name: '',
    flags: '@css/admin',
    immunity: 1
  });

  // 1. Fetch Servers
  const { data: servers = [] } = useQuery<ServerInfo[]>({
    queryKey: ['servers'],
    queryFn: () => apiFetch('/api/servers').then(res => res.json())
  });

  // Auto-select first server
  useEffect(() => {
    if (servers.length > 0 && !selectedServerId) {
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId]);

  // 2. Fetch Admins for selected server
  const { 
    data: adminsObj = {}, 
    isLoading: loading,
    isRefetching,
    refetch 
  } = useQuery({
    queryKey: ['admins', selectedServerId],
    queryFn: () => apiFetch(`/api/servers/${selectedServerId}/admins`).then(res => res.json()),
    enabled: !!selectedServerId
  });

  // Convert object to array for easier display
  const admins = useMemo(() => {
    return Object.entries(adminsObj).map(([name, data]: [string, any]) => ({
      Name: name,
      ...data
    })) as Admin[];
  }, [adminsObj]);

  const filteredAdmins = admins.filter(admin => 
    (admin.Name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (admin.identity || '').includes(searchQuery)
  );

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServerId) return;

    if (!/^\d{17}$/.test(newAdmin.steamId)) {
      toast.error(t('admins.invalid_steamid'));
      return;
    }

    const updatedAdmins = { ...adminsObj };
    const adminKey = newAdmin.name || `Admin_${newAdmin.steamId.slice(-4)}`;
    
    updatedAdmins[adminKey] = {
      identity: newAdmin.steamId,
      flags: [newAdmin.flags],
      immunity: Number(newAdmin.immunity)
    };

    try {
      const response = await apiFetch(`/api/servers/${selectedServerId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedAdmins)
      });

      if (response.ok) {
        toast.success(t('admins.admin_added'));
        queryClient.invalidateQueries({ queryKey: ['admins', selectedServerId] });
        setIsAdding(false);
        setNewAdmin({ steamId: '', name: '', flags: '@css/admin', immunity: 1 });
      }
    } catch (error) {
      toast.error(t('admins.add_failed'));
    }
  };

  const handleDeleteAdmin = async (name: string) => {
    if (!selectedServerId || !confirm(t('admins.remove_confirm', { name }))) return;

    const updatedAdmins = { ...adminsObj };
    delete updatedAdmins[name];

    try {
      const response = await apiFetch(`/api/servers/${selectedServerId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedAdmins)
      });

      if (response.ok) {
        toast.success(t('admins.admin_removed'));
        queryClient.invalidateQueries({ queryKey: ['admins', selectedServerId] });
      }
    } catch (error) {
      toast.error(t('admins.remove_failed'));
    }
  };

  return (
    <div className="p-6 font-display">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('admins.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('admins.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative group">
            <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <select 
              className="bg-[#111827] border border-gray-800 text-white pl-10 pr-4 py-2 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none text-sm"
              value={selectedServerId || ''}
              onChange={(e) => setSelectedServerId(Number(e.target.value))}
            >
              <option value="" disabled>{t('admins.select_server')}</option>
              {servers.map((s: ServerInfo) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              className="w-64 pl-10 pr-4 py-2 bg-[#111827] border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200" 
              placeholder={t('admins.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button 
            onClick={() => refetch()}
            disabled={!selectedServerId || loading || isRefetching}
            className="bg-[#111827] border border-gray-800 text-gray-400 hover:text-white px-4 py-2 rounded-xl transition-all active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>

          <button 
            onClick={() => setIsAdding(true)}
            className="bg-primary hover:bg-blue-600 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center transition-all shadow-lg shadow-blue-500/20 active:scale-95"
          >
            <Plus className="mr-2 w-4 h-4" />
            {t('admins.add_admin')}
          </button>
        </div>
      </header>

      {/* Admin List Table */}
      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                <th className="px-6 py-4 border-b border-gray-800/50">{t('admins.admin_name')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50">{t('admins.steam_id')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50">{t('admins.flags')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-center">{t('admins.immunity')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-right">{t('admins.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {loading ? (
                <tr>
                   <td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">{t('admins.loading')}</td>
                </tr>
              ) : filteredAdmins.length === 0 ? (
                <tr>
                   <td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">
                     {selectedServerId ? t('admins.no_admins') : t('admins.select_server_to_view')}
                   </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => (
                  <tr key={admin.Name} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold border border-primary/20">
                          <ShieldCheck size={16} />
                        </div>
                        <span className="font-bold text-white text-sm">{admin.Name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-primary font-mono select-all">
                      {admin.identity}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(admin.flags) ? (
                          admin.flags.map((flag: string) => (
                            <span key={flag} className="px-2 py-1 bg-gray-800 rounded-md text-[10px] text-gray-400 font-mono border border-gray-700">
                              {flag}
                            </span>
                          ))
                        ) : (
                          <span className="px-2 py-1 bg-gray-800 rounded-md text-[10px] text-gray-400 font-mono border border-gray-700">
                            {admin.flags}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm font-bold text-orange-400">{admin.immunity}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteAdmin(admin.Name)}
                        className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Admin Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <UserPlus size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{t('admins.add_admin_title')}</h3>
                <p className="text-sm text-gray-400">{t('admins.grant_permissions')}</p>
              </div>
            </div>

            <form onSubmit={handleAddAdmin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">{t('admins.steamid64')}</label>
                <input
                  required
                  type="text"
                  placeholder="76561198..."
                  value={newAdmin.steamId}
                  onChange={(e) => setNewAdmin({...newAdmin, steamId: e.target.value})}
                  className="w-full px-4 py-2.5 bg-[#0d1421] border border-gray-800 rounded-xl text-white outline-none focus:border-primary transition-all text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">{t('admins.admin_name_label')}</label>
                <input
                  required
                  type="text"
                  placeholder={t('admins.admin_name_placeholder')}
                  value={newAdmin.name}
                  onChange={(e) => setNewAdmin({...newAdmin, name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-[#0d1421] border border-gray-800 rounded-xl text-white outline-none focus:border-primary transition-all text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">{t('admins.flags_label')}</label>
                  <select
                    value={newAdmin.flags}
                    onChange={(e) => setNewAdmin({...newAdmin, flags: e.target.value})}
                    className="w-full px-4 py-2.5 bg-[#0d1421] border border-gray-800 rounded-xl text-white outline-none focus:border-primary transition-all text-sm"
                  >
                    <option value="@css/admin">{t('admins.flag_admin')}</option>
                    <option value="@css/root">{t('admins.flag_root')}</option>
                    <option value="@css/generic">{t('admins.flag_generic')}</option>
                    <option value="@css/chat">{t('admins.flag_chat')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">{t('admins.immunity_label')}</label>
                  <input
                    type="number"
                    value={newAdmin.immunity}
                    onChange={(e) => setNewAdmin({...newAdmin, immunity: Number(e.target.value)})}
                    className="w-full px-4 py-2.5 bg-[#0d1421] border border-gray-800 rounded-xl text-white outline-none focus:border-primary transition-all text-sm"
                  />
                </div>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl flex items-start gap-3 mt-4">
                <AlertCircle className="text-amber-500 w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-500/80 leading-relaxed uppercase font-bold">
                  {t('admins.reload_warning')}
                </p>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-750 text-white rounded-xl font-bold transition-all text-sm"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold transition-all text-sm shadow-lg shadow-blue-500/20"
                >
                  {t('admins.save_admin')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admins;
