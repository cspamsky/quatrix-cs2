import { apiFetch } from '../utils/api';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Folder,
  ArrowLeft,
  ChevronRight,
  Save,
  RefreshCw,
  FileCode,
  FileText,
  Trash2,
  FolderPlus,
  Upload,
  Search,
  Download,
  Edit2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useConfirmDialog } from '../hooks/useConfirmDialog.js';

interface FileStat {
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: string;
}

interface FileContentResponse {
  content: string;
}

const FileManager = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { showConfirm } = useConfirmDialog();
  const [files, setFiles] = useState<FileStat[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [editingFile, setEditingFile] = useState<{
    name: string;
    content: string;
    originalContent: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renamingFile, setRenamingFile] = useState<FileStat | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileStat } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles(currentPath);

    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    window.addEventListener('contextmenu', handleClick);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleClick);
    };
  }, [id, currentPath]);

  const fetchFiles = async (path: string) => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/servers/${id}/files?path=${encodeURIComponent(path)}`);
      if (response.ok) {
        const data = (await response.json()) as FileStat[];
        setFiles(data);
      } else {
        toast.error(t('file_manager.toast_load_error', 'Failed to load files'));
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
      toast.error(t('file_manager.toast_connection_error', 'Connection error'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (file: FileStat) => {
    if (file.isDirectory) {
      setCurrentPath(currentPath ? `${currentPath}/${file.name}` : file.name);
      return;
    }

    try {
      const response = await apiFetch(
        `/api/servers/${id}/files/read?path=${encodeURIComponent(currentPath ? `${currentPath}/${file.name}` : file.name)}`
      );
      if (response.ok) {
        const data = (await response.json()) as FileContentResponse;
        setEditingFile({ name: file.name, content: data.content, originalContent: data.content });
        toast.success(
          t('file_manager.toast_editing', { name: file.name, defaultValue: `Editing ${file.name}` })
        );
      } else {
        toast.error(t('file_manager.toast_read_error', 'Failed to read file'));
      }
    } catch {
      toast.error(t('file_manager.toast_connection_error', 'Connection error'));
    }
  };

  const handleSave = async () => {
    if (!editingFile) return;
    setSaving(true);
    try {
      const filePath = currentPath ? `${currentPath}/${editingFile.name}` : editingFile.name;
      const response = await apiFetch(`/api/servers/${id}/files/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: editingFile.content }),
      });
      if (response.ok) {
        setEditingFile(null);
        toast.success(t('file_manager.toast_save_success', 'File saved successfully'));
        fetchFiles(currentPath);
      } else {
        toast.error(t('file_manager.toast_save_error', 'Failed to save file'));
      }
    } catch {
      toast.error(t('file_manager.toast_connection_error', 'Connection error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (file: FileStat) => {
    const confirmed = await showConfirm({
      title: t('file_manager.delete_confirm_title', 'Delete Item'),
      message: t('file_manager.delete_confirm_msg', {
        name: file.name,
        defaultValue: `Are you sure you want to delete ${file.name}? This action cannot be undone.`,
      }),
      confirmText: t('file_manager.delete_btn', 'Delete'),
      type: 'danger',
    });

    if (confirmed) {
      try {
        const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
        const response = await apiFetch(
          `/api/servers/${id}/files?path=${encodeURIComponent(filePath)}`,
          {
            method: 'DELETE',
          }
        );
        if (response.ok) {
          toast.success(
            t('file_manager.toast_delete_success', {
              name: file.name,
              defaultValue: `${file.name} deleted`,
            })
          );
          fetchFiles(currentPath);
        } else {
          toast.error(t('file_manager.toast_delete_error', 'Failed to delete item'));
        }
      } catch {
        toast.error(t('file_manager.toast_connection_error', 'Connection error'));
      }
    }
  };

  const openRenameModal = (file: FileStat) => {
    setRenamingFile(file);
    setNewFileName(file.name);
    setIsRenameModalOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!renamingFile || !newFileName || newFileName === renamingFile.name) {
      setIsRenameModalOpen(false);
      return;
    }

    try {
      const oldPath = currentPath ? `${currentPath}/${renamingFile.name}` : renamingFile.name;
      const newPath = currentPath ? `${currentPath}/${newFileName}` : newFileName;
      const response = await apiFetch(`/api/servers/${id}/files/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath }),
      });
      if (response.ok) {
        toast.success(t('file_manager.toast_rename_success', 'Renamed successfully'));
        setIsRenameModalOpen(false);
        fetchFiles(currentPath);
      } else {
        toast.error(t('file_manager.toast_rename_error', 'Failed to rename'));
      }
    } catch {
      toast.error('Connection error');
    }
  };

  const handleDownload = async (file: FileStat) => {
    try {
      const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
      const response = await apiFetch(
        `/api/servers/${id}/files/read?path=${encodeURIComponent(filePath)}`
      );
      if (response.ok) {
        const data = (await response.json()) as FileContentResponse;
        const blob = new Blob([data.content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success(
          t('file_manager.toast_downloading', {
            name: file.name,
            defaultValue: `Downloading ${file.name}`,
          })
        );
      }
    } catch {
      toast.error(t('file_manager.toast_download_error', 'Download failed'));
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName) return;
    try {
      const dirPath = currentPath ? `${currentPath}/${newFolderName}` : newFolderName;
      const response = await apiFetch(`/api/servers/${id}/files/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      });
      if (response.ok) {
        toast.success(t('file_manager.toast_folder_created', 'Folder created'));
        setIsNewFolderModalOpen(false);
        setNewFolderName('');
        fetchFiles(currentPath);
      } else {
        toast.error(t('file_manager.toast_folder_error', 'Failed to create folder'));
      }
    } catch {
      toast.error(t('file_manager.toast_connection_error', 'Connection error'));
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(
        `/api/servers/${id}/files/upload?path=${encodeURIComponent(currentPath)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: formData,
        }
      );

      if (response.ok) {
        toast.success(
          t('file_manager.toast_upload_success', {
            name: file.name,
            defaultValue: `${file.name} uploaded successfully`,
          })
        );
        fetchFiles(currentPath);
      } else {
        toast.error(t('file_manager.toast_upload_error', 'Upload failed'));
      }
    } catch {
      toast.error(t('file_manager.toast_upload_net_error', 'Network error during upload'));
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileStat) => {
    e.preventDefault();
    e.stopPropagation();
    const y = e.clientY + 220 > window.innerHeight ? e.clientY - 220 : e.clientY;
    const x = e.clientX + 160 > window.innerWidth ? e.clientX - 160 : e.clientX;
    setContextMenu({ x, y, file });
  };

  const copyPathToClipboard = (file: FileStat) => {
    const fullPath = currentPath ? `${currentPath}/${file.name}` : file.name;
    navigator.clipboard.writeText(fullPath);
    toast.success(t('file_manager.toast_path_copied', 'Path copied to clipboard'));
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 h-full flex flex-col animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/instances')}
              className="p-1 -ml-1 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
              {t('file_manager.title', 'FILE MANAGER')}
              <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-bold tracking-widest uppercase">
                {currentPath
                  ? t('file_manager.directory', 'Directory')
                  : t('file_manager.root', 'Root')}
              </span>
            </h2>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setIsNewFolderModalOpen(true)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all border border-gray-700/50"
          >
            <FolderPlus size={16} /> {t('file_manager.new_folder', 'NEW FOLDER')}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-primary/20"
          >
            <Upload size={16} /> {t('file_manager.upload', 'UPLOAD')}
          </button>
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleUpload} />
        </div>
      </header>

      <div className="flex items-center gap-4 bg-[#111827] p-2 rounded-2xl border border-gray-800 shadow-inner mb-4">
        <div className="flex-1 flex items-center px-4 gap-2 text-sm text-gray-400">
          <button
            type="button"
            className="cursor-pointer hover:text-primary transition-all font-bold"
            onClick={() => setCurrentPath('')}
          >
            root
          </button>
          {currentPath
            .split('/')
            .filter((p) => p)
            .map((p, i, arr) => (
              <span key={i} className="flex items-center gap-2">
                <ChevronRight size={14} className="opacity-30" />
                <button
                  type="button"
                  className="cursor-pointer hover:text-white transition-all"
                  onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))}
                >
                  {p}
                </button>
              </span>
            ))}
        </div>

        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            placeholder={t('file_manager.search_placeholder', 'Search files...')}
            className="w-full bg-black/20 border border-gray-700/50 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-600 focus:border-primary outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <button
          onClick={() => fetchFiles(currentPath)}
          className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-all"
          title={t('file_manager.refresh', 'Refresh')}
        >
          <RefreshCw size={18} className={loading && !editingFile ? 'animate-spin' : ''} />
        </button>
      </div>

      <main className="flex-1 bg-[#111827] border border-gray-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative">
        {editingFile ? (
          <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 duration-300">
            <div className="bg-[#1c2537] px-6 py-4 flex justify-between items-center border-b border-gray-800">
              <div className="flex items-center gap-3">
                <FileCode className="text-primary" size={20} />
                <div>
                  <h4 className="text-white text-sm font-bold tracking-tight">
                    {editingFile.name}
                  </h4>
                  <p className="text-[10px] text-gray-500 font-mono tracking-widest">
                    {currentPath || 'root'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (editingFile.content !== editingFile.originalContent) {
                      if (
                        !confirm(
                          t(
                            'file_manager.edit.unsaved_confirm',
                            'You have unsaved changes. Discard?'
                          )
                        )
                      )
                        return;
                    }
                    setEditingFile(null);
                  }}
                  className="text-xs font-bold text-gray-400 hover:text-white px-4 py-2 rounded-xl transition-all"
                >
                  {t('file_manager.edit.discard', 'DISCARD')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
                >
                  <Save size={16} />{' '}
                  {saving
                    ? t('file_manager.edit.saving', 'SAVING...')
                    : t('file_manager.edit.save', 'SAVE CHANGES')}
                </button>
              </div>
            </div>
            <textarea
              className="flex-1 bg-black/30 text-gray-300 p-8 font-mono text-sm outline-none resize-none scrollbar-hide leading-relaxed"
              spellCheck={false}
              autoFocus
              value={editingFile.content}
              onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <table className="w-full text-left border-collapse">
              <thead className="bg-black/40 text-gray-500 text-[10px] uppercase font-black tracking-[0.2em] sticky top-0 z-10">
                <tr>
                  <th className="px-8 py-5">{t('file_manager.name', 'Name')}</th>
                  <th className="px-8 py-5">{t('file_manager.size', 'Size')}</th>
                  <th className="px-8 py-5">{t('file_manager.modified', 'Modified')}</th>
                  <th className="px-8 py-5 text-right">{t('file_manager.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/30">
                {currentPath && (
                  <tr
                    className="hover:bg-white/[0.02] cursor-pointer transition-all border-l-2 border-transparent hover:border-primary/50"
                    onClick={() => {
                      const parts = currentPath.split('/');
                      parts.pop();
                      setCurrentPath(parts.join('/'));
                    }}
                  >
                    <td
                      colSpan={4}
                      className="px-8 py-4 flex items-center gap-3 text-gray-500 font-bold text-xs italic"
                    >
                      <ArrowLeft size={14} /> {t('file_manager.go_up', '.. (Go Up)')}
                    </td>
                  </tr>
                )}
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-4 text-gray-600">
                        <RefreshCw className="w-10 h-10 animate-spin opacity-20" />
                        <span className="text-xs font-black tracking-widest">
                          {t('file_manager.loading', 'LOADING FILESYSTEM')}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-2 text-gray-600">
                        <Search className="w-10 h-10 opacity-20" />
                        <span className="text-xs font-black tracking-widest">
                          {searchTerm
                            ? t('file_manager.no_results', 'NO FILES MATCH SEARCH')
                            : t('file_manager.empty', 'DIRECTORY IS EMPTY')}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((file, i) => (
                    <tr
                      key={i}
                      className={`hover:bg-white/[0.03] cursor-pointer group transition-all border-l-4 border-transparent hover:border-primary group ${contextMenu?.file.name === file.name ? 'bg-primary/5 border-primary' : ''}`}
                      onClick={() => handleEdit(file)}
                      onContextMenu={(e) => handleContextMenu(e, file)}
                    >
                      <td className="px-8 py-4 flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-gray-900/50 group-hover:bg-gray-800 transition-all border border-gray-800/50">
                          {file.isDirectory ? (
                            <Folder className="text-amber-500 w-5 h-5 fill-amber-500/10" />
                          ) : file.name.endsWith('.cfg') ||
                            file.name.endsWith('.json') ||
                            file.name.endsWith('.ini') ? (
                            <FileCode className="text-primary w-5 h-5" />
                          ) : (
                            <FileText className="text-gray-400 w-5 h-5" />
                          )}
                        </div>
                        <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-all">
                          {file.name}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-xs font-mono text-gray-500 tracking-tighter">
                        {file.isDirectory ? '-' : formatSize(file.size)}
                      </td>
                      <td className="px-8 py-4 text-xs text-gray-600 font-medium">
                        {new Date(file.mtime).toLocaleString()}
                      </td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRenameModal(file);
                            }}
                            title="Rename"
                          >
                            <Edit2 size={14} />
                          </button>
                          {!file.isDirectory && (
                            <button
                              className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(file);
                              }}
                              title="Download"
                            >
                              <Download size={14} />
                            </button>
                          )}
                          <button
                            className="p-2 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(file);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* New Folder Modal */}
        {isNewFolderModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setIsNewFolderModalOpen(false)}
            ></div>
            <div className="relative bg-[#111827] border border-gray-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-black text-white mb-6 tracking-tighter uppercase">
                {t('file_manager.modals.new_dir_title', 'NEW DIRECTORY')}
              </h3>
              <div className="space-y-4">
                <input
                  type="text"
                  autoFocus
                  placeholder={t('file_manager.modals.folder_name', 'Folder Name')}
                  className="w-full bg-black/40 border border-gray-700 rounded-2xl px-6 py-4 text-white focus:border-primary outline-none transition-all font-bold"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                />
                <button
                  onClick={handleCreateFolder}
                  className="w-full py-4 bg-primary hover:bg-blue-600 text-white rounded-2xl font-black tracking-widest text-xs transition-all shadow-lg shadow-primary/20"
                >
                  {t('file_manager.modals.create', 'CREATE FOLDER')}
                </button>
                <button
                  onClick={() => setIsNewFolderModalOpen(false)}
                  className="w-full py-4 bg-transparent text-gray-500 hover:text-white font-bold text-xs"
                >
                  {t('file_manager.modals.cancel', 'CANCEL')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rename Modal */}
        {isRenameModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setIsRenameModalOpen(false)}
            ></div>
            <div className="relative bg-[#111827] border border-gray-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-black text-white mb-6 tracking-tighter uppercase text-center">
                {t('file_manager.modals.rename_title', 'RENAME ITEM')}
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-gray-900/50 rounded-2xl border border-gray-800 mb-2">
                  <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-1">
                    {t('file_manager.modals.old_name', 'Old Name')}
                  </p>
                  <p className="text-sm text-gray-400 font-mono truncate">{renamingFile?.name}</p>
                </div>
                <input
                  type="text"
                  autoFocus
                  placeholder={t('file_manager.modals.new_name', 'New Name')}
                  className="w-full bg-black/40 border border-gray-700 rounded-2xl px-6 py-4 text-white focus:border-primary outline-none transition-all font-bold"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
                />
                <button
                  onClick={handleRenameSubmit}
                  className="w-full py-4 bg-primary hover:bg-blue-600 text-white rounded-2xl font-black tracking-widest text-xs transition-all shadow-lg shadow-primary/20"
                >
                  {t('file_manager.modals.rename_btn', 'RENAME ITEM')}
                </button>
                <button
                  onClick={() => setIsRenameModalOpen(false)}
                  className="w-full py-4 bg-transparent text-gray-500 hover:text-white font-bold text-xs"
                >
                  {t('file_manager.modals.cancel', 'CANCEL')}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-4 flex justify-between items-center text-[10px] font-black text-gray-600 tracking-[0.3em] uppercase">
        <div>QUATRIX FILE SYSTEM V2</div>
        <div className="flex gap-4">
          <span>{files.length} ITEMS</span>
          <span className="text-primary/50">ENCRYPTED TRANSFER</span>
        </div>
      </footer>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[999] bg-[#1a2233]/95 backdrop-blur-xl border border-gray-700/50 rounded-xl shadow-2xl overflow-hidden min-w-[180px] animate-in fade-in zoom-in-95 duration-100 py-1.5"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-2 border-b border-gray-800/50 mb-1">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest truncate max-w-[140px]">
              {contextMenu.file.name}
            </p>
          </div>

          <button
            onClick={() => {
              handleEdit(contextMenu.file);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-gray-300 hover:text-white hover:bg-primary transition-all text-left"
          >
            {contextMenu.file.isDirectory ? <ExternalLink size={14} /> : <Edit2 size={14} />}
            {contextMenu.file.isDirectory
              ? t('file_manager.ctx.open_folder', 'OPEN FOLDER')
              : t('file_manager.ctx.edit_file', 'EDIT FILE')}
          </button>

          <button
            onClick={() => {
              openRenameModal(contextMenu.file);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-gray-300 hover:text-white hover:bg-gray-800 transition-all text-left"
          >
            <RefreshCw size={14} /> {t('file_manager.ctx.rename', 'RENAME')}
          </button>

          {!contextMenu.file.isDirectory && (
            <button
              onClick={() => {
                handleDownload(contextMenu.file);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-gray-300 hover:text-white hover:bg-gray-800 transition-all text-left"
            >
              <Download size={14} /> {t('file_manager.ctx.download', 'DOWNLOAD')}
            </button>
          )}

          <button
            onClick={() => {
              copyPathToClipboard(contextMenu.file);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-gray-300 hover:text-white hover:bg-gray-800 transition-all text-left"
          >
            <Copy size={14} /> {t('file_manager.ctx.copy_path', 'COPY PATH')}
          </button>

          <div className="h-px bg-gray-800/50 my-1 mx-2" />

          <button
            onClick={() => {
              handleDelete(contextMenu.file);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-red-500 hover:text-white hover:bg-red-500 transition-all text-left"
          >
            <Trash2 size={14} /> {t('file_manager.ctx.delete', 'DELETE')}
          </button>
        </div>
      )}
    </div>
  );
};

export default FileManager;
