import { 
  LayoutDashboard, 
  Map as MapIcon, 
  Users, 
  Puzzle, 
  Settings, 
  LogOut,
  Layers,
  Terminal
} from 'lucide-react'
import { useNavigate, useLocation, Link } from 'react-router-dom'

interface LayoutProps {
  children: React.ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/instances', icon: Layers, label: 'Instances' },
    { path: '/console', icon: Terminal, label: 'Server Console' },
    { path: '/maps', icon: MapIcon, label: 'Map Management' },
    { path: '/players', icon: Users, label: 'Player List' },
    { path: '/plugins', icon: Puzzle, label: 'Plugins' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ]

  const user = JSON.parse(localStorage.getItem('user') || '{"username": "User"}')
  const displayName = user.fullname || user.username || 'User'
  
  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const getInitials = (name: string | undefined) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0F172A] text-gray-100 font-display">
      {/* Sidebar */}
      <aside className="w-60 bg-[#001529] text-gray-400 flex flex-col border-r border-gray-800 shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-[#1890ff] p-2 rounded-lg">
            <LayoutDashboard className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">CS2 Manager</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive 
                    ? 'bg-[#1890ff] text-white shadow-lg shadow-blue-500/20' 
                    : 'hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
            <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-primary">
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
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

export default Layout
