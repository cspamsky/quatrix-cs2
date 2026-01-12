import { apiFetch } from '../utils/api'
import { useState, useEffect, useRef } from 'react'
import { 
  Terminal as TerminalIcon, 
  Play, 
  Square, 
  RotateCcw, 
  RefreshCw,
  MoveRight
} from 'lucide-react'
import { useParams } from 'react-router-dom'
import { io } from 'socket.io-client'

const socket = io('http://localhost:3001')

interface LogEntry {
  timestamp: string
  type: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'CHAT' | 'RAW'
  message: string
}

interface Server {
  id: number;
  status: string;
  name: string;
}

const Console = () => {
  const { id } = useParams()
  const [server, setServer] = useState<Server | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([
    { 
      timestamp: new Date().toLocaleTimeString(), 
      type: 'INFO', 
      message: id ? `Connected to Instance ${id} Console...` : 'Global Console Access. Please select an instance from the Servers page to see live logs.' 
    },
  ])
  const [command, setCommand] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [isAutoScroll, setIsAutoScroll] = useState(true)
  const logEndRef = useRef<HTMLDivElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return;

    const fetchServerData = async () => {
      try {
        const response = await apiFetch(`http://localhost:3001/api/servers`)
        const data = await response.json()
        const currentServer = data.find((s: any) => s.id.toString() === id)
        if (currentServer) setServer(currentServer)
      } catch (error) {
        console.error('Failed to fetch server info:', error)
      }
    }

    const fetchLogs = async () => {
      try {
        const response = await apiFetch(`http://localhost:3001/api/servers/${id}/logs`);
        if (response.ok) {
          const rawLogs = await response.json();
          const processedLogs = rawLogs.map((log: string) => {
            const match = log.match(/^\[(.*?)\] (.*)/);
            if (match) {
              return { timestamp: new Date(match[1]).toLocaleTimeString(), type: 'RAW', message: match[2] };
            }
            return { timestamp: '', type: 'RAW', message: log };
          });
          setLogs(prev => [...prev, ...processedLogs]);
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
      }
    };

    fetchServerData();
    fetchLogs();

    const eventName = `console:${id}`
    socket.on(eventName, (log: string) => {
      const now = new Date()
      const timestamp = now.toLocaleTimeString()
      
      // Determine message type based on prefixes
      let type: LogEntry['type'] = 'RAW';
      let message = log;

      if (log.startsWith('[ERROR]')) {
        type = 'ERROR';
        message = log.replace('[ERROR]', '').trim();
      } else if (log.startsWith('[SUCCESS]')) {
        type = 'SUCCESS';
        message = log.replace('[SUCCESS]', '').trim();
      } else if (log.startsWith('[WARN]')) {
        type = 'WARN';
        message = log.replace('[WARN]', '').trim();
      } else if (log.startsWith('> ')) {
        type = 'INFO'; // User commands
      }

      setLogs(prev => {
        const isProgress = message.includes('Update state') && message.includes('progress:');
        const lastLog = prev[prev.length - 1];
        const wasProgress = lastLog?.message.includes('Update state') && lastLog?.message.includes('progress:');

        let newLogs;
        if (isProgress && wasProgress) {
          // Replace last log if both are progress updates
          newLogs = [...prev.slice(0, -1), { timestamp, type, message }];
        } else {
          newLogs = [...prev, { timestamp, type, message }];
        }

        // Limit to last 1000 logs for performance
        if (newLogs.length > 1000) {
          return newLogs.slice(-1000);
        }
        return newLogs;
      });
    });

    socket.on('status_update', ({ serverId, status }: { serverId: number, status: string }) => {
      if (id && serverId.toString() === id) {
        setServer(prev => prev ? { ...prev, status } : null);
      }
    });

    return () => {
      socket.off(eventName)
      socket.off('status_update')
    }
  }, [id])

  // --- Auto-scroll Effect ---
  useEffect(() => {
    if (isAutoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isAutoScroll])

  const handleScroll = () => {
    if (consoleRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = consoleRef.current
      // If user is within 50px of the bottom, enable auto-scroll
      const atBottom = scrollHeight - scrollTop - clientHeight < 50
      setIsAutoScroll(atBottom)
    }
  }

  const fetchServerInfo = async () => {
    if (!id) return;
    try {
      const response = await apiFetch(`http://localhost:3001/api/servers`)
      const data = await response.json()
      const currentServer = data.find((s: any) => s.id.toString() === id)
      if (currentServer) setServer(currentServer)
    } catch (error) {
      console.error('Failed to fetch server info:', error)
    }
  }

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!id) return
    setActionLoading(true)
    try {
      const response = await apiFetch(`http://localhost:3001/api/servers/${id}/${action}`, {
        method: 'POST'
      })
      if (response.ok) {
        const data = await response.json()
        setLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          type: 'INFO',
          message: data.message || `Action ${action} initiated`
        }])
        // Refresh server status
        await fetchServerInfo()
      }
    } catch (error) {
        console.error(`Action ${action} failed:`, error)
    } finally {
      setActionLoading(false)
    }
  }

  const sendCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || !id) return
    
    const cmdToSubmit = command;
    setCommand('') // Clear input immediately for UX

    try {
      await apiFetch(`http://localhost:3001/api/servers/${id}/rcon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmdToSubmit })
      })
      // We don't need to handle the response here because the backend 
      // now emits both the command and the response to the socket.
    } catch (error) {
      setLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        type: 'ERROR',
        message: `Connection error: ${error}`
      }])
    }
  }

  const getTypeStyle = (type: LogEntry['type']) => {
    switch (type) {
      case 'INFO': return 'text-blue-400'
      case 'SUCCESS': return 'text-emerald-400'
      case 'WARN': return 'text-amber-400'
      case 'ERROR': return 'text-red-400'
      case 'CHAT': return 'text-primary font-bold'
      default: return 'text-slate-300'
    }
  }

  const handleForceUpdate = async () => {
    if (!id) return
    setActionLoading(true)
    try {
      const response = await apiFetch(`http://localhost:3001/api/servers/${id}/install`, {
        method: 'POST'
      })
      if (response.ok) {
        setLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          type: 'INFO',
          message: 'Force update/validation started...'
        }])
        // Immediately refresh status to show spinning icon
        await fetchServerInfo()
      }
    } catch (error) {
      console.error('Force update failed:', error)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden font-display">
      <header className="h-20 flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Server Console</h2>
          <p className="text-sm text-gray-400 mt-1">CS2 Server Panel - Manage your competitive battlefield with ease</p>
        </div>

      </header>

      <div className="flex-1 flex flex-col px-6 pb-6 gap-6 overflow-hidden">
        {/* Console Window */}
        <div className="flex-1 flex flex-col bg-[#0d1421] border border-gray-800 rounded-xl overflow-hidden shadow-2xl relative">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between bg-[#111827]">
            <div className="flex items-center gap-2">
              <TerminalIcon className="text-primary w-4 h-4" />
              <span className="text-sm font-semibold text-slate-200">Server Live Console</span>
            </div>
            {!isAutoScroll && (
              <button 
                onClick={() => {
                  setIsAutoScroll(true)
                  logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/30 transition-all animate-pulse"
              >
                Auto-scroll Paused - Click to catch up
              </button>
            )}
          </div>
          
          <div 
            ref={consoleRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-5 font-mono text-sm custom-scrollbar bg-black/20"
          >
            <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                  <p className="break-all">
                    {log.type !== 'RAW' && log.type !== 'CHAT' && (
                      <span className={`${getTypeStyle(log.type)} mr-2`}>{log.type}:</span>
                    )}
                    {log.type === 'CHAT' && (
                      <span className="text-primary font-bold mr-2">CHAT:</span>
                    )}
                    <span className={`whitespace-pre-wrap ${log.type === 'RAW' ? 'text-slate-300' : ''}`}>{log.message}</span>
                  </p>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* Command Input */}
          <form onSubmit={sendCommand} className="p-4 border-t border-gray-800 flex items-center gap-4 bg-[#111827]">
            <div className="flex-1 flex items-center gap-3 text-slate-400">
              <MoveRight className="text-primary w-5 h-5" />
              <input 
                className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono placeholder:text-slate-600 p-0 outline-none text-white" 
                placeholder="Type console command..." 
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </div>
            <button 
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white font-bold text-[10px] tracking-widest px-6 py-2 rounded transition-all shadow-lg shadow-primary/20"
            >
              SEND
            </button>
          </form>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
          <button 
            disabled={actionLoading || server?.status === 'ONLINE' || server?.status === 'STARTING' || server?.status === 'INSTALLING'}
            onClick={() => handleAction('start')}
            className="flex items-center justify-center gap-2 py-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-all font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Play size={18} /> Start Server
          </button>
          <button 
            disabled={actionLoading || server?.status === 'OFFLINE' || server?.status === 'INSTALLING'}
            onClick={() => handleAction('restart')}
            className="flex items-center justify-center gap-2 py-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-all font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RotateCcw size={18} className={actionLoading ? 'animate-spin' : ''} /> Restart
          </button>
          <button 
            disabled={actionLoading || server?.status === 'OFFLINE' || server?.status === 'INSTALLING'}
            onClick={() => handleAction('stop')}
            className="flex items-center justify-center gap-2 py-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/20 transition-all font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Square size={18} /> Stop Server
          </button>
          <button 
            disabled={actionLoading || server?.status === 'ONLINE' || server?.status === 'INSTALLING'}
            onClick={handleForceUpdate}
            className="flex items-center justify-center gap-2 py-3.5 bg-primary/10 border border-primary/20 text-primary rounded-lg hover:bg-primary/20 transition-all font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RefreshCw size={18} className={server?.status === 'INSTALLING' ? 'animate-spin' : ''} /> Force Update
          </button>
        </div>
      </div>
    </div>
  )
}

export default Console
