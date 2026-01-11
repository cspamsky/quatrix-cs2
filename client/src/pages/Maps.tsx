import { useState } from 'react'
import { 
  Search, 
  Plus, 
  Play, 
  Trash2, 
  RefreshCcw, 
  CheckCircle2,
  Clock,
  Layers
} from 'lucide-react'

interface CS2Map {
  id: string
  name: string
  displayName: string
  type: 'Defusal' | 'Hostage' | 'Workshop'
  image: string
  isActive: boolean
  inPool: boolean
}

const Maps = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'pool' | 'all' | 'workshop'>('pool')

  const [maps] = useState<CS2Map[]>([
    {
      id: '1',
      name: 'de_dust2',
      displayName: 'Dust II',
      type: 'Defusal',
      image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop',
      isActive: true,
      inPool: true
    },
    {
      id: '2',
      name: 'de_inferno',
      displayName: 'Inferno',
      type: 'Defusal',
      image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=2070&auto=format&fit=crop',
      isActive: false,
      inPool: true
    },
    {
      id: '3',
      name: 'de_mirage',
      displayName: 'Mirage',
      type: 'Defusal',
      image: 'https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=2070&auto=format&fit=crop',
      isActive: false,
      inPool: true
    },
    {
      id: '4',
      name: 'cs_italy',
      displayName: 'Italy',
      type: 'Hostage',
      image: 'https://images.unsplash.com/photo-1533134486753-c833f0ed4866?q=80&w=2070&auto=format&fit=crop',
      isActive: false,
      inPool: false
    }
  ])

  const activeMap = maps.find(m => m.isActive)
  const filteredMaps = maps.filter(m => {
    if (activeTab === 'pool') return m.inPool
    if (activeTab === 'all') return true
    return m.type === 'Workshop'
  })

  return (
    <div className="p-6 font-display">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Map Management</h2>
          <p className="text-sm text-gray-400 mt-1">Configure your server's map pool and community content.</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              className="w-64 pl-10 pr-4 py-2 bg-[#111827] border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200" 
              placeholder="Search maps..." 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="bg-primary hover:bg-blue-600 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center transition-all shadow-lg shadow-primary/20 active:scale-95">
            <Plus className="mr-2 w-4 h-4" />
            Add Workshop Map
          </button>
        </div>
      </header>

      {/* Current Map Hero */}
      {activeMap && (
        <section className="mb-10 relative group h-64 rounded-3xl overflow-hidden border border-gray-800 shadow-2xl">
          <img 
            src={activeMap.image} 
            alt={activeMap.displayName}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/40 to-transparent"></div>
          <div className="absolute bottom-0 left-0 p-8 flex flex-col md:flex-row md:items-end justify-between w-full gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 rounded bg-green-500 text-white text-[10px] font-black uppercase tracking-widest animate-pulse">
                  Live Now
                </span>
                <span className="text-gray-300 text-xs font-medium flex items-center gap-1">
                  <Clock size={12} /> 12:45 Elapsed
                </span>
              </div>
              <h1 className="text-4xl font-black text-white tracking-tighter uppercase">{activeMap.displayName}</h1>
              <p className="text-gray-400 text-sm font-medium">de_dust2 • Competitive Mode</p>
            </div>
            <div className="flex gap-3">
              <button className="px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-2xl font-bold text-sm transition-all flex items-center gap-2 border border-white/10">
                <RefreshCcw size={18} />
                Restart Map
              </button>
              <button className="px-6 py-3 bg-primary hover:bg-blue-600 text-white rounded-2xl font-bold text-sm transition-all flex items-center gap-2 shadow-xl shadow-primary/20">
                <Layers size={18} />
                Match Strategy
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Map Pool Tabs */}
      <div className="flex items-center gap-6 mb-8 border-b border-gray-800 pb-px">
        <button 
          onClick={() => setActiveTab('pool')}
          className={`pb-4 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'pool' ? 'text-primary' : 'text-gray-500 hover:text-white'}`}
        >
          Active Map Pool
          {activeTab === 'pool' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_10px_#1890ff]"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('all')}
          className={`pb-4 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'all' ? 'text-primary' : 'text-gray-500 hover:text-white'}`}
        >
          All Maps
          {activeTab === 'all' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_10px_#1890ff]"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('workshop')}
          className={`pb-4 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'workshop' ? 'text-primary' : 'text-gray-500 hover:text-white'}`}
        >
          Workshop Content
          {activeTab === 'workshop' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_10px_#1890ff]"></div>}
        </button>
      </div>

      {/* Map Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredMaps.map(map => (
          <div 
            key={map.id} 
            className={`group bg-[#111827] border border-gray-800 rounded-3xl overflow-hidden transition-all duration-300 hover:border-primary/50 flex flex-col ${map.isActive ? 'ring-2 ring-primary ring-offset-4 ring-offset-[#0F172A]' : ''}`}
          >
            <div className="h-40 relative overflow-hidden">
              <img src={map.image} alt={map.displayName} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111827] to-transparent"></div>
              
              {map.isActive && (
                <div className="absolute top-4 right-4 bg-green-500 p-1.5 rounded-full text-white">
                  <CheckCircle2 size={16} />
                </div>
              )}
              
              <button className="absolute inset-0 m-auto w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-y-4 group-hover:translate-y-0 shadow-xl shadow-primary/40">
                <Play size={24} fill="currentColor" className="ml-1" />
              </button>
            </div>
            
            <div className="p-5 flex-1">
              <div className="flex justify-between items-start mb-1">
                <h4 className="font-bold text-white text-lg">{map.displayName}</h4>
                <span className="text-[10px] font-black uppercase text-gray-600 bg-gray-800/50 px-2 py-0.5 rounded">
                  {map.type}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono mb-4">{map.name}</p>
              
              <div className="flex items-center justify-between mt-auto">
                <button className={`text-[10px] font-black uppercase tracking-widest transition-colors ${map.inPool ? 'text-primary' : 'text-gray-600 hover:text-white'}`}>
                  {map.inPool ? 'In Pool' : 'Add to Pool'}
                </button>
                <div className="flex gap-1">
                  <button className="p-2 text-gray-600 hover:text-white transition-colors">
                    <RefreshCcw size={14} />
                  </button>
                  <button className="p-2 text-gray-600 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Add New Map Card Utility */}
        <button className="h-full min-h-[250px] border-2 border-dashed border-gray-800 rounded-3xl flex flex-col items-center justify-center text-gray-600 hover:border-primary hover:text-primary transition-all group bg-[#111827]/30">
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-700 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:border-primary transition-all">
            <Plus size={24} />
          </div>
          <span className="text-xs font-black uppercase tracking-widest">New Map Entry</span>
        </button>
      </div>
    </div>
  )
}

export default Maps
