import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Toaster } from 'react-hot-toast'
import { Oval } from 'react-loading-icons'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import { ConfirmDialogProvider } from './contexts/ConfirmDialogContext'

// Lazy load pages for code splitting
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Instances = lazy(() => import('./pages/Instances'))
const Console = lazy(() => import('./pages/Console'))
const Settings = lazy(() => import('./pages/Settings'))
const Players = lazy(() => import('./pages/Players'))
const CreateInstance = lazy(() => import('./pages/CreateInstance'))
const Plugins = lazy(() => import('./pages/Plugins'))
const Maps = lazy(() => import('./pages/Maps'))
const ServerSettings = lazy(() => import('./pages/ServerSettings'))
const FileManager = lazy(() => import('./pages/FileManager'))
const BanHistory = lazy(() => import('./pages/BanHistory'))
const Admins = lazy(() => import('./pages/Admins'))
const Chat = lazy(() => import('./pages/Chat'))

// Loading component with react-loading-icons
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#0F172A]">
    <Oval stroke="#1890ff" strokeWidth={4} speed={1} />
  </div>
)

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
})

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmDialogProvider>
      <Router>
        {/* Global Toast Notifications */}
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1E293B',
              color: '#F1F5F9',
              border: '1px solid #334155',
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#F1F5F9',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#F1F5F9',
              },
            },
          }}
        />
        
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Auth Routes (No Sidebar, Prevent logged-in access) */}
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

            {/* Protected Dashboard Routes (With Sidebar, Require authentication) */}
            <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
            <Route path="/instances" element={<ProtectedRoute><Layout><Instances /></Layout></ProtectedRoute>} />
            <Route path="/instances/create" element={<ProtectedRoute><Layout><CreateInstance /></Layout></ProtectedRoute>} />
            <Route path="/instances/:id/console" element={<ProtectedRoute><Layout><Console /></Layout></ProtectedRoute>} />
            <Route path="/console/:id" element={<ProtectedRoute><Layout><Console /></Layout></ProtectedRoute>} />
            <Route path="/instances/:id/settings" element={<ProtectedRoute><Layout><ServerSettings /></Layout></ProtectedRoute>} />
            <Route path="/instances/:id/files" element={<ProtectedRoute><Layout><FileManager /></Layout></ProtectedRoute>} />
            <Route path="/console" element={<ProtectedRoute><Layout><Console /></Layout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
            <Route path="/players" element={<ProtectedRoute><Layout><Players /></Layout></ProtectedRoute>} />
            <Route path="/bans" element={<ProtectedRoute><Layout><BanHistory /></Layout></ProtectedRoute>} />
            <Route path="/maps" element={<ProtectedRoute><Layout><Maps /></Layout></ProtectedRoute>} />
            <Route path="/plugins" element={<ProtectedRoute><Layout><Plugins /></Layout></ProtectedRoute>} />
            <Route path="/admins" element={<ProtectedRoute><Layout><Admins /></Layout></ProtectedRoute>} />
            <Route path="/chat/:id" element={<ProtectedRoute><Layout><Chat /></Layout></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute><Layout><Chat /></Layout></ProtectedRoute>} />

            {/* Default route redirects to dashboard if logged in, otherwise login */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* Catch all to Dashboard or Login based on auth */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </ConfirmDialogProvider>
    </QueryClientProvider>
  )
}

export default App
