import { apiFetch } from '../utils/api'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Server, MapPin, Users, Lock, Key, Shield } from 'lucide-react'
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
}

const GAME_MODES = [
  { name: 'Casual', type: 0, mode: 0 },
  { name: 'Competitive', type: 0, mode: 1 },
  { name: 'Wingman', type: 0, mode: 2 },
  { name: 'Arms Race', type: 1, mode: 0 },
  { name: 'Demolition', type: 1, mode: 1 },
  { name: 'Deathmatch', type: 1, mode: 2 }
]

const ServerSettings = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [server, setServer] = useState<ServerData | null>(null)

  useEffect(() => {
    fetchServerData()
  }, [id])

  const fetchServerData = async () => {
    try {
      const response = await apiFetch(`/api/servers/${id}`)

      if (response.ok) {
        const data = await response.json()
        setServer(data)
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
          <Server className="w-10 h-10 animate-pulse opacity-20" />
          <span className="text-xs font-black tracking-widest uppercase">LOADING SETTINGS</span>
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
    <div className="p-6 h-full flex flex-col animate-in fade-in duration-500">
      <header className="mb-8">
        <button
          onClick={() => navigate('/instances')}
          className="flex items-center text-gray-500 hover:text-white transition-colors mb-4 text-xs font-bold uppercase tracking-widest"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Instances
        </button>
        <h2 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3">
          SERVER SETTINGS
          <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-bold tracking-widest uppercase">
            Configuration
          </span>
        </h2>
        <p className="text-sm text-gray-400 mt-2 font-medium">Fine-tune your Counter-Strike 2 server parameters and security protocols.</p>
      </header>

      <form onSubmit={handleSave} className="space-y-8 flex-1">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Server Information */}
          <div className="bg-[#111827] rounded-2xl border border-gray-800 p-8 shadow-xl">
            <h3 className="text-xl font-black text-white mb-8 flex items-center gap-3 uppercase tracking-tight">
              <Server className="w-6 h-6 text-primary" />
              Instance Core
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Server Identity Name
                </label>
                <input
                  type="text"
                  value={server.name}
                  onChange={(e) => setServer({ ...server, name: e.target.value })}
                  className="w-full px-5 py-4 bg-black/20 border border-gray-800 rounded-xl text-white font-bold focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder:text-gray-700"
                  placeholder="Quatrix Dedicated Server"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Primary Map
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <select
                      value={server.map}
                      onChange={(e) => setServer({ ...server, map: e.target.value })}
                      className="w-full pl-12 pr-5 py-4 bg-black/20 border border-gray-800 rounded-xl text-white font-bold focus:border-primary outline-none transition-all appearance-none cursor-pointer"
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
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Capacity Limit
                  </label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <input
                      type="number"
                      min="2"
                      max="64"
                      value={server.max_players}
                      onChange={(e) => setServer({ ...server, max_players: parseInt(e.target.value) })}
                      className="w-full pl-12 pr-5 py-4 bg-black/20 border border-gray-800 rounded-xl text-white font-bold focus:border-primary outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Game Mode Selection
                  </label>
                  <select
                    value={`${server.game_type}-${server.game_mode}`}
                    onChange={(e) => {
                      const [type, mode] = e.target.value.split('-').map(Number)
                      setServer({ ...server, game_type: type, game_mode: mode })
                    }}
                    className="w-full px-5 py-4 bg-black/20 border border-gray-800 rounded-xl text-white font-bold focus:border-primary outline-none transition-all"
                  >
                    {GAME_MODES.map((mode) => (
                      <option key={`${mode.type}-${mode.mode}`} value={`${mode.type}-${mode.mode}`}>
                        {mode.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Network Port
                  </label>
                  <input
                    type="number"
                    min="1024"
                    max="65535"
                    value={server.port}
                    onChange={(e) => setServer({ ...server, port: parseInt(e.target.value) })}
                    className="w-full px-5 py-4 bg-black/20 border border-gray-800 rounded-xl text-white font-bold font-mono focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="bg-[#111827] rounded-2xl border border-gray-800 p-8 shadow-xl">
            <h3 className="text-xl font-black text-white mb-8 flex items-center gap-3 uppercase tracking-tight">
              <Shield className="w-6 h-6 text-primary" />
              Security & Auth
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Access Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <input
                      type="password"
                      value={server.password || ''}
                      onChange={(e) => setServer({ ...server, password: e.target.value })}
                      className="w-full pl-12 pr-5 py-4 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all"
                      placeholder="Public access if empty"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    RCON CMD Password
                  </label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                    <input
                      type="password"
                      value={server.rcon_password || ''}
                      onChange={(e) => setServer({ ...server, rcon_password: e.target.value })}
                      className="w-full pl-12 pr-5 py-4 bg-black/20 border border-gray-800 rounded-xl text-white focus:border-primary outline-none transition-all"
                      placeholder="Remote console access"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  GSLT (Game Server Login Token)
                </label>
                <input
                  type="text"
                  value={server.gslt_token || ''}
                  onChange={(e) => setServer({ ...server, gslt_token: e.target.value })}
                  className="w-full px-5 py-4 bg-black/20 border border-gray-800 rounded-xl text-white font-mono text-xs focus:border-primary outline-none transition-all"
                  placeholder="GSLT from Steam"
                />
                <p className="text-[10px] text-gray-600 font-bold tracking-tight">
                  Tokens are mandatory for external server listing. Get one at <a href="https://steamcommunity.com/dev/managegameservers" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Steam GSA Management</a>
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Steam Web API Authentication
                </label>
                <input
                  type="text"
                  value={server.steam_api_key || ''}
                  onChange={(e) => setServer({ ...server, steam_api_key: e.target.value })}
                  className="w-full px-5 py-4 bg-black/20 border border-gray-800 rounded-xl text-white font-mono text-xs focus:border-primary outline-none transition-all"
                  placeholder="Web API Key"
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
                    <span className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">Valve Anti-Cheat (VAC)</span>
                    <span className="text-[10px] text-gray-600 font-black uppercase tracking-widest">Enhanced server protection</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Global Action Footer */}
        <div className="flex items-center justify-between p-8 bg-[#111827] rounded-2xl border border-gray-800 shadow-2xl">
          <div className="hidden lg:block">
            <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em]">Warning: Major changes require server restart</p>
          </div>
          <div className="flex items-center gap-4 w-full lg:w-auto">
            <button
              type="button"
              onClick={() => navigate('/instances')}
              className="flex-1 lg:flex-none px-8 py-4 bg-white/[0.03] hover:bg-white/[0.08] text-gray-400 hover:text-white rounded-xl font-black text-xs tracking-widest transition-all"
            >
              DISCARD
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 lg:flex-none px-12 py-4 bg-primary hover:bg-blue-600 text-white rounded-xl font-black text-xs tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'UPDATING...' : 'COMMIT CHANGES'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default ServerSettings
