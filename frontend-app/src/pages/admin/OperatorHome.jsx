import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Container, Typography, Box, Card, CardContent, Grid, Button, CircularProgress, Alert } from '@mui/material';
import { DirectionsCar, Explore, Description, ChatBubble, BarChart, Public } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';
import { AR_PLACES_DASHBOARD_CARD, canAccessArPlaces } from './arPlacesPermissions';

export default function OperatorHome() {
  const [metrics, setMetrics] = useState(null);
  const [territory, setTerritoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;
  const canAccessArPlacesCard = canAccessArPlaces(admin?.role);
  const token = localStorage.getItem('kaviar_admin_token');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { 'Authorization': `Bearer ${token}` };

      const [metricsRes, territoryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/dashboard/metrics`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/dashboard/territory`, { headers }),
      ]);

      if (metricsRes.status === 403) {
        setError('Sem território vinculado. Solicite acesso ao administrador.');
        return;
      }

      const metricsData = await metricsRes.json();
      const territoryData = await territoryRes.json();

      if (metricsData.success !== false) setMetrics(metricsData.metrics || metricsData);
      if (territoryData.success) setTerritoryData(territoryData.data);
    } catch (err) {
      setError('Erro ao carregar dados do território');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kaviar_admin_token');
    localStorage.removeItem('kaviar_admin_data');
    window.location.href = '/admin/login';
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 6, textAlign: 'center' }}>
        <CircularProgress sx={{ color: '#B8942E' }} />
        <Typography sx={{ mt: 2, color: '#6B7280' }}>Carregando território...</Typography>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FAFAF8', pt: 2, pb: 6 }}>
      <Container maxWidth="md">
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #E8E5DE', borderTop: '3px solid #B8942E' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <span style={{ color: '#B8942E' }}>KAVIAR</span> Operador Territorial
            </Typography>
            <Typography sx={{ color: '#6B7280', fontSize: 12 }}>{admin?.name || 'Operador'}</Typography>
          </Box>
          <Button onClick={handleLogout} variant="outlined" size="small" sx={{ borderColor: '#E8E5DE', color: '#6B7280', '&:hover': { borderColor: '#B8942E', color: '#B8942E' } }}>
            Sair
          </Button>
        </Box>

        {error && <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>}

        {/* KPIs */}
        {metrics && (
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {[
              { label: 'Motoristas', value: metrics.drivers?.total ?? 0 },
              { label: 'Corridas', value: metrics.rides?.total ?? 0 },
            ].map(k => (
              <Grid item xs={6} sm={3} key={k.label}>
                <Card sx={{ bgcolor: '#fff', borderTop: '3px solid #B8942E', border: '1px solid #E8E5DE', borderRadius: 2 }}>
                  <CardContent sx={{ textAlign: 'center', py: 2 }}>
                    <Typography sx={{ fontSize: 28, fontWeight: 800, color: '#1A1A1A' }}>{k.value}</Typography>
                    <Typography sx={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Territory metrics */}
        {territory && territory.total > 0 && (
          <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid #E8E5DE', borderRadius: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>Corridas por Território</Typography>
              <Grid container spacing={1}>
                {[
                  { label: 'Local', value: territory.local },
                  { label: 'Vizinho', value: territory.adjacent },
                  { label: 'Externo', value: territory.external },
                  { label: 'Retorno', value: territory.homebound },
                  { label: 'Total', value: territory.total },
                ].map(t => (
                  <Grid item xs key={t.label}>
                    <Box sx={{ textAlign: 'center', py: 1, bgcolor: '#FAFAF8', borderRadius: 1 }}>
                      <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A' }}>{t.value}</Typography>
                      <Typography sx={{ fontSize: 9, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>{t.label}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Shortcuts */}
        <Typography sx={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5, fontWeight: 600 }}>Indicar Motoristas</Typography>
        <ReferralSection token={token} />

        {/* Módulos */}
        <Typography sx={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5, mt: 3, fontWeight: 600 }}>Módulos</Typography>
        <Grid container spacing={1.5} sx={{ mb: 4 }}>
          {[
            { Icon: DirectionsCar, title: 'Motoristas', desc: 'Ver motoristas do território', to: '/admin/drivers' },
            { Icon: ChatBubble, title: 'Central WhatsApp', desc: 'Convites e atendimento do território', to: '/admin/whatsapp' },
            { Icon: Explore, title: 'Corridas', desc: 'Ver corridas do território', to: '/admin/rides' },
            { Icon: BarChart, title: 'Cockpit Operacional', desc: 'Acompanhe corridas e motoristas do território', to: '/admin/operations' },
            ...(canAccessArPlacesCard ? [{ Icon: Public, title: AR_PLACES_DASHBOARD_CARD.title, desc: AR_PLACES_DASHBOARD_CARD.desc, to: AR_PLACES_DASHBOARD_CARD.to }] : []),
            { Icon: Description, title: 'Meu Contrato', desc: 'Perfil e contrato', to: '/admin/meu-contrato' },
          ].map(c => (
            <Grid item xs={12} sm={6} key={c.to}>
              <Card component={Link} to={c.to} sx={{ bgcolor: '#fff', border: '1px solid #E8E5DE', borderRadius: 2, textDecoration: 'none', display: 'block', '&:hover': { borderColor: '#B8942E', transform: 'translateY(-1px)', boxShadow: '0 2px 8px rgba(184,148,46,0.1)' }, transition: 'all 0.2s' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, px: 2 }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: 'rgba(184,148,46,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <c.Icon sx={{ fontSize: 18, color: '#B8942E' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ color: '#1A1A1A', fontWeight: 600, fontSize: 13 }}>{c.title}</Typography>
                    <Typography sx={{ color: '#6B7280', fontSize: 11 }}>{c.desc}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Institutional footer */}
        <Box sx={{ textAlign: 'center', pt: 2, borderTop: '1px solid #E8E5DE' }}>
          <Typography sx={{ color: '#9CA3AF', fontSize: 10 }}>
            KAVIAR é produto da USB Tecnok Manutenção e Instalação de Computadores Ltda — CNPJ 07.710.691/0001-66
          </Typography>
          <Typography sx={{ color: '#D1D5DB', fontSize: 9, mt: 0.5 }}>
            Operador territorial — acesso restrito ao território vinculado
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

function ReferralSection({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchReferral(); }, []);

  const fetchReferral = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/operator/referrals`, { headers: { 'Authorization': `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {} finally { setLoading(false); }
  };

  const handleGenerate = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/operator/referrals/generate`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) fetchReferral();
    } catch {}
  };

  const handleCopy = () => {
    if (data?.referral_link) {
      navigator.clipboard.writeText(data.referral_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsApp = () => {
    if (data?.referral_link) {
      const msg = encodeURIComponent(`Quer ser motorista KAVIAR na nossa região? Cadastre-se pelo meu link:\n${data.referral_link}`);
      window.open(`https://wa.me/?text=${msg}`, '_blank');
    }
  };

  if (loading) return null;

  if (!data?.has_code) {
    return (
      <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid #E8E5DE', borderRadius: 2 }}>
        <CardContent sx={{ p: 2, textAlign: 'center' }}>
          <Typography sx={{ color: '#6B7280', fontSize: 13, mb: 1.5 }}>Você ainda não tem um link de indicação.</Typography>
          <Button onClick={handleGenerate} variant="contained" size="small" sx={{ bgcolor: '#B8942E', '&:hover': { bgcolor: '#9A7B24' } }}>
            Gerar meu link de indicação
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid #E8E5DE', borderRadius: 2 }}>
      <CardContent sx={{ p: 2 }}>
        {/* Link */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 1.5, bgcolor: '#FAFAF8', borderRadius: 1, border: '1px solid #E8E5DE' }}>
          <Typography sx={{ flex: 1, fontSize: 12, color: '#1A1A1A', fontFamily: 'monospace', wordBreak: 'break-all' }}>{data.referral_link}</Typography>
          <Button onClick={handleCopy} size="small" sx={{ minWidth: 'auto', fontSize: 11, color: copied ? '#16A34A' : '#B8942E' }}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button onClick={handleWhatsApp} size="small" variant="outlined" sx={{ fontSize: 11, borderColor: '#25D366', color: '#25D366', '&:hover': { borderColor: '#128C7E', bgcolor: 'rgba(37,211,102,0.04)' } }}>
            📱 Compartilhar no WhatsApp
          </Button>
        </Box>

        {/* Stats */}
        {data.stats && (
          <Grid container spacing={1}>
            {[
              { label: 'Indicados', value: data.stats.total, color: '#1A1A1A' },
              { label: 'Pendentes', value: data.stats.pending, color: '#D97706' },
              { label: 'Aprovados', value: data.stats.qualified, color: '#16A34A' },
              { label: 'Rejeitados', value: data.stats.rejected, color: '#DC2626' },
            ].map(s => (
              <Grid item xs={3} key={s.label}>
                <Box sx={{ textAlign: 'center', py: 1, bgcolor: '#FAFAF8', borderRadius: 1 }}>
                  <Typography sx={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</Typography>
                  <Typography sx={{ fontSize: 9, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        )}

        <Typography sx={{ fontSize: 9, color: '#9CA3AF', mt: 1.5, textAlign: 'center' }}>
          Código: {data.referral_code} • Motoristas indicados são aprovados pelo KAVIAR
        </Typography>
      </CardContent>
    </Card>
  );
}
