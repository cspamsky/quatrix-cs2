import { memo } from 'react';
import {
  Users,
  Hash,
  Play,
  Square,
  Terminal,
  Settings,
  Copy,
  Check,
  Trash2,
  Download,
  RefreshCw,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { getMapImage } from '../utils/mapImages';
import { useTranslation } from 'react-i18next';

interface Instance {
  id: number;
  name: string;
  map: string;
  status: 'ONLINE' | 'OFFLINE' | 'STARTING' | 'INSTALLING';
  current_players: number;
  max_players: number;
  port: number;
  image?: string;
  isInstalled?: boolean;
  workshop_map_name?: string;
  workshop_map_image?: string;
}

interface ServerCardProps {
  instance: Instance;
  serverIp: string;
  copiedId: string | null;
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
  onCopy: (text: string, id: string) => void;
  onConsole: (id: number) => void;
  onSettings: (id: number) => void;
  onFiles: (id: number) => void;
  isSelected?: boolean;
  onSelect?: (id: number) => void;
  userPermissions?: string[];
}

const ServerCard = memo(
  ({
    instance,
    serverIp,
    copiedId,
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
    onCopy,
    onConsole,
    onSettings,
    onFiles,
    isSelected = false,
    onSelect,
    userPermissions = [],
  }: ServerCardProps) => {
    const { t } = useTranslation();

    const hasPerm = (p: string) => userPermissions.includes('*') || userPermissions.includes(p);
    return (
      <div
        className={`bg-[#111827] rounded-xl border border-gray-800/50 overflow-hidden flex flex-col group hover:border-primary/50 transition-all duration-300 ${
          instance.status === 'OFFLINE' ? 'opacity-70 grayscale-[0.5]' : ''
        } ${isSelected ? 'ring-2 ring-primary border-primary' : ''}`}
      >
        <div className="relative h-32 overflow-hidden bg-gray-900">
          <img
            alt={`Map ${instance.workshop_map_name || instance.map}`}
            className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
            src={instance.workshop_map_image || getMapImage(instance.map)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#111827] to-transparent"></div>

          <div className="absolute top-3 left-3 flex items-center">
            {instance.status === 'ONLINE' && (
              <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20 flex items-center backdrop-blur-md shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
                {t('serverCard.status_online')}
              </div>
            )}
            {instance.status === 'OFFLINE' && (
              <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20 flex items-center backdrop-blur-md shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 mr-1.5"></span>
                {t('serverCard.status_offline')}
              </div>
            )}
            {instance.status === 'STARTING' && (
              <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 flex items-center backdrop-blur-md shadow-sm">
                <div className="w-2 h-2 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin mr-1.5"></div>
                {t('serverCard.status_starting')}
              </div>
            )}
            {instance.status === 'INSTALLING' && (
              <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20 flex items-center backdrop-blur-md shadow-sm">
                <div className="w-2 h-2 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mr-1.5"></div>
                {t('serverCard.status_installing')}
              </div>
            )}
          </div>

          {onSelect && (
            <div className="absolute top-3 right-3 z-20">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelect(instance.id)}
                className="w-4 h-4 rounded border-white/20 bg-black/40 text-primary focus:ring-primary focus:ring-offset-gray-900 cursor-pointer backdrop-blur-md"
              />
            </div>
          )}

          <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center">
            <p className="text-white text-[10px] font-bold tracking-widest uppercase opacity-80 truncate max-w-[150px]">
              {instance.workshop_map_name || instance.map}
            </p>
            {instance.workshop_map_image && (
              <div className="px-1.5 py-0.5 rounded-md bg-blue-500/20 border border-blue-500/30 text-[8px] font-black text-blue-400 uppercase tracking-tighter backdrop-blur-sm">
                {t('serverCard.workshop')}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-white truncate text-sm">{instance.name}</h3>
            <span className="text-[10px] text-gray-500 font-mono">ID: {instance.id}</span>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400 flex items-center">
                <Users className="w-3.5 h-3.5 mr-2 opacity-70" /> {t('serverCard.players')}
              </span>
              <span className="text-white font-medium">
                {instance.current_players} / {instance.max_players}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400 flex items-center">
                <Hash className="w-3.5 h-3.5 mr-2 opacity-70" /> {t('serverCard.ip_address')}
              </span>
              <button
                type="button"
                aria-label={t('serverCard.copy_address')}
                title={t('serverCard.copy_address')}
                className="flex items-center gap-1.5 text-primary hover:text-blue-400 transition-colors group/ip bg-transparent border-0 p-0"
                onClick={() => onCopy(`${serverIp}:${instance.port}`, instance.id.toString())}
              >
                <span className="font-mono">
                  {serverIp || t('serverCard.detecting')}
                  {serverIp ? `:${instance.port}` : ''}
                </span>
                {copiedId === instance.id.toString() ? (
                  <Check size={12} />
                ) : (
                  <Copy
                    size={12}
                    className="opacity-0 group-hover/ip:opacity-100 group-focus-visible/ip:opacity-100 transition-opacity"
                  />
                )}
              </button>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-2 pt-4 border-t border-gray-800/60">
            {!instance.isInstalled ? (
              hasPerm('servers.create') && (
                <button
                  onClick={() => onInstall(instance.id)}
                  disabled={installingId === instance.id || instance.status === 'INSTALLING'}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded text-[11px] font-semibold transition-all flex items-center justify-center shadow-lg shadow-orange-500/10 disabled:opacity-50"
                >
                  {installingId === instance.id || instance.status === 'INSTALLING' ? (
                    <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3 mr-1.5" />
                  )}
                  {instance.status === 'INSTALLING'
                    ? t('serverCard.installing')
                    : t('serverCard.install_server')}
                </button>
              )
            ) : (
              <>
                {instance.status === 'OFFLINE' ? (
                  hasPerm('servers.update') && (
                    <button
                      onClick={() => onStart(instance.id)}
                      disabled={startingId === instance.id}
                      className="flex-1 bg-primary hover:bg-blue-600 text-white py-2 rounded text-[11px] font-semibold transition-all flex items-center justify-center shadow-lg shadow-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {startingId === instance.id ? (
                        <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 mr-1.5" />
                      )}
                      {startingId === instance.id
                        ? t('serverCard.starting')
                        : t('serverCard.start')}
                    </button>
                  )
                ) : (
                  <>
                    {hasPerm('servers.update') && (
                      <>
                        <button
                          onClick={() => onStop(instance.id)}
                          disabled={stoppingId === instance.id}
                          className="flex-1 bg-gray-800/40 hover:bg-red-500/10 hover:text-red-500 py-2 rounded text-[11px] font-semibold transition-all flex items-center justify-center border border-gray-800/40 disabled:opacity-50"
                        >
                          {stoppingId === instance.id ? (
                            <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                          ) : (
                            <Square className="w-3 h-3 mr-1.5 fill-current" />
                          )}
                          {stoppingId === instance.id
                            ? t('serverCard.stopping')
                            : t('serverCard.stop')}
                        </button>
                        <button
                          onClick={() => onRestart(instance.id)}
                          disabled={restartingId === instance.id}
                          className="p-2 bg-gray-800/40 hover:bg-amber-500/10 hover:text-amber-500 rounded transition-all border border-gray-800/40 disabled:opacity-50"
                          title={t('serverCard.restart')}
                          aria-label={t('serverCard.restart')}
                        >
                          <RotateCcw
                            className={`w-3.5 h-3.5 ${restartingId === instance.id ? 'animate-spin' : ''}`}
                          />
                        </button>
                      </>
                    )}
                  </>
                )}
                {hasPerm('servers.console') && (
                  <button
                    onClick={() => onConsole(instance.id)}
                    className="flex-1 bg-gray-800/40 hover:bg-primary/10 hover:text-primary py-2 rounded text-[11px] font-semibold transition-all flex items-center justify-center border border-gray-800/40"
                  >
                    <Terminal className="w-3 h-3 mr-1.5" /> {t('serverCard.console')}
                  </button>
                )}
              </>
            )}

            <button
              aria-label={t('serverCard.settings')}
              onClick={() => onSettings(instance.id)}
              className="p-2 bg-gray-800/40 hover:bg-gray-700/40 rounded transition-all border border-gray-800/40 text-gray-400 hover:text-white"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {hasPerm('servers.files') && (
              <button
                aria-label={t('serverCard.file_manager')}
                onClick={() => onFiles(instance.id)}
                disabled={!instance.isInstalled}
                className="p-2 bg-gray-800/40 hover:bg-gray-700/40 rounded transition-all border border-gray-800/40 text-gray-400 hover:text-white disabled:opacity-30"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
            )}

            {hasPerm('servers.delete') && (
              <button
                aria-label={t('serverCard.delete_server')}
                onClick={() => onDelete(instance.id)}
                disabled={deletingId === instance.id}
                className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded transition-all border border-red-500/20 text-red-500 flex items-center justify-center disabled:opacity-50"
              >
                {deletingId === instance.id ? (
                  <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

export default ServerCard;
