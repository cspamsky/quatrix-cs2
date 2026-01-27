import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/api'
import { 
  Info, 
  Map as MapIcon, 
  Settings2, 
  ChevronRight, 
  ChevronLeft, 
  Rocket
} from 'lucide-react'

const CreateInstance = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    serverName: '',
    gameType: '0-1', // Default to Competitive (type 0, mode 1)
    maxPlayers: 10,
    port: '27015',
    initialMap: 'de_dust2',
    glstToken: '',
    steamApiKey: '',
    serverPassword: '',
    rconPassword: '',
    autoStart: true,
    sourceTV: false,
    vac: true
  })

  const nextStep = () => setStep(s => Math.min(s + 1, 3))
  const prevStep = () => setStep(s => Math.max(s - 1, 1))

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    setFormData(prev => ({ ...prev, [name]: val }))
  }

  const handleSubmit = async () => {
    setError('')
    setLoading(true)

    try {
      const response = await apiFetch('/api/servers', {

        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: formData.serverName,
          map: formData.initialMap,
          max_players: parseInt(String(formData.maxPlayers)),
          port: parseInt(String(formData.port)),
          rcon_password: formData.rconPassword || null,
          password: formData.serverPassword || null,
          gslt_token: formData.glstToken || null,
          steam_api_key: formData.steamApiKey || null,
          vac_enabled: formData.vac ? 1 : 0,
          game_type: parseInt(formData.gameType.split('-')[0]),
          game_mode: parseInt(formData.gameType.split('-')[1]),
          auto_start: formData.autoStart
        }),
      })


      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create server')
      }

      navigate('/instances')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 font-display">
      {/* Breadcrumbs & Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">Create New CS2 Instance</h2>
        <p className="text-sm text-gray-400 mt-1">Configure and deploy a new Counter-Strike 2 dedicated server using our setup wizard.</p>
      </div>

      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        {/* Stepper Header */}
        <div className="px-8 py-6 border-b border-gray-800 bg-[#111827]">
          <div className="flex justify-between items-center max-w-2xl">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step >= 1 ? 'bg-primary text-white' : 'bg-gray-800 text-gray-500'}`}>1</div>
              <span className={`font-semibold hidden sm:block ${step >= 1 ? 'text-primary' : 'text-gray-500'}`}>Details</span>
            </div>
            <div className={`h-px flex-1 mx-4 ${step > 1 ? 'bg-primary' : 'bg-gray-800'}`}></div>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step >= 2 ? 'bg-primary text-white' : 'bg-gray-800 text-gray-500'}`}>2</div>
              <span className={`font-semibold hidden sm:block ${step >= 2 ? 'text-primary' : 'text-gray-500'}`}>Map</span>
            </div>
            <div className={`h-px flex-1 mx-4 ${step > 2 ? 'bg-primary' : 'bg-gray-800'}`}></div>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step >= 3 ? 'bg-primary text-white' : 'bg-gray-800 text-gray-500'}`}>3</div>
              <span className={`font-semibold hidden sm:block ${step >= 3 ? 'text-primary' : 'text-gray-500'}`}>Advanced</span>
            </div>
          </div>
        </div>

        <div className="p-8 min-h-[400px]">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
              {error}
            </div>
          )}
          <form className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Step 1: Server Details */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="pb-4 border-b border-gray-800 mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Info className="text-primary" size={20} />
                    Basic Server Information
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">Provide the essential details for your new CS2 instance.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label htmlFor="serverName" className="block text-sm font-bold text-gray-400">Server Name</label>
                    <input 
                      id="serverName"
                      type="text" 
                      name="serverName"
                      value={formData.serverName}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder="My Awesome CS2 Server"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="gameType" className="block text-sm font-bold text-gray-400">Game Type</label>
                    <select 
                      id="gameType"
                      name="gameType"
                      value={formData.gameType}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                    >
                      <option value="0-0">Casual</option>
                      <option value="0-1">Competitive</option>
                      <option value="0-2">Wingman</option>
                      <option value="1-0">Arms Race</option>
                      <option value="1-1">Demolition</option>
                      <option value="1-2">Deathmatch</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="maxPlayers" className="block text-sm font-bold text-gray-400">Max Players</label>
                    <input 
                      id="maxPlayers"
                      type="number" 
                      name="maxPlayers"
                      value={formData.maxPlayers}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="port" className="block text-sm font-bold text-gray-400">Server Port</label>
                    <input 
                      id="port"
                      type="text" 
                      name="port"
                      value={formData.port}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all" 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Map Selection */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="pb-4 border-b border-gray-800 mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <MapIcon className="text-primary" size={20} />
                    Map Configuration
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">Choose the initial map for your server.</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="initialMap" className="block text-sm font-bold text-gray-400">Initial Map</label>
                  <select 
                    id="initialMap"
                    name="initialMap"
                    value={formData.initialMap}
                    onChange={handleInputChange}
                    className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                  >
                    <option value="de_dust2">de_dust2</option>
                    <option value="de_mirage">de_mirage</option>
                    <option value="de_inferno">de_inferno</option>
                    <option value="de_nuke">de_nuke</option>
                    <option value="de_ancient">de_ancient</option>
                    <option value="de_anubis">de_anubis</option>
                    <option value="de_vertigo">de_vertigo</option>
                    <option value="de_overpass">de_overpass</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 3: Advanced Settings */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="pb-4 border-b border-gray-800 mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Settings2 className="text-primary" size={20} />
                    Advanced Configuration
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">Optional settings for enhanced server control.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label htmlFor="glstToken" className="block text-sm font-bold text-gray-400">GLST Token (Optional)</label>
                    <input 
                      id="glstToken"
                      type="text" 
                      name="glstToken"
                      value={formData.glstToken}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder="Your GameServer Login Token"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="steamApiKey" className="block text-sm font-bold text-gray-400">Steam Web API Key (Optional)</label>
                    <input 
                      id="steamApiKey"
                      type="text" 
                      name="steamApiKey"
                      value={formData.steamApiKey}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder="For workshop content"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="serverPassword" className="block text-sm font-bold text-gray-400">Server Password (Optional)</label>
                    <input 
                      id="serverPassword"
                      type="password" 
                      name="serverPassword"
                      value={formData.serverPassword}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder="Leave empty for public"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="rconPassword" className="block text-sm font-bold text-gray-400">RCON Password (Optional)</label>
                    <input 
                      id="rconPassword"
                      type="password" 
                      name="rconPassword"
                      value={formData.rconPassword}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder="Auto-generated if empty"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="flex items-center gap-3 p-4 bg-[#0F172A]/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-all">
                    <button
                      aria-label="Toggle Auto-start server after creation"
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, autoStart: !prev.autoStart }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.autoStart ? 'bg-primary' : 'bg-gray-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.autoStart ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-sm text-gray-300">Auto-start server after creation</span>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-[#0F172A]/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-all">
                    <button
                      aria-label="Toggle Enable SourceTV"
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, sourceTV: !prev.sourceTV }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.sourceTV ? 'bg-primary' : 'bg-gray-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.sourceTV ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-sm text-gray-300">Enable SourceTV</span>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-[#0F172A]/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-all">
                    <button
                      aria-label="Toggle Enable VAC"
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, vac: !prev.vac }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.vac ? 'bg-primary' : 'bg-gray-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.vac ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-sm text-gray-300">Enable VAC (Valve Anti-Cheat)</span>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Navigation Footer */}
        <div className="px-8 py-6 border-t border-gray-800 bg-[#0F172A]/30 flex justify-between items-center">
          <button 
            onClick={prevStep}
            disabled={step === 1}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-800"
          >
            <ChevronLeft size={18} />
            Previous
          </button>
          
          <div className="flex gap-4">
            {step < 3 ? (
              <button 
                onClick={nextStep}
                className="px-10 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 active:scale-95"
              >
                Next Step
                <ChevronRight size={18} />
              </button>
            ) : (
              <button 
                onClick={handleSubmit}
                disabled={loading || !formData.serverName}
                className="px-12 py-3 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Rocket size={18} />
                {loading ? 'Creating...' : 'Launch Instance'}
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default CreateInstance
