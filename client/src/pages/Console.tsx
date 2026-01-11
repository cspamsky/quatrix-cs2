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

const Console = () => {
  const { id } = useParams()
  const [logs, setLogs] = useState<LogEntry[]>([
    { 
      timestamp: new Date().toLocaleTimeString(), 
      type: 'INFO', 
      message: id ? `Connected to Instance ${id} Console...` : 'Global Console Access. Please select an instance from the Servers page to see live logs.' 
    },
  ])
  const [command, setCommand] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return;

    // Fetch previous logs
    const fetchLogs = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/servers/${id}/logs`);
        if (response.ok) {
          const rawLogs = await response.json();
          const processedLogs = rawLogs.map((log: string) => {
            // Log format: [timestamp] message
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

    fetchLogs();

    const eventName = `console_${id}`
    socket.on(eventName, (log) => {
      const now = new Date()
      const timestamp = now.toLocaleTimeString()
      setLogs(prev => [...prev, { timestamp, type: 'RAW', message: log }])
    })

    return () => {
      socket.off(eventName)
    }
  }, [id])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const sendCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || !id) return
    
    // Add command to logs immediately
    setLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      type: 'INFO',
      message: `> ${command}`
    }])
    
    try {
      const response = await fetch(`http://localhost:3001/api/servers/${id}/rcon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      })
      
      const data = await response.json()
      
      if (data.success) {
        // Add response to logs
        setLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          type: 'SUCCESS',
          message: data.response
        }])
      } else {
        setLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          type: 'ERROR',
          message: data.error || data.message || 'Command failed'
        }])
      }
    } catch (error) {
      setLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        type: 'ERROR',
        message: `Failed to send command: ${error}`
      }])
    }
    
    setCommand('')
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
        <div className="flex-1 flex flex-col bg-[#0d1421] border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 bg-[#111827]">
            <TerminalIcon className="text-primary w-4 h-4" />
            <span className="text-sm font-semibold text-slate-200">Server Live Console</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5 font-mono text-sm custom-scrollbar bg-black/20">
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
                    <span className={log.type === 'RAW' ? 'text-slate-300' : ''}>{log.message}</span>
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
          <button className="flex items-center justify-center gap-2 py-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-all font-semibold text-sm">
            <Play size={18} /> Start Server
          </button>
          <button className="flex items-center justify-center gap-2 py-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-all font-semibold text-sm">
            <RotateCcw size={18} /> Restart
          </button>
          <button className="flex items-center justify-center gap-2 py-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/20 transition-all font-semibold text-sm">
            <Square size={18} /> Stop Server
          </button>
          <button className="flex items-center justify-center gap-2 py-3.5 bg-primary/10 border border-primary/20 text-primary rounded-lg hover:bg-primary/20 transition-all font-semibold text-sm">
            <RefreshCw size={18} /> Force Update
          </button>
        </div>
      </div>
    </div>
  )
}

export default Console
