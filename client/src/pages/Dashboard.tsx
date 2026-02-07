import { 
  Plus, 
  Terminal, 
  Users, 
  Map as MapIcon, 
  Server,
  Activity,
  Cpu,
  Database,
  Clock,
  ChevronRight,
  ClipboardList,
  AlertTriangle,
  Bell,
  HardDrive,
  X,
  Search,
  History
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import socket from '../utils/socket'
import MonitoringSection from '../components/MonitoringSection'
import { apiFetch } from '../utils/api'

const Dashboard = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const dateLocale = i18n.language.startsWith('tr') ? tr : enUS
  const [activities, setActivities] = useState<any[]>([])
  const [modalActivities, setModalActivities] = useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isConnected, setIsConnected] = useState(socket.connected)
  
  // State for real-time stats and history
  const [stats, setStats] = useState({
    cpu: '0',
    ram: '0',
    memUsed: '0',
    memTotal: '0',
    networkIn: '0 KB/s',
    networkOut: '0 KB/s',
    diskRead: '0 KB/s',
    diskWrite: '0 KB/s'
  })
  const [statsHistory, setStatsHistory] = useState<any[]>([])

  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: () => apiFetch('/api/system-info').then(res => res.json())
  })

  const { data: serverStats, refetch: refetchServerStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiFetch('/api/servers/stats').then(res => res.json()),
    refetchInterval: 5000,
    initialData: JSON.parse(localStorage.getItem('last_dashboard_stats') || 'null')
  })

  useEffect(() => {
    if (serverStats) {
      localStorage.setItem('last_dashboard_stats', JSON.stringify(serverStats))
    }
  }, [serverStats])

  const { data: initialActivities } = useQuery<any[]>({
    queryKey: ['recent-activities'],
    queryFn: () => apiFetch('/api/logs/activity/recent').then(res => res.json())
  })

  useEffect(() => {
    // Sync initial activities if they change (e.g. from cache)
    if (initialActivities) {
      setActivities(initialActivities)
    }
  }, [initialActivities])

  useEffect(() => {
    function onConnect() {
      setIsConnected(true)
      refetchServerStats() // Get fresh data on connect
    }

    function onDisconnect() {
      setIsConnected(false)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    
    socket.on('stats', (data: any) => {
      setStats(data)
      setStatsHistory(prev => [...prev, data].slice(-30))
    })
    
    socket.on('stats_history', (data: any[]) => {
      setStatsHistory(data)
    })

    socket.on('dashboard_stats', (data: any) => {
      queryClient.setQueryData(['dashboard-stats'], data)
    })

    socket.on('recent_activity', (data: any[]) => {
      setActivities(data)
    })

    socket.on('activity', (data: any) => {
      setActivities(prev => [data, ...prev].slice(0, 15))
    })

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('stats')
      socket.off('stats_history')
      socket.off('recent_activity')
      socket.off('activity')
    }
  }, [])

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'SUCCESS': return 'text-green-400 bg-green-400/10'
      case 'WARNING': return 'text-yellow-400 bg-yellow-400/10'
      case 'CRITICAL': return 'text-red-400 bg-red-400/10'
      case 'INFO': return 'text-blue-400 bg-blue-400/10'
      default: return 'text-gray-400 bg-gray-400/10'
    }
  }

  const getActivityIcon = (type: string) => {
    if (type.includes('CPU')) return Cpu;
    if (type.includes('RAM') || type.includes('MEM')) return Database;
    if (type.includes('CRITICAL')) return AlertTriangle;
    if (type.includes('SERVER')) return Server;
    if (type.includes('BACKUP')) return HardDrive;
    return Bell;
  }

  const stats_items = [
    { 
      label: t('dashboard.servers'), 
      value: `${serverStats?.activeServers || 0} / ${serverStats?.totalServers || 0}`, 
      icon: Server, 
      color: 'text-blue-500', 
      sub: t('dashboard.active_instances') 
    },
    { 
      label: t('dashboard.players'), 
      value: `${serverStats?.onlinePlayers || 0} / ${serverStats?.totalCapacity || 0}`, 
      icon: Users, 
      color: 'text-green-500', 
      sub: t('dashboard.online_total') 
    },
    { 
      label: t('dashboard.uptime'), 
      value: (stats as any).uptime || '0h 0m', 
      icon: Activity, 
      color: 'text-purple-500', 
      sub: `${t('dashboard.server_health')}: %${(stats as any).healthScore || 100}` 
    },
    { label: t('dashboard.maps'), value: serverStats?.maps || 0, icon: MapIcon, color: 'text-orange-500', sub: t('dashboard.available_maps') },
  ]

  const handleOpenModal = async () => {
    setIsModalOpen(true)
    try {
      const res = await apiFetch('/api/logs/activity/recent?limit=100')
      if (res.ok) {
        const data = await res.json()
        setModalActivities(data)
      }
    } catch (err) {
      console.error("Failed to fetch modal logs", err)
    }
  }

  const filteredModalActivities = modalActivities.filter(a => 
    a.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="w-full p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Welcome Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {t('dashboard.welcome', { name: JSON.parse(localStorage.getItem('user') || '{}').username || 'User' })}
          </h1>
          <p className="text-gray-400 mt-1 font-medium">{t('dashboard.subtitle')}</p>
        </div>
        <div className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border transition-all duration-300 ${
          isConnected 
            ? 'bg-green-500/10 border-green-500/20 text-green-500' 
            : 'bg-red-500/10 border-red-500/20 text-red-500'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">
            {isConnected ? t('dashboard.ws_connected') : t('dashboard.ws_disconnected')}
          </span>
        </div>
      </header>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats_items.map((item, index) => (
          <div key={index} className="p-6 bg-[#111827] rounded-2xl border border-gray-800/60 hover:border-white/10 transition-all hover:translate-y-[-2px] group shadow-lg shadow-black/20">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{item.label}</span>
              <div className={`p-2 rounded-lg bg-white/5 ${item.color} group-hover:scale-110 transition-transform`}>
                <item.icon size={18} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{item.value}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2 font-medium opacity-80">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Real-time Monitoring Section (Integrated Mega Cards) */}
      <MonitoringSection 
        data={statsHistory} 
        systemInfo={systemInfo} 
        currentStats={stats} 
      />

      {/* Quick Actions Bar */}
      <div>
          <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 pl-1">{t('dashboard.actions_title')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Terminal, label: t('dashboard.action_console'), path: '/console' },
              { icon: Plus, label: t('dashboard.action_new_server'), path: '/instances/create' },
              { icon: Users, label: t('dashboard.action_manage_players'), path: '/players' },
              { icon: MapIcon, label: t('dashboard.action_map_rotation'), path: '/maps' },
            ].map((action, i) => (
              <button 
                key={i}
                onClick={() => navigate(action.path)}
                className="flex items-center gap-4 p-4 bg-[#111827] rounded-2xl border border-gray-800/60 hover:border-primary/50 hover:bg-primary/5 transition-all group shadow-lg shadow-black/10"
              >
                <div className="p-2.5 rounded-xl bg-gray-800/50 text-gray-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <action.icon size={18} />
                </div>
                <span className="text-[10px] font-black text-gray-400 group-hover:text-white uppercase tracking-wider">{action.label}</span>
              </button>
            ))}
          </div>
      </div>

      {/* Activity Feed Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        
        {/* Activity Feed */}
        <div className="xl:col-span-3 bg-[#111827] rounded-2xl border border-gray-800/60 overflow-hidden flex flex-col shadow-lg shadow-black/20 h-full min-h-[220px]">
          <div className="flex-1 divide-y divide-gray-800/40 overflow-y-auto max-h-[220px] custom-scrollbar">
            {activities.length > 0 ? activities.map((activity, idx) => (
              <div key={activity.id || idx} className="px-6 py-3 flex items-center justify-between hover:bg-white/[0.01] transition-all group">
                <div className="flex items-center gap-4">
                  <div className={`p-1.5 rounded-lg ${getSeverityColor(activity.severity)}`}>
                    {(() => {
                        const Icon = getActivityIcon(activity.type);
                        return <Icon size={14} />
                    })()}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-200">{activity.message}</div>
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{activity.type.replace('_', ' ')}</div>
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  <Clock size={10} />
                  {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: dateLocale })}
                </div>
              </div>
            )) : (
              <div className="px-6 py-12 text-center opacity-30 flex flex-col items-center justify-center h-full">
                <div className="p-4 rounded-full bg-gray-800/50 mb-4">
                  <ClipboardList size={32} className="text-gray-600" />
                </div>
                <p className="text-sm font-medium">{t('dashboard.no_activity')}</p>
              </div>
            )}
          </div>
          
          <button 
            onClick={handleOpenModal}
            className="w-full py-2.5 px-6 text-[10px] font-bold text-gray-400 hover:text-white border-t border-gray-800/40 hover:bg-white/[0.02] transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
              {t('dashboard.view_all_logs')}
            </div>
            <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* Activity Logs Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div 
            className="w-full max-w-4xl max-h-[85vh] bg-[#0B1120] rounded-3xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                  <History size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">{t('dashboard.recent_activity')}</h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">Sistem ve yönetim günlüklerini detaylı inceleyin</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl bg-gray-800/50 text-gray-400 hover:bg-red-500/10 hover:text-red-500 transition-all active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Filters */}
            <div className="px-6 py-4 bg-gray-900/30 border-b border-gray-800/50 flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                <input 
                  type="text"
                  placeholder="Günlüklerde ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-800/40 border border-gray-800 rounded-xl pl-11 pr-4 py-2 text-sm text-white placeholder:text-gray-600 focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                />
              </div>
              <div className="flex items-center gap-2 bg-gray-800/40 border border-gray-800 rounded-xl px-4 py-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{modalActivities.length} Kayıt</span>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#0B1120]">
              <div className="space-y-4">
                {filteredModalActivities.length > 0 ? filteredModalActivities.map((activity, idx) => (
                  <div key={activity.id || idx} className="p-4 bg-gray-800/20 border border-gray-800/40 rounded-2xl flex items-center justify-between hover:bg-white/[0.02] transition-all group">
                    <div className="flex items-center gap-5">
                      <div className={`p-3 rounded-xl ${getSeverityColor(activity.severity)} shadow-lg shadow-black/20`}>
                        {(() => {
                            const Icon = getActivityIcon(activity.type);
                            return <Icon size={18} />
                        })()}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-100 leading-tight mb-1">{activity.message}</div>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest bg-gray-800/50 px-2 py-0.5 rounded-md">
                                {activity.type.replace('_', ' ')}
                            </span>
                            <span className="text-[10px] text-primary/70 font-bold uppercase tracking-widest">
                                ID: #{activity.id || idx}
                            </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1.5 text-gray-500">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 bg-gray-800/30 px-3 py-1 rounded-full">
                        <Clock size={12} className="text-primary/50" />
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: dateLocale })}
                      </div>
                      <span className="text-[9px] font-mono opacity-40">{new Date(activity.created_at).toLocaleString('tr-TR')}</span>
                    </div>
                  </div>
                )) : (
                  <div className="py-20 text-center opacity-30 flex flex-col items-center justify-center">
                    <div className="p-6 rounded-full bg-gray-800/50 mb-4">
                      <ClipboardList size={48} className="text-gray-600" />
                    </div>
                    <p className="text-lg font-bold">Kayıt bulunamadı</p>
                    <p className="text-sm mt-1">Arama kriterlerinizi değiştirmeyi deneyin.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-800 bg-gray-900/20 flex items-center justify-end">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
