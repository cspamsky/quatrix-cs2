import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';

/**
 * Middleware to authorize users based on specific permissions.
 * @param requiredPermission The specific permission string required (e.g., 'servers.create')
 */
export const authorize = (requiredPermission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const permissions = authReq.user.permissions || [];

    // Root permission '*' bypasses all checks
    if (permissions.includes('*') || permissions.includes(requiredPermission)) {
      return next();
    }

    return res.status(403).json({
      message: 'Forbidden: You do not have the required permission',
      requiredPermission,
    });
  };
};
