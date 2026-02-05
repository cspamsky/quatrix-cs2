import { useState, useEffect } from 'react'
import { Database, Server, RefreshCw, Copy, Check, Layers, ExternalLink } from 'lucide-react'
import { apiFetch } from '../utils/api'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

interface DatabaseInfo {
  host: string
  port: number
  database: string
  user: string
  password?: string
}

interface ServerWithDB {
  id: number
  name: string
  db: DatabaseInfo | null
  stats?: { size: number; tables: number }
  autoSync?: boolean
}

const DatabasePage = () => {
  const { t } = useTranslation()
  const [servers, setServers] = useState<ServerWithDB[]>([])
  const [loading, setLoading] = useState(true)
  const [provisioning, setProvisioning] = useState<number | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [globalStatus, setGlobalStatus] = useState<'ONLINE' | 'OFFLINE' | 'CHECKING'>('CHECKING')
  const [manualForm, setManualForm] = useState({
    host: '',
    port: '3306',
    database: '',
    user: '',
    password: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // Check MariaDB Status
      const statusRes = await apiFetch('/api/servers/database/status')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setGlobalStatus(statusData.status)
      } else {
        setGlobalStatus('OFFLINE')
      }

      const response = await apiFetch('/api/servers')
      if (response.ok) {
        const serverList = await response.json()
        
        // Fetch DB info for each server
        const enrichedServers = await Promise.all(serverList.map(async (srv: any) => {
          const dbRes = await apiFetch(`/api/servers/${srv.id}/database`)
          const dbData = dbRes.ok ? await dbRes.json() : null
          return {
            id: srv.id,
            name: srv.name,
            db: dbData?.credentials || null,
            stats: dbData?.stats || { size: 0, tables: 0 },
            autoSync: dbData?.credentials?.autoSync !== false // default to true
          }
        }))
        
        setServers(enrichedServers)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
      toast.error(t('database.load_failed'))
      setGlobalStatus('OFFLINE')
    } finally {
      setLoading(false)
    }
  }

  const handleProvision = async (serverId: number) => {
    setProvisioning(serverId)
    try {
      const res = await apiFetch(`/api/servers/${serverId}/database/provision`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setServers(prev => prev.map(s => s.id === serverId ? { ...s, db: data.credentials } : s))
        toast.success(t('database.provision_success'))
      } else {
        toast.error(t('database.provision_failed'))
      }
    } catch (error) {
      toast.error(t('database.connection_error'))
    } finally {
      setProvisioning(null)
    }
  }

  const handleSaveManual = async (id: number) => {
    try {
      const response = await apiFetch(`/api/servers/${id}/database`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualForm)
      })

      if (response.ok) {
        toast.success(t('database.credentials_saved'))
        setEditingId(null)
        fetchData()
      } else {
        const data = await response.json()
        toast.error(data.message || t('database.save_failed'))
      }
    } catch (error) {
      toast.error(t('database.server_connect_failed'))
    }
  }

  const handleCustomProvision = async (id: number) => {
    try {
      const response = await apiFetch(`/api/servers/${id}/database/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: manualForm.user,
          password: manualForm.password,
          database: manualForm.database
        })
      })

      if (response.ok) {
        toast.success(t('database.local_db_created'))
        setEditingId(null)
        fetchData()
      } else {
        const data = await response.json()
        toast.error(data.message || t('database.local_db_failed'))
      }
    } catch (error) {
      toast.error(t('database.server_connect_failed'))
    }
  }

  const toggleAutoSync = async (id: number, current: boolean) => {
    try {
      const response = await apiFetch(`/api/servers/${id}/database/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSync: !current })
      })

      if (response.ok) {
        toast.success(t('database.autosync_toggled', { status: !current ? t('common.enabled') : t('common.disabled') }))
        fetchData()
      }
    } catch (error) {
      toast.error(t('database.settings_update_failed'))
    }
  }


  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
    toast.success(t('database.copied'))
  }

  const openManualEntry = (server: ServerWithDB) => {
    setEditingId(server.id)
    if (server.db) {
      setManualForm({
        host: server.db.host,
        port: String(server.db.port),
        database: server.db.database,
        user: server.db.user,
        password: server.db.password || ''
      })
    } else {
      setManualForm({ host: '', port: '3306', database: '', user: '', password: '' })
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 text-primary animate-spin opacity-50" />
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen flex flex-col">
      <header className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="text-left">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-bold text-white tracking-tight flex items-center justify-start gap-3">
              <Database className="w-8 h-8 text-primary" />
              {t('database.title')}
            </h2>
            <div className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
              globalStatus === 'ONLINE' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
              globalStatus === 'OFFLINE' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
              'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${globalStatus === 'ONLINE' ? 'bg-green-500 animate-pulse' : 'bg-current'}`}></span>
              MariaDB: {globalStatus}
            </div>
          </div>
          <p className="text-gray-400 max-w-2xl text-left">
            {t('database.subtitle')}
          </p>
        </div>
        <button 
          onClick={fetchData}
          className="lg:mb-1 p-3 bg-[#111827] border border-gray-800 hover:border-primary/50 text-gray-400 hover:text-primary rounded-2xl transition-all shadow-xl group"
          title={t('database.refresh_stats')}
        >
          <RefreshCw className={`w-5 h-5 group-active:rotate-180 transition-transform duration-500 ${loading ? 'animate-spin text-primary' : ''}`} />
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {servers.map((server) => (
          <div key={server.id} className="bg-[#111827]/50 backdrop-blur-xl rounded-3xl border border-gray-800/50 overflow-hidden flex flex-col shadow-2xl transition-all hover:border-primary/20">
            <div className="p-6 border-b border-gray-800/50 flex items-center justify-between bg-white/[0.01]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
                  <Server className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors">{server.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">ID:{server.id}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${server.db ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-gray-600'}`}></div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                {!server.db && !editingId && (
                  <>
                    <button
                      onClick={() => handleProvision(server.id)}
                      disabled={provisioning === server.id}
                      className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {provisioning === server.id ? t('database.provisioning') : t('database.auto_provision')}
                    </button>
                    <button
                      onClick={() => openManualEntry(server)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-xs font-bold transition-all"
                    >
                      {t('database.manual')}
                    </button>
                  </>
                )}
                {server.db && editingId !== server.id && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.open(window.location.origin + '/phpmyadmin/', '_blank')}
                      className="px-3 py-2 bg-[#6c78af]/20 hover:bg-[#6c78af]/30 text-[#bbc4ff] border border-[#6c78af]/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      phpMyAdmin
                    </button>
                    <button
                      onClick={() => openManualEntry(server)}
                      className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 rounded-xl transition-all"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 flex-1">
              {editingId === server.id ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('database.host')}</label>
                      <input 
                        className="w-full bg-black/40 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-all"
                        value={manualForm.host}
                        onChange={e => setManualForm({...manualForm, host: e.target.value})}
                        placeholder="localhost"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('database.port')}</label>
                      <input 
                        className="w-full bg-black/40 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-all"
                        value={manualForm.port}
                        onChange={e => setManualForm({...manualForm, port: e.target.value})}
                        placeholder="3306"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('database.database_name')}</label>
                    <input 
                      className="w-full bg-black/40 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-all"
                      value={manualForm.database}
                      onChange={e => setManualForm({...manualForm, database: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('database.username')}</label>
                      <input 
                        className="w-full bg-black/40 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-all"
                        value={manualForm.user}
                        onChange={e => setManualForm({...manualForm, user: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('database.password')}</label>
                      <input 
                        type="password"
                        className="w-full bg-black/40 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-all"
                        value={manualForm.password}
                        onChange={e => setManualForm({...manualForm, password: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => handleSaveManual(server.id)}
                      className="flex-1 py-2.5 bg-primary text-black font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 text-xs"
                    >
                      {t('database.save_config')}
                    </button>
                    {!manualForm.host || manualForm.host === 'localhost' || manualForm.host === '127.0.0.1' ? (
                      <button 
                        onClick={() => handleCustomProvision(server.id)}
                        className="flex-1 py-2.5 bg-white/10 text-white font-bold rounded-xl border border-white/10 hover:bg-white/20 transition-all text-xs"
                      >
                        {t('database.create_local_db')}
                      </button>
                    ) : null}
                    <button 
                      onClick={() => setEditingId(null)}
                      className="px-6 py-2.5 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-all text-xs"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : server.db ? (
                <div className="grid grid-cols-2 gap-6 animate-in fade-in duration-500">
                  {[
                    { label: t('database.host'), value: `${server.db.host}:${server.db.port}`, key: `host-${server.id}` },
                    { label: t('database.database'), value: server.db.database, key: `db-${server.id}` },
                    { label: t('database.user'), value: server.db.user, key: `user-${server.id}` },
                    { label: t('database.password'), value: server.db.password || '********', key: `pass-${server.id}` }
                  ].map((field) => (
                    <div key={field.key} className="space-y-2 group">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-extrabold text-gray-600 uppercase tracking-widest">{field.label}</label>
                      </div>
                      <div 
                        onClick={() => copyToClipboard(field.value, field.key)}
                        className="flex items-center justify-between px-4 py-3 bg-black/30 border border-gray-800/40 rounded-2xl group-hover:border-primary/40 group-hover:bg-primary/[0.02] transition-all cursor-pointer overflow-hidden"
                      >
                        <span className="text-xs text-gray-300 font-mono truncate mr-2">{field.value}</span>
                        {copiedKey === field.key ? (
                          <Check className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-600 group-hover:text-primary transition-colors shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="col-span-2 mt-2 pt-4 border-t border-gray-800/30 grid grid-cols-2 gap-4 text-center">
                    <div className="bg-white/[0.02] p-3 rounded-2xl border border-white/[0.02]">
                       <div className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">{t('database.storage_size')}</div>
                       <div className="text-lg font-bold text-white font-mono">{server.stats?.size || 0} <span className="text-[10px] text-gray-500">MB</span></div>
                    </div>
                    <div className="bg-white/[0.02] p-3 rounded-2xl border border-white/[0.02]">
                       <div className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">{t('database.total_tables')}</div>
                       <div className="text-lg font-bold text-white font-mono">{server.stats?.tables || 0}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center opacity-40">
                  <Database className="w-16 h-16 text-gray-700 mb-4 stroke-1" />
                  <h4 className="text-white font-bold mb-1">{t('database.offline_title')}</h4>
                  <p className="text-xs text-gray-500 max-w-[240px]">
                    {t('database.offline_message')}
                  </p>
                </div>
              )}
            </div>
            
            {server.db && editingId !== server.id && (
              <div className="px-8 py-4 bg-primary/[0.03] border-t border-gray-800/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div>
                  <span className="text-[11px] font-black text-primary uppercase tracking-[0.2em]">{t('database.synchronized')}</span>
                </div>
                <div className="text-[10px] text-gray-500 font-medium italic">
                  {server.autoSync ? t('database.injecting_credentials') : t('database.autosync_disabled')}
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-bold text-gray-600 uppercase">{t('database.autosync')}</label>
                  <button 
                    onClick={() => toggleAutoSync(server.id, !!server.autoSync)}
                    className={`w-10 h-5 rounded-full transition-all relative ${server.autoSync ? 'bg-primary' : 'bg-gray-800'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${server.autoSync ? 'right-1' : 'left-1'}`}></div>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {servers.length === 0 && (
        <div className="col-span-full py-20 bg-[#111827] rounded-3xl border border-dashed border-gray-800 flex flex-col items-center">
          <Layers className="w-12 h-12 text-gray-800 mb-4" />
          <h3 className="text-white font-bold">{t('database.no_instances_title')}</h3>
          <p className="text-gray-500 text-sm mt-1">{t('database.no_instances_message')}</p>
        </div>
      )}

    </div>
  )
}

export default DatabasePage
