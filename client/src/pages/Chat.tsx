import { apiFetch } from "../utils/api";
import { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  User,
  Hash,
  Clock,
  Server,
  RefreshCw,
  Search
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import socket from '../utils/socket'

interface ChatLog {
  id: number;
  server_id: number;
  player_name: string;
  steam_id: string;
  message: string;
  type: string;
  created_at: string;
}

interface ServerInfo {
  id: number;
  status: string;
  name: string;
  port: number;
}

const Chat = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [allServers, setAllServers] = useState<ServerInfo[]>([]);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const response = await apiFetch(`/api/servers`);
        const data = await response.json();
        setAllServers(data);
        
        if (id) {
          // Verify server exists
          data.find((s: any) => s.id.toString() === id);
        } else if (data.length > 0) {
           // If no ID, but servers exist, redirect to first server's chat
           navigate(`/chat/${data[0].id}`, { replace: true });
        }
      } catch (error) {
        console.error("Failed to fetch servers:", error);
      }
    };

    fetchServers();

    if (!id) return;

    fetchChatHistory();

    // Socket.IO for real-time chat
    socket.on('chat_message', (msg: any) => {
        if (msg.serverId.toString() === id) {
            setChatLogs(prev => [
                {
                    id: Date.now(), // Local ID for key
                    server_id: parseInt(msg.serverId),
                    player_name: msg.name,
                    steam_id: msg.steamId,
                    message: msg.message,
                    type: msg.type,
                    created_at: msg.timestamp
                },
                ...prev.slice(0, 99) // Limit to last 100 in view
            ]);
        }
    });

    return () => {
      socket.off('chat_message');
    };
  }, [id]);

  const fetchChatHistory = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const response = await apiFetch(`/api/chat/${id}?limit=100`);
      if (response.ok) {
        const data = await response.json();
        setChatLogs(data);
      }
    } catch (error) {
      console.error("Failed to fetch chat history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTypeColor = (type: string) => {
    return type === 'say_team' ? 'text-emerald-400 bg-emerald-400/10' : 'text-primary bg-primary/10';
  };

  const filteredLogs = chatLogs.filter(log => 
    log.player_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.steam_id.includes(searchTerm)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden font-display">
      {/* Header */}
      <header className="h-20 flex items-center justify-between px-6 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="text-primary w-6 h-6" />
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Server Chat Logs
            </h2>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Live monitoring and message history
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              type="text"
              placeholder="Filter by name, message..."
              className="bg-[#111827] border border-gray-800 text-white pl-10 pr-4 py-2 rounded-xl focus:ring-2 focus:ring-primary/50 transition-all outline-none text-sm w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-col items-end">
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <select 
                className="bg-[#111827] border border-gray-800 text-white pl-10 pr-4 py-2 rounded-xl focus:ring-2 focus:ring-primary/50 transition-all outline-none text-sm min-w-[200px]"
                value={id || ''}
                onChange={(e) => navigate(`/chat/${e.target.value}`)}
              >
                <option value="" disabled>Select server...</option>
                {allServers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.port})</option>
                ))}
              </select>
            </div>
          </div>
          
          <button 
            onClick={fetchChatHistory}
            className="p-2.5 bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all border border-gray-700/50"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 pb-6 gap-6">
        <div className="flex-1 bg-[#0d1421] border border-gray-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
          <div className="overflow-y-auto flex-1 p-4 flex flex-col-reverse custom-scrollbar" ref={chatContainerRef}>
            <div className="space-y-4 pb-2">
              {filteredLogs.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-gray-500 gap-4">
                   <div className="w-16 h-16 rounded-full bg-gray-800/20 flex items-center justify-center">
                     <MessageSquare size={32} />
                   </div>
                   <p className="text-sm font-medium">
                     {searchTerm ? "No messages matching your search" : "No chat history found for this server"}
                   </p>
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="group animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-gray-800">
                      {/* Avatar placeholder */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center shrink-0 border border-gray-700 group-hover:border-primary/50 transition-colors">
                        <User className="text-gray-400 w-5 h-5 group-hover:text-primary transition-colors" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-slate-200 truncate max-w-[200px]">
                            {log.player_name}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${getTypeColor(log.type)}`}>
                            {log.type === 'say_team' ? 'TEAM' : 'ALL'}
                          </span>
                          <span className="text-[11px] text-gray-500 font-mono mt-0.5 ml-auto">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        
                        <p className="text-slate-300 text-sm leading-relaxed break-words bg-[#111827]/50 p-2.5 rounded-lg border border-gray-800/50">
                          {log.message}
                        </p>
                        
                        <div className="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-primary transition-colors cursor-help">
                            <Clock size={12} />
                            {new Date(log.created_at).toLocaleDateString()}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-primary transition-colors cursor-copy" 
                               onClick={() => navigator.clipboard.writeText(log.steam_id)}>
                            <Hash size={12} />
                            {log.steam_id}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
