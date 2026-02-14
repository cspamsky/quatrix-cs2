import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Clock, Calendar, Hash, RefreshCcw, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import toast from 'react-hot-toast';
import CustomSelect from '../ui/CustomSelect';

interface BackupScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BackupScheduleModal: React.FC<BackupScheduleModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings states
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [frequency, setFrequency] = useState('daily');
  const [scheduleTime, setScheduleTime] = useState('03:00');
  const [specificDate, setSpecificDate] = useState('');
  const [retentionLimit, setRetentionLimit] = useState('7');

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();

      setAutoEnabled(data.backup_auto_enabled === 'true');
      setFrequency(data.backup_frequency || 'daily');
      setScheduleTime(data.backup_schedule_time || '03:00');
      setSpecificDate(data.backup_specific_date || '');
      setRetentionLimit(data.backup_retention_limit || '7');
    } catch {
      toast.error('Failed to load login settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backup_auto_enabled: autoEnabled.toString(),
          backup_frequency: frequency,
          backup_schedule_time: scheduleTime,
          backup_specific_date: specificDate,
          backup_retention_limit: retentionLimit,
        }),
      });

      if (!response.ok) throw new Error('Failed to save settings');
      toast.success(t('settings.save_success'));
      onClose();
    } catch {
      toast.error(t('settings.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#020617]/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-[#0F172A] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                {t('backups.schedule_settings_title', 'Scheduled Backup')}
              </h3>
              <p className="text-xs text-gray-500 font-medium tracking-wide uppercase mt-0.5">
                Configuration & Automation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 space-y-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-4">
              <RefreshCcw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-gray-400 text-sm font-medium">{t('common.loading')}</p>
            </div>
          ) : (
            <>
              {/* Enable Toggle */}
              <div
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                  autoEnabled
                    ? 'bg-primary/5 border-primary/20 shadow-lg shadow-primary/5'
                    : 'bg-white/5 border-white/5 hover:border-white/10'
                }`}
                onClick={() => setAutoEnabled(!autoEnabled)}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`p-2 rounded-lg transition-colors ${autoEnabled ? 'bg-primary/20 text-primary' : 'bg-white/5 text-gray-500'}`}
                  >
                    {autoEnabled ? (
                      <ToggleRight className="w-5 h-5" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {t('settingsGeneral.auto_backup', 'Automatic Backup')}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t(
                        'settingsGeneral.auto_backup_desc',
                        'Automatically backup the system at specific intervals'
                      )}
                    </p>
                  </div>
                </div>
                <div
                  className={`w-12 h-6 rounded-full relative transition-colors ${autoEnabled ? 'bg-primary' : 'bg-gray-700'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${autoEnabled ? 'translate-x-6' : ''}`}
                  />
                </div>
              </div>

              {/* Frequency & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <RefreshCcw className="w-3 h-3 text-primary" />
                    {t('backups.frequency', 'Frequency / Period')}
                  </label>
                  <CustomSelect
                    options={[
                      { value: 'daily', label: t('backups.freq_daily', 'Daily') },
                      { value: 'weekly', label: t('backups.freq_weekly', 'Weekly (Sunday)') },
                      { value: 'monthly', label: t('backups.freq_monthly', 'Monthly (1st Day)') },
                    ]}
                    value={frequency}
                    onChange={(val) => setFrequency(String(val))}
                    disabled={!autoEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-3 h-3 text-primary" />
                    {t('backups.time', 'Backup Time')}
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    disabled={!autoEnabled}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-white/10"
                  />
                </div>
              </div>

              {/* Specific Date & Retention */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-primary" />
                    {t('backups.specific_date', 'Specific Date (One Time)')}
                  </label>
                  <input
                    type="date"
                    value={specificDate}
                    onChange={(e) => setSpecificDate(e.target.value)}
                    disabled={!autoEnabled}
                    placeholder="YYYY-MM-DD"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <Hash className="w-3 h-3 text-primary" />
                    {t('settingsGeneral.backup_retention_limit', 'Saklama Limiti')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={retentionLimit}
                    onChange={(e) => setRetentionLimit(e.target.value)}
                    disabled={!autoEnabled}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Tips */}
              <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed uppercase tracking-wider font-bold mt-1">
                  {autoEnabled
                    ? `Backups will be taken automatically ${frequency === 'daily' ? 'every day' : frequency === 'weekly' ? 'on Sundays' : 'on the first day of the month'} at ${scheduleTime}.`
                    : 'Automatic backup is currently disabled. Toggle the switch above to configure settings.'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-white/5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-8 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupScheduleModal;
