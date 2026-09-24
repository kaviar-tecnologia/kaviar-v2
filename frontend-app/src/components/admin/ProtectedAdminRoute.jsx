import { Navigate, useLocation } from 'react-router-dom';

const PET_ROLES = ['PET_OPERATOR', 'PET_SUPERVISOR', 'PET_ADMIN'];
const RETIRED_ROLES = ['ANGEL_VIEWER'];

export const ProtectedAdminRoute = ({ children, requireSuperAdmin = false, allowedRoles = null }) => {
  const location = useLocation();
  const token = localStorage.getItem('kaviar_admin_token');
  const adminData = localStorage.getItem('kaviar_admin_data');

  if (!token) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  if (adminData) {
    const admin = JSON.parse(adminData);

    if (RETIRED_ROLES.includes(admin.role)) {
      localStorage.removeItem('kaviar_admin_token');
      localStorage.removeItem('kaviar_admin_data');
      return <Navigate to="/admin/login" state={{ retiredRole: true }} replace />;
    }

    const petRedirect = PET_ROLES.includes(admin.role) ? '/admin/pet' : '/admin';
    
    if (requireSuperAdmin && admin.role !== 'SUPER_ADMIN') {
      return <Navigate to={petRedirect} replace />;
    }

    if (allowedRoles && !allowedRoles.includes(admin.role)) {
      return <Navigate to={petRedirect} replace />;
    }
    
    if (admin.mustChangePassword && location.pathname !== '/admin/change-password') {
      return <Navigate to="/admin/change-password" replace />;
    }
  }

  return children;
};
