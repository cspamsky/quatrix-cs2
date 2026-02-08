import React from 'react';
import { Settings, X, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CS2Map {
  id: string;
  name: string;
  displayName: string;
}

interface MapConfigEditorProps {
  map: CS2Map | null;
  onClose: () => void;
  configContent: string;
  onConfigChange: (content: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

const MapConfigEditor: React.FC<MapConfigEditorProps> = ({
  map,
  onClose,
  configContent,
  onConfigChange,
  onSave,
  isSaving,
}) => {
  const { t } = useTranslation();

  if (!map) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-6">
      <div className="bg-[#111827] border border-gray-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#0d1421]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <Settings size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {t('maps.config_editor_title')} {map.displayName}
              </h3>
              <p className="text-[10px] text-gray-500 font-mono tracking-widest mt-0.5 uppercase">
                quatrix_maps/{map.name}.cfg
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-xl transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 bg-black/40 p-1">
          <textarea
            className="w-full h-full min-h-[400px] bg-transparent text-primary/90 p-8 font-mono text-sm outline-none resize-none leading-relaxed selection:bg-primary/20"
            spellCheck={false}
            placeholder={t('maps.config_placeholder')}
            value={configContent}
            onChange={(e) => onConfigChange(e.target.value)}
            autoFocus
          />
        </div>

        <div className="p-6 bg-[#0d1421] border-t border-gray-800 flex justify-between items-center">
          <div className="text-[10px] text-gray-500 flex items-center gap-2 font-bold uppercase tracking-widest">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            {t('maps.auto_executed')}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-xs font-bold text-gray-400 hover:text-white transition-all capitalize"
            >
              {t('maps.discard')}
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-8 py-2.5 rounded-xl text-xs font-black tracking-[0.1em] transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {t('maps.save_configuration')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapConfigEditor;
