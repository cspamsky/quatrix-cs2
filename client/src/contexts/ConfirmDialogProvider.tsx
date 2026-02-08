import { useState, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialogContext, type ConfirmDialogOptions } from './ConfirmDialogContext.js';

export const ConfirmDialogProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions>({
    title: '',
    message: '',
    confirmText: t('common.save'),
    cancelText: t('common.cancel'),
    type: 'danger',
  });
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const showConfirm = (opts: ConfirmDialogOptions): Promise<boolean> => {
    setOptions({
      ...opts,
      confirmText: opts.confirmText || t('common.save'),
      cancelText: opts.cancelText || t('common.cancel'),
      type: opts.type || 'danger',
    });
    setIsOpen(true);

    return new Promise<boolean>((resolve) => {
      setResolvePromise(() => resolve);
    });
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(true);
      setResolvePromise(null);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(false);
      setResolvePromise(null);
    }
  };

  const getTypeStyles = () => {
    switch (options.type) {
      case 'danger':
        return {
          icon: 'text-red-500',
          iconBg: 'bg-red-500/10',
          confirmBtn: 'bg-red-500 hover:bg-red-600 shadow-red-500/20',
        };
      case 'warning':
        return {
          icon: 'text-amber-500',
          iconBg: 'bg-amber-500/10',
          confirmBtn: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20',
        };
      case 'info':
        return {
          icon: 'text-blue-500',
          iconBg: 'bg-blue-500/10',
          confirmBtn: 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20',
        };
      default:
        return {
          icon: 'text-red-500',
          iconBg: 'bg-red-500/10',
          confirmBtn: 'bg-red-500 hover:bg-red-600 shadow-red-500/20',
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <ConfirmDialogContext.Provider value={{ showConfirm }}>
      {children}

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />

          {/* Dialog */}
          <div className="relative bg-[#111827] border border-gray-800 rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 pb-4">
              <div className="flex items-start gap-4">
                <div className={`${styles.iconBg} p-3 rounded-xl shrink-0`}>
                  <AlertTriangle className={`w-6 h-6 ${styles.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white mb-2">{options.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{options.message}</p>
                </div>
                <button
                  onClick={handleCancel}
                  className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 pt-2 flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-semibold text-sm transition-all"
              >
                {options.cancelText}
              </button>
              <button
                onClick={handleConfirm}
                className={`flex-1 px-4 py-2.5 text-white rounded-xl font-semibold text-sm transition-all shadow-lg ${styles.confirmBtn}`}
              >
                {options.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
};
