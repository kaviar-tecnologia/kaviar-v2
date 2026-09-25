import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { AccountBalance, Refresh, Savings, TrendingDown, TrendingUp, WarningAmber } from '@mui/icons-material';
import FinanceModuleNav from '../../components/admin/finance/FinanceModuleNav';
import {
  fetchFinanceTreasurySummary,
  fetchOutboundTreasuryHealth,
} from '../../services/adminFinanceService';
import { formatCentsStringToBRL } from '../../utils/brlCurrency';

function Metric({ label, value, helper, tone = 'default', icon }) {
  const colors = {
    default: { bg: '#FFFFFF', border: '#E2E8F0', color: '#0F172A' },
    positive: { bg: '#F0FDF4', border: '#BBF7D0', color: '#166534' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E' },
    danger: { bg: '#FEF2F2', border: '#FECACA', color: '#991B1B' },
    info: { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8' },
  };
  const t = colors[tone] || colors.default;
  return (
    <Card elevation={0} sx={{ height: '100%', border: `1px solid ${t.border}`, bgcolor: t.bg, borderRadius: 2.5 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontSize: 11, textTransform: 'uppercase', color: '#64748B', fontWeight: 800 }}>{label}</Typography>
          <Box sx={{ color: t.color }}>{icon}</Box>
        </Box>
        <Typography sx={{ mt: 0.75, fontSize: 21, fontWeight: 900, color: t.color }}>{formatCentsStringToBRL(value || '0')}</Typography>
        {helper && <Typography sx={{ mt: 0.25, fontSize: 11, color: '#64748B' }}>{helper}</Typography>}
      </CardContent>
    </Card>
  );
}

function formatDate(value) {
  if (!value) return '—';
  const iso = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

export default function FinanceTreasuryPage() {
  const [treasury, setTreasury] = useState(null);
  const [providerTreasury, setProviderTreasury] = useState(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setWarning('');
    const results = await Promise.allSettled([
      fetchFinanceTreasurySummary(),
      fetchOutboundTreasuryHealth(),
    ]);

    if (results[0].status === 'fulfilled') setTreasury(results[0].value?.data || null);
    else {
      setTreasury(null);
      setError(results[0].reason?.message || 'Não foi possível carregar a tesouraria.');
    }

    if (results[1].status === 'fulfilled') setProviderTreasury(results[1].value?.data || null);
    else {
      setProviderTreasury(null);
      setWarning('A posição do provedor de pagamentos não está disponível. O saldo interno continua válido.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasNegative = (treasury?.negative_account_count || 0) > 0;

  return (
    <Container maxWidth="xl" sx={{ mt: 2, pb: 6 }}>
      <FinanceModuleNav />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, color: '#0F172A' }}>Tesouraria</Typography>
          <Typography sx={{ mt: 0.5, color: '#64748B', fontSize: 13 }}>
            Posição de caixa e equivalentes calculada a partir dos saldos iniciais e do ledger financeiro.
          </Typography>
        </Box>
        <Button startIcon={<Refresh />} variant="outlined" onClick={load} disabled={loading} sx={{ textTransform: 'none' }}>Atualizar</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {warning && <Alert severity="warning" sx={{ mb: 2 }}>{warning}</Alert>}
      {hasNegative && (
        <Alert severity="warning" icon={<WarningAmber />} sx={{ mb: 2 }}>
          Há {treasury.negative_account_count} conta(s) com saldo atual negativo. Verifique lançamentos, saldo inicial e conciliações.
        </Alert>
      )}

      {loading && !treasury ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Metric label="Saldo atual" value={treasury?.current_total_cents} helper={`${treasury?.account_count || 0} conta(s) ativa(s)`} tone={hasNegative ? 'warning' : 'positive'} icon={<Savings />} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Metric label="Entradas previstas" value={treasury?.pending_in_cents} helper="Rascunhos e pendentes" tone="info" icon={<TrendingUp />} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Metric label="Saídas previstas" value={treasury?.pending_out_cents} helper="Rascunhos e pendentes" tone="warning" icon={<TrendingDown />} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Metric label="Saldo projetado" value={treasury?.projected_total_cents} helper="Atual + movimentos previstos" tone="default" icon={<AccountBalance />} />
            </Grid>
          </Grid>

          {providerTreasury && (
            <Card elevation={0} sx={{ mb: 3, border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 900, color: '#0F172A' }}>Liquidez do provedor de pagamentos</Typography>
                    <Typography sx={{ mt: 0.25, fontSize: 12, color: '#64748B' }}>
                      Valores externos usados para pagamentos automáticos. Não substituem o saldo contábil interno.
                    </Typography>
                  </Box>
                  <Chip
                    label={providerTreasury.providerAvailable ? 'Provedor disponível' : 'Provedor indisponível'}
                    color={providerTreasury.providerAvailable ? 'success' : 'warning'}
                    variant="outlined"
                  />
                </Box>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid item xs={6} md={2}><Typography variant="caption" color="text.secondary">Saldo provedor</Typography><Typography fontWeight={800}>{formatCentsStringToBRL(providerTreasury.providerBalanceCents || '0')}</Typography></Grid>
                  <Grid item xs={6} md={2}><Typography variant="caption" color="text.secondary">Aprovadas</Typography><Typography fontWeight={800}>{formatCentsStringToBRL(providerTreasury.approvedObligationsCents || '0')}</Typography></Grid>
                  <Grid item xs={6} md={2}><Typography variant="caption" color="text.secondary">Reservadas</Typography><Typography fontWeight={800}>{formatCentsStringToBRL(providerTreasury.reservedObligationsCents || '0')}</Typography></Grid>
                  <Grid item xs={6} md={2}><Typography variant="caption" color="text.secondary">Em trânsito</Typography><Typography fontWeight={800}>{formatCentsStringToBRL(providerTreasury.inTransitCents || '0')}</Typography></Grid>
                  <Grid item xs={6} md={2}><Typography variant="caption" color="text.secondary">Buffer</Typography><Typography fontWeight={800}>{formatCentsStringToBRL(providerTreasury.bufferCents || '0')}</Typography></Grid>
                  <Grid item xs={6} md={2}><Typography variant="caption" color="text.secondary">Déficit</Typography><Typography fontWeight={800} color={providerTreasury.deficitCents !== '0' ? 'error.main' : 'success.main'}>{formatCentsStringToBRL(providerTreasury.deficitCents || '0')}</Typography></Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          <Card elevation={0} sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5, overflow: 'hidden' }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography sx={{ fontWeight: 900, color: '#0F172A' }}>Posição por conta</Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12, color: '#64748B' }}>
                Saldo atual = saldo inicial + entradas realizadas − saídas realizadas. Projetado inclui rascunhos e pendências.
              </Typography>
            </CardContent>
            {treasury?.accounts?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                      <TableCell sx={{ fontWeight: 800 }}>Conta</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Tipo</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Saldo inicial</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>Entradas realizadas</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>Saídas realizadas</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>Saldo atual</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>Previsto líquido</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>Projetado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {treasury.accounts.map((account) => {
                      const pendingNet = BigInt(account.pending_in_cents || '0') - BigInt(account.pending_out_cents || '0');
                      return (
                        <TableRow key={account.id} hover>
                          <TableCell>
                            <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{account.name}</Typography>
                            <Typography sx={{ fontSize: 11, color: '#64748B' }}>{account.code} · {account.institution_name || 'Sem instituição'}</Typography>
                          </TableCell>
                          <TableCell><Chip size="small" label={account.type} variant="outlined" /></TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{formatCentsStringToBRL(account.opening_balance_cents)}</Typography>
                            <Typography sx={{ fontSize: 10, color: '#64748B' }}>{formatDate(account.opening_balance_date)}</Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ color: '#166534', fontWeight: 700 }}>{formatCentsStringToBRL(account.realized_in_cents)}</TableCell>
                          <TableCell align="right" sx={{ color: '#991B1B', fontWeight: 700 }}>{formatCentsStringToBRL(account.realized_out_cents)}</TableCell>
                          <TableCell align="right">
                            <Typography sx={{ fontWeight: 900, color: account.is_negative ? '#B91C1C' : '#0F172A' }}>{formatCentsStringToBRL(account.current_balance_cents)}</Typography>
                            {account.is_negative && <Chip size="small" color="error" label="Negativo" sx={{ mt: 0.4 }} />}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCentsStringToBRL(pendingNet.toString())}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 900, color: '#1D4ED8' }}>{formatCentsStringToBRL(account.projected_balance_cents)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info" sx={{ m: 2 }}>
                Nenhuma conta bancária, caixa ou carteira marcada como equivalente de caixa está ativa.
              </Alert>
            )}
          </Card>
        </>
      )}
    </Container>
  );
}
