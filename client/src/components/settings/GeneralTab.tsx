import React from 'react';
import { Settings as SettingsIcon, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GeneralTabProps {
  panelName: string;
  setPanelName: (val: string) => void;
  defaultPort: string;
  setDefaultPort: (val: string) => void;
  autoBackup: boolean;
  setAutoBackup: (val: boolean) => void;
  autoPluginUpdates: boolean;
  setAutoPluginUpdates: (val: boolean) => void;
  onSave: () => void;
  systemInfo?: {
    runtime?: {
      node?: string;
      panel?: string;
      os?: string;
    };
  };
  isLoading?: boolean;
  canEdit?: boolean;
}

const GeneralTab: React.FC<GeneralTabProps> = ({
  panelName,
  setPanelName,
  defaultPort,
  setDefaultPort,
  autoBackup,
  setAutoBackup,
  autoPluginUpdates,
  setAutoPluginUpdates,
  onSave,
  systemInfo,
  isLoading,
  canEdit = true,
}) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <SettingsIcon className="text-primary w-5 h-5" />
            <h3 className="text-lg font-bold text-white tracking-tight">
              {t('settingsGeneral.title')}
            </h3>
          </div>
          <form className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {t('settingsGeneral.panel_name')}
              </label>
              <input
                className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600"
                type="text"
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {t('settingsGeneral.default_port')}
              </label>
              <input
                className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600 disabled:opacity-50"
                type="number"
                value={defaultPort}
                onChange={(e) => setDefaultPort(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between p-5 bg-[#0d1624] rounded-2xl border border-gray-800/50">
              <div>
                <p className="text-sm font-bold text-white">{t('settingsGeneral.auto_backup')}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {t('settingsGeneral.auto_backup_desc')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={autoBackup}
                  onChange={(e) => setAutoBackup(e.target.checked)}
                  disabled={!canEdit}
                />
                <div
                  className={`w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                ></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-5 bg-[#0d1624] rounded-2xl border border-gray-800/50">
              <div>
                <p className="text-sm font-bold text-white">
                  {t('settingsGeneral.auto_plugin_updates')}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {t('settingsGeneral.auto_plugin_desc')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={autoPluginUpdates}
                  onChange={(e) => setAutoPluginUpdates(e.target.checked)}
                  disabled={!canEdit}
                />
                <div
                  className={`w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                ></div>
              </label>
            </div>
            {canEdit && (
              <button
                onClick={onSave}
                className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 active:scale-95"
                type="button"
              >
                <Save size={18} />
                {t('settingsGeneral.save_changes')}
              </button>
            )}
          </form>
        </div>
      </div>

      <div className="space-y-10">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <SettingsIcon className="text-primary w-5 h-5" aria-hidden="true" />
            <h3 className="text-lg font-bold text-white tracking-tight">
              {t('settingsGeneral.system_info')}
            </h3>
          </div>
          <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('settingsGeneral.nodejs_version')}</span>
              <span className="text-gray-300 font-mono">
                {isLoading ? (
                  <span className="inline-block w-16 h-4 bg-gray-800 rounded animate-pulse"></span>
                ) : (
                  systemInfo?.runtime?.node || '--'
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('settingsGeneral.panel_version')}</span>
              <span className="text-gray-300 font-mono">
                {isLoading ? (
                  <span className="inline-block w-20 h-4 bg-gray-800 rounded animate-pulse"></span>
                ) : (
                  systemInfo?.runtime?.panel || '--'
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">OS</span>
              <span className="text-gray-300">
                {isLoading ? (
                  <span className="inline-block w-32 h-4 bg-gray-800 rounded animate-pulse"></span>
                ) : (
                  systemInfo?.runtime?.os || '--'
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralTab;
