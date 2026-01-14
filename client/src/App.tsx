import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import { NotificationProvider } from './contexts/NotificationContext'
import { ConfirmDialogProvider } from './contexts/ConfirmDialogContext'

// Lazy load pages
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

const LoadingFallback = () => (
  <div className="flex h-screen w-full items-center justify-center bg-[#0F172A] text-white">
    <div className="flex flex-col items-center gap-4">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-sm text-gray-400 font-medium animate-pulse">Loading...</p>
    </div>
  </div>
)

const App = () => {
  return (
    <ConfirmDialogProvider>
      <NotificationProvider>
      <Router>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Auth Routes (No Sidebar, Prevent logged-in access) */}
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

            {/* Protected Dashboard Routes (With Sidebar, Require authentication) */}
            <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
            <Route path="/instances" element={<ProtectedRoute><Layout><Instances /></Layout></ProtectedRoute>} />
            <Route path="/instances/create" element={<ProtectedRoute><Layout><CreateInstance /></Layout></ProtectedRoute>} />
            <Route path="/instances/:id/console" element={<ProtectedRoute><Layout><Console /></Layout></ProtectedRoute>} />
            <Route path="/instances/:id/settings" element={<ProtectedRoute><Layout><ServerSettings /></Layout></ProtectedRoute>} />
            <Route path="/instances/:id/files" element={<ProtectedRoute><Layout><FileManager /></Layout></ProtectedRoute>} />
            <Route path="/console" element={<ProtectedRoute><Layout><Console /></Layout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
            <Route path="/players" element={<ProtectedRoute><Layout><Players /></Layout></ProtectedRoute>} />
            <Route path="/maps" element={<ProtectedRoute><Layout><Maps /></Layout></ProtectedRoute>} />
            <Route path="/plugins" element={<ProtectedRoute><Layout><Plugins /></Layout></ProtectedRoute>} />

            {/* Default route redirects to dashboard if logged in, otherwise login */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Catch all to Dashboard or Login based on auth */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </NotificationProvider>
    </ConfirmDialogProvider>
  )
}

export default App
