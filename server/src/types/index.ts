import type { Request } from 'express';

export interface User {
  id: number;
  username: string;
  permissions?: string[];
  jti?: string;
  iat?: number;
  exp?: number;
}

export type AuthenticatedRequest = Request & {
  user: User;
};

export interface Settings {
  [key: string]: string | number | null;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

export interface DatabaseCredentials {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
}

export interface Server {
  id: number;
  name: string;
  port: number;
  status: string;
  map: string;
  max_players: number;
  current_players?: number;
  rcon_password: string;
  rcon_port?: number;
  password?: string | null;
  gslt_token?: string | null;
  steam_api_key?: string | null;
  vac_enabled: number;
  game_type: number;
  game_mode: number;
  tickrate: number;
  game_alias?: string | null;
  hibernate: number;
  validate_files: number;
  additional_args?: string | null;
  cpu_priority: number;
  ram_limit: number;
  is_installed: number;
  user_id: number;
  ip?: string;
  settings?: string;
  region?: number;
  auto_start?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DashboardStats {
  totalServers: number;
  activeServers: number;
  maps: number;
  onlinePlayers: number;
  totalCapacity: number;
}

export interface UpdateServerBody {
  name: string;
  map: string;
  max_players: number;
  port: number;
  password?: string | null;
  rcon_password: string;
  vac_enabled: number;
  gslt_token?: string | null;
  steam_api_key?: string | null;
  game_type: number;
  game_mode: number;
  tickrate: number;
  game_alias?: string | null;
  hibernate: number;
  validate_files: number;
  additional_args?: string | null;
  cpu_priority: number;
  ram_limit: number;
}
