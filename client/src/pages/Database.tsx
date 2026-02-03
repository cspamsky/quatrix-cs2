import { useState, useEffect } from 'react'
import { Database, Server, RefreshCw, Copy, Check, Layers } from 'lucide-react'
import { apiFetch } from '../utils/api'
import toast from 'react-hot-toast'

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
}

const DatabasePage = () => {
  const [servers, setServers] = useState<ServerWithDB[]>([])
  const [loading, setLoading] = useState(true)
  const [provisioning, setProvisioning] = useState<number | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
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
            db: dbData?.credentials || null
          }
        }))
        
        setServers(enrichedServers)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
      toast.error('Failed to load database information')
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
        toast.success('Database provisioned successfully')
      } else {
        toast.error('Failed to provision database')
      }
    } catch (error) {
      toast.error('Connection error')
    } finally {
      setProvisioning(null)
    }
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
    toast.success('Copied to clipboard')
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 text-primary animate-spin opacity-50" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <header className="mb-10">
        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <Database className="w-8 h-8 text-primary" />
          MySQL Database Management
        </h2>
        <p className="text-gray-400 mt-2 max-w-2xl">
          Manage isolated MySQL databases for your game server instances. 
          Credentials are automatically injected into supported plugins like LevelsRanks and SkyboxChanger.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {servers.map((server) => (
          <div key={server.id} className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white">{server.name}</h3>
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Instance ID: {server.id}</span>
                </div>
              </div>
              
              {!server.db && (
                <button
                  onClick={() => handleProvision(server.id)}
                  disabled={provisioning === server.id}
                  className="px-4 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                >
                  {provisioning === server.id ? 'Provisioning...' : 'Provision DB'}
                </button>
              )}
            </div>

            <div className="p-6 flex-1">
              {server.db ? (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Host', value: `${server.db.host}:${server.db.port}`, key: `host-${server.id}` },
                    { label: 'Database', value: server.db.database, key: `db-${server.id}` },
                    { label: 'User', value: server.db.user, key: `user-${server.id}` },
                    { label: 'Password', value: server.db.password || '********', key: `pass-${server.id}` }
                  ].map((field) => (
                    <div key={field.key} className="space-y-1.5 group">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{field.label}</label>
                      <div 
                        onClick={() => copyToClipboard(field.value, field.key)}
                        className="flex items-center justify-between px-3 py-2 bg-black/40 border border-gray-800 rounded-lg group-hover:border-primary/50 transition-all cursor-pointer"
                      >
                        <span className="text-xs text-gray-300 font-mono truncate mr-2">{field.value}</span>
                        {copiedKey === field.key ? (
                          <Check className="w-3 h-3 text-green-500 shrink-0" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-600 group-hover:text-primary transition-colors shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Database className="w-10 h-10 text-gray-800 mb-3" />
                  <p className="text-xs text-gray-500 font-medium max-w-[200px]">
                    No database linked to this instance.
                  </p>
                </div>
              )}
            </div>
            
            {server.db && (
              <div className="px-6 py-4 bg-primary/5 border-t border-gray-800/50 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Connected & Ready</span>
              </div>
            )}
          </div>
        ))}

        {servers.length === 0 && (
          <div className="col-span-full py-20 bg-[#111827] rounded-3xl border border-dashed border-gray-800 flex flex-col items-center">
            <Layers className="w-12 h-12 text-gray-800 mb-4" />
            <h3 className="text-white font-bold">No instances found</h3>
            <p className="text-gray-500 text-sm mt-1">Create a server instance first to manage its database.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default DatabasePage
