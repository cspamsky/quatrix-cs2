import { apiFetch } from '../utils/api'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  Folder, 
  ArrowLeft, 
  ChevronRight, 
  Save, 
  RefreshCw,
  FileCode,
  FileText,
  MoreVertical,
  X
} from 'lucide-react'

interface FileStat {
  name: string
  isDirectory: boolean
  size: number
  mtime: string
}

const FileManager = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [files, setFiles] = useState<FileStat[]>([])
  const [currentPath, setCurrentPath] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [editingFile, setEditingFile] = useState<{name: string, content: string} | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchFiles(currentPath)
  }, [id, currentPath])

  const fetchFiles = async (path: string) => {
    setLoading(true)
    try {
      const response = await apiFetch(`http://localhost:3001/api/servers/${id}/files?path=${encodeURIComponent(path)}`)
      if (response.ok) {
        const data = await response.json()
        setFiles(data)
      }
    } catch (error) {
      console.error('Failed to fetch files:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = async (file: FileStat) => {
    if (file.isDirectory) {
      setCurrentPath(currentPath ? `${currentPath}/${file.name}` : file.name)
      return
    }

    try {
      const response = await apiFetch(`http://localhost:3001/api/servers/${id}/files/read?path=${encodeURIComponent(currentPath ? `${currentPath}/${file.name}` : file.name)}`)
      if (response.ok) {
        const data = await response.json()
        setEditingFile({ name: file.name, content: data.content })
      }
    } catch {
      alert('Failed to read file')
    }
  }

  const handleSave = async () => {
    if (!editingFile) return
    setSaving(true)
    try {
      const filePath = currentPath ? `${currentPath}/${editingFile.name}` : editingFile.name
      const response = await apiFetch(`http://localhost:3001/api/servers/${id}/files/write`, {
        method: 'POST',
        body: JSON.stringify({ path: filePath, content: editingFile.content })
      })
      if (response.ok) {
        setEditingFile(null)
        fetchFiles(currentPath)
      } else {
        alert('Failed to save file')
      }
    } catch {
      alert('Connection error')
    } finally {
      setSaving(false)
    }
  }

  const navigateUp = () => {
    const parts = currentPath.split('/')
    parts.pop()
    setCurrentPath(parts.join('/'))
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <button
            onClick={() => navigate('/instances')}
            className="flex items-center text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Instances
          </button>
          <h2 className="text-2xl font-bold text-white tracking-tight">File Manager</h2>
          <div className="flex items-center text-sm text-gray-400 mt-2 gap-2">
            <button
              type="button"
              className="cursor-pointer hover:text-primary transition-all bg-transparent border-0 p-0"
              onClick={() => setCurrentPath('')}
              aria-label="Root directory"
            >
              root
            </button>
            {currentPath.split('/').filter(p => p).map((p, i, arr) => (
              <span key={i} className="flex items-center gap-2">
                <ChevronRight size={14} className="opacity-50" />
                <button
                  type="button"
                  className="cursor-pointer hover:text-primary transition-all bg-transparent border-0 p-0"
                  onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))}
                  aria-label={`Go to ${p}`}
                >
                  {p}
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
           {currentPath && (
             <button 
               onClick={navigateUp}
               className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm transition-all"
             >
               Go Up
             </button>
           )}
           <button 
             onClick={() => fetchFiles(currentPath)}
             className="bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-xl transition-all"
             aria-label="Refresh files"
           >
             <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
           </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 bg-[#111827] border border-gray-800 rounded-xl overflow-hidden flex flex-col">
        {editingFile ? (
          <div className="flex-1 flex flex-col">
            <div className="bg-[#1c2537] px-4 py-3 flex justify-between items-center border-b border-gray-800">
              <span className="text-sm font-mono text-white">{editingFile.name}</span>
              <div className="flex gap-4">
                <button 
                  onClick={() => setEditingFile(null)}
                  className="text-gray-400 hover:text-white transition-all"
                  aria-label="Close editor"
                >
                  <X size={18} />
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-4 py-1.5 rounded text-xs font-bold transition-all disabled:opacity-50"
                 >
                  <Save size={14} /> {saving ? 'SAVING...' : 'SAVE CHANGES'}
                </button>
              </div>
            </div>
            <textarea 
              className="flex-1 bg-black/20 text-gray-300 p-6 font-mono text-sm outline-none resize-none custom-scrollbar"
              spellCheck={false}
              value={editingFile.content}
              onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-black/20 text-gray-400 text-[10px] uppercase font-bold tracking-widest sticky top-0">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Size</th>
                  <th className="px-6 py-4">Modified</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center text-gray-500">Loading files...</td>
                  </tr>
                ) : files.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center text-gray-500">No files found here.</td>
                  </tr>
                ) : files.map((file, i) => (
                  <tr 
                    key={i} 
                    className="hover:bg-white/[0.02] cursor-pointer group transition-all"
                    onClick={() => handleEdit(file)}
                  >
                    <td className="px-6 py-4 flex items-center gap-3">
                      {file.isDirectory ? (
                        <Folder className="text-amber-500 w-5 h-5" />
                      ) : file.name.endsWith('.cfg') || file.name.endsWith('.json') ? (
                        <FileCode className="text-blue-500 w-5 h-5" />
                      ) : (
                        <FileText className="text-gray-500 w-5 h-5" />
                      )}
                      <span className="text-sm font-medium text-gray-300 group-hover:text-primary transition-all">{file.name}</span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">{file.isDirectory ? '-' : formatSize(file.size)}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {new Date(file.mtime).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        className="text-gray-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                        aria-label="More options"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default FileManager
