import { useState, useEffect } from 'react';
import {
  Lock,
  Shield,
  Smartphone,
  Clock,
  Globe,
  LogOut,
  Camera,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, ShieldOff, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Session {
  id: number;
  token_id: string;
  device_info: string;
  ip_address: string;
  last_active: string;
}

interface UserProfile {
  id: number;
  username: string;
  avatar_url?: string;
  two_factor_enabled: boolean;
  created_at: string;
  currentJti?: string;
}

const Profile = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // 2FA States
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable2FA, setShowDisable2FA] = useState(false);

  // 1. Fetch Profile Data
  const { data: user, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: () => apiFetch('/api/profile').then((res) => res.json()),
  });

  // Sync avatar URL when user data is loaded
  useEffect(() => {
    if (user?.avatar_url) setAvatarUrl(user.avatar_url);
  }, [user]);

  // 2. Fetch Sessions
  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: () => apiFetch('/api/profile/sessions').then((res) => res.json()),
  });

  // 3. Update Password Mutation
  const updatePasswordMutation = useMutation({
    mutationFn: (passwords: { currentPassword: string; newPassword: string }) =>
      apiFetch('/api/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwords),
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        return data;
      }),
    onSuccess: () => {
      toast.success(t('profile.password_success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 4. Update Avatar Mutation
  const updateAvatarMutation = useMutation({
    mutationFn: (url: string) =>
      apiFetch('/api/profile/avatar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: url }),
      }).then((res) => res.json()),
    onSuccess: () => {
      toast.success('Avatar updated');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      // Update local storage user object if needed
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...storedUser, avatar_url: avatarUrl }));
      window.dispatchEvent(new Event('storage')); // Trigger re-render in Layout
    },
  });

  // 5. Terminate Session Mutation
  const terminateSessionMutation = useMutation({
    mutationFn: (tokenId: string) =>
      apiFetch(`/api/profile/sessions/${tokenId}`, { method: 'DELETE' }).then((res) => res.json()),
    onSuccess: () => {
      toast.success('Session terminated');
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  // 5b. Upload Avatar Mutation
  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);
      const token = localStorage.getItem('token');
      return fetch(`/api/profile/avatar/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }).then((res) => res.json());
    },
    onSuccess: (data) => {
      toast.success('Avatar uploaded successfully');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...storedUser, avatar_url: data.avatarUrl }));
      window.dispatchEvent(new Event('storage'));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 6. Terminate All Sessions Mutation
  const terminateAllSessionsMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/profile/sessions', { method: 'DELETE' }).then((res) => res.json()),
    onSuccess: () => {
      toast.success('All other sessions terminated');
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  // 7. 2FA Mutations
  const setup2FAMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/profile/2fa/setup', { method: 'POST' }).then((res) => res.json()),
    onSuccess: (data) => {
      setSetupData(data);
      setShow2FAModal(true);
    },
  });

  const verify2FAMutation = useMutation({
    mutationFn: (code: string) =>
      apiFetch('/api/profile/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        return data;
      }),
    onSuccess: () => {
      toast.success('2FA enabled successfully');
      setShow2FAModal(false);
      setTwoFactorCode('');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disable2FAMutation = useMutation({
    mutationFn: (password: string) =>
      apiFetch('/api/profile/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        return data;
      }),
    onSuccess: () => {
      toast.success('2FA disabled');
      setShowDisable2FA(false);
      setDisablePassword('');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return toast.error('Passwords do not match');
    }
    updatePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const handleUpdateAvatar = () => {
    updateAvatarMutation.mutate(avatarUrl);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadAvatarMutation.mutate(e.target.files[0]);
    }
  };

  const getFullAvatarUrl = (url?: string) => {
    if (!url) return null;
    return url; // Since it's served from the same origin/proxy
  };

  if (profileLoading)
    return <div className="p-8 text-center text-gray-500">Loading profile...</div>;

  return (
    <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('profile.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('profile.subtitle')}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-[#111827] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-700 relative">
              <label
                className="absolute -bottom-12 left-6 ring-4 ring-[#111827] rounded-full overflow-hidden w-24 h-24 bg-gray-900 flex items-center justify-center group cursor-pointer"
                title="Click to upload new avatar"
              >
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
                {user?.avatar_url ? (
                  <img
                    src={getFullAvatarUrl(user.avatar_url)!}
                    alt="Profile"
                    className="w-full h-full object-cover group-hover:opacity-50 transition-opacity"
                  />
                ) : (
                  <span className="text-3xl font-bold text-gray-400">
                    {user?.username?.[0].toUpperCase()}
                  </span>
                )}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                  <Camera size={24} className="text-white" />
                </div>
              </label>
            </div>
            <div className="pt-16 pb-6 px-6">
              <h3 className="text-xl font-bold text-white">{user?.username}</h3>
              <p className="text-sm text-gray-500 font-medium">Standard User</p>

              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <Globe size={16} />
                  <span>Language: English</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <Clock size={16} />
                  <span>
                    Joined:{' '}
                    {user?.created_at
                      ? new Date(user.created_at).toLocaleDateString()
                      : 'Loading...'}
                  </span>
                </div>
              </div>

              <div className="mt-8">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                  Avatar URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    className="flex-1 bg-[#0F172A] border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-200 outline-none focus:border-primary transition-all"
                    placeholder="https://..."
                  />
                  <button
                    onClick={handleUpdateAvatar}
                    disabled={updateAvatarMutation.isPending}
                    className="bg-primary/10 text-primary hover:bg-primary/20 p-2 rounded-xl transition-all"
                  >
                    <Camera size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2FA Card */}
          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
              <Shield size={64} className="text-orange-500" />
            </div>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Smartphone className="text-orange-500" size={20} />
              2-Factor Authentication
            </h3>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-6">
              <div className="flex gap-3">
                <AlertCircle className="text-orange-500 shrink-0" size={20} />
                <p className="text-xs text-orange-200/80 leading-relaxed">
                  {user?.two_factor_enabled
                    ? 'Your account is protected with 2FA. We recommend keeping it enabled.'
                    : 'Protect your account with an extra layer of security. We recommend enabling 2FA.'}
                </p>
              </div>
            </div>

            {user?.two_factor_enabled ? (
              <button
                onClick={() => setShowDisable2FA(true)}
                className="w-full py-3 bg-red-400/10 text-red-500 rounded-xl font-bold text-sm border border-red-400/20 hover:bg-red-400/20 transition-all flex items-center justify-center gap-2"
              >
                <ShieldOff size={16} />
                Disable 2FA
              </button>
            ) : (
              <button
                onClick={() => setup2FAMutation.mutate()}
                disabled={setup2FAMutation.isPending}
                className="w-full py-3 bg-primary/10 text-primary rounded-xl font-bold text-sm border border-primary/20 hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
              >
                <Shield size={16} />
                {setup2FAMutation.isPending ? 'Generating...' : 'Enable 2FA'}
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Security & Sessions */}
        <div className="lg:col-span-2 space-y-8">
          {/* Password Change Form */}
          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-8 shadow-xl">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Lock className="text-blue-500" size={20} />
              Security Settings
            </h3>
            <form onSubmit={handleChangePassword} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-[#0F172A] border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#0F172A] border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#0F172A] border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={updatePasswordMutation.isPending}
                  className="bg-primary hover:bg-blue-600 text-white px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>

          {/* Session Management */}
          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-8 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Clock className="text-green-500" size={20} />
                Active Sessions
              </h3>
              <span className="text-xs text-gray-500 bg-gray-800/50 px-3 py-1 rounded-full">
                {sessions.length} Devices
              </span>
            </div>

            <div className="space-y-4">
              {sessions.length === 0 ? (
                <p className="text-center py-8 text-gray-500 text-sm">No active sessions found.</p>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className="group flex items-center gap-4 p-4 rounded-xl bg-[#0F172A]/50 border border-gray-800/50 hover:border-gray-700 transition-all"
                  >
                    <div className="p-3 bg-gray-800 rounded-xl text-gray-400 group-hover:text-white transition-colors">
                      <Smartphone size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{session.device_info}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Globe size={12} /> {session.ip_address}
                        </span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs text-gray-500">
                          Last active: {new Date(session.last_active).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {user?.currentJti === session.token_id && (
                      <span className="text-[10px] font-bold bg-green-500/10 text-green-500 px-2 py-1 rounded-md border border-green-500/20 uppercase tracking-wider">
                        Current Device
                      </span>
                    )}
                    <button
                      onClick={() => terminateSessionMutation.mutate(session.token_id)}
                      className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                      title="Terminate Session"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-8 flex items-center gap-3 p-4 bg-red-400/5 border border-red-400/10 rounded-xl">
              <LogOut className="text-red-400" size={20} />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-400/80">Force Logout Everywhere</p>
                <p className="text-xs text-gray-500">
                  This will terminate all sessions except your current one.
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to log out from all other devices?')) {
                    terminateAllSessionsMutation.mutate();
                  }
                }}
                className="text-xs font-bold text-red-400 hover:underline disabled:opacity-50"
                disabled={terminateAllSessionsMutation.isPending}
              >
                Terminate All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2FA Setup Modal */}
      {show2FAModal && setupData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShow2FAModal(false)}
          ></div>
          <div className="relative bg-[#111827] border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Shield size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Setup 2-FA</h3>
                  <p className="text-sm text-gray-500">
                    Scan this QR code with your authenticator app
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl mb-6 mx-auto w-fit shadow-lg">
                <img src={setupData.qrCodeUrl} alt="QR Code" className="w-48 h-48" />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                    Or enter code manually
                  </label>
                  <div className="flex gap-2">
                    <code className="flex-1 bg-black/40 border border-gray-800 rounded-lg px-3 py-2 text-sm text-primary font-mono select-all">
                      {setupData.secret}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(setupData.secret);
                        toast.success('Secret copied to clipboard');
                      }}
                      className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg"
                    >
                      <Copy size={18} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    className="w-full bg-[#0F172A] border border-gray-800 rounded-xl px-4 py-3 text-lg font-mono text-center tracking-[0.5em] text-white outline-none focus:border-primary transition-all"
                    placeholder="000000"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    onClick={() => setShow2FAModal(false)}
                    className="flex-1 py-3 border border-gray-800 text-gray-400 rounded-xl font-bold text-sm hover:bg-gray-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => verify2FAMutation.mutate(twoFactorCode)}
                    disabled={verify2FAMutation.isPending || twoFactorCode.length < 6}
                    className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-blue-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Check size={18} />
                    Verify & Enable
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disable 2FA Modal */}
      {showDisable2FA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowDisable2FA(false)}
          ></div>
          <div className="relative bg-[#111827] border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <h3 className="text-xl font-bold text-white mb-2">
                Disable 2-Factor Authentication?
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Enter your password to confirm this action.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    className="w-full bg-[#0F172A] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-red-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    onClick={() => setShowDisable2FA(false)}
                    className="flex-1 py-3 border border-gray-800 text-gray-400 rounded-xl font-bold text-sm hover:bg-gray-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => disable2FAMutation.mutate(disablePassword)}
                    disabled={disable2FAMutation.isPending || !disablePassword}
                    className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <ShieldOff size={18} />
                    Disable 2FA
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
