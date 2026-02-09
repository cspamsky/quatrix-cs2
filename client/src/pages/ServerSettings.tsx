import { apiFetch } from '../utils/api';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Server, MapPin, Users, Lock, Key, Shield, Globe } from 'lucide-react';
import { SERVER_REGIONS } from '../config/regions';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface ServerData {
  id: number;
  name: string;
  map: string;
  max_players: number;
  port: number;
  password?: string;
  rcon_password?: string;
  vac_enabled: boolean;
  gslt_token?: string;
  steam_api_key?: string;
  game_type: number;
  game_mode: number;
  game_alias?: string;
  hibernate: number;
  validate_files: number;
  auto_update: number;
  additional_args?: string;
  tickrate: number;
  region: number;
  cpu_priority: number;
  ram_limit: number;
}

const ServerSettings = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [server, setServer] = useState<ServerData | null>(null);
  const [user] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : { permissions: [] };
    } catch {
      return { permissions: [] };
    }
  });

  const canEdit = user?.permissions?.includes('*') || user?.permissions?.includes('servers.update');

  useEffect(() => {
    fetchServerData();
  }, [id]);

  const fetchServerData = async () => {
    try {
      const [srvResponse, dbResponse] = await Promise.all([
        apiFetch(`/api/servers/${id}`),
        apiFetch(`/api/servers/${id}/database`),
      ]);

      if (srvResponse.ok) {
        const data = await srvResponse.json();
        setServer(data);
      }
      if (dbResponse.ok) {
        // Database credentials are now managed in a dedicated page
      }
    } catch (error) {
      console.error('Failed to fetch server:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server) return;

    setSaving(true);
    try {
      const response = await apiFetch(`/api/servers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(server),
      });

      if (response.ok) {
        toast.success(t('serverSettings.save_success'));
      } else {
        toast.error(t('serverSettings.save_error'));
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Connection error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 text-gray-600">
          <Server className="w-10 h-10 opacity-20" />
          <span className="text-xs font-bold tracking-widest uppercase">
            {t('serverSettings.loading')}
          </span>
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        {t('serverSettings.not_found')}
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/instances')}
              className="p-1 -ml-1 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {t('serverSettings.title')}
            </h2>
          </div>
          <div className="pl-9">
            <p className="text-sm text-gray-400 mt-1">{t('serverSettings.subtitle')}</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSave} className="space-y-8 flex-1">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Server Information */}
          <div className="bg-[#111827] rounded-2xl border border-gray-800 p-8">
            <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-3">
              <Server className="w-5 h-5 text-primary" />
              {t('serverSettings.instance_info')}
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-400">
                  {t('serverSettings.server_name')}
                </label>
                <input
                  type="text"
                  value={server.name}
                  onChange={(e) => setServer({ ...server, name: e.target.value })}
                  className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder:text-gray-700 disabled:opacity-50"
                  placeholder="Quatrix Dedicated Server"
                  disabled={!canEdit}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    {t('serverSettings.primary_map')}
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <select
                      value={server.map}
                      onChange={(e) => setServer({ ...server, map: e.target.value })}
                      className="w-full pl-12 pr-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all cursor-pointer disabled:opacity-50"
                      disabled={!canEdit}
                    >
                      <option value="de_dust2">de_dust2</option>
                      <option value="de_mirage">de_mirage</option>
                      <option value="de_inferno">de_inferno</option>
                      <option value="de_nuke">de_nuke</option>
                      <option value="de_overpass">de_overpass</option>
                      <option value="de_vertigo">de_vertigo</option>
                      <option value="de_ancient">de_ancient</option>
                      <option value="de_anubis">de_anubis</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    {t('serverSettings.max_players')}
                  </label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <input
                      type="number"
                      min="2"
                      max="64"
                      value={server.max_players}
                      onChange={(e) =>
                        setServer({ ...server, max_players: parseInt(e.target.value) })
                      }
                      className="w-full pl-12 pr-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all disabled:opacity-50"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    {t('serverSettings.server_port')}
                  </label>
                  <input
                    type="number"
                    min="1024"
                    max="65535"
                    value={server.port}
                    onChange={(e) => setServer({ ...server, port: parseInt(e.target.value) })}
                    className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white font-mono focus:border-primary outline-none transition-all disabled:opacity-50"
                    disabled={!canEdit}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    {t('serverSettings.game_alias')}
                  </label>
                  <select
                    value={server.game_alias || ''}
                    onChange={(e) => setServer({ ...server, game_alias: e.target.value })}
                    className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all cursor-pointer disabled:opacity-50"
                    disabled={!canEdit}
                  >
                    <option value="">{t('createInstance.game_alias_default')}</option>
                    <option value="competitive">
                      {t('createInstance.game_alias_competitive')}
                    </option>
                    <option value="casual">{t('createInstance.game_alias_casual')}</option>
                    <option value="deathmatch">{t('createInstance.game_alias_deathmatch')}</option>
                    <option value="wingman">{t('createInstance.game_alias_wingman')}</option>
                    <option value="armsrace">{t('createInstance.game_alias_armsrace')}</option>
                    <option value="demolition">{t('createInstance.game_alias_demolition')}</option>
                    <option value="training">{t('createInstance.game_alias_training')}</option>
                    <option value="custom">{t('createInstance.game_alias_custom')}</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    {t('serverSettings.tickrate')}
                  </label>
                  <input
                    type="number"
                    min="64"
                    max="128"
                    value={server.tickrate || 128}
                    onChange={(e) => setServer({ ...server, tickrate: parseInt(e.target.value) })}
                    className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all disabled:opacity-50"
                    disabled={!canEdit}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    {t('serverSettings.server_region')}
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <select
                      value={server.region || 3}
                      onChange={(e) => setServer({ ...server, region: parseInt(e.target.value) })}
                      className="w-full pl-12 pr-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all cursor-pointer disabled:opacity-50"
                      disabled={!canEdit}
                    >
                      {SERVER_REGIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {t(`regions.${r.code}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    {t('serverSettings.additional_args')}
                  </label>
                  <input
                    type="text"
                    value={server.additional_args || ''}
                    onChange={(e) => setServer({ ...server, additional_args: e.target.value })}
                    className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all disabled:opacity-50"
                    placeholder="-tickrate 128 +sv_infinite_ammo 1..."
                    disabled={!canEdit}
                  />
                </div>

                {/* Performance Orchestration */}
                <div className="space-y-4 pt-4 border-t border-gray-800/50">
                  <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                    {t('serverSettings.performance_orchestration')}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                        {t('serverSettings.cpu_priority')}
                      </label>
                      <select
                        value={server.cpu_priority || 0}
                        onChange={(e) =>
                          setServer({ ...server, cpu_priority: parseInt(e.target.value) })
                        }
                        disabled={!canEdit}
                        className="w-full px-4 py-2 bg-black/20 border border-gray-800 rounded-xl text-white text-xs outline-none focus:border-primary transition-all disabled:opacity-50"
                      >
                        <option value="-10">{t('serverSettings.cpu_high')}</option>
                        <option value="0">{t('serverSettings.cpu_normal')}</option>
                        <option value="10">{t('serverSettings.cpu_low')}</option>
                        <option value="19">{t('serverSettings.cpu_idle')}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                        {t('serverSettings.ram_limit')}
                      </label>
                      <select
                        value={server.ram_limit || 0}
                        onChange={(e) =>
                          setServer({ ...server, ram_limit: parseInt(e.target.value) })
                        }
                        disabled={!canEdit}
                        className="w-full px-4 py-2 bg-black/20 border border-gray-800 rounded-xl text-white text-xs outline-none focus:border-primary transition-all disabled:opacity-50"
                      >
                        <option value="0">{t('serverSettings.ram_unlimited')}</option>
                        <option value="4096">4 GB</option>
                        <option value="8192">8 GB</option>
                        <option value="16384">16 GB</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="bg-[#111827] rounded-2xl border border-gray-800 p-8">
            <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              {t('serverSettings.security_settings')}
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    {t('serverSettings.server_password')}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <input
                      type="password"
                      value={server.password || ''}
                      onChange={(e) => setServer({ ...server, password: e.target.value })}
                      className="w-full pl-12 pr-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all disabled:opacity-50"
                      placeholder={t('serverSettings.optional')}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    {t('serverSettings.rcon_password')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <input
                      type="password"
                      value={server.rcon_password || ''}
                      onChange={(e) => setServer({ ...server, rcon_password: e.target.value })}
                      className="w-full pl-12 pr-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all disabled:opacity-50"
                      placeholder={t('serverSettings.required')}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-400">
                  {t('serverSettings.gslt_token')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={server.gslt_token || ''}
                  onChange={(e) => setServer({ ...server, gslt_token: e.target.value })}
                  className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white font-mono text-sm focus:border-primary outline-none transition-all disabled:opacity-50"
                  placeholder={t('serverSettings.gslt_placeholder')}
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-400">
                  {t('serverSettings.steam_api_key')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={server.steam_api_key || ''}
                  onChange={(e) => setServer({ ...server, steam_api_key: e.target.value })}
                  className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white font-mono text-sm focus:border-primary outline-none transition-all disabled:opacity-50"
                  placeholder={t('serverSettings.steam_api_placeholder')}
                  disabled={!canEdit}
                />
              </div>

              <div className="pt-4">
                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={Boolean(server.vac_enabled)}
                      onChange={(e) => setServer({ ...server, vac_enabled: e.target.checked })}
                      className="sr-only peer"
                      disabled={!canEdit}
                    />
                    <div className="w-12 h-6 bg-gray-800 rounded-full peer peer-checked:bg-primary transition-all duration-300"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-6 transition-all duration-300"></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">
                      {t('serverSettings.vac_enabled')}
                    </span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      {t('serverSettings.vac_desc')}
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-8 pt-4 border-t border-gray-800/50">
                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={Boolean(server.hibernate)}
                      onChange={(e) =>
                        setServer({ ...server, hibernate: e.target.checked ? 1 : 0 })
                      }
                      className="sr-only peer"
                      disabled={!canEdit}
                    />
                    <div className="w-12 h-6 bg-gray-800 rounded-full peer peer-checked:bg-primary transition-all duration-300"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-6 transition-all duration-300"></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">
                      {t('serverSettings.hibernation')}
                    </span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      {t('serverSettings.hibernation_desc')}
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={Boolean(server.validate_files)}
                      onChange={(e) =>
                        setServer({ ...server, validate_files: e.target.checked ? 1 : 0 })
                      }
                      className="sr-only peer"
                      disabled={!canEdit}
                    />
                    <div className="w-12 h-6 bg-gray-800 rounded-full peer peer-checked:bg-primary transition-all duration-300"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-6 transition-all duration-300"></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">
                      {t('serverSettings.validate_files')}
                    </span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      {t('serverSettings.validate_desc')}
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={Boolean(server.auto_update)}
                      onChange={(e) =>
                        setServer({ ...server, auto_update: e.target.checked ? 1 : 0 })
                      }
                      className="sr-only peer"
                      disabled={!canEdit}
                    />
                    <div className="w-12 h-6 bg-gray-800 rounded-full peer peer-checked:bg-amber-600 transition-all duration-300"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-6 transition-all duration-300"></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-300 group-hover:text-amber-200 transition-colors">
                      {t('serverSettings.auto_update')}
                    </span>
                    <span className="text-[10px] text-amber-500/70 font-bold uppercase tracking-wider">
                      {t('serverSettings.auto_update_warning')}
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Global Action Footer */}
        {canEdit && (
          <div className="flex items-center justify-end gap-4 p-6 bg-[#111827] rounded-2xl border border-gray-800">
            <button
              type="button"
              onClick={() => navigate('/instances')}
              className="px-6 py-2 text-gray-400 hover:text-white transition-colors font-semibold"
            >
              {t('serverSettings.discard')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-2 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? t('serverSettings.saving') : t('serverSettings.save_changes')}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default ServerSettings;
