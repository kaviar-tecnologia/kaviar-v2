import { useState, useEffect } from 'react';
import { Box, Container, Typography, Card, CardContent, Button, Alert, CircularProgress, Chip, Snackbar } from '@mui/material';
import { ContentCopy, Share, Download } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';
import { downloadCsv } from '../../utils/exportCsv';

const GOLD = '#B8942E';
const STATUS_LABEL = { pending: 'Pendente', qualified: 'Aprovado', rejected: 'Rejeitado' };
const STATUS_COLOR = { pending: '#F59E0B', qualified: '#10B981', rejected: '#EF4444' };

export default function ManagerReferrals() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const token = localStorage.getItem('kaviar_admin_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/operator/referrals`, { headers });
      const d = await res.json();
      if (d.success) setData(d.data);
    } catch {}
    setLoading(false);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/operator/referrals/generate`, { method: 'POST', headers });
      const d = await res.json();
      if (d.success) load();
    } catch {}
    setGenerating(false);
  };

  const copyLink = () => {
    if (data?.referral_link) {
      navigator.clipboard.writeText(data.referral_link).then(() => setCopied(true)).catch(() => {});
    }
  };

  const shareWhatsApp = () => {
    if (data?.referral_link) {
      const text = `Quer ser motorista KAVIAR? Cadastre-se pelo meu link: ${data.referral_link}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  if (loading) return <Container maxWidth="sm" sx={{ mt: 6, textAlign: 'center' }}><CircularProgress sx={{ color: GOLD }} /></Container>;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FAFAF8', pt: 2, pb: 6 }}>
      <Container maxWidth="sm">
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          <span style={{ color: GOLD }}>🔗</span> Indicações
        </Typography>
        <Typography sx={{ color: '#6B7280', fontSize: 12, mb: 2 }}>Link de captação e indicados</Typography>

        {/* Link section */}
        {data?.has_code ? (
          <Card sx={{ mb: 3, border: '1px solid #E8E5DE', borderTop: `3px solid ${GOLD}`, borderRadius: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>Seu Link de Captação</Typography>
              <Box sx={{ bgcolor: '#F9FAFB', border: '1px solid #E8E5DE', borderRadius: 1, p: 1.5, mb: 1.5 }}>
                <Typography sx={{ fontSize: 13, fontFamily: 'monospace', color: '#1A1A1A', wordBreak: 'break-all' }}>{data.referral_link}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" startIcon={<ContentCopy />} onClick={copyLink} variant="outlined" sx={{ borderColor: GOLD, color: GOLD, fontSize: 12 }}>Copiar link</Button>
                <Button size="small" startIcon={<Share />} onClick={shareWhatsApp} variant="contained" sx={{ bgcolor: '#25D366', fontSize: 12, '&:hover': { bgcolor: '#1DA851' } }}>WhatsApp</Button>
              </Box>
              <Typography sx={{ fontSize: 11, color: '#6B7280', mt: 1.5 }}>Compartilhe este link com interessados. Os cadastros enviados passarão por análise da central KAVIAR.</Typography>
            </CardContent>
          </Card>
        ) : (
          <Card sx={{ mb: 3, border: '1px solid #E8E5DE', borderRadius: 2 }}>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 13, color: '#6B7280', mb: 2 }}>Você ainda não tem um link de captação. Gere agora para começar a indicar motoristas.</Typography>
              <Button onClick={generate} disabled={generating} variant="contained" sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#9A7B24' } }}>
                {generating ? 'Gerando...' : 'Gerar meu link de captação'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {data?.has_code && data.stats && (
          <Card sx={{ mb: 3, border: '1px solid #E8E5DE', borderRadius: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>Resumo</Typography>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                {[
                  { label: 'Total', value: data.stats.total },
                  { label: 'Pendentes', value: data.stats.pending },
                  { label: 'Aprovados', value: data.stats.qualified },
                ].map(s => (
                  <Box key={s.label} sx={{ textAlign: 'center' }}>
                    <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A' }}>{s.value}</Typography>
                    <Typography sx={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase' }}>{s.label}</Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {data?.has_code && data.stats?.total === 0 && (
          <Alert severity="info" sx={{ mb: 3 }}>Ainda não há indicados por este link.</Alert>
        )}

        {data?.has_code && data.stats?.total > 0 && (
          <Button size="small" startIcon={<Download />} onClick={() => {
            const headers = ['Código', 'Total Indicados', 'Pendentes', 'Aprovados'];
            const rows = [[data.referral_code, data.stats.total, data.stats.pending, data.stats.qualified]];
            downloadCsv(headers, rows, `kaviar-indicacoes-${new Date().toISOString().split('T')[0]}.csv`);
          }} sx={{ mb: 2, color: '#6B7280', borderColor: '#E8E5DE' }} variant="outlined">Exportar CSV</Button>
        )}

        {/* Disclaimer */}
        <Alert severity="warning" icon={false} sx={{ bgcolor: 'rgba(184,148,46,0.06)', border: '1px solid #E8E5DE', '& .MuiAlert-message': { color: '#6B7280', fontSize: 11 } }}>
          Esta tela é informativa. A indicação não garante aprovação, pagamento, vínculo contratual ou repasse automático.
        </Alert>

        <Snackbar open={copied} autoHideDuration={2000} onClose={() => setCopied(false)} message="Link copiado!" />
      </Container>
    </Box>
  );
}
