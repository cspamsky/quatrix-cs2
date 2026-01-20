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
      toast.error('Connection error: Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading server settings...</div>
      </div>
    )
  }

  if (!server) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Server not found</div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <button
            onClick={() => navigate('/instances')}
            className="flex items-center text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Instances
          </button>
          <h2 className="text-2xl font-bold text-white tracking-tight">Server Settings</h2>
          <p className="text-sm text-gray-400 mt-1">Configure your CS2 server instance</p>
        </header>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Server Information */}
          <div className="bg-[#111827] rounded-xl border border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Server className="w-5 h-5 mr-2 text-primary" />
              Server Information
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Server Name
                </label>
                <input
                  type="text"
                  value={server.name}
                  onChange={(e) => setServer({ ...server, name: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0d1421] border border-gray-800 rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  placeholder="My CS2 Server"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center">
                    <MapPin className="w-4 h-4 mr-1.5 text-primary" />
                    Default Map
                  </label>
                  <select
                    value={server.map}
                    onChange={(e) => setServer({ ...server, map: e.target.value })}
                    className="w-full px-4 py-2 bg-[#0d1421] border border-gray-800 rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
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

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center">
                    <Users className="w-4 h-4 mr-1.5 text-primary" />
                    Max Players
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="64"
                    value={server.max_players}
                    onChange={(e) => setServer({ ...server, max_players: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-[#0d1421] border border-gray-800 rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
              </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Game Mode
                  </label>
                  <select
                    value={`${server.game_type}-${server.game_mode}`}
                    onChange={(e) => {
                      const [type, mode] = e.target.value.split('-').map(Number)
                      setServer({ ...server, game_type: type, game_mode: mode })
                    }}
                    className="w-full px-4 py-2 bg-[#0d1421] border border-gray-800 rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  >
                    {GAME_MODES.map((mode) => (
                      <option key={`${mode.type}-${mode.mode}`} value={`${mode.type}-${mode.mode}`}>
                        {mode.name}
                      </option>
                    ))}
                  </select>
                </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Server Port
                </label>
                <input
                  type="number"
                  min="1024"
                  max="65535"
                  value={server.port}
                  onChange={(e) => setServer({ ...server, port: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-[#0d1421] border border-gray-800 rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="bg-[#111827] rounded-xl border border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-primary" />
              Security Settings
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center">
                  <Lock className="w-4 h-4 mr-1.5 text-primary" />
                  Server Password (Optional)
                </label>
                <input
                  type="password"
                  value={server.password || ''}
                  onChange={(e) => setServer({ ...server, password: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0d1421] border border-gray-800 rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  placeholder="Leave empty for public server"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center">
                  <Key className="w-4 h-4 mr-1.5 text-primary" />
                  RCON Password
                </label>
                <input
                  type="password"
                  value={server.rcon_password || ''}
                  onChange={(e) => setServer({ ...server, rcon_password: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0d1421] border border-gray-800 rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  placeholder="Remote console password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center">
                  <Key className="w-4 h-4 mr-1.5 text-orange-500" />
                  GLST Token (Optional)
                </label>
                <input
                  type="text"
                  value={server.gslt_token || ''}
                  onChange={(e) => setServer({ ...server, gslt_token: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0d1421] border border-gray-800 rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all font-mono text-sm"
                  placeholder="Your GameServer Login Token"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get your token from: <a href="https://steamcommunity.com/dev/managegameservers" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Steam Game Server Account Management</a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center">
                  <Key className="w-4 h-4 mr-1.5 text-orange-500" />
                  Steam Web API Key (Optional)
                </label>
                <input
                  type="text"
                  value={server.steam_api_key || ''}
                  onChange={(e) => setServer({ ...server, steam_api_key: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0d1421] border border-gray-800 rounded-lg text-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all font-mono text-sm"
                  placeholder="Your Steam Web API Key"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get your API key from: <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Steam Web API Key</a>
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="vac"
                  checked={Boolean(server.vac_enabled)}
                  onChange={(e) => setServer({ ...server, vac_enabled: e.target.checked })}
                  className="w-4 h-4 text-primary bg-[#0d1421] border-gray-800 rounded focus:ring-primary focus:ring-2"
                />
                <label htmlFor="vac" className="ml-2 text-sm text-gray-300">
                  Enable VAC (Valve Anti-Cheat)
                </label>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/instances')}
              className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg font-semibold transition-all flex items-center disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ServerSettings
