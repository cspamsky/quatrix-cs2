import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Archive, 
  Trash2, 
  RotateCcw, 
  Plus, 
  HardDrive,
  Calendar,
  Layers,
  Search,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { tr, enUS } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { useConfirmDialog } from '../contexts/ConfirmDialogContext';
import { apiFetch } from '../utils/api';

interface Backup {
  id: string;
  serverId: string | number;
  filename: string;
  size: number;
  createdAt: number;
  type: 'manual' | 'auto';
  comment?: string;
}

interface Server {
  id: string | number;
  name: string;
}

const Backups: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { showConfirm } = useConfirmDialog();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | number>('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const dateLocale = i18n.language.startsWith('tr') ? tr : enUS;

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    if (selectedServerId) {
      fetchBackups(selectedServerId);
    } else {
        setBackups([]);
        setLoading(false);
    }
  }, [selectedServerId]);

  const fetchServers = async () => {
    try {
      const response = await apiFetch('/api/servers');
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      
      const serverArray = Array.isArray(data) ? data : [];
      setServers(serverArray);
      
      if (serverArray.length > 0) {
        setSelectedServerId(serverArray[0].id);
      } else {
        setLoading(false);
      }
    } catch (error) {
      toast.error(t('backups.error_fetch_servers'));
      setLoading(false);
    }
  };

  const fetchBackups = async (serverId: string | number) => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/backups/${serverId}`);
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      setBackups(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(t('backups.error_fetch_backups'));
      setBackups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
     if (!selectedServerId) return;

     toast.promise(
       (async () => {
         const response = await apiFetch(`/api/backups/${selectedServerId}/create`, {
           method: 'POST',
           body: JSON.stringify({ comment: 'Manual Backup', type: 'manual' })
         });
         const data = await response.json();
         if (!response.ok) throw new Error(data.error || 'Failed to start backup');
         return data;
       })(),
       {
         loading: t('backups.creating_backup_loading'),
         success: t('backups.creating_backup_started'),
         error: (err) => err.message
       }
     );
  };

  const handleRestore = async (backup: Backup) => {
    const confirmed = await showConfirm({
      title: t('backups.restore_confirm_title'),
      message: t('backups.restore_confirm_message', { filename: backup.filename }),
      confirmText: t('common.start'),
      cancelText: t('common.cancel'),
      type: 'warning'
    });

    if (confirmed) {
      toast.promise(
        (async () => {
          const response = await apiFetch(`/api/backups/${backup.id}/restore`, {
            method: 'POST'
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to start restore');
          return data;
        })(),
        {
          loading: t('backups.restoring_loading'),
          success: t('backups.restoring_started'),
          error: (err) => err.message
        }
      );
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm({
      title: t('backups.delete_confirm_title'),
      message: t('backups.delete_confirm_message'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      type: 'danger'
    });

    if (confirmed) {
      try {
        const response = await apiFetch(`/api/backups/${id}`, { method: 'DELETE' });
        if (response.ok) {
          toast.success(t('backups.deleted_success'));
          fetchBackups(selectedServerId);
        } else {
          throw new Error();
        }
      } catch (error) {
        toast.error(t('backups.delete_failed'));
      }
    }
  };

  const filteredBackups = backups.filter(b => 
    b.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.comment && b.comment.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-700">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white tracking-tight">{t('backups.title')}</h1>
          <p className="text-gray-400 max-w-2xl">{t('backups.subtitle')}</p>
        </div>

        <button 
          onClick={handleCreateBackup}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
          disabled={!selectedServerId}
        >
          <Plus className="w-5 h-5" />
          {t('backups.create_new')}
        </button>
      </div>

      {/* Control Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="relative group">
          <Layers className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
          <select
            value={selectedServerId}
            onChange={(e) => setSelectedServerId(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer hover:bg-white/10 shadow-sm"
          >
            <option value="" disabled className="bg-[#001529]">{t('backups.select_server')}</option>
            {Array.isArray(servers) && servers.map(server => (
              <option key={server.id} value={server.id} className="bg-[#001529]">{server.name}</option>
            ))}
          </select>
        </div>

        <div className="relative group lg:col-span-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder={t('backups.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all hover:bg-white/10 shadow-sm"
          />
        </div>
      </div>

      {/* Backups List */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl relative min-h-[400px]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <p className="text-gray-400 font-medium">{t('common.loading')}</p>
            </div>
          </div>
        ) : filteredBackups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">{t('backups.column_date')}</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">{t('backups.column_filename')}</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">{t('backups.column_size')}</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">{t('backups.column_type')}</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredBackups.map((backup) => (
                  <tr key={backup.id} className="group hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-gray-500 group-hover:text-primary transition-colors" />
                        <span className="text-sm font-medium text-white whitespace-nowrap">
                          {format(backup.createdAt, 'PPp', { locale: dateLocale })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col max-w-[300px]">
                        <span className="text-sm font-semibold text-gray-200 truncate" title={backup.filename}>
                          {backup.filename}
                        </span>
                        {backup.comment && (
                          <span className="text-xs text-gray-500 truncate">{backup.comment}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-300 font-medium tabular-nums">{formatSize(backup.size)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={clsx(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        backup.type === 'manual' ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      )}>
                        {backup.type === 'manual' ? t('backups.type_manual') : t('backups.type_auto')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 px-1">
                        <button 
                          onClick={() => handleRestore(backup)}
                          className="p-2 text-primary hover:bg-primary/20 rounded-lg transition-all active:scale-95"
                          title={t('backups.restore')}
                        >
                          <RotateCcw className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(backup.id)}
                          className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/20 rounded-lg transition-all active:scale-95"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-[400px] flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6 group hover:bg-white/10 transition-colors">
              <Archive className="w-10 h-10 text-gray-600 group-hover:text-primary/50 transition-colors" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t('backups.no_backups_found')}</h3>
            <p className="text-gray-500 max-w-sm mb-8">
              {selectedServerId ? t('backups.no_backups_desc') : t('backups.no_server_selected_desc')}
            </p>
            {selectedServerId && (
              <button 
                onClick={handleCreateBackup}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 font-bold transition-all active:scale-95 shadow-lg"
              >
                <Plus className="w-5 h-5 text-primary" />
                {t('backups.create_new')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Proactive Tip */}
      <div className="flex items-start gap-4 p-5 bg-primary/5 border border-primary/10 rounded-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
           <AlertCircle className="w-24 h-24 text-primary" />
        </div>
        <div className="p-2.5 bg-primary/10 rounded-xl text-primary shrink-0 shadow-inner">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1 relative z-10">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">{t('backups.tip_title')}</h4>
          <p className="text-sm text-gray-400 leading-relaxed font-medium">
            {t('backups.tip_message')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Backups;
