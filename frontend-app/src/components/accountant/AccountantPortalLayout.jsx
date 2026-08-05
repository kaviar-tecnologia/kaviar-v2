import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, Divider, Button, Avatar } from '@mui/material';
import { Dashboard, Business, Description, CalendarMonth, Assignment, Assessment, Person, Logout, VpnKey, Gavel } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccountantAuth } from '../../auth/AccountantAuthContext';

const DRAWER_WIDTH = 240;

const menuItems = [
  { label: 'Dashboard', icon: <Dashboard />, path: '/contador' },
  { label: 'Empresas', icon: <Business />, path: '/contador/empresas' },
  { label: 'Documentos', icon: <Description />, path: '/contador/documentos' },
  { label: 'Certificados', icon: <VpnKey />, path: '/contador/certificados' },
  { label: 'Procurações', icon: <Gavel />, path: '/contador/procuracoes' },
  { label: 'Competências', icon: <CalendarMonth />, path: '/contador/competencias' },
  { label: 'Pendências', icon: <Assignment />, path: '/contador/pendencias' },
  { label: 'Relatórios', icon: <Assessment />, path: '/contador/relatorios' },
  { label: 'Meu Perfil', icon: <Person />, path: '/contador/perfil' },
];

export default function AccountantPortalLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { accountant, logout } = useAccountantAuth();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#0F1419' }}>
      {/* Sidebar */}
      <Drawer variant="permanent" sx={{
        width: DRAWER_WIDTH,
        '& .MuiDrawer-paper': { width: DRAWER_WIDTH, bgcolor: '#1A1F2E', borderRight: '1px solid rgba(212,175,55,0.15)' },
      }}>
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography sx={{ color: '#D4AF37', fontWeight: 700, fontSize: 20, letterSpacing: '0.1em' }}>KAVIAR</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Portal do Contador</Typography>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: '#D4AF37', fontSize: 14 }}>
              {accountant?.nome_completo?.charAt(0)?.toUpperCase() || 'C'}
            </Avatar>
            <Box>
              <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{accountant?.nome_completo || 'Contador'}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{accountant?.email || ''}</Typography>
            </Box>
          </Box>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
        <List sx={{ flex: 1, px: 1 }}>
          {menuItems.map(item => (
            <ListItemButton
              key={item.path}
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              sx={{
                borderRadius: 1, mb: 0.5,
                color: location.pathname === item.path ? '#D4AF37' : 'rgba(255,255,255,0.7)',
                '&.Mui-selected': { bgcolor: 'rgba(212,175,55,0.1)' },
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13 }} />
            </ListItemButton>
          ))}
        </List>
        <Box sx={{ p: 2 }}>
          <Button fullWidth variant="outlined" startIcon={<Logout />} onClick={logout}
            sx={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.15)', fontSize: 12, '&:hover': { borderColor: '#D4AF37', color: '#D4AF37' } }}>
            Sair
          </Button>
        </Box>
      </Drawer>

      {/* Main content */}
      <Box sx={{ flex: 1, p: 3, ml: `${DRAWER_WIDTH}px` }}>
        {children}
      </Box>
    </Box>
  );
}
