export interface User {
  username: string;
  avatar_url?: string;
  role?: string;
  fullname?: string;
  email?: string;
}

export interface Instance {
  id: number;
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'STARTING' | 'CRASHED';
  pid?: number;
  port: number;
  map?: string;
  players?: number;
  max_players?: number;
  version?: string;
}

export interface PlayerProfile {
  steam_id: string;
  name: string;
  avatar_url?: string;
  first_seen?: string;
  last_seen?: string;
  is_online?: boolean;
}

export interface LivePlayer {
  userId: string;
  name: string;
  steamId: string;
  ipAddress?: string;
  connected: string;
  ping: number;
  state: string;
  avatar?: string;
}

export interface AdminData {
  identity: string;
  flags?: string[];
  immunity?: number;
  groups?: string[];
}

export interface Backup {
  id: string;
  serverId: string | number;
  filename: string;
  size: number;
  createdAt: number;
  type: 'manual' | 'auto';
  comment?: string;
}

export interface Settings {
  steamcmd_path?: string;
  install_dir?: string;
  panel_name?: string;
  default_port?: string | number;
  auto_backup?: boolean;
  auto_plugin_updates?: boolean;
  [key: string]: any;
}
