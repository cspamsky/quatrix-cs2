import React from 'react'
import { Terminal, Server, Database, Monitor, AlertTriangle, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const ActivityLogTab: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2 mb-6">
        <Terminal className="text-[#1890ff]" size={20} />
        <h3 className="text-lg font-bold text-white">{t('activityLog.title')}</h3>
      </div>
      <div className="space-y-4 max-h-[600px] overflow-y-auto scrollbar-hide">
        {/* Activity Item */}
        <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
          <div className="p-2 rounded-lg bg-green-500/10 text-green-500 shrink-0">
            <Server size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{t('activityLog.server_started')}</p>
            <p className="text-xs text-gray-400 mt-1">CS2-Server-01 {t('activityLog.server_started_desc')}</p>
            <p className="text-xs text-gray-500 mt-2">2 {t('activityLog.minutes_ago')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
            <Terminal size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{t('activityLog.console_command')}</p>
            <p className="text-xs text-gray-400 mt-1 font-mono">mp_roundtime 5</p>
            <p className="text-xs text-gray-500 mt-2">15 {t('activityLog.minutes_ago')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
            <Database size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{t('activityLog.map_changed')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('activityLog.map_changed_desc')} de_dust2</p>
            <p className="text-xs text-gray-500 mt-2">1 {t('activityLog.hour_ago')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
            <Monitor size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{t('activityLog.system_update')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('activityLog.system_update_desc')}</p>
            <p className="text-xs text-gray-500 mt-2">3 {t('activityLog.hours_ago')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
          <div className="p-2 rounded-lg bg-red-500/10 text-red-500 shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{t('activityLog.security_alert')}</p>
            <p className="text-xs text-gray-500 mt-1">{t('activityLog.security_alert_desc')}</p>
            <p className="text-xs text-gray-500 mt-2">5 {t('activityLog.hours_ago')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-[#0F172A]/50 rounded-lg border border-gray-800/30 hover:border-blue-500/30 transition-all">
          <div className="p-2 rounded-lg bg-green-500/10 text-green-500 shrink-0">
            <Shield size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{t('activityLog.password_changed')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('activityLog.password_changed_desc')}</p>
            <p className="text-xs text-gray-500 mt-2">1 {t('activityLog.day_ago')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ActivityLogTab
