import React from 'react';
import { Shield, Lock, Smartphone, AlertTriangle } from 'lucide-react';

const SecurityTab: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <Shield className="text-primary w-5 h-5" />
            <h3 className="text-lg font-bold text-white tracking-tight">Quick Security Overview</h3>
          </div>
          <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-4">
            <div className="flex items-center space-x-2 mb-2 text-primary">
              <Lock className="text-lg w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-widest">
                Change Account Password
              </span>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                  Current Password
                </label>
                <input
                  className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm transition-all"
                  placeholder="••••••••"
                  type="password"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                  New Password
                </label>
                <input
                  className="w-full bg-[#0F172A]/50 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm transition-all"
                  placeholder="••••••••"
                  type="password"
                />
              </div>
              <button className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-bold border border-gray-700 transition-all active:scale-[0.98]">
                Update Password
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-primary/10 rounded-xl">
                <Smartphone className="text-primary w-6 h-6" />
              </div>
              <div>
                <h4 className="text-white font-bold">Two-Factor Authentication</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-[280px] leading-relaxed">
                  Add an extra layer of security to your account by enabling 2FA using Google
                  Authenticator.
                </p>
              </div>
            </div>
            <button className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-widest">
              Enable
            </button>
          </div>
        </div>

        <div className="pt-4 px-2">
          <h3 className="text-xs font-black text-red-500 mb-4 uppercase tracking-[0.2em] flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Danger Zone
          </h3>
          <div className="p-6 border border-red-900/20 bg-red-950/10 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-200">Factory Reset Panel</p>
              <p className="text-xs text-gray-500 mt-1">
                This will clear all settings and instance data.
              </p>
            </div>
            <button className="px-5 py-2.5 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-[10px] font-black transition-all uppercase tracking-widest active:scale-95">
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityTab;
