import { useState } from 'react'
import { 
  CheckCircle,
  Cpu, 
  Zap, 
  ShieldCheck,
  Search,
  Plus,
  Trash2,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

interface Plugin {
  id: string
  name: string
  version: string
  author: string
  description: string
  status: 'active' | 'inactive'
  icon: any
  iconColor: string
  server: string
}

const Plugins = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [plugins, setPlugins] = useState<Plugin[]>([
    {
      id: '1',
      name: 'Metamod:Source',
      version: 'v2.0.0-git1310',
      author: 'AlliedModders',
      description: 'Base plugin framework for Source engine.',
      status: 'active',
      icon: Cpu,
      iconColor: 'text-orange-500',
      server: 'Server Alpha'
    },
    {
      id: '2',
      name: 'Counter-Strike Sharp',
      version: 'v1.0.244',
      author: 'roflmuffin',
      description: 'C# scripting platform for CS2.',
      status: 'active',
      icon: Zap,
      iconColor: 'text-blue-500',
      server: 'Server Alpha'
    },
    {
      id: '3',
      name: 'MatchZy',
      version: 'v0.6.1',
      author: 'shobhit-pathak',
      description: 'Competitive matches & practice mode.',
      status: 'inactive',
      icon: ShieldCheck,
      iconColor: 'text-purple-500',
      server: 'Server Alpha'
    }
  ])

  const togglePlugin = (id: string) => {
    setPlugins(prev => prev.map(p => 
      p.id === id ? { ...p, status: p.status === 'active' ? 'inactive' : 'active' } : p
    ))
  }

  return (
    <div className="p-6 font-display">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Plugins Management</h2>
          <p className="text-sm text-gray-400 mt-1">Enhance your CS2 server with powerful extensions</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              className="w-64 pl-10 pr-4 py-2 bg-[#111827] border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200" 
              placeholder="Search plugins..." 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="bg-primary hover:bg-blue-600 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center transition-all shadow-lg shadow-blue-500/20 active:scale-95">
            <Plus className="mr-2 w-4 h-4" />
            Add New Plugin
          </button>
        </div>
      </header>

      {/* Installed Plugins Table Section */}
      <section className="mb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <CheckCircle className="text-primary w-5 h-5" />
            Installed Plugins
          </h3>

        </div>

        <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800/50">
              <thead>
                <tr className="bg-[#0c1424]">
                  <th className="py-4 px-6 text-left w-12">
                    <input type="checkbox" className="rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary h-4 w-4" />
                  </th>
                  <th className="py-4 px-6 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">
                    Plugin Name
                  </th>
                  <th className="py-4 px-6 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">
                    Author
                  </th>
                  <th className="py-4 px-6 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">
                    Version
                  </th>
                  <th className="py-4 px-6 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">
                    Status
                  </th>
                  <th className="py-4 px-6 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">
                    Server
                  </th>
                  <th className="py-4 px-6 text-right text-[10px] font-black uppercase tracking-widest text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/30">
                {plugins.map((plugin) => (
                  <tr key={plugin.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="py-4 px-6">
                      <input type="checkbox" className="rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary h-4 w-4" />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center ${plugin.iconColor}`}>
                          <plugin.icon size={16} />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm">{plugin.name}</div>
                          <div className="text-[11px] text-gray-500 line-clamp-1">{plugin.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-xs text-gray-400 font-medium">{plugin.author}</td>
                    <td className="py-4 px-6 text-xs text-gray-400 font-mono">{plugin.version}</td>
                    <td className="py-4 px-6">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={plugin.status === 'active'}
                          onChange={() => togglePlugin(plugin.id)}
                        />
                        <div className="w-9 h-5 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </td>
                    <td className="py-4 px-6 text-xs text-gray-400 font-medium">{plugin.server}</td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-all">
                          <Settings size={14} />
                        </button>
                        <button className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-gray-800/50 bg-[#0c1424] flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-500">
            <span>{plugins.filter(p => p.status === 'active').length} plugins active</span>
            <div className="flex items-center gap-4">
              <span>Rows per page: 10</span>
              <div className="flex gap-2">
                <button className="p-1 hover:bg-gray-800 rounded transition-colors"><ChevronLeft size={14} /></button>
                <button className="p-1 hover:bg-gray-800 rounded transition-colors"><ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="px-4 py-2 bg-primary text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-primary/10">
            Enable Selected
          </button>
          <button className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 hover:text-white transition-all">
            Disable Selected
          </button>
          <button className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">
            Uninstall Selected
          </button>
        </div>
      </section>

    </div>
  )
}

export default Plugins
