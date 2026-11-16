import { Alert, Box, Button, Chip, Container, Typography } from '@mui/material';

export default function ExecutiveHome() {
  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;
  const firstName = admin?.name?.split(' ')?.[0] || 'Executiva';

  const handleLogout = () => {
    localStorage.removeItem('kaviar_admin_token');
    localStorage.removeItem('kaviar_admin_data');
    window.location.href = '/admin/login';
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F7F6F2', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
          <Box>
            <Typography sx={{ color: '#B8942E', fontWeight: 800, letterSpacing: 1, fontSize: 14 }}>
              KAVIAR
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#1A1A1A', mt: 0.5 }}>
              Olá, {firstName}
            </Typography>
            <Chip label="Sócia Executiva" size="small" sx={{ mt: 1, bgcolor: 'rgba(184,148,46,0.10)', color: '#8A6D18', fontWeight: 700 }} />
          </Box>
          <Button size="small" onClick={handleLogout} sx={{ color: '#6B7280' }}>Sair</Button>
        </Box>
        <Alert severity="info">
          O Chat KAVIAR e suas consultas rápidas estão disponíveis apenas para a Central e o Financeiro.
        </Alert>
      </Container>
    </Box>
  );
}
