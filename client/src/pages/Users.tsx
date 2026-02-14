import { useState, useMemo } from 'react';
import { apiFetch } from '../utils/api';
import { Search, RefreshCw, Trash2, Key, Calendar, Lock, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

interface User {
  id: number;
  username: string;
  avatar_url: string | null;
  two_factor_enabled: number;
  permissions: string[];
  created_at: string;
}

const Users = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [tempPermissions, setTempPermissions] = useState<string[]>([]);
  const [user] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : { permissions: [] };
    } catch {
      return { permissions: [] };
    }
  });

  const availablePermissions = useMemo(
    () => [
      { id: 'servers.create', label: t('permissions.create_servers', 'Create Servers') },
      { id: 'servers.delete', label: t('permissions.delete_servers', 'Delete Servers') },
      { id: 'servers.update', label: t('permissions.update_servers', 'Update Server Settings') },
      { id: 'servers.console', label: t('permissions.access_console', 'Access Console') },
      { id: 'servers.files', label: t('permissions.manage_files', 'Manage Files') },
      { id: 'servers.database', label: t('permissions.manage_databases', 'Manage Databases') },
      { id: 'plugins.manage', label: t('permissions.manage_plugins', 'Manage Plugins') },
      { id: 'analytics.view', label: t('permissions.view_analytics', 'View Analytics') },
      { id: 'users.manage', label: t('permissions.manage_users', 'Manage Users') },
    ],
    [t]
  );

  const canManage = user?.permissions?.includes('*') || user?.permissions?.includes('users.manage');

  // 1. Fetch Users
  const {
    data: users = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users').then((res) => res.json()),
  });

  const filteredUsers = useMemo(() => {
    return users.filter((user) => user.username.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [users, searchQuery]);

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(t('users.delete_confirm', { username }))) return;

    try {
      const response = await apiFetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success(t('users.delete_success', 'User deleted'));
        queryClient.invalidateQueries({ queryKey: ['users'] });
      } else {
        const data = await response.json();
        toast.error(data.message || t('users.delete_failed', 'Delete failed'));
      }
    } catch {
      toast.error(t('users.connection_error', 'Connection error'));
    }
  };

  const handleUpdatePermissions = async () => {
    if (!selectedUser) return;
    try {
      const response = await apiFetch(`/api/users/${selectedUser.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: tempPermissions }),
      });

      if (response.ok) {
        toast.success(t('users.update_success', 'Permissions updated'));
        setIsPermissionModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ['users'] });
      } else {
        const data = await response.json();
        toast.error(data.message || t('users.update_failed', 'Update failed'));
      }
    } catch {
      toast.error(t('users.connection_error', 'Connection error'));
    }
  };

  const togglePermission = (permId: string) => {
    setTempPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  return (
    <div className="p-6 font-display">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {t('users.title', 'User Management')}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {t('users.subtitle', 'List and manage system users and their permissions.')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              className="w-64 pl-10 pr-4 py-2 bg-[#111827] border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200"
              placeholder={t('users.search_placeholder', 'Search users...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="bg-[#111827] border border-gray-800 text-gray-400 hover:text-white px-4 py-2 rounded-xl transition-all active:scale-95"
            title={t('common.refresh', 'Refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                <th className="px-6 py-4 border-b border-gray-800/50">
                  {t('common.user', 'User')}
                </th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-center">2FA</th>
                <th className="px-6 py-4 border-b border-gray-800/50">
                  {t('users.joined_at', 'Joined At')}
                </th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-right">
                  {t('common.actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">
                    {t('users.loading', 'Loading...')}
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 text-sm">
                    {t('users.no_users', 'No users found.')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary shrink-0 overflow-hidden">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          ) : (
                            user.username.substring(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">{user.username}</p>
                          <p className="text-[10px] text-gray-500 uppercase font-black">
                            ID: {user.id}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center">
                        {user.two_factor_enabled ? (
                          <div
                            className="p-1.5 bg-green-500/10 text-green-500 rounded-md border border-green-500/20"
                            title={t('users.two_fa_active', '2FA Active')}
                          >
                            <Key size={14} />
                          </div>
                        ) : (
                          <div
                            className="p-1.5 bg-gray-500/10 text-gray-500 rounded-md border border-gray-500/20"
                            title={t('users.two_fa_disabled', '2FA Disabled')}
                          >
                            <Key size={14} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Calendar size={12} />
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canManage && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setTempPermissions(user.permissions || []);
                              setIsPermissionModalOpen(true);
                            }}
                            className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg transition-all"
                            title={t('users.edit_permissions', 'Edit Permissions')}
                          >
                            <Lock size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id, user.username)}
                            className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                            title={t('users.delete_user', 'Delete User')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permissions Modal */}
      {isPermissionModalOpen && selectedUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-[#0B1120] rounded-2xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                  <Lock size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {t('users.permissions.title', 'Permissions')}
                  </h3>
                  <p className="text-sm text-gray-500 font-medium">
                    {t('users.permissions.subtitle', 'Managed User Profile')}
                  </p>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    {t('users.permissions.managing', { username: selectedUser.username })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPermissionModalOpen(false)}
                className="p-2 text-gray-500 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-3 overflow-y-auto max-h-[60vh] custom-scrollbar">
              <div className="space-y-2">
                {availablePermissions.map((perm) => (
                  <label
                    key={perm.id}
                    className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl cursor-pointer hover:bg-white/[0.08] transition-all group"
                  >
                    <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition-colors">
                      {perm.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={tempPermissions.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                      className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-primary focus:ring-primary focus:ring-offset-0"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 bg-gray-900/20 flex gap-3">
              <button
                onClick={() => setIsPermissionModalOpen(false)}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              >
                {t('users.permissions.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleUpdatePermissions}
                className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20"
              >
                {t('users.permissions.save', 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
