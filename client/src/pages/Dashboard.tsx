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
  HardDrive
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import socket from '../utils/socket'
import MonitoringSection from '../components/MonitoringSection'
import { apiFetch } from '../utils/api'

const Dashboard = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const dateLocale = i18n.language.startsWith('tr') ? tr : enUS
  const [activities, setActivities] = useState<any[]>([])
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

  const { data: serverStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiFetch('/api/servers/stats').then(res => res.json()),
    refetchInterval: 10000
  })

  useEffect(() => {
    function onConnect() {
      setIsConnected(true)
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

    socket.on('recent_activity', (data: any[]) => {
      setActivities(data)
    })

    socket.on('activity', (data: any) => {
      setActivities(prev => [data, ...prev].slice(0, 10))
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

  return (
    <div className="w-full p-4 sm:p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
            {t('dashboard.welcome', { name: JSON.parse(localStorage.getItem('user') || '{}').username || 'User' })}
          </h1>
          <p className="text-gray-400 mt-1 font-medium">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-[#111827] rounded-2xl border border-gray-800/60 shadow-lg shadow-black/10">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
            {isConnected ? t('dashboard.ws_connected') : t('dashboard.ws_disconnected')}
          </span>
        </div>
      </div>

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
            onClick={() => navigate('/settings?tab=activity')}
            className="w-full py-2.5 px-6 text-[10px] font-bold text-gray-400 hover:text-white border-t border-gray-800/40 hover:bg-white/[0.02] transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
              {t('dashboard.view_all_logs')}
            </div>
            <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
