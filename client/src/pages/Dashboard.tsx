import { apiFetch } from '../utils/api'
import { useState, useEffect } from 'react'
import { 
  Cpu,
  Database,
  Network,
  ArrowDown,
  ArrowUp,
  Monitor,
  Server,
  Terminal
} from 'lucide-react'
import { io } from 'socket.io-client'

const socket = io('http://localhost:3001')

const Dashboard = () => {
  const [stats, setStats] = useState<any>({
    cpu: '0.0',
    ram: '0.0',
    memUsed: '0',
    memTotal: '0',
    netIn: '0',
    netOut: '0'
  })
  const [systemInfo, setSystemInfo] = useState<any>({
    os: 'Loading...',
    arch: 'Loading...',
    hostname: 'Loading...',
  })
  const [serverStats, setServerStats] = useState<any>({
    totalServers: 0,
    activeServers: 0,
    totalPlayers: 0
  })

  const [isConnected, setIsConnected] = useState(socket.connected)

  useEffect(() => {
    // Fetch system info
    apiFetch('http://localhost:3001/api/system-info')
      .then(res => res.json())
      .then(data => setSystemInfo(data))
      .catch(err => console.error('Failed to fetch system info:', err))

    // Fetch user server stats
    apiFetch('http://localhost:3001/api/stats')
      .then(res => res.json())
      .then(data => setServerStats(data))
      .catch(err => console.error('Failed to fetch server stats:', err))

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))
    socket.on('stats', (data) => setStats(data))

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('stats')
    }
  }, [])

  const user = JSON.parse(localStorage.getItem('user') || '{"username": "User"}')
  const displayName = user.fullname || user.username || 'User'
  const firstName = displayName.split(' ')[0]

  return (
    <div className="p-6">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back, {firstName}</h2>
          <p className="text-sm text-gray-400 mt-1">CS2 Server Panel - Manage your competitive battlefield with ease</p>
        </div>
        <div className="flex gap-4">
          {isConnected ? (
            <div className="flex gap-2 items-center bg-green-500/10 text-green-500 px-4 py-2 rounded-xl text-sm font-medium border border-green-500/20">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              WebSocket Connected
            </div>
          ) : (
            <div className="flex gap-2 items-center bg-red-500/10 text-red-500 px-4 py-2 rounded-xl text-sm font-medium border border-red-500/20">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              WebSocket Disconnected
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#111827] border border-gray-800/50 p-6 rounded-xl flex items-center gap-4 hover:border-blue-500/30 transition-all">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
            <Monitor size={32} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Operating System</p>
            <p className="text-lg font-bold text-white truncate">{systemInfo.os}</p>
          </div>
        </div>
        <div className="bg-[#111827] border border-gray-800/50 p-6 rounded-xl flex items-center gap-4 hover:border-purple-500/30 transition-all">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
            <Cpu size={32} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Architecture</p>
            <p className="text-lg font-bold text-white truncate">{systemInfo.arch}</p>
          </div>
        </div>
        <div className="bg-[#111827] border border-gray-800/50 p-6 rounded-xl flex items-center gap-4 hover:border-orange-500/30 transition-all">
          <div className="p-3 rounded-xl bg-orange-500/10 text-orange-500">
            <Server size={32} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Node Hostname</p>
            <p className="text-lg font-bold text-white truncate">{systemInfo.hostname}</p>
          </div>
        </div>
      </div>

      {/* Server Statistics & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Server Statistics */}
        <div className="bg-[#111827] border border-gray-800/50 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Server className="text-[#1890ff]" size={20} />
            Server Statistics
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0F172A]/50 p-4 rounded-lg border border-gray-800/30">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Active Servers</p>
              <p className="text-3xl font-bold text-green-400">{serverStats.activeServers}</p>
              <p className="text-xs text-gray-400 mt-1">{serverStats.activeServers} online, {serverStats.totalServers - serverStats.activeServers} offline</p>
            </div>
            <div className="bg-[#0F172A]/50 p-4 rounded-lg border border-gray-800/30">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Total Players</p>
              <p className="text-3xl font-bold text-blue-400">{serverStats.totalPlayers}</p>
              <p className="text-xs text-gray-400 mt-1">across all servers</p>
            </div>
            <div className="bg-[#0F172A]/50 p-4 rounded-lg border border-gray-800/30">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Total Instances</p>
              <p className="text-3xl font-bold text-purple-400">{serverStats.totalServers}</p>
              <p className="text-xs text-gray-400 mt-1">created instances</p>
            </div>
            <div className="bg-[#0F172A]/50 p-4 rounded-lg border border-gray-800/30">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Total Maps</p>
              <p className="text-3xl font-bold text-orange-400">47</p>
              <p className="text-xs text-gray-400 mt-1">in rotation</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-[#111827] border border-gray-800/50 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Terminal className="text-[#1890ff]" size={20} />
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => window.location.href = '/console'}
              className="flex flex-col items-center gap-3 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
            >
              <div className="p-3 rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 transition-all">
                <Terminal size={24} />
              </div>
              <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">Open Console</span>
            </button>

            <button 
              onClick={() => window.location.href = '/instances/create'}
              className="flex flex-col items-center gap-3 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-green-500/50 hover:bg-green-500/5 transition-all group"
            >
              <div className="p-3 rounded-lg bg-green-500/10 text-green-500 group-hover:bg-green-500/20 transition-all">
                <Server size={24} />
              </div>
              <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">New Server</span>
            </button>

            <button 
              onClick={() => window.location.href = '/players'}
              className="flex flex-col items-center gap-3 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
            >
              <div className="p-3 rounded-lg bg-purple-500/10 text-purple-500 group-hover:bg-purple-500/20 transition-all">
                <Database size={24} />
              </div>
              <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">Manage Players</span>
            </button>

            <button 
              onClick={() => window.location.href = '/maps'}
              className="flex flex-col items-center gap-3 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group"
            >
              <div className="p-3 rounded-lg bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20 transition-all">
                <Monitor size={24} />
              </div>
              <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">Map Manager</span>
            </button>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        {/* CPU Usage */}
        <div className="bg-[#111827] border border-gray-800/50 p-6 rounded-xl">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2 text-[#1890ff] font-semibold">
              <Cpu size={20} />
              CPU Usage
            </div>
            <span className="text-2xl font-bold text-green-400">{stats.cpu}%</span>
          </div>
          <div className="space-y-4">
            <div className="text-xs text-gray-500 mb-1 flex justify-between">
              <span>Cores: 16 (Logical)</span>
              <span>System Load</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div 
                className="bg-[#1890ff] h-2 rounded-full transition-all duration-500" 
                style={{ width: `${stats.cpu}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* RAM Usage */}
        <div className="bg-[#111827] border border-gray-800/50 p-6 rounded-xl">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2 text-[#1890ff] font-semibold">
              <Database size={20} />
              RAM Usage
            </div>
            <span className="text-2xl font-bold text-green-400">{stats.ram}%</span>
          </div>
          <div className="space-y-4">
            <div className="text-xs text-gray-500 mb-1 flex justify-between">
              <span>Used: {stats.memUsed} GB</span>
              <span>Total: {stats.memTotal} GB</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-500" 
                style={{ width: `${stats.ram}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Network Usage */}
        <div className="bg-[#111827] border border-gray-800/50 p-6 rounded-xl">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2 text-[#1890ff] font-semibold">
              <Network size={20} />
              Network Traffic
            </div>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ArrowDown className="text-green-400" size={20} />
                <div>
                  <p className="text-xs text-gray-500 uppercase">Incoming</p>
                  <p className="text-xl font-bold text-gray-200">{stats.netIn} MB/s</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ArrowUp className="text-blue-400" size={20} />
                <div>
                  <p className="text-xs text-gray-500 uppercase">Outgoing</p>
                  <p className="text-xl font-bold text-gray-200">{stats.netOut} MB/s</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
