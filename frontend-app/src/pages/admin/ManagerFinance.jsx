import { useState, useEffect } from 'react';
import { Box, Container, Typography, Card, CardContent, Grid, Chip, Alert, CircularProgress, ToggleButtonGroup, ToggleButton, Button, Snackbar } from '@mui/material';
import { Download } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';
import { downloadCsv } from '../../utils/exportCsv';
import { formatDate } from '../../utils/formatDate';

const GOLD = '#B8942E';
const STATUS_MAP = { OPEN: 'Aberto', CALCULATED: 'Calculado', UNDER_REVIEW: 'Em revisão', APPROVED: 'Aprovado', OBLIGATION_CREATED: 'Reservado', CANCELLED: 'Cancelado' };
const STATUS_COLOR = { OPEN: '#6B7280', CALCULATED: '#F59E0B', UNDER_REVIEW: '#8B5CF6', APPROVED: '#3B82F6', OBLIGATION_CREATED: '#10B981', CANCELLED: '#EF4444' };

export default function ManagerFinance() {
  const [summary, setSummary] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');
  const [snack, setSnack] = useState('');
  const token = localStorage.getItem('kaviar_admin_token');
  const headers = { Authorization: `Bearer ${token}` };
  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;

  useEffect(() => { load(); }, [period]);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, pRes, rRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/manager/finance/summary?period=${period}`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/manager/finance/payouts`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/manager/finance/rules`, { headers }),
      ]);
      const [sData, pData, rData] = await Promise.all([sRes.json(), pRes.json(), rRes.json()]);
      if (sData.success) setSummary(sData.data);
      if (pData.success) setPayouts(pData.data);
      if (rData.success) setRules(rData.data);
    } catch {}
    setLoading(false);
  };

  const fmt = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

  const buildReportText = (forNote) => {
    const code = `REL-TER-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(new Date().getHours()).padStart(2,'0')}${String(new Date().getMinutes()).padStart(2,'0')}`;
    let text = `📊 Relatório do Gestor Territorial — KAVIAR\n👤 Gestor: ${admin?.name || '—'}\nBase operacional: KAVIAR\nCódigo: ${code}\nEmitido: ${new Date().toLocaleString('pt-BR')}\nPeríodo: ${period === '7d' ? '7 dias' : period === '30d' ? '30 dias' : '90 dias'}\n`;
    if (summary && !summary.empty) {
      text += `\n🚗 Operações reconhecidas: ${summary.rides_completed}\n🏦 Taxa da plataforma arrecadada: ${fmt(summary.platform_fee)}\n📍 Participação reconhecida do gestor: ${fmt(summary.regional_estimated)}`;
      if (summary.has_rule) text += `\n💵 Valor reconhecido no período: ${fmt(summary.net_estimated)}`;
    }
    text += `\n\n${forNote ? 'Este documento é uma base operacional de valores já reconhecidos pelo Wallet V2 para conferência e eventual documento fiscal. Não substitui nota fiscal, recibo fiscal ou documento contábil oficial.' : 'Os valores exibidos vêm do Wallet V2 e representam reconhecimento financeiro do período; pagamento continua sujeito ao ciclo financeiro da central KAVIAR.'}`;
    return text;
  };

  if (loading) return <Container maxWidth="md" sx={{ mt: 6, textAlign: 'center' }}><CircularProgress sx={{ color: GOLD }} /></Container>;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FAFAF8', pt: 2, pb: 6 }}>
      <Container maxWidth="md">
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          <span style={{ color: GOLD }}>💰</span> Financeiro do Território
        </Typography>
        <Typography sx={{ color: '#6B7280', fontSize: 12, mb: 2 }}>Visão informativa — somente leitura</Typography>

        {/* Action buttons */}
        <Box className="no-print" sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', '@media print': { display: 'none' } }}>
          <Button size="small" sx={{ textTransform: 'none', color: '#6B7280' }} onClick={() => window.print()}>🖨️ Imprimir</Button>
          <Button size="small" sx={{ textTransform: 'none', color: '#6B7280' }} onClick={() => { navigator.clipboard.writeText(buildReportText(false)); setSnack('Resumo copiado!'); }}>📋 Copiar</Button>
          <Button size="small" sx={{ textTransform: 'none', color: '#25D366' }} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(buildReportText(false))}`, '_blank')}>📱 WhatsApp</Button>
          <Button size="small" sx={{ textTransform: 'none', color: '#6B7280' }} onClick={() => { navigator.clipboard.writeText(buildReportText(true)); setSnack('Base para nota copiada!'); }}>📄 Base para Nota</Button>
          {summary && !summary.empty && <Button size="small" startIcon={<Download />} onClick={() => {
            const h = ['Período', 'Operações Reconhecidas', 'Taxa Plataforma Arrecadada', 'Participação Reconhecida'];
            const rows = [[period === '7d' ? '7 dias' : period === '30d' ? '30 dias' : '90 dias', summary.rides_completed, summary.platform_fee, summary.regional_estimated]];
            downloadCsv(h, rows, `kaviar-financeiro-territorial-${new Date().toISOString().split('T')[0]}.csv`);
          }} sx={{ textTransform: 'none', color: '#6B7280' }} variant="outlined">CSV</Button>}
        </Box>

        {/* Print header */}
        <Box className="print-header" sx={{ display: 'none', '@media print': { display: 'block', mb: 3, borderBottom: '2px solid #B8942E', pb: 2 } }}>
          <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#B8942E' }}>Relatório do Gestor Territorial — KAVIAR</Typography>
          <Typography sx={{ fontSize: 12, color: '#374151', mt: 0.5 }}>Gestor responsável: {admin?.name || '—'}</Typography>
          <Typography sx={{ fontSize: 12, color: '#374151' }}>Base operacional: KAVIAR</Typography>
          <Typography sx={{ fontSize: 11, color: '#6B7280' }}>Código: REL-TER-{new Date().toISOString().slice(0,10).replace(/-/g,'')}-{String(new Date().getHours()).padStart(2,'0')}{String(new Date().getMinutes()).padStart(2,'0')}</Typography>
          <Typography sx={{ fontSize: 11, color: '#6B7280' }}>Emitido em: {new Date().toLocaleString('pt-BR')}</Typography>
          <Typography sx={{ fontSize: 11, color: '#6B7280' }}>Período: {period === '7d' ? '7 dias' : period === '30d' ? '30 dias' : '90 dias'}</Typography>
        </Box>

        {/* Period selector */}
        <ToggleButtonGroup value={period} exclusive onChange={(_, v) => v && setPeriod(v)} size="small" sx={{ mb: 2 }}>
          <ToggleButton value="7d" sx={{ fontSize: 11 }}>7 dias</ToggleButton>
          <ToggleButton value="30d" sx={{ fontSize: 11 }}>30 dias</ToggleButton>
          <ToggleButton value="90d" sx={{ fontSize: 11 }}>90 dias</ToggleButton>
        </ToggleButtonGroup>

        {/* KPIs */}
        {summary && !summary.empty ? (
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {[
              { label: 'Operações reconhecidas', value: summary.rides_completed },
              { label: 'Taxa plataforma arrecadada', value: fmt(summary.platform_fee) },
              { label: 'Participação reconhecida', value: fmt(summary.regional_estimated) },
              { label: 'Ativação Financeira', value: summary.financial_activation_active === true ? 'Ativa' : summary.financial_activation_active === false ? 'Bloqueada' : '—' },
            ].map(k => (
              <Grid item xs={6} sm={3} key={k.label}>
                <Card sx={{ bgcolor: '#fff', borderTop: `3px solid ${GOLD}`, border: '1px solid #E8E5DE', borderRadius: 2 }}>
                  <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#1A1A1A' }}>{k.value}</Typography>
                    <Typography sx={{ fontSize: 10, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : <Alert severity="info" sx={{ mb: 3 }}>Ainda não há dados financeiros calculados para este território.</Alert>}

        {summary && !summary.empty && summary.financial_activation_active === false && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            Ativação Financeira bloqueada{summary.financial_activation_reason ? `: ${summary.financial_activation_reason}` : ''}. Enquanto o bloqueio existir, novas operações reconhecem 0% para o Gestor e 100% da Taxa da Plataforma para a KAVIAR.
          </Alert>
        )}

        {/* Net estimated */}
        {summary && !summary.empty && summary.has_rule && (
          <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid #E8E5DE', borderRadius: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={4} sx={{ textAlign: 'center' }}><Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase' }}>Base</Typography><Typography sx={{ fontSize: 16, fontWeight: 700 }}>Wallet V2</Typography></Grid>
                <Grid item xs={4} sx={{ textAlign: 'center' }}><Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase' }}>Reconhecido no período</Typography><Typography sx={{ fontSize: 20, fontWeight: 800, color: GOLD }}>{fmt(summary.net_estimated)}</Typography></Grid>
                <Grid item xs={4} sx={{ textAlign: 'center' }}><Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase' }}>Participação contratual</Typography><Typography sx={{ fontSize: 16, fontWeight: 700 }}>{summary.regional_percent}%</Typography></Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Payouts */}
        {/* Meus Repasses KAVIAR */}
        <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid #E8E5DE', borderRadius: 2 }}>
          <CardContent sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5 }}>Meus Repasses KAVIAR</Typography>
            {payouts && payouts.length > 0 ? payouts.map(p => (
              <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75, borderBottom: '1px solid #F3F4F6' }}>
                <Box><Typography sx={{ fontSize: 13, fontWeight: 600 }}>{p.reference_month}</Typography><Typography sx={{ fontSize: 11, color: '#6B7280' }}>{fmt(p.approved_amount || p.calculated_amount)}{p.paid_at && ` • ${p.payment_method || 'PIX'} em ${formatDate(p.paid_at)}`}</Typography></Box>
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  <Chip label={STATUS_MAP[p.status] || p.status} size="small" sx={{ bgcolor: `${STATUS_COLOR[p.status] || '#6B7280'}15`, color: STATUS_COLOR[p.status] || '#6B7280', fontSize: 10, height: 22, fontWeight: 600 }} />
                </Box>
              </Box>
            )) : (
              <Typography sx={{ fontSize: 12, color: '#6B7280', textAlign: 'center', py: 2 }}>Você ainda não possui repasses disponíveis neste território. Quando a central KAVIAR apurar ou liberar valores, eles aparecerão aqui.</Typography>
            )}
          </CardContent>
        </Card>

        {/* Rules */}
        {rules && (
          <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid #E8E5DE', borderRadius: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>Regra Financeira Vigente</Typography>
              <Grid container spacing={1}>
                <Grid item xs={4} sx={{ textAlign: 'center' }}><Typography sx={{ fontSize: 20, fontWeight: 800 }}>{Number(rules.regional_share_percent)}%</Typography><Typography sx={{ fontSize: 9, color: '#6B7280', textTransform: 'uppercase' }}>Gestor</Typography></Grid>
                <Grid item xs={4} sx={{ textAlign: 'center' }}><Typography sx={{ fontSize: 20, fontWeight: 800 }}>{Number(rules.matrix_share_percent)}%</Typography><Typography sx={{ fontSize: 9, color: '#6B7280', textTransform: 'uppercase' }}>KAVIAR</Typography></Grid>
                <Grid item xs={4} sx={{ textAlign: 'center' }}><Typography sx={{ fontSize: 20, fontWeight: 800 }}>{rules.financial_activation_active === true ? 'ATIVA' : rules.financial_activation_active === false ? 'BLOQUEADA' : '—'}</Typography><Typography sx={{ fontSize: 9, color: '#6B7280', textTransform: 'uppercase' }}>Ativação Financeira</Typography></Grid>
              </Grid>
              {rules.description && <Typography sx={{ fontSize: 11, color: '#6B7280', mt: 1 }}>{rules.description}</Typography>}
              {rules.financial_activation_active === false && rules.financial_activation_reason && <Typography sx={{ fontSize: 11, color: '#B45309', mt: 0.5 }}>Motivo: {rules.financial_activation_reason}</Typography>}
            </CardContent>
          </Card>
        )}

        {/* Print footer */}
        <Box className="print-footer" sx={{ display: 'none', '@media print': { display: 'block', mt: 4, pt: 2, borderTop: '1px solid #E5E7EB' } }}>
          <Typography sx={{ fontSize: 10, color: '#6B7280' }}>Relatório do Gestor Territorial — Base operacional KAVIAR.</Typography>
          <Typography sx={{ fontSize: 9, color: '#9CA3AF', mt: 0.5 }}>Este relatório possui finalidade operacional e gerencial do território. Não substitui nota fiscal, recibo fiscal ou documento contábil oficial.</Typography>
          <Typography sx={{ fontSize: 9, color: '#9CA3AF' }}>Valores reconhecidos pelo Wallet V2. O pagamento depende do ciclo financeiro e das validações da central KAVIAR.</Typography>
        </Box>

        {/* Disclaimer */}
        <Alert severity="warning" icon={false} sx={{ bgcolor: 'rgba(184,148,46,0.06)', border: '1px solid #E8E5DE', '& .MuiAlert-message': { color: '#6B7280', fontSize: 11 } }}>
          Os valores exibidos são reconhecidos pelo Wallet V2. Sem Ativação Financeira/assignment elegível, novas operações geram 0% ao gestor. Pagamento e documento fiscal seguem o ciclo financeiro da central KAVIAR.
        </Alert>

        {/* Print CSS */}
        <style>{`@media print { .no-print, nav, header { display: none !important; } .print-header, .print-footer { display: block !important; } }`}</style>
      </Container>
      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
