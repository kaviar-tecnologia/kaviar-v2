import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Grid, Chip, Button, Skeleton, LinearProgress } from '@mui/material';
import { Business, Assignment, CalendarMonth, Schedule, ArrowForward, Warning, CheckCircle, Error as ErrorIcon, VpnKey, Gavel, Description } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

const cardStyle = { bgcolor: '#1A1F2E', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 2, height: '100%' };

const PRIORITY_COLORS = { URGENT: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#3B82F6', LOW: '#6B7280' };

export default function AccountantHomePage() {
  const [data, setData] = useState(null);
  const [pendencias, setPendencias] = useState(null);
  const [fiscalHealth, setFiscalHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      accountantApi.get('/api/accountant/portal/dashboard').then(r => r.data?.data).catch(() => null),
      accountantApi.get('/api/accountant/portal/pendencias/summary').then(r => r.data?.data).catch(() => null),
      accountantApi.get('/api/accountant/portal/fiscal-health').then(r => r.data?.data).catch(() => null),
    ]).then(([dash, pend, health]) => {
      setData(dash);
      setPendencias(pend);
      setFiscalHealth(health);
    }).finally(() => setLoading(false));
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
  const overallHealth = fiscalHealth?.overall || 'HEALTHY';
  const healthColor = overallHealth === 'CRITICAL' ? '#EF4444' : overallHealth === 'ATTENTION' ? '#F59E0B' : '#22C55E';
  const healthLabel = overallHealth === 'CRITICAL' ? 'Situação Crítica' : overallHealth === 'ATTENTION' ? 'Atenção' : 'Empresas em Dia';

  return (
    <AccountantPortalLayout>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
          {getGreeting()}, {data?.accountant?.nome_completo?.split(' ')[0] || 'Contador'}
        </Typography>
        {data?.firm && (
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, mt: 0.5 }}>{data.firm.razao_social}</Typography>
        )}
        <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, mt: 0.5 }}>
          {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={cardStyle}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Business sx={{ color: '#D4AF37', fontSize: 28 }} />
                <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Empresas</Typography>
              </Box>
              <Typography sx={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>{data?.entities?.length || 0}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>vinculadas</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={cardStyle}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Assignment sx={{ color: pendencias?.urgent > 0 ? '#EF4444' : '#F59E0B', fontSize: 28 }} />
                <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendências</Typography>
              </Box>
              <Typography sx={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>{pendencias?.total || 0}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                {pendencias?.urgent > 0 ? `${pendencias.urgent} urgente${pendencias.urgent > 1 ? 's' : ''}` : 'a resolver'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ ...cardStyle, borderColor: `${healthColor}30` }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                {overallHealth === 'CRITICAL' ? <ErrorIcon sx={{ color: healthColor, fontSize: 28 }} /> :
                 overallHealth === 'ATTENTION' ? <Warning sx={{ color: healthColor, fontSize: 28 }} /> :
                 <CheckCircle sx={{ color: healthColor, fontSize: 28 }} />}
                <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saúde Fiscal</Typography>
              </Box>
              <Typography sx={{ color: healthColor, fontSize: 18, fontWeight: 700 }}>{healthLabel}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={cardStyle}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Schedule sx={{ color: '#6366F1', fontSize: 28 }} />
                <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Último Acesso</Typography>
              </Box>
              <Typography sx={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
                {data?.accountant?.last_login_at ? new Date(data.accountant.last_login_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Pendências — O que fazer agora */}
      {pendencias?.top?.length > 0 && (
        <Card sx={{ ...cardStyle, mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography sx={{ color: '#D4AF37', fontWeight: 600, fontSize: 16 }}>O que fazer agora</Typography>
              <Button size="small" onClick={() => navigate('/contador/pendencias')} sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'none' }}>Ver todas ({pendencias.total})</Button>
            </Box>
            {pendencias.top.map(p => (
              <Box key={p.id} onClick={() => p.action_path && navigate(p.action_path)}
                sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: 1, cursor: p.action_path ? 'pointer' : 'default', mb: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                <Box sx={{ width: 4, height: 32, borderRadius: 2, bgcolor: PRIORITY_COLORS[p.priority] || '#6B7280' }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{p.title}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{p.entity_name} • {p.description}</Typography>
                </Box>
                <Typography sx={{ color: PRIORITY_COLORS[p.priority], fontSize: 11, fontWeight: 500 }}>{p.action}</Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty state: No pendências */}
      {pendencias && pendencias.total === 0 && (
        <Card sx={{ ...cardStyle, mb: 3, borderColor: 'rgba(34,197,94,0.2)' }}>
          <CardContent sx={{ textAlign: 'center', py: 3 }}>
            <CheckCircle sx={{ fontSize: 36, color: '#22C55E', mb: 1 }} />
            <Typography sx={{ color: '#22C55E', fontSize: 15, fontWeight: 600 }}>Tudo em dia!</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, mt: 0.5 }}>Nenhuma pendência urgente. Todas as empresas estão com documentação regular.</Typography>
          </CardContent>
        </Card>
      )}

      {/* Quick navigation */}
      <Card sx={{ ...cardStyle, mb: 3 }}>
        <CardContent>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 13, mb: 2 }}>Acesso Rápido</Typography>
          <Grid container spacing={1}>
            {[
              { label: 'Empresas', path: '/contador/empresas', icon: <Business sx={{ fontSize: 16 }} /> },
              { label: 'Documentos', path: '/contador/documentos', icon: <Description sx={{ fontSize: 16 }} /> },
              { label: 'Certificados', path: '/contador/certificados', icon: <VpnKey sx={{ fontSize: 16 }} /> },
              { label: 'Procurações', path: '/contador/procuracoes', icon: <Gavel sx={{ fontSize: 16 }} /> },
              { label: 'Pendências', path: '/contador/pendencias', icon: <Assignment sx={{ fontSize: 16 }} /> },
            ].map(item => (
              <Grid item xs={12} sm={6} md={4} key={item.path}>
                <Button fullWidth onClick={() => navigate(item.path)} startIcon={item.icon}
                  sx={{ justifyContent: 'flex-start', color: 'rgba(255,255,255,0.7)', textTransform: 'none', fontSize: 13, py: 1, '&:hover': { bgcolor: 'rgba(212,175,55,0.08)', color: '#D4AF37' } }}>
                  {item.label}
                </Button>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Fiscal Health per company */}
      {fiscalHealth?.companies?.length > 0 && (
        <Card sx={cardStyle}>
          <CardContent>
            <Typography sx={{ color: '#D4AF37', fontWeight: 600, fontSize: 16, mb: 2 }}>Saúde das Empresas</Typography>
            {fiscalHealth.companies.map(({ entity, health }) => {
              if (!entity) return null;
              const color = health.overall === 'CRITICAL' ? '#EF4444' : health.overall === 'ATTENTION' ? '#F59E0B' : '#22C55E';
              return (
                <Box key={entity.id} onClick={() => navigate(`/contador/empresas/${entity.id}`)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: 1, mb: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                  <Box sx={{ width: 40, textAlign: 'center' }}>
                    <Typography sx={{ color, fontSize: 18, fontWeight: 700 }}>{health.score}</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ color: '#fff', fontSize: 14 }}>{entity.razao_social}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{entity.cnpj}</Typography>
                  </Box>
                  <Chip label={health.overall === 'CRITICAL' ? 'Crítica' : health.overall === 'ATTENTION' ? 'Atenção' : 'Saudável'} size="small" sx={{ bgcolor: `${color}15`, color, fontSize: 11, height: 22 }} />
                </Box>
              );
            })}
          </CardContent>
        </Card>
      )}
    </AccountantPortalLayout>
  );
}
