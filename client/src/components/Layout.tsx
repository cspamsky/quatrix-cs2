import { 
  LayoutDashboard, 
  Map as MapIcon, 
  Users, 
  Puzzle, 
  Settings, 
  LogOut,
  Layers,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  Menu,
  X,
  MessageSquare
} from 'lucide-react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Logo from './Logo'


interface LayoutProps {
  children: React.ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/instances', icon: Layers, label: 'Instances' },
    { path: '/chat', icon: MessageSquare, label: 'Chat Logs' },
    { path: '/console', icon: Terminal, label: 'Server Console' },
    { path: '/maps', icon: MapIcon, label: 'Map Management' },
    { path: '/players', icon: Users, label: 'Player List' },
    { path: '/bans', icon: ShieldAlert, label: 'Ban History' },
    { path: '/plugins', icon: Puzzle, label: 'Plugins' },
    { path: '/admins', icon: ShieldCheck, label: 'Admin Management' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ]

  const user = JSON.parse(localStorage.getItem('user') || '{"username": "User"}')
  const displayName = user.username || 'User'
  
  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const getInitials = (name: string | undefined) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
  }

  // Close mobile menu when location changes
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

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
          <Logo size={24} className="text-[#1890ff]" withBackground={false} />
          <span className="text-lg font-bold text-white tracking-tight">Quatrix</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
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
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-[#001529] text-gray-400 flex flex-col border-r border-gray-800 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 shrink-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 hidden lg:flex items-center gap-3">
          <div className="bg-[#1890ff]/10 p-2 rounded-lg shrink-0">
            <Logo size={24} className="text-[#1890ff]" withBackground={false} />
          </div>
          <span className="text-lg font-bold text-white tracking-tight whitespace-nowrap">Quatrix Manager</span>
        </div>

        {/* Mobile Sidebar Header */}
        <div className="p-6 lg:hidden flex items-center justify-between border-b border-gray-800/50 mb-4">
          <div className="flex items-center gap-3">
             <Logo size={24} className="text-[#1890ff]" withBackground={false} />
             <span className="text-lg font-bold text-white tracking-tight">Quatrix</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="text-gray-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-hide" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
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
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
            <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-primary shrink-0">
              {getInitials(displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{displayName}</p>
              <p className="text-[10px] text-green-500 truncate font-bold flex items-center gap-1.5 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                Online
              </p>
            </div>
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
        {children}
      </main>
    </div>
  )
}

export default Layout
