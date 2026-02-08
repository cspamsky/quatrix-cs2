import React from 'react';
import { Settings, Trash2, Play, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CS2Map {
  id: string;
  workshop_id?: string;
  name: string;
  displayName: string;
  type: 'Defusal' | 'Hostage' | 'Workshop';
  image: string;
  isActive: boolean;
}

interface MapCardProps {
  map: CS2Map;
  onOpenConfig: (map: CS2Map) => void;
  onRemoveWorkshop: (id: string) => void;
  onChangeMap: (map: CS2Map) => void;
  isServerOnline: boolean;
  isChanging: boolean;
}

const MapCard: React.FC<MapCardProps> = ({
  map,
  onOpenConfig,
  onRemoveWorkshop,
  onChangeMap,
  isServerOnline,
  isChanging,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={`group relative aspect-[16/10] rounded-2xl overflow-hidden border border-gray-800 transition-all hover:border-primary/50 ${
        map.isActive ? 'ring-2 ring-primary ring-offset-4 ring-offset-[#0F172A]' : ''
      }`}
    >
      <img
        src={map.image}
        alt={map.displayName}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>

      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
        <div className="truncate mr-2">
          <h4 className="text-white font-bold text-sm truncate">{map.displayName}</h4>
          <p className="text-gray-400 text-[9px] font-mono truncate opacity-60">{map.name}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onOpenConfig(map)}
            className="p-3 bg-gray-900/80 text-gray-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:text-white"
            title={t('maps.settings')}
          >
            <Settings size={16} />
          </button>
          {map.type === 'Workshop' && (
            <button
              onClick={() => onRemoveWorkshop(map.id)}
              className="p-3 bg-red-500/10 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
              title={t('maps.remove')}
            >
              <Trash2 size={16} />
            </button>
          )}
          {!map.isActive && (
            <button
              onClick={() => onChangeMap(map)}
              disabled={isChanging || !isServerOnline}
              className="p-3 bg-primary text-white rounded-xl shadow-xl shadow-primary/40 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 disabled:opacity-50"
              title={t('maps.play')}
            >
              <Play size={18} fill="white" />
            </button>
          )}
        </div>
      </div>

      {map.isActive && (
        <div className="absolute top-4 right-4 bg-green-500 p-1.5 rounded-full text-white">
          <CheckCircle2 size={16} />
        </div>
      )}
    </div>
  );
};

export default MapCard;
