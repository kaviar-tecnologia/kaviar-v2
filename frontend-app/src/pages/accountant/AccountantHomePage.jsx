import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Grid, Chip, Skeleton } from '@mui/material';
import { Business, Description, CalendarMonth, Schedule } from '@mui/icons-material';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

export default function AccountantHomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    accountantApi.get('/api/accountant/portal/dashboard')
      .then(res => setData(res.data?.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <AccountantPortalLayout><Skeleton variant="rectangular" height={200} /></AccountantPortalLayout>;

  const cards = [
    { icon: <Business sx={{ color: '#D4AF37' }} />, label: 'Empresas vinculadas', value: data?.entities?.length || 0 },
    { icon: <Description sx={{ color: '#D4AF37' }} />, label: 'Documentos pendentes', value: data?.pendingDocuments || 0 },
    { icon: <CalendarMonth sx={{ color: '#D4AF37' }} />, label: 'Competência atual', value: data?.currentPeriod || '-' },
    { icon: <Schedule sx={{ color: '#D4AF37' }} />, label: 'Último acesso', value: data?.accountant?.last_login_at ? new Date(data.accountant.last_login_at).toLocaleDateString('pt-BR') : '-' },
  ];

  return (
    <AccountantPortalLayout>
      <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, mb: 0.5 }}>
        Bem-vindo, {data?.accountant?.nome_completo || 'Contador'}
      </Typography>
      {data?.firm && <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, mb: 3 }}>Escritório: {data.firm.razao_social}</Typography>}

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {cards.map(card => (
          <Grid item xs={12} sm={6} md={3} key={card.label}>
            <Card sx={{ bgcolor: '#1A1F2E', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 2 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {card.icon}
                <Box>
                  <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{card.label}</Typography>
                  <Typography sx={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>{card.value}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {data?.entities?.length > 0 && (
        <Card sx={{ bgcolor: '#1A1F2E', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 2 }}>
          <CardContent>
            <Typography sx={{ color: '#D4AF37', fontWeight: 600, mb: 2 }}>Empresas vinculadas</Typography>
            {data.entities.map(e => (
              <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Chip label={e.entity_type} size="small" sx={{ bgcolor: 'rgba(212,175,55,0.1)', color: '#D4AF37', fontSize: 10 }} />
                <Typography sx={{ color: '#fff', fontSize: 14 }}>{e.razao_social}</Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </AccountantPortalLayout>
  );
}
