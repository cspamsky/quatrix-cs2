import React from 'react';
import { Cpu, Zap, Layers, Download, Trash2, Settings, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PluginInfo {
  id: string;
  name: string;
  category: 'core' | 'metamod' | 'cssharp';
  description?: string;
  tags?: string[];
  inPool: boolean;
  isCustom?: boolean;
}

interface PluginRowProps {
  id: string;
  info: PluginInfo;
  status: { installed: boolean; hasConfigs: boolean } | undefined;
  updates: { hasUpdate: boolean; currentVersion?: string; latestVersion?: string } | undefined;
  actionLoading: string | null;
  onAction: (id: string, action: 'install' | 'uninstall' | 'update') => void;
  onOpenConfig: (id: string, name: string) => void;
  onOpenUpload: (id: string, name: string) => void;
  metamodInstalled: boolean;
  cssharpInstalled: boolean;
}

const PluginRow: React.FC<PluginRowProps> = ({
  id,
  info,
  status,
  updates,
  actionLoading,
  onAction,
  onOpenConfig,
  onOpenUpload,
  metamodInstalled,
  cssharpInstalled,
}) => {
  const { t } = useTranslation();
  const isInstalled = !!status?.installed;
  const hasConfigs = !!status?.hasConfigs;
  const hasUpdate = !!updates?.hasUpdate;
  const isLoading = actionLoading === id;

  const canInstall =
    !isInstalled &&
    info.inPool &&
    (id === 'metamod' || metamodInstalled) &&
    (info.category !== 'cssharp' || id === 'cssharp' || cssharpInstalled);

  return (
    <tr className="group hover:bg-primary/[0.01] transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
              isInstalled
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-gray-800/40 text-gray-500 border border-gray-800/40'
            }`}
          >
            {id === 'metamod' || info.category === 'metamod' ? (
              <Cpu size={18} />
            ) : id === 'cssharp' || info.category === 'cssharp' ? (
              <Zap size={18} />
            ) : (
              <Layers size={18} />
            )}
          </div>
          <div>
            <div className="text-sm font-bold text-white group-hover:text-primary transition-colors">
              {info.name}
            </div>
            <span
              className={`text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded mt-1 inline-block ${
                isInstalled ? 'bg-green-500/10 text-green-500' : 'bg-gray-800/60 text-gray-500'
              }`}
            >
              {isInstalled ? t('plugins.installed') : t('plugins.not_installed')}
            </span>
            {info.isCustom && (
              <span className="text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded mt-1 ml-1 inline-block bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {t('plugins.custom')}
              </span>
            )}
            {!info.inPool && (
              <span className="text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded mt-1 ml-1 inline-block bg-orange-500/10 text-orange-500 border border-orange-500/20">
                {t('plugins.not_in_pool')}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 hidden lg:table-cell">
        <p className="text-xs text-gray-500 max-w-sm line-clamp-1 mb-2">
          {info.description || `High-performance module.`}
        </p>
        <div className="flex flex-wrap gap-1">
          {info.tags?.map((tag) => (
            <span
              key={tag}
              className="text-[8px] font-bold text-primary/40 group-hover:text-primary/70 transition-colors uppercase tracking-tight"
            >
              #{tag}
            </span>
          ))}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="text-[11px] font-mono font-bold text-gray-400">
            {isInstalled ? `v${updates?.currentVersion || '?.?.?'}` : '--'}
          </span>
          {hasUpdate && isInstalled && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[9px] font-black text-yellow-500 animate-pulse uppercase">
                {t('plugins.update')}
              </span>
              <span className="text-[9px] text-yellow-500/50 font-medium">
                → v{updates?.latestVersion}
              </span>
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex justify-end gap-2 text-right">
          {isInstalled ? (
            <>
              {hasUpdate && (
                <button
                  disabled={actionLoading !== null}
                  onClick={() => onAction(id, 'update')}
                  className="p-1.5 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Update Plugin"
                >
                  {isLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                </button>
              )}
              {hasConfigs && (
                <button
                  disabled={actionLoading !== null}
                  onClick={() => onOpenConfig(id, info.name)}
                  className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Plugin Settings"
                >
                  <Settings size={14} />
                </button>
              )}
              <button
                disabled={actionLoading !== null}
                onClick={() => onAction(id, 'uninstall')}
                className="p-1.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Uninstall Plugin"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {!info.inPool && (
                <button
                  onClick={() => onOpenUpload(id, info.name)}
                  className="p-1.5 bg-orange-500/10 text-orange-500 rounded-lg hover:bg-orange-500/20 transition-all"
                  title="Upload to Pool"
                >
                  <Layers size={14} />
                </button>
              )}
              <button
                disabled={!canInstall || actionLoading !== null}
                onClick={() => onAction(id, 'install')}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-primary/10 disabled:bg-gray-800/50 disabled:text-gray-500 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                {info.inPool ? t('plugins.install') : t('plugins.not_in_pool')}
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

export default PluginRow;
