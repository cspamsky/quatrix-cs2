import {
  LayoutDashboard,
  Map as MapIcon,
  Users,
  UserCog,
  Puzzle,
  Settings,
  LogOut,
  Layers,
  Terminal,
  ShieldCheck,
  Menu,
  X,
  MessageSquare,
  Database,
  Globe,
  Archive,
  Activity,
} from 'lucide-react';
import { useNavigate, useLocation, Link, Outlet } from 'react-router-dom';
import { useState, useEffect, Suspense } from 'react';
import { Oval } from 'react-loading-icons';
import { useTranslation } from 'react-i18next';
import type { User } from '../types';

const Layout = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [user, setUser] = useState<User>(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : { username: 'User' };
    } catch {
      return { username: 'User' };
    }
  });

  const displayName = user?.username || 'User';

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { path: '/instances', icon: Layers, label: t('nav.instances') },
    { path: '/chat', icon: MessageSquare, label: t('nav.chat') },
    { path: '/console', icon: Terminal, label: t('nav.console') },
    {
      path: '/maps',
      icon: MapIcon,
      label: t('nav.maps'),
    },
    {
      path: '/players',
      icon: Users,
      label: t('nav.players'),
    },
    {
      path: '/plugins',
      icon: Puzzle,
      label: t('nav.plugins'),
    },
    { path: '/admins', icon: ShieldCheck, label: t('nav.admins') },
    {
      path: '/database',
      icon: Database,
      label: t('nav.database'),
    },
    {
      path: '/analytics',
      icon: Activity,
      label: t('nav.analytics'),
    },
    {
      path: '/users',
      icon: UserCog,
      label: t('nav.users'),
    },
    { path: '/backups', icon: Archive, label: t('nav.backups') },
    { path: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  const filteredNavItems = navItems.filter((item: any) => {
    // Users with '*' (root) see everything
    if (user?.permissions?.includes('*')) return true;

    // If item has no restrictions, show it
    if (!item.permission) return true;

    // check if specific permission is allowed
    return user?.permissions && user.permissions.includes(item.permission);
  });

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem('user');
        const updatedUser = stored ? JSON.parse(stored) : { username: 'User' };
        setUser(updatedUser);
      } catch {
        setUser({ username: 'User' });
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const [avatarError, setAvatarError] = useState(false);

  const getInitials = (name: string | undefined) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Close mobile menu when location changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0F172A] text-gray-100 font-display flex-col lg:flex-row">
      {/* Skip Navigation Link - Accessibility for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#1890ff] focus:text-white focus:rounded-lg focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between p-4 bg-[#001529] border-b border-gray-800 z-50">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Quatrix Logo" className="w-8 h-8" />
          <span className="text-lg font-bold text-white tracking-tight">Quatrix</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Backdrop for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-[#001529] text-gray-400 flex flex-col border-r border-gray-800 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 shrink-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
      >
        <div className="p-6 hidden lg:flex items-center gap-3">
          <div className="shrink-0">
            <img src="/logo.png" alt="Quatrix Logo" className="w-10 h-10" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight whitespace-nowrap">
            Quatrix Manager
          </span>
        </div>

        {/* Mobile Sidebar Header */}
        <div className="p-6 lg:hidden flex items-center justify-between border-b border-gray-800/50 mb-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Quatrix Logo" className="w-8 h-8" />
            <span className="text-lg font-bold text-white tracking-tight">Quatrix</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-gray-500 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <nav
          className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-hide"
          aria-label="Main navigation"
        >
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-[#1890ff] text-white shadow-lg shadow-blue-500/20'
                    : 'hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon size={20} aria-hidden="true" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-2 border-t border-gray-800">
          <div className="flex items-center justify-between px-2 py-1 bg-white/5 rounded-lg border border-white/5 mb-2">
            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <Globe size={12} />
              <span>Language</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => i18n.changeLanguage('tr')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${i18n.language.startsWith('tr') ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
              >
                TR
              </button>
              <button
                onClick={() => i18n.changeLanguage('en')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${i18n.language.startsWith('en') ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
            <Link to="/profile" className="flex items-center gap-3 flex-1 min-w-0 group">
              <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-primary shrink-0 group-hover:border-primary/60 transition-colors overflow-hidden">
                {user?.avatar_url && !avatarError ? (
                  <img
                    src={user.avatar_url}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  getInitials(displayName)
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-white truncate group-hover:text-primary transition-colors">
                  {displayName}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-green-500 truncate font-bold flex items-center gap-1.5 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    {t('common.online')}
                  </p>
                </div>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-red-400 transition-colors p-1.5 hover:bg-red-400/10 rounded-lg"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 overflow-y-auto scrollbar-hide">
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center p-12">
              <Oval stroke="#1890ff" strokeWidth={4} speed={1} />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

export default Layout;
