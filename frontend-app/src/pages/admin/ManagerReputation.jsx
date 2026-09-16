import { useState, useEffect } from 'react';
import { Box, Container, Typography, Card, CardContent, Grid, Chip, Alert, CircularProgress, Button } from '@mui/material';
import { Star, Warning, Download } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';
import { downloadCsv } from '../../utils/exportCsv';

const GOLD = '#B8942E';

export default function ManagerReputation() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('kaviar_admin_token');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/manager/drivers/reputation`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Container maxWidth="md" sx={{ mt: 6, textAlign: 'center' }}><CircularProgress sx={{ color: GOLD }} /></Container>;

  const summary = data?.summary || { total: 0, online: 0, avg_rating: 0, alerts: 0 };
  const drivers = data?.drivers || [];
  const attention = drivers.filter(d => d.attention);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FAFAF8', pt: 2, pb: 6 }}>
      <Container maxWidth="md">
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          <span style={{ color: GOLD }}>⭐</span> Reputação — Motoristas do Território
        </Typography>
        <Typography sx={{ color: '#6B7280', fontSize: 12, mb: 2 }}>Visão somente leitura</Typography>

        {drivers.length > 0 && (
          <Button size="small" startIcon={<Download />} onClick={() => {
            const headers = ['Nome', 'Bairro', 'Veículo', 'Média', 'Avaliações', 'Corridas', 'Status', 'Atenção'];
            const rows = drivers.map(d => [d.name, d.neighborhood || '', d.vehicle || '', d.avg_rating?.toFixed(1) || '—', d.total_ratings, d.rides_completed, d.availability, d.attention ? 'Sim' : 'Não']);
            downloadCsv(headers, rows, `kaviar-reputacao-${new Date().toISOString().split('T')[0]}.csv`);
          }} sx={{ mb: 2, color: '#6B7280', borderColor: '#E8E5DE' }} variant="outlined">Exportar CSV</Button>
        )}

        {/* KPIs */}
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {[
            { label: 'Total', value: summary.total },
            { label: 'Online', value: summary.online },
            { label: 'Média', value: summary.avg_rating ? `${summary.avg_rating}⭐` : '—' },
            { label: 'Alertas', value: summary.alerts },
          ].map(k => (
            <Grid item xs={6} sm={3} key={k.label}>
              <Card sx={{ bgcolor: '#fff', borderTop: `3px solid ${GOLD}`, border: '1px solid #E8E5DE', borderRadius: 2 }}>
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A' }}>{k.value}</Typography>
                  <Typography sx={{ fontSize: 10, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Attention */}
        {attention.length > 0 && (
          <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid #FDE68A', borderRadius: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1, fontWeight: 600 }}>
                <Warning sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />Motoristas com Atenção (média &lt; 3.5)
              </Typography>
              {attention.map(d => (
                <Box key={d.id} sx={{ py: 0.75, borderBottom: '1px solid #FEF3C7' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{d.name}</Typography>
                    <Chip label={`★${d.avg_rating?.toFixed(1)} (${d.total_ratings})`} size="small" sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontSize: 10, height: 20 }} />
                  </Box>
                  {d.neg_tags.length > 0 && <Typography sx={{ fontSize: 11, color: '#6B7280', mt: 0.3 }}>Tags: {d.neg_tags.join(', ')}</Typography>}
                  {d.last_neg_comment && <Typography sx={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', mt: 0.3 }}>"{d.last_neg_comment}"</Typography>}
                </Box>
              ))}
            </CardContent>
          </Card>
        )}

        {/* All drivers */}
        {drivers.length > 0 ? (
          <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid #E8E5DE', borderRadius: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5 }}>Motoristas do Território</Typography>
              {drivers.map(d => (
                <Box key={d.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75, borderBottom: '1px solid #F3F4F6' }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{d.name}</Typography>
                    <Typography sx={{ fontSize: 11, color: '#6B7280' }}>
                      {d.neighborhood || '—'}{d.vehicle ? ` • ${d.vehicle}` : ''} • {d.rides_completed} corridas
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    {d.avg_rating !== null && (
                      <Chip label={`★${d.avg_rating.toFixed(1)}`} size="small" sx={{ bgcolor: d.attention ? '#FEF3C7' : 'rgba(16,185,129,0.1)', color: d.attention ? '#92400E' : '#059669', fontSize: 10, height: 20, fontWeight: 600 }} />
                    )}
                    <Chip label={d.availability === 'online' ? 'Online' : 'Offline'} size="small" sx={{ bgcolor: d.availability === 'online' ? 'rgba(16,185,129,0.1)' : '#F3F4F6', color: d.availability === 'online' ? '#059669' : '#9CA3AF', fontSize: 9, height: 18 }} />
                  </Box>
                </Box>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Alert severity="info" sx={{ mb: 3 }}>Ainda não há motoristas aprovados com avaliações neste território.</Alert>
        )}

        {/* Disclaimer */}
        <Alert severity="warning" icon={false} sx={{ bgcolor: 'rgba(184,148,46,0.06)', border: '1px solid #E8E5DE', '& .MuiAlert-message': { color: '#6B7280', fontSize: 11 } }}>
          Visualização somente leitura. Ações de aprovação, suspensão, alteração cadastral ou bloqueio de motoristas são exclusivas da central KAVIAR.
        </Alert>
      </Container>
    </Box>
  );
}
