import { apiFetch } from '../utils/api'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Server, MapPin, Users, Lock, Key, Shield, Globe, Database } from 'lucide-react'
import { SERVER_REGIONS } from '../config/regions'
import toast from 'react-hot-toast'

interface ServerData {
  id: number
  name: string
  map: string
  max_players: number
  port: number
  password?: string
  rcon_password?: string
  vac_enabled: boolean
  gslt_token?: string
  steam_api_key?: string
  game_type: number
  game_mode: number
  game_alias?: string
  hibernate: number
  validate_files: number
  additional_args?: string
  tickrate: number
  region: number
}

const ServerSettings = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [server, setServer] = useState<ServerData | null>(null)
  const [dbCreds, setDbCreds] = useState<any>(null)

  useEffect(() => {
    fetchServerData()
  }, [id])

  const fetchServerData = async () => {
    try {
      const [srvResponse, dbResponse] = await Promise.all([
        apiFetch(`/api/servers/${id}`),
        apiFetch(`/api/servers/${id}/database`)
      ])

      if (srvResponse.ok) {
        setServer(await srvResponse.json())
      }
      if (dbResponse.ok) {
        const dbData = await dbResponse.json()
        setDbCreds(dbData.credentials)
      }
    } catch (error) {
      console.error('Failed to fetch server:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!server) return

    setSaving(true)
    try {
      const response = await apiFetch(`/api/servers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(server)
      })

      if (response.ok) {
        toast.success('Server settings updated successfully')
      } else {
        toast.error('Failed to save server settings')
      }
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Connection error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 text-gray-600">
          <Server className="w-10 h-10 opacity-20" />
          <span className="text-xs font-bold tracking-widest uppercase">LOADING SETTINGS</span>
        </div>
      </div>
    )
  }

  if (!server) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Server not found
      </div>
    )
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <header className="mb-8">
        <button
          onClick={() => navigate('/instances')}
          className="flex items-center text-gray-500 hover:text-white transition-colors mb-4 text-xs font-bold uppercase tracking-widest"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Instances
        </button>
        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          Server Settings
          <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-bold tracking-widest uppercase">
            Configuration
          </span>
        </h2>
        <p className="text-sm text-gray-400 mt-2">Manage your Counter-Strike 2 server parameters and security protocols.</p>
      </header>

      <form onSubmit={handleSave} className="space-y-8 flex-1">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Server Information */}
          <div className="bg-[#111827] rounded-2xl border border-gray-800 p-8">
            <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-3">
              <Server className="w-5 h-5 text-primary" />
              Instance Information
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-400">
                  Server Name
                </label>
                <input
                  type="text"
                  value={server.name}
                  onChange={(e) => setServer({ ...server, name: e.target.value })}
                  className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder:text-gray-700"
                  placeholder="Quatrix Dedicated Server"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    Primary Map
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <select
                      value={server.map}
                      onChange={(e) => setServer({ ...server, map: e.target.value })}
                      className="w-full pl-12 pr-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all cursor-pointer"
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
                    Max Players
                  </label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <input
                      type="number"
                      min="2"
                      max="64"
                      value={server.max_players}
                      onChange={(e) => setServer({ ...server, max_players: parseInt(e.target.value) })}
                      className="w-full pl-12 pr-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    Server Port
                  </label>
                  <input
                    type="number"
                    min="1024"
                    max="65535"
                    value={server.port}
                    onChange={(e) => setServer({ ...server, port: parseInt(e.target.value) })}
                    className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white font-mono focus:border-primary outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    Game Alias
                  </label>
                  <select
                    value={server.game_alias || ''}
                    onChange={(e) => setServer({ ...server, game_alias: e.target.value })}
                    className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all cursor-pointer"
                  >
                    <option value="">Default (Use Game Mode)</option>
                    <option value="competitive">Competitive</option>
                    <option value="casual">Casual</option>
                    <option value="deathmatch">Deathmatch</option>
                    <option value="wingman">Wingman</option>
                    <option value="armsrace">Arms Race</option>
                    <option value="demolition">Demolition</option>
                    <option value="training">Training</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    Tickrate
                  </label>
                  <input
                    type="number"
                    min="64"
                    max="128"
                    value={server.tickrate || 128}
                    onChange={(e) => setServer({ ...server, tickrate: parseInt(e.target.value) })}
                    className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    Server Region
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <select
                      value={server.region || 3}
                      onChange={(e) => setServer({ ...server, region: parseInt(e.target.value) })}
                      className="w-full pl-12 pr-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all cursor-pointer"
                    >
                      {SERVER_REGIONS.map((r: any) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    Additional Launch Arguments
                  </label>
                  <input
                    type="text"
                    value={server.additional_args || ''}
                    onChange={(e) => setServer({ ...server, additional_args: e.target.value })}
                    className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all"
                    placeholder="-tickrate 128 +sv_infinite_ammo 1..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="bg-[#111827] rounded-2xl border border-gray-800 p-8">
            <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              Security Settings
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    Server Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <input
                      type="password"
                      value={server.password || ''}
                      onChange={(e) => setServer({ ...server, password: e.target.value })}
                      className="w-full pl-12 pr-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-400">
                    RCON Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <input
                      type="password"
                      value={server.rcon_password || ''}
                      onChange={(e) => setServer({ ...server, rcon_password: e.target.value })}
                      className="w-full pl-12 pr-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all"
                      placeholder="Required"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-400">
                  GSLT Token <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={server.gslt_token || ''}
                  onChange={(e) => setServer({ ...server, gslt_token: e.target.value })}
                  className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white font-mono text-sm focus:border-primary outline-none transition-all"
                  placeholder="Steam Game Server Login Token"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-400">
                  Steam Web API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={server.steam_api_key || ''}
                  onChange={(e) => setServer({ ...server, steam_api_key: e.target.value })}
                  className="w-full px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white font-mono text-sm focus:border-primary outline-none transition-all"
                  placeholder="Your Steam Web API Key"
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
                    />
                    <div className="w-12 h-6 bg-gray-800 rounded-full peer peer-checked:bg-primary transition-all duration-300"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-6 transition-all duration-300"></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">Valve Anti-Cheat (VAC)</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Enhanced Protection</span>
                  </div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-8 pt-4 border-t border-gray-800/50">
                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={Boolean(server.hibernate)}
                      onChange={(e) => setServer({ ...server, hibernate: e.target.checked ? 1 : 0 })}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-6 bg-gray-800 rounded-full peer peer-checked:bg-primary transition-all duration-300"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-6 transition-all duration-300"></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">Hibernation</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Low CPU when empty</span>
                  </div>
                </label>

                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={Boolean(server.validate_files)}
                      onChange={(e) => setServer({ ...server, validate_files: e.target.checked ? 1 : 0 })}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-6 bg-gray-800 rounded-full peer peer-checked:bg-primary transition-all duration-300"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-6 transition-all duration-300"></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">Validate Files</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Run validation on start</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Database Information */}
          <div className="bg-[#111827] rounded-2xl border border-gray-800 p-8">
            <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-3">
              <Database className="w-5 h-5 text-primary" />
              Database Management
            </h3>
            
            {!dbCreds ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Database className="w-8 h-8 text-primary opacity-50" />
                </div>
                <h4 className="text-white font-bold mb-2">No Database Provisioned</h4>
                <p className="text-sm text-gray-400 max-w-md mb-6">
                  Each server can have its own isolated MySQL database. 
                  Provisioning a database allows plugins like SkyboxChanger and LevelsRanks to store data permanently.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await apiFetch(`/api/servers/${id}/database/provision`, { method: 'POST' });
                    if (res.ok) {
                      const data = await res.json();
                      setDbCreds(data.credentials);
                      toast.success('Database provisioned successfully');
                    } else {
                      toast.error('Failed to provision database');
                    }
                  }}
                  className="px-6 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl font-bold transition-all"
                >
                  Provision Database Now
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-gray-400">
                  This server has an isolated database provisioned. Credentials are automatically injected into supported plugins.
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-400">Database Host</label>
                    <div className="px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white font-mono text-sm">
                      {dbCreds.host}:{dbCreds.port}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-400">Database Name</label>
                    <div className="px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white font-mono text-sm">
                      {dbCreds.database}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-400">Username</label>
                    <div className="px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white font-mono text-sm">
                      {dbCreds.user}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-400">Password</label>
                    <div className="px-5 py-3 bg-black/20 border border-gray-800 rounded-xl text-white font-mono text-sm break-all">
                      {dbCreds.password}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Global Action Footer */}
        <div className="flex items-center justify-end gap-4 p-6 bg-[#111827] rounded-2xl border border-gray-800">
          <button
            type="button"
            onClick={() => navigate('/instances')}
            className="px-6 py-2 text-gray-400 hover:text-white transition-colors font-semibold"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-2 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ServerSettings
