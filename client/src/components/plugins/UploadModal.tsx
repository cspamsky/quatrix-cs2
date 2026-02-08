import React from 'react';
import { Layers, X, AlertCircle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface UploadModalProps {
  plugin: { id: string; name: string } | null;
  onClose: () => void;
  isUploading: boolean;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const UploadModal: React.FC<UploadModalProps> = ({
  plugin,
  onClose,
  isUploading,
  selectedFile,
  onFileChange,
  onSubmit,
}) => {
  const { t } = useTranslation();

  if (!plugin) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => !isUploading && onClose()}
      />
      <div className="relative bg-[#0c1424] border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 border border-orange-500/20">
              <Layers size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {plugin.id === 'unknown' ? t('plugins.upload_custom_plugin') : t('plugins.upload')}
              </h3>
              <p className="text-[10px] text-gray-500 font-mono tracking-tight mt-0.5">
                {plugin.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-white transition-colors"
            disabled={isUploading}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl flex items-start gap-3">
              <AlertCircle size={16} className="text-orange-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-gray-400 leading-relaxed">
                {t('plugins.upload_instruction')}
              </p>
            </div>

            <div className="relative group">
              <input
                type="file"
                accept=".zip,.rar,.gz,.tgz,.tar"
                onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={isUploading}
              />
              <div
                className={`p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 transition-all ${
                  selectedFile
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-gray-800 group-hover:border-gray-700 hover:bg-white/5'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    selectedFile ? 'bg-primary/20 text-primary' : 'bg-gray-800 text-gray-600'
                  }`}
                >
                  {selectedFile ? <CheckCircle2 size={24} /> : <Download size={24} />}
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white">
                    {selectedFile ? selectedFile.name : t('plugins.select_zip')}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1 font-mono uppercase tracking-widest">
                    {selectedFile
                      ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                      : 'MAX 50MB'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-800/40 text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-gray-800 transition-all border border-gray-800"
              disabled={isUploading}
            >
              {t('plugins.cancel')}
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="flex-[2] px-4 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-blue-600 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('plugins.uploading')}
                </>
              ) : (
                <>
                  <Layers size={16} />
                  {t('plugins.upload')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UploadModal;
