import React from 'react';
import {
  Monitor,
  Shield,
  AlertTriangle,
  RefreshCw,
  Download,
  Terminal,
  FolderOpen,
  Save,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ServerEngineTabProps {
  steamCmdPath: string;
  setSteamCmdPath: (val: string) => void;
  installDir: string;
  setInstallDir: (val: string) => void;
  engineLoading: boolean;
  engineMessage: { type: string; text: string };
  onDownloadSteamCmd: () => void;
  onSave: () => void;
}

const ServerEngineTab: React.FC<ServerEngineTabProps> = ({
  steamCmdPath,
  setSteamCmdPath,
  installDir,
  setInstallDir,
  engineLoading,
  engineMessage,
  onDownloadSteamCmd,
  onSave,
}) => {
  const { t } = useTranslation();
  return (
    <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2 mb-8">
        <Monitor className="text-primary w-6 h-6" />
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            {t('settingsEngine.title')}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{t('settingsEngine.subtitle')}</p>
        </div>
      </div>

      {engineMessage.text && (
        <div
          className={`mb-6 p-4 rounded-xl border ${
            engineMessage.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-500'
              : engineMessage.type === 'error'
                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-500'
          } text-sm flex items-center gap-2`}
        >
          {engineMessage.type === 'success' && <Shield size={16} />}
          {engineMessage.type === 'error' && <AlertTriangle size={16} />}
          {engineMessage.type === 'info' && <RefreshCw size={16} className="animate-spin" />}
          {engineMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-400">
                  {t('settingsEngine.steamcmd_path')}
                </label>
                <button
                  onClick={onDownloadSteamCmd}
                  disabled={engineLoading}
                  className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"
                >
                  <Download size={12} />
                  {t('settingsEngine.download_online')}
                </button>
              </div>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors">
                  <Terminal size={18} />
                </div>
                <input
                  className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-700 text-sm"
                  type="text"
                  placeholder="/home/user/quatrix/server/data/steamcmd/steamcmd.sh"
                  value={steamCmdPath}
                  onChange={(e) => setSteamCmdPath(e.target.value)}
                />
              </div>
              <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
                {t('settingsEngine.steamcmd_help')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {t('settingsEngine.game_library_path')}
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors">
                  <FolderOpen size={18} />
                </div>
                <input
                  className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-700 text-sm"
                  type="text"
                  placeholder="/home/user/quatrix/instances"
                  value={installDir}
                  onChange={(e) => setInstallDir(e.target.value)}
                />
              </div>
              <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
                {t('settingsEngine.library_help')}
              </p>
            </div>

            <button
              type="button"
              onClick={onSave}
              disabled={engineLoading}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
            >
              {engineLoading ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {t('settingsEngine.update_engine')}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-8 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl border border-primary/20">
            <h4 className="text-primary font-black uppercase tracking-widest text-xs mb-4">
              {t('settingsEngine.pro_tip_title')}
            </h4>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              {t('settingsEngine.pro_tip_desc')}
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                {t('settingsEngine.one_instance')}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                {t('settingsEngine.five_instances')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerEngineTab;
