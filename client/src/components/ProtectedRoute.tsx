import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
}

const ProtectedRoute = ({ children, requiredPermission }: ProtectedRouteProps) => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  if (!token || !userStr) {
    return <Navigate to="/login" replace />;
  }

  try {
    const user = JSON.parse(userStr);

    if (requiredPermission) {
      const permissions = user.permissions || [];
      const hasPermission = permissions.includes('*') || permissions.includes(requiredPermission);

      if (!hasPermission) {
        return <Navigate to="/dashboard" replace />;
      }
    }
  } catch (error) {
    console.error('Error parsing user from localStorage', error);
    localStorage.clear();
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
