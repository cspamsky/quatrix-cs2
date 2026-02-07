import { useState, useEffect } from 'react';
import { User, Lock, Eye, EyeOff, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [require2FA, setRequire2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we already have a valid session
    if (localStorage.getItem('token')) {
      navigate('/dashboard');
    }

    // Load remembered identity on mount
    const savedIdentity = localStorage.getItem('remembered_identity');
    if (savedIdentity) {
      setIdentity(savedIdentity);
      setRememberMe(true);
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ identity, password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed');

      if (data.require_2fa) {
        setRequire2FA(true);
        setTempToken(data.temp_token);
        setLoading(false);
        return;
      }

      // Remember Me logic
      if (rememberMe) {
        localStorage.setItem('remembered_identity', identity);
      } else {
        localStorage.removeItem('remembered_identity');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiFetch('/api/login/2fa', {
        method: 'POST',
        body: JSON.stringify({ temp_token: tempToken, code: twoFactorCode }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Verification failed');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0F172A] relative overflow-hidden font-display">
      {/* Background decor */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="Quatrix Logo" className="w-24 h-24" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Quatrix Manager</h1>

          <p className="text-gray-400 mt-2">Manage your competitive battlefield with ease</p>
        </div>

        <div className="bg-[#111827] border border-gray-800/50 rounded-2xl shadow-xl p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white">Welcome back</h2>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {!require2FA ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label
                  className="block text-sm font-medium text-gray-300 mb-1.5"
                  htmlFor="identity"
                >
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User size={18} className="text-gray-500" />
                  </div>
                  <input
                    className="block w-full pl-11 pr-4 py-2.5 bg-[#0F172A]/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-sm"
                    id="identity"
                    placeholder="Username"
                    required
                    type="text"
                    value={identity}
                    onChange={(e) => setIdentity(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-gray-300 mb-1.5"
                  htmlFor="password"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock size={18} className="text-gray-500" />
                  </div>
                  <input
                    className="block w-full pl-11 pr-12 py-2.5 bg-[#0F172A]/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-sm"
                    id="password"
                    placeholder="••••••••"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-gray-300"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-700 rounded bg-[#0F172A]"
                    id="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <label
                    className="ml-2 block text-sm text-gray-300 cursor-pointer"
                    htmlFor="remember-me"
                  >
                    Remember Me
                  </label>
                </div>
                <div className="text-sm">
                  <a
                    className="font-medium text-primary hover:text-primary/80 transition-colors"
                    href="#"
                  >
                    Forgot Password?
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-2">
                <button
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  type="submit"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <LogIn size={18} />
                      Sign In
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handle2FAVerify} className="space-y-6">
              <div className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4">
                  <LogIn size={24} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Two-Factor Authentication</h3>
                <p className="text-sm text-gray-400">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  className="w-full bg-[#0F172A] border border-gray-700 rounded-xl px-4 py-4 text-2xl font-mono text-center tracking-[0.5em] text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                  placeholder="000000"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  disabled={loading || twoFactorCode.length < 6}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all active:scale-[0.98] disabled:opacity-50"
                  type="submit"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    'Verify & Sign In'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setRequire2FA(false)}
                  className="text-sm text-gray-400 hover:text-white transition-colors py-2"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}
          <div className="mt-8 pt-6 border-t border-gray-800 text-center">
            <p className="text-sm text-gray-400">
              Don't have an account?{' '}
              <button
                onClick={() => navigate('/register')}
                className="font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                Create an account
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
