import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Grid, Chip, Button, Skeleton, Divider } from '@mui/material';
import { Business, Assignment, CalendarMonth, Schedule, ArrowForward, Warning } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const cardStyle = { bgcolor: '#1A1F2E', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 2, height: '100%' };

export default function AccountantHomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    accountantApi.get('/api/accountant/portal/dashboard')
      .then(res => setData(res.data?.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <AccountantPortalLayout>
      <Skeleton variant="rectangular" height={60} sx={{ bgcolor: '#1A1F2E', borderRadius: 2, mb: 2 }} />
      <Grid container spacing={2}>
        {[1,2,3,4].map(i => <Grid item xs={12} sm={6} md={3} key={i}><Skeleton variant="rectangular" height={100} sx={{ bgcolor: '#1A1F2E', borderRadius: 2 }} /></Grid>)}
      </Grid>
    </AccountantPortalLayout>
  );

  const now = new Date();
  const currentMonth = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const cards = [
    { icon: <Business sx={{ color: '#D4AF37', fontSize: 28 }} />, label: 'Empresas', value: data?.entities?.length || 0, sub: 'vinculadas' },
    { icon: <Assignment sx={{ color: '#F59E0B', fontSize: 28 }} />, label: 'Pendências', value: data?.pendingDocuments || 0, sub: 'a resolver' },
    { icon: <CalendarMonth sx={{ color: '#10B981', fontSize: 28 }} />, label: 'Competência', value: data?.currentPeriod || '-', sub: currentMonth },
    { icon: <Schedule sx={{ color: '#6366F1', fontSize: 28 }} />, label: 'Último acesso', value: formatDate(data?.accountant?.last_login_at), sub: '' },
  ];

  const actions = [
    { label: 'Ver empresas', path: '/contador/empresas', desc: 'Consultar empresas vinculadas' },
    { label: 'Ver documentos', path: '/contador/documentos', desc: 'Acompanhar saúde fiscal' },
    { label: 'Ver competências', path: '/contador/competencias', desc: 'Timeline de obrigações' },
    { label: 'Ver pendências', path: '/contador/pendencias', desc: 'Tarefas a resolver' },
  ];

  return (
    <AccountantPortalLayout>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
          {getGreeting()}, {data?.accountant?.nome_completo?.split(' ')[0] || 'Contador'}
        </Typography>
        {data?.firm && (
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, mt: 0.5 }}>
            {data.firm.razao_social}
          </Typography>
        )}
        <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, mt: 0.5 }}>
          Hoje é {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </Typography>
      </Box>

      {/* Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {cards.map(card => (
          <Grid item xs={12} sm={6} md={3} key={card.label}>
            <Card sx={cardStyle}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  {card.icon}
                  <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</Typography>
                </Box>
                <Typography sx={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>{card.value}</Typography>
                {card.sub && <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{card.sub}</Typography>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* O que fazer agora */}
      <Card sx={{ ...cardStyle, mb: 3 }}>
        <CardContent>
          <Typography sx={{ color: '#D4AF37', fontWeight: 600, fontSize: 16, mb: 2 }}>O que fazer agora</Typography>
          <Grid container spacing={1}>
            {actions.map(action => (
              <Grid item xs={12} sm={6} key={action.path}>
                <Button
                  fullWidth
                  onClick={() => navigate(action.path)}
                  sx={{
                    justifyContent: 'space-between', textAlign: 'left', textTransform: 'none',
                    color: '#fff', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 1.5, p: 1.5,
                    '&:hover': { bgcolor: 'rgba(212,175,55,0.08)', borderColor: 'rgba(212,175,55,0.3)' },
                  }}
                  endIcon={<ArrowForward sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }} />}
                >
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{action.label}</Typography>
                    <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{action.desc}</Typography>
                  </Box>
                </Button>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Empresas vinculadas */}
      {data?.entities?.length > 0 && (
        <Card sx={cardStyle}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography sx={{ color: '#D4AF37', fontWeight: 600, fontSize: 16 }}>Empresas vinculadas</Typography>
              <Button size="small" onClick={() => navigate('/contador/empresas')} sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Ver todas</Button>
            </Box>
            {data.entities.map(e => (
              <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, p: 1, borderRadius: 1, '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                <Business sx={{ color: 'rgba(212,175,55,0.6)', fontSize: 20 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#fff', fontSize: 14 }}>{e.razao_social}</Typography>
                </Box>
                <Chip label={e.entity_type} size="small" sx={{ bgcolor: 'rgba(212,175,55,0.1)', color: '#D4AF37', fontSize: 10, height: 20 }} />
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </AccountantPortalLayout>
  );
}
