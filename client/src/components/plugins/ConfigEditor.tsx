import React from 'react';
import { Settings, X, Loader2, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfigEditorProps {
  plugin: { id: string; name: string } | null;
  onClose: () => void;
  isLoading: boolean;
  configFiles: { name: string; path: string }[];
  selectedFilePath: string | null;
  onFileSelect: (path: string) => void;
  editingContent: string;
  onContentChange: (content: string) => void;
  isSaving: boolean;
  onSave: () => void;
}

const ConfigEditor: React.FC<ConfigEditorProps> = ({
  plugin,
  onClose,
  isLoading,
  configFiles,
  selectedFilePath,
  onFileSelect,
  editingContent,
  onContentChange,
  isSaving,
  onSave,
}) => {
  const { t } = useTranslation();

  if (!plugin) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-6xl bg-[#0c1424] border border-gray-800 rounded-3xl shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
              <Settings size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {plugin.name} Settings
              </h3>
              <p className="text-[10px] text-gray-500 font-mono tracking-tight mt-0.5">
                {selectedFilePath || 'Select a file'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar (File List) */}
          <div className="w-1/4 border-r border-gray-800 bg-[#111827]/40 overflow-y-auto">
            <div className="p-3 uppercase text-[9px] font-black text-gray-600 tracking-widest">
              {t('plugins.available_files')}
            </div>
            {isLoading ? (
              <div className="p-6 flex justify-center">
                <Loader2 size={24} className="text-primary animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col gap-1 p-2">
                {configFiles.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => onFileSelect(file.path)}
                    className={`px-3 py-2 rounded-xl text-left text-xs font-bold transition-all ${
                      selectedFilePath === file.path
                        ? 'bg-primary/20 text-primary'
                        : 'text-gray-500 hover:bg-gray-800/50 hover:text-gray-300'
                    }`}
                  >
                    {file.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editor */}
          <div className="flex-1 flex flex-col bg-[#080c14]">
            <textarea
              className="flex-1 w-full bg-transparent p-6 text-sm font-mono text-gray-300 focus:outline-none resize-none scrollbar-hide leading-relaxed"
              value={editingContent}
              onChange={(e) => onContentChange(e.target.value)}
              spellCheck={false}
              placeholder={t('plugins.no_content')}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 bg-[#111827]/40 flex items-center justify-between">
          <span className="text-[10px] text-gray-500 font-medium">
            {t('plugins.changes_applied')}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-300 transition-all uppercase tracking-widest"
            >
              {t('plugins.cancel')}
            </button>
            <button
              disabled={isSaving || !selectedFilePath}
              onClick={onSave}
              className="flex items-center gap-2 bg-primary text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isSaving ? t('plugins.saving') : t('plugins.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigEditor;
