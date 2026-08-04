import { Box, Typography, Button, Paper, Divider } from '@mui/material';
import { useAccountantAuth } from '../../auth/AccountantAuthContext';

export default function AccountantHomePage() {
  const { accountant, logout } = useAccountantAuth();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F5F5F5', p: 3 }}>
      <Paper sx={{ maxWidth: 600, mx: 'auto', p: 4 }}>
        <Typography variant="h5" sx={{ color: '#B8942E', fontWeight: 700 }}>Portal do Contador KAVIAR</Typography>
        <Divider sx={{ my: 2 }} />
        {accountant && (
          <>
            <Typography><strong>Nome:</strong> {accountant.nome_completo || accountant.name}</Typography>
            <Typography><strong>Email:</strong> {accountant.email}</Typography>
          </>
        )}
        <Typography color="text.secondary" sx={{ mt: 2 }}>O portal documental será implementado nas próximas frentes.</Typography>
        <Button variant="outlined" color="error" sx={{ mt: 3 }} onClick={logout}>Sair</Button>
      </Paper>
    </Box>
  );
}
