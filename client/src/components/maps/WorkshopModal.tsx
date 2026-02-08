import React from 'react';
import { Globe, X, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WorkshopModalProps {
  isOpen: boolean;
  onClose: () => void;
  workshopId: string;
  onWorkshopIdChange: (id: string) => void;
  mapFile: string;
  onMapFileChange: (name: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

const WorkshopModal: React.FC<WorkshopModalProps> = ({
  isOpen,
  onClose,
  workshopId,
  onWorkshopIdChange,
  mapFile,
  onMapFileChange,
  onSubmit,
  isPending,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Globe className="text-primary" size={20} />
            <h3 className="text-white font-bold">{t('maps.add_workshop_title')}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-8 space-y-5">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 ml-1">
              {t('maps.workshop_id_label')}
            </label>
            <input
              type="text"
              placeholder={t('maps.workshop_id_placeholder')}
              className="w-full bg-[#0c1424] border border-gray-800 rounded-2xl py-4 px-6 text-white focus:border-primary transition-all outline-none text-lg font-mono placeholder:text-gray-700"
              value={workshopId}
              onChange={(e) => onWorkshopIdChange(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 ml-1">
              {t('maps.map_name_label')}
            </label>
            <input
              type="text"
              placeholder={t('maps.map_name_placeholder')}
              className="w-full bg-[#0c1424] border border-gray-800 rounded-2xl py-4 px-6 text-white focus:border-primary transition-all outline-none text-lg font-mono placeholder:text-gray-700"
              value={mapFile}
              onChange={(e) => onMapFileChange(e.target.value)}
            />
            <p className="mt-3 text-[10px] text-gray-600 flex items-center gap-2">
              <Plus size={10} /> {t('maps.map_name_hint')}
            </p>
          </div>

          <button
            onClick={onSubmit}
            disabled={!workshopId || isPending}
            className="w-full bg-primary hover:bg-blue-600 disabled:opacity-50 text-white py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-xl shadow-primary/20"
          >
            {isPending ? t('maps.verifying') : t('maps.link_to_server')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkshopModal;
