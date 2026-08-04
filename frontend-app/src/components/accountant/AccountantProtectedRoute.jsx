import { Navigate, useLocation } from 'react-router-dom';
import { CircularProgress, Box, Typography, Paper } from '@mui/material';
import { useAccountantAuth, ACCOUNTANT_AUTH_STATUS } from '../../auth/AccountantAuthContext';

export default function AccountantProtectedRoute({ children }) {
  const { status, error } = useAccountantAuth();
  const location = useLocation();

  if (status === ACCOUNTANT_AUTH_STATUS.BOOTSTRAPPING) {
    return <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <CircularProgress />
      <Typography sx={{ mt: 2 }} color="text.secondary">Carregando sessão...</Typography>
    </Box>;
  }

  if (status === ACCOUNTANT_AUTH_STATUS.ANONYMOUS) {
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/contador/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  if (status === ACCOUNTANT_AUTH_STATUS.FORBIDDEN) {
    return <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Paper sx={{ p: 4, maxWidth: 400, textAlign: 'center' }}>
        <Typography variant="h6" color="error">Acesso indisponível</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>{error || 'Sua conta não possui vínculos ativos.'}</Typography>
      </Paper>
    </Box>;
  }

  if (status === ACCOUNTANT_AUTH_STATUS.LOCKED) {
    return <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Paper sx={{ p: 4, maxWidth: 400, textAlign: 'center' }}>
        <Typography variant="h6" color="warning.main">Conta bloqueada</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>{error || 'Sua conta está temporariamente bloqueada. Tente novamente em alguns minutos.'}</Typography>
      </Paper>
    </Box>;
  }

  return children;
}
