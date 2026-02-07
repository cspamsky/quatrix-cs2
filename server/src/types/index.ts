import type { Request } from 'express';

export interface User {
  id: number;
  username: string;
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
  autoSync?: boolean;
}
