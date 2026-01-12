import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Server, UserPlus, User, Lock, Eye, EyeOff } from 'lucide-react'

const Register = () => {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    setLoading(true)
    try {
      const response = await fetch('http://localhost:3001/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed')
      }

      // Success
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0F172A] relative overflow-hidden font-display">
      {/* Background decor */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-xl mb-4 shadow-lg shadow-primary/20 text-white">
            <Server size={36} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">CS2 Manager</h1>
          <p className="text-gray-400 mt-1">Server Administration Panel</p>
        </div>

        <div className="bg-[#111827] border border-gray-800/50 rounded-2xl p-8 shadow-2xl">
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-white">Create Account</h2>
            <p className="text-sm text-gray-400">Join the community and manage your servers.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="username">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User size={18} className="text-gray-500" />
                </div>
                <input 
                  className="w-full bg-[#0F172A]/50 border border-gray-700 text-white rounded-xl pl-11 pr-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-500 text-sm" 
                  id="username" 
                  placeholder="johndoe" 
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="password">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-500" />
                </div>
                <input 
                  className="w-full bg-[#0F172A]/50 border border-gray-700 text-white rounded-xl pl-11 pr-12 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-500 text-sm"
                  id="password" 
                  placeholder="••••••••" 
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-gray-300"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="flex items-start pt-2">
              <div className="flex items-center h-5">
                <input className="w-4 h-4 text-primary focus:ring-primary border-gray-700 rounded bg-[#0F172A]" id="terms" type="checkbox" required />
              </div>
              <label className="ml-2 text-sm text-gray-400" htmlFor="terms">
                I agree to the <a className="text-primary hover:text-primary/80 transition-colors" href="#">Terms and Conditions</a>
              </label>
            </div>

            <button 
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-primary/10 mt-2 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]" 
              type="submit"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <UserPlus size={18} />
                  Sign Up
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-800 text-center">
            <p className="text-sm text-gray-400">
              Already have an account? {" "}
              <button 
                onClick={() => navigate('/login')} 
                className="text-primary font-medium hover:text-primary/80 transition-colors"
                type="button"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
