import { memo } from 'react';
import {
  Users,
  Play,
  Square,
  Terminal,
  Settings,
  Trash2,
  Download,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Instance {
  id: number;
  name: string;
  map: string;
  status: 'ONLINE' | 'OFFLINE' | 'STARTING' | 'INSTALLING';
  current_players: number;
  max_players: number;
  port: number;
  isInstalled?: boolean;
  workshop_map_name?: string;
}

interface ServerRowProps {
  instance: Instance;
  serverIp: string;
  isSelected: boolean;
  onSelect: (id: number) => void;
  installingId: number | null;
  startingId: number | null;
  stoppingId: number | null;
  restartingId: number | null;
  deletingId: number | null;
  onInstall: (id: number) => void;
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  onRestart: (id: number) => void;
  onDelete: (id: number) => void;
  onConsole: (id: number) => void;
  onSettings: (id: number) => void;
  onFiles: (id: number) => void;
  userPermissions?: string[];
}

const ServerRow = memo(
  ({
    instance,
    serverIp,
    isSelected,
    onSelect,
    installingId,
    startingId,
    stoppingId,
    restartingId,
    deletingId,
    onInstall,
    onStart,
    onStop,
    onRestart,
    onDelete,
    onConsole,
    onSettings,
    onFiles,
    userPermissions = [],
  }: ServerRowProps) => {
    const { t } = useTranslation();

    const hasPerm = (p: string) => userPermissions.includes('*') || userPermissions.includes(p);

    return (
      <div
        className={`flex items-center gap-4 bg-[#111827] hover:bg-[#111827]/80 p-3 rounded-xl border transition-all ${
          isSelected ? 'border-primary bg-primary/5' : 'border-gray-800/50'
        } ${instance.status === 'OFFLINE' ? 'opacity-80' : ''}`}
      >
        <div className="flex items-center gap-3 shrink-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(instance.id)}
            className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary focus:ring-offset-gray-900"
          />
          <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center shrink-0 border border-gray-800 overflow-hidden">
            {instance.status === 'ONLINE' ? (
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            ) : instance.status === 'OFFLINE' ? (
              <div className="w-2 h-2 rounded-full bg-gray-500" />
            ) : (
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white text-sm truncate">{instance.name}</h3>
            <span className="text-[10px] text-gray-600 font-mono">#{instance.id}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest truncate max-w-[120px]">
              {instance.workshop_map_name || instance.map}
            </p>
            <span className="text-[10px] text-gray-700">|</span>
            <span className="text-[10px] text-gray-500 font-mono">
              {serverIp}:{instance.port}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-8 shrink-0 px-4">
          <div className="flex flex-col items-center min-w-[60px]">
            <span className="text-[9px] text-gray-600 font-black uppercase tracking-tighter mb-1">
              {t('serverCard.players')}
            </span>
            <div className="flex items-center gap-1.5">
              <Users size={12} className="text-gray-500" />
              <span className="text-xs font-bold text-gray-200">
                {instance.current_players} / {instance.max_players}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!instance.isInstalled ? (
            hasPerm('servers.create') && (
              <button
                onClick={() => onInstall(instance.id)}
                disabled={installingId === instance.id || instance.status === 'INSTALLING'}
                className="bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 p-2 rounded-lg transition-all disabled:opacity-50"
                title={t('serverCard.install_server')}
              >
                <Download
                  size={16}
                  className={installingId === instance.id ? 'animate-bounce' : ''}
                />
              </button>
            )
          ) : (
            <>
              {instance.status === 'OFFLINE' ? (
                hasPerm('servers.update') && (
                  <button
                    onClick={() => onStart(instance.id)}
                    disabled={startingId === instance.id}
                    className="bg-green-500/10 hover:bg-green-500/20 text-green-500 p-2 rounded-lg transition-all"
                    title={t('serverCard.start')}
                  >
                    <Play size={16} className={startingId === instance.id ? 'animate-pulse' : ''} />
                  </button>
                )
              ) : (
                <>
                  {hasPerm('servers.update') && (
                    <>
                      <button
                        onClick={() => onStop(instance.id)}
                        disabled={stoppingId === instance.id}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 p-2 rounded-lg transition-all"
                        title={t('serverCard.stop')}
                      >
                        <Square
                          size={16}
                          className={stoppingId === instance.id ? 'animate-pulse' : 'fill-current'}
                        />
                      </button>
                      <button
                        onClick={() => onRestart(instance.id)}
                        disabled={restartingId === instance.id}
                        className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 p-2 rounded-lg transition-all"
                        title={t('serverCard.restart')}
                      >
                        <RotateCcw
                          size={16}
                          className={restartingId === instance.id ? 'animate-spin' : ''}
                        />
                      </button>
                    </>
                  )}
                </>
              )}
              {hasPerm('servers.console') && (
                <button
                  onClick={() => onConsole(instance.id)}
                  className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 p-2 rounded-lg transition-all"
                  title={t('serverCard.console')}
                >
                  <Terminal size={16} />
                </button>
              )}
            </>
          )}
          <div className="w-px h-6 bg-gray-800 mx-1" />
          {hasPerm('servers.files') && (
            <button
              onClick={() => onFiles(instance.id)}
              disabled={!instance.isInstalled}
              className="text-gray-500 hover:text-white p-2 rounded-lg transition-all disabled:opacity-20"
              title={t('serverCard.file_manager')}
            >
              <FileText size={16} />
            </button>
          )}

          <button
            onClick={() => onSettings(instance.id)}
            className="text-gray-500 hover:text-white p-2 rounded-lg transition-all"
            title={t('serverCard.settings')}
          >
            <Settings size={16} />
          </button>

          {hasPerm('servers.delete') && (
            <button
              onClick={() => onDelete(instance.id)}
              disabled={deletingId === instance.id}
              className="text-gray-500 hover:text-red-500 p-2 rounded-lg transition-all"
              title={t('serverCard.delete_server')}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    );
  }
);

export default ServerRow;
