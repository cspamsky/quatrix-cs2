import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Layout from './components/Layout'
import Instances from './pages/Instances'
import Console from './pages/Console'
import Settings from './pages/Settings'
import Players from './pages/Players'
import CreateInstance from './pages/CreateInstance'
import Plugins from './pages/Plugins'
import Maps from './pages/Maps'
import ServerSettings from './pages/ServerSettings'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'

const App = () => {
  return (
    <Router>
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
    </Router>
  )
}

export default App
