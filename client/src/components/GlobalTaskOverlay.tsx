import { useTasks, type Task } from '../contexts/TaskContext';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, XCircle, Server, Download, Database, Info } from 'lucide-react';
import { clsx } from 'clsx';

const GlobalTaskOverlay: React.FC = () => {
  const { tasks } = useTasks();
  const { t } = useTranslation();

  if (tasks.length === 0) return null;

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'server_install':
        return <Server className="w-4 h-4" />;
      case 'plugin_install':
        return <Download className="w-4 h-4" />;
      case 'backup_create':
        return <Database className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 w-80 max-w-[calc(100vw-3rem)]">
      {tasks.map((task: Task) => (
        <div
          key={task.id}
          className={clsx(
            'p-4 bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl transition-all duration-300 transform',
            task.status === 'completed' && 'border-green-500/30 shadow-green-500/10',
            task.status === 'failed' && 'border-red-500/30 shadow-red-500/10'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                {getTaskIcon(task.type)}
              </div>
              <span className="text-sm font-semibold text-white truncate">
                {String(t(`tasks.type.${task.type}`, { defaultValue: task.type }))}
              </span>
            </div>
            {getStatusIcon(task.status)}
          </div>

          {/* Message */}
          <p className="text-xs text-gray-400 mb-3 line-clamp-2">{task.message}</p>

          {/* Progress Bar */}
          <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={clsx(
                'absolute top-0 left-0 h-full transition-all duration-500 ease-out',
                task.status === 'completed'
                  ? 'bg-green-500'
                  : task.status === 'failed'
                    ? 'bg-red-500'
                    : 'bg-primary'
              )}
              style={{ width: `${task.progress}%` }}
            />
          </div>

          <div className="flex justify-end mt-1.5">
            <span className="text-[10px] text-gray-500 tabular-nums">
              {Math.round(task.progress)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default GlobalTaskOverlay;
