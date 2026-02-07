import { apiFetch } from '../utils/api';
import { useState, useEffect, useRef } from 'react';
import {
  Terminal as TerminalIcon,
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  MoveRight,
  Server,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../utils/socket';
import { generateUUID } from '../utils/uuid';
import { COMMON_COMMANDS } from '../config/consoleCommands';
import { useTranslation } from 'react-i18next';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'CHAT' | 'RAW';
  message: string;
}

interface Server {
  id: number;
  status: string;
  name: string;
  port: number;
}

const Console = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [server, setServer] = useState<Server | null>(null);
  const [allServers, setAllServers] = useState<Server[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: generateUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'INFO',
      message: id ? t('console.connecting') : t('console.select_instance'),
    },
  ]);
  const [command, setCommand] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchServerData = async () => {
      try {
        const response = await apiFetch(`/api/servers`);
        const data = await response.json();
        setAllServers(data);

        if (id) {
          const currentServer = data.find((s: Server) => s.id.toString() === id);
          if (currentServer) setServer(currentServer);
        }
      } catch (error) {
        console.error('Failed to fetch server info:', error);
      }
    };

    fetchServerData();
    const serverDataInterval = setInterval(fetchServerData, 5000);

    // Only proceed with logs and socket if an ID is present
    if (!id) {
      return () => clearInterval(serverDataInterval);
    }

    const fetchLogs = async () => {
      try {
        const response = await apiFetch(`/api/servers/${id}/logs`);

        if (response.ok) {
          const rawLogs = await response.json();
          // Safety check: ensure rawLogs is an array
          const safeLogs = Array.isArray(rawLogs) ? rawLogs : [];

          const processedLogs = safeLogs.map((log: string) => {
            const match = log.match(/^\[(.*?)\] (.*)/);

            if (match) {
              const possibleDate = new Date(match[1]);
              const isValidDate = !isNaN(possibleDate.getTime());

              return {
                id: generateUUID(),
                timestamp: isValidDate ? possibleDate.toLocaleTimeString() : '',
                type: 'RAW' as const,
                message: isValidDate ? match[2] : log,
              };
            }
            return {
              id: generateUUID(),
              timestamp: '',
              type: 'RAW' as const,
              message: log,
            };
          });
          setLogs((prev) => [...prev, ...processedLogs]);
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
      }
    };

    fetchLogs();

    const eventName = `console:${id}`;
    socket.on(eventName, (log: string) => {
      const now = new Date();
      const timestamp = now.toLocaleTimeString();

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

      setLogs((prev) => {
        const isProgress = message.includes('Update state') && message.includes('progress:');
        const isFrameWarning =
          message.includes('UNEXPECTED LONG FRAME DETECTED') || message.includes('Long frame');

        const lastLog = prev[prev.length - 1];
        const wasProgress =
          lastLog?.message.includes('Update state') && lastLog?.message.includes('progress:');
        const wasFrameWarning =
          lastLog?.message.includes('UNEXPECTED LONG FRAME DETECTED') ||
          lastLog?.message.includes('Long frame');

        let newLogs;
        if ((isProgress && wasProgress) || (isFrameWarning && wasFrameWarning)) {
          // Replace last log to avoid flooding (Progress or Frame Warnings)
          newLogs = [...prev.slice(0, -1), { id: lastLog.id, timestamp, type, message }];
        } else {
          newLogs = [...prev, { id: generateUUID(), timestamp, type, message }];
        }

        // Limit to last 1000 logs for performance
        if (newLogs.length > 1000) {
          return newLogs.slice(-1000);
        }
        return newLogs;
      });
    });

    socket.on('status_update', ({ serverId, status }: { serverId: number; status: string }) => {
      if (id && serverId.toString() === id) {
        setServer((prev) => (prev ? { ...prev, status } : null));
      }
    });

    return () => {
      clearInterval(serverDataInterval);
      socket.off(eventName);
      socket.off('status_update');
    };
  }, [id]);

  // Reset logs when server changes
  useEffect(() => {
    setLogs([
      {
        id: generateUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'INFO',
        message: id
          ? `${t('console.connected_to')} ${server?.name || 'Instance'} ${t('console.connected_to').split(' ')[0]}...`
          : t('console.select_instance'),
      },
    ]);
  }, [id]);

  // --- Auto-scroll Effect ---
  useEffect(() => {
    if (isAutoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isAutoScroll]);

  const handleScroll = () => {
    if (consoleRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = consoleRef.current;
      // If user is within 50px of the bottom, enable auto-scroll
      const atBottom = scrollHeight - scrollTop - clientHeight < 50;
      setIsAutoScroll(atBottom);
    }
  };

  const fetchServerInfo = async () => {
    if (!id) return;
    try {
      const response = await apiFetch(`/api/servers`);
      const data = await response.json();
      const currentServer = data.find((s: Server) => s.id.toString() === id);
      if (currentServer) setServer(currentServer);
    } catch (error) {
      console.error('Failed to fetch server info:', error);
    }
  };

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!id) return;
    setActionLoading(true);
    try {
      const response = await apiFetch(`/api/servers/${id}/${action}`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        setLogs((prev) => [
          ...prev,
          {
            id: generateUUID(),
            timestamp: new Date().toLocaleTimeString(),
            type: 'INFO',
            message: data.message || `${t('console.action_initiated')} ${action}`,
          },
        ]);
        // Refresh server status
        await fetchServerInfo();
      }
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
    } finally {
      setActionLoading(false);
    }
  };

  // --- Autocomplete System ---
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleCommandChange = (val: string) => {
    setCommand(val);
    if (val.trim()) {
      const filtered = COMMON_COMMANDS.filter(
        (cmd) =>
          cmd.toLowerCase().startsWith(val.toLowerCase()) && cmd.toLowerCase() !== val.toLowerCase()
      ).slice(0, 8); // Limit to 8 suggestions
      setSuggestions(filtered);
      setSelectedIndex(0);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setCommand(suggestions[selectedIndex]);
        setShowSuggestions(false);
      } else if (e.key === 'Enter') {
        setShowSuggestions(false);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  };

  const sendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !id) return;

    const cmdToSubmit = command;
    setCommand(''); // Clear input immediately for UX
    setShowSuggestions(false);

    try {
      await apiFetch(`/api/servers/${id}/rcon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmdToSubmit }),
      });
      // Backend handles emission via sockets
    } catch (error) {
      setLogs((prev) => [
        ...prev,
        {
          id: generateUUID(),
          timestamp: new Date().toLocaleTimeString(),
          type: 'ERROR',
          message: `${t('console.connection_error')} ${error}`,
        },
      ]);
    }
  };

  const getTypeStyle = (type: LogEntry['type']) => {
    switch (type) {
      case 'INFO':
        return 'text-blue-400';
      case 'SUCCESS':
        return 'text-emerald-400';
      case 'WARN':
        return 'text-amber-400';
      case 'ERROR':
        return 'text-red-400';
      case 'CHAT':
        return 'text-primary font-bold';
      default:
        return 'text-slate-300';
    }
  };

  const handleForceUpdate = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      const response = await apiFetch(`/api/servers/${id}/install`, {
        method: 'POST',
      });
      if (response.ok) {
        setLogs((prev) => [
          ...prev,
          {
            id: generateUUID(),
            timestamp: new Date().toLocaleTimeString(),
            type: 'INFO',
            message: t('console.force_update_started'),
          },
        ]);
        // Immediately refresh status to show spinning icon
        await fetchServerInfo();
      }
    } catch (error) {
      console.error('Force update failed:', error);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden font-display">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 shrink-0 z-10 relative">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('console.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('console.subtitle')}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">
              {t('console.switch_server')}
            </span>
            <div className="relative group">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <select
                className="bg-[#111827] border border-gray-800 text-white pl-10 pr-4 py-2 rounded-xl focus:ring-2 focus:ring-primary/50 transition-all outline-none text-sm min-w-[200px]"
                value={id || ''}
                onChange={(e) => navigate(`/console/${e.target.value}`)}
              >
                <option value="" disabled>
                  {t('console.select_server')}
                </option>
                {allServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col px-6 pb-6 gap-6 overflow-hidden">
        {/* Console Window */}
        <div className="flex-1 flex flex-col bg-[#0d1421] border border-gray-800 rounded-xl overflow-hidden shadow-2xl relative">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between bg-[#111827]">
            <div className="flex items-center gap-2">
              <TerminalIcon className="text-primary w-4 h-4" />
              <span className="text-sm font-semibold text-slate-200">
                {t('console.live_console')}
              </span>
            </div>
            {!isAutoScroll && (
              <button
                onClick={() => {
                  setIsAutoScroll(true);
                  logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/30 transition-all animate-pulse"
              >
                {t('console.auto_scroll_paused')}
              </button>
            )}
          </div>

          <div
            ref={consoleRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-5 font-mono text-sm custom-scrollbar bg-black/20"
          >
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-3">
                  <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                  <p className="break-all">
                    {log.type !== 'RAW' && log.type !== 'CHAT' && (
                      <span className={`${getTypeStyle(log.type)} mr-2`}>{log.type}:</span>
                    )}
                    {log.type === 'CHAT' && (
                      <span className="text-primary font-bold mr-2">CHAT:</span>
                    )}
                    <span
                      className={`whitespace-pre-wrap ${
                        log.type === 'RAW' ? 'text-slate-300' : ''
                      }`}
                    >
                      {log.message}
                    </span>
                  </p>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* Command Input */}
          <form
            onSubmit={sendCommand}
            className="p-4 border-t border-gray-800 flex items-center gap-4 bg-[#111827]"
          >
            <div className="flex-1 flex items-center gap-3 text-slate-400 relative group">
              <MoveRight className="text-primary w-5 h-5 shrink-0" />
              <div className="relative flex-1 flex items-center">
                {/* Ghost Suggestion */}
                {command && suggestions.length > 0 && (
                  <div className="absolute left-0 top-0 text-sm font-mono p-0 pointer-events-none text-slate-600 whitespace-pre">
                    <span className="opacity-0">{command}</span>
                    {suggestions[0].slice(command.length)}
                  </div>
                )}
                <input
                  className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono placeholder:text-slate-600 p-0 outline-none text-white relative z-10"
                  placeholder={t('console.command_placeholder')}
                  type="text"
                  autoComplete="off"
                  value={command}
                  onChange={(e) => handleCommandChange(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Tab' || e.key === 'ArrowRight') && suggestions.length > 0) {
                      e.preventDefault();
                      setCommand(suggestions[0]);
                      setSuggestions([]);
                    } else if (e.key === 'Escape') {
                      setSuggestions([]);
                    }
                    handleKeyDown(e);
                  }}
                />
              </div>
              <div className="hidden group-focus-within:block text-[10px] text-slate-500 font-mono animate-pulse">
                {t('console.press_tab')}
              </div>
            </div>
            <button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white font-bold text-[10px] tracking-widest px-6 py-2 rounded transition-all shadow-lg shadow-primary/20"
            >
              {t('console.send')}
            </button>
          </form>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
          <button
            disabled={
              actionLoading ||
              server?.status === 'ONLINE' ||
              server?.status === 'STARTING' ||
              server?.status === 'INSTALLING'
            }
            onClick={() => handleAction('start')}
            className="flex items-center justify-center gap-2 py-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-all font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Play size={18} /> {t('console.start_server')}
          </button>
          <button
            disabled={
              actionLoading || server?.status === 'OFFLINE' || server?.status === 'INSTALLING'
            }
            onClick={() => handleAction('restart')}
            className="flex items-center justify-center gap-2 py-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-all font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RotateCcw size={18} className={actionLoading ? 'animate-spin' : ''} />{' '}
            {t('console.restart')}
          </button>
          <button
            disabled={
              actionLoading || server?.status === 'OFFLINE' || server?.status === 'INSTALLING'
            }
            onClick={() => handleAction('stop')}
            className="flex items-center justify-center gap-2 py-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/20 transition-all font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Square size={18} /> {t('console.stop_server')}
          </button>
          <button
            disabled={
              actionLoading || server?.status === 'ONLINE' || server?.status === 'INSTALLING'
            }
            onClick={handleForceUpdate}
            className="flex items-center justify-center gap-2 py-3.5 bg-primary/10 border border-primary/20 text-primary rounded-lg hover:bg-primary/20 transition-all font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RefreshCw
              size={18}
              className={server?.status === 'INSTALLING' ? 'animate-spin' : ''}
            />{' '}
            {t('console.force_update')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Console;
