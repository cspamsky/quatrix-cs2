import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/api'
import { 
  Info, 
  Map as MapIcon, 
  Settings2, 
  ChevronRight, 
  ChevronLeft, 
  Rocket,
  Globe
} from 'lucide-react'
import { SERVER_REGIONS } from '../config/regions'
import { useTranslation } from 'react-i18next'

const CreateInstance = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    serverName: '',
    maxPlayers: 10,
    port: '27015',
    initialMap: 'de_dust2',
    glstToken: '',
    steamApiKey: '',
    serverPassword: '',
    rconPassword: '',
    autoStart: true,
    sourceTV: false,
    vac: true,
    gameAlias: 'competitive', // Default to Competitive alias
    hibernate: true,
    validateFiles: false,
    additionalArgs: '',
    region: 3 // Default to Europe
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
          game_alias: formData.gameAlias,
          hibernate: formData.hibernate ? 1 : 0,
          validate_files: formData.validateFiles ? 1 : 0,
          additional_args: formData.additionalArgs || null,
          auto_start: formData.autoStart,
          region: formData.region
        }),
      })


      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || t('createInstance.create_error'))
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
        <h2 className="text-2xl font-bold text-white tracking-tight">{t('createInstance.title')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('createInstance.subtitle')}</p>
      </div>

      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        {/* Stepper Header */}
        <div className="px-8 py-6 border-b border-gray-800 bg-[#111827]">
          <div className="flex justify-between items-center max-w-2xl">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step >= 1 ? 'bg-primary text-white' : 'bg-gray-800 text-gray-500'}`}>1</div>
              <span className={`font-semibold hidden sm:block ${step >= 1 ? 'text-primary' : 'text-gray-500'}`}>{t('createInstance.step_details')}</span>
            </div>
            <div className={`h-px flex-1 mx-4 ${step > 1 ? 'bg-primary' : 'bg-gray-800'}`}></div>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step >= 2 ? 'bg-primary text-white' : 'bg-gray-800 text-gray-500'}`}>2</div>
              <span className={`font-semibold hidden sm:block ${step >= 2 ? 'text-primary' : 'text-gray-500'}`}>{t('createInstance.step_map')}</span>
            </div>
            <div className={`h-px flex-1 mx-4 ${step > 2 ? 'bg-primary' : 'bg-gray-800'}`}></div>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step >= 3 ? 'bg-primary text-white' : 'bg-gray-800 text-gray-500'}`}>3</div>
              <span className={`font-semibold hidden sm:block ${step >= 3 ? 'text-primary' : 'text-gray-500'}`}>{t('createInstance.step_advanced')}</span>
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
                    {t('createInstance.basic_info_title')}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{t('createInstance.basic_info_subtitle')}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label htmlFor="serverName" className="block text-sm font-bold text-gray-400">{t('createInstance.server_name')}</label>
                    <input 
                      id="serverName"
                      type="text" 
                      name="serverName"
                      value={formData.serverName}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder={t('createInstance.server_name_placeholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="maxPlayers" className="block text-sm font-bold text-gray-400">{t('createInstance.max_players')}</label>
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
                    <label htmlFor="port" className="block text-sm font-bold text-gray-400">{t('createInstance.server_port')}</label>
                    <input 
                      id="port"
                      type="text" 
                      name="port"
                      value={formData.port}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="region" className="block text-sm font-bold text-gray-400">{t('createInstance.server_region')}</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                      <select 
                        id="region"
                        name="region"
                        value={formData.region}
                        onChange={handleInputChange}
                        className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all cursor-pointer"
                      >
                        {SERVER_REGIONS.map((r: any) => (
                          <option key={r.id} value={r.id}>{t(`regions.${r.code}`)}</option>
                        ))}
                      </select>
                    </div>
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
                    {t('createInstance.map_config_title')}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{t('createInstance.map_config_subtitle')}</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="initialMap" className="block text-sm font-bold text-gray-400">{t('createInstance.initial_map')}</label>
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
                    {t('createInstance.advanced_config_title')}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{t('createInstance.advanced_config_subtitle')}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label htmlFor="glstToken" className="block text-sm font-bold text-gray-400">
                      {t('createInstance.gslt_token')} <span className="text-red-500">*</span>
                    </label>
                    <input 
                      id="glstToken"
                      type="text" 
                      name="glstToken"
                      value={formData.glstToken}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder={t('createInstance.gslt_placeholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="steamApiKey" className="block text-sm font-bold text-gray-400">
                      {t('createInstance.steam_api_key')} <span className="text-red-500">*</span>
                    </label>
                    <input 
                      id="steamApiKey"
                      type="text" 
                      name="steamApiKey"
                      value={formData.steamApiKey}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder={t('createInstance.steam_api_placeholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="serverPassword" className="block text-sm font-bold text-gray-400">{t('createInstance.server_password')}</label>
                    <input 
                      id="serverPassword"
                      type="password" 
                      name="serverPassword"
                      value={formData.serverPassword}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder={t('createInstance.server_password_placeholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="rconPassword" className="block text-sm font-bold text-gray-400">
                      {t('createInstance.rcon_password')} <span className="text-red-500">*</span>
                    </label>
                    <input 
                      id="rconPassword"
                      type="password" 
                      name="rconPassword"
                      value={formData.rconPassword}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder={t('createInstance.rcon_placeholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="gameAlias" className="block text-sm font-bold text-gray-400">{t('createInstance.game_alias')}</label>
                    <select 
                      id="gameAlias"
                      name="gameAlias"
                      value={formData.gameAlias}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all cursor-pointer"
                    >
                      <option value="">{t('createInstance.game_alias_default')}</option>
                      <option value="competitive">{t('createInstance.game_alias_competitive')}</option>
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
                    <label htmlFor="additionalArgs" className="block text-sm font-bold text-gray-400">{t('createInstance.additional_args')}</label>
                    <input 
                      id="additionalArgs"
                      type="text" 
                      name="additionalArgs"
                      value={formData.additionalArgs}
                      onChange={handleInputChange}
                      className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600" 
                      placeholder={t('createInstance.additional_args_placeholder')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <div className="flex items-center gap-3 p-4 bg-[#0F172A]/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-all">
                    <button
                      aria-label="Toggle Server Hibernation"
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, hibernate: !prev.hibernate }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.hibernate ? 'bg-primary' : 'bg-gray-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.hibernate ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <div className="flex flex-col">
                        <span className="text-sm text-gray-300 font-semibold">{t('createInstance.enable_hibernation')}</span>
                        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">{t('createInstance.hibernation_desc')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-[#0F172A]/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-all">
                    <button
                      aria-label="Toggle Force File Validation"
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, validateFiles: !prev.validateFiles }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.validateFiles ? 'bg-primary' : 'bg-gray-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.validateFiles ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <div className="flex flex-col">
                        <span className="text-sm text-gray-300 font-semibold">{t('createInstance.validate_files')}</span>
                        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">{t('createInstance.validate_desc')}</span>
                    </div>
                  </div>
                 <div className="flex items-center gap-3 p-4 bg-[#0F172A]/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-all">
                    <button
                      aria-label="Toggle Auto-start server after creation"
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, autoStart: !prev.autoStart }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.autoStart ? 'bg-primary' : 'bg-gray-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.autoStart ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-sm text-gray-300">{t('createInstance.auto_start')}</span>
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
                    <span className="text-sm text-gray-300">{t('createInstance.enable_sourcetv')}</span>
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
                    <span className="text-sm text-gray-300">{t('createInstance.enable_vac')}</span>
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
            {t('createInstance.previous')}
          </button>
          
          <div className="flex gap-4">
            {step < 3 ? (
              <button 
                onClick={nextStep}
                className="px-10 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 active:scale-95"
              >
                {t('createInstance.next_step')}
                <ChevronRight size={18} />
              </button>
            ) : (
              <button 
                onClick={handleSubmit}
                disabled={loading || !formData.serverName}
                className="px-12 py-3 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Rocket size={18} />
                {loading ? t('createInstance.creating') : t('createInstance.launch_instance')}
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default CreateInstance
