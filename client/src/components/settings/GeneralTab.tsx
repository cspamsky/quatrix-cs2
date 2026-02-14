import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SearchableSelect from '../ui/SearchableSelect';

interface GeneralTabProps {
  panelName: string;
  setPanelName: (val: string) => void;
  defaultPort: string;
  setDefaultPort: (val: string) => void;
  timezone: string;
  setTimezone: (val: string) => void;
  timezones: string[];
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
  timezone,
  setTimezone,
  timezones,
  systemInfo,
  isLoading,
  canEdit = true,
}) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <SettingsIcon className="text-primary w-5 h-5" />
            <h3 className="text-lg font-bold text-white tracking-tight">
              {t('settingsGeneral.title')}
            </h3>
          </div>
          <form className="space-y-4">
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
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {t('settingsGeneral.timezone', 'System Time Zone')}
              </label>
              <SearchableSelect
                options={timezones}
                value={timezone}
                onChange={setTimezone}
                disabled={!canEdit}
                placeholder={t('settingsGeneral.select_timezone', 'Select a timezone...')}
              />
              <p className="text-[10px] text-gray-500 mt-2 px-1">
                {t(
                  'settingsGeneral.timezone_desc',
                  'The region used for server time and backup scheduling.'
                )}
              </p>
            </div>
            {/* Save Button Removed - Moved to Settings.tsx Footer */}
          </form>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-4">
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
              <span className="text-gray-500">{t('settingsGeneral.os')}</span>
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
