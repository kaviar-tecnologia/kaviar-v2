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
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccountBalance,
  ArrowForward,
  CloudDone,
  CloudOff,
  Payments,
  ReceiptLong,
  RequestQuote,
  Savings,
  TrendingDown,
  TrendingUp,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import FinanceModuleNav from '../../components/admin/finance/FinanceModuleNav';
import {
  fetchAccountingObligationsSummary,
  fetchDashboardSummary,
  fetchFinanceReceivablesSummary,
  fetchFinanceTreasurySummary,
  fetchOutboundProviderHealth,
  fetchOutboundTreasuryHealth,
} from '../../services/adminFinanceService';
import { formatCentsStringToBRL } from '../../utils/brlCurrency';

function localIsoDate(date) {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function periodParams(period) {
  if (period === 'all') return {};
  const days = period === '90d' ? 90 : 30;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return {
    date_field: 'transaction_date',
    date_from: localIsoDate(start),
    date_to: localIsoDate(end),
  };
}

function MetricCard({ title, value, subtitle, icon, tone = 'default' }) {
  const tones = {
    positive: { bg: '#F0FDF4', border: '#BBF7D0', value: '#166534' },
    negative: { bg: '#FEF2F2', border: '#FECACA', value: '#991B1B' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', value: '#92400E' },
    info: { bg: '#EFF6FF', border: '#BFDBFE', value: '#1D4ED8' },
    default: { bg: '#FFFFFF', border: '#E2E8F0', value: '#0F172A' },
  };
  const t = tones[tone] || tones.default;
  return (
    <Card elevation={0} sx={{ height: '100%', bgcolor: t.bg, border: `1px solid ${t.border}`, borderRadius: 2.5 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {title}
          </Typography>
          <Box sx={{ color: t.value, display: 'flex' }}>{icon}</Box>
        </Box>
        <Typography sx={{ mt: 1, fontSize: 22, lineHeight: 1.2, fontWeight: 800, color: t.value }}>
          {value}
        </Typography>
        {subtitle && <Typography sx={{ mt: 0.5, fontSize: 11, color: '#64748B' }}>{subtitle}</Typography>}
      </CardContent>
    </Card>
  );
}

function QuickLink({ to, title, description, icon }) {
  return (
    <Card elevation={0} sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5, height: '100%' }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: '#EFF6FF', color: '#1D4ED8', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {icon}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>{title}</Typography>
            <Typography sx={{ mt: 0.25, fontSize: 12, color: '#64748B' }}>{description}</Typography>
            <Button component={RouterLink} to={to} size="small" endIcon={<ArrowForward />} sx={{ mt: 1, px: 0, textTransform: 'none', fontWeight: 700 }}>
              Abrir
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function FinanceOverviewPage() {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState({
    dashboard: null,
    receivables: null,
    treasury: null,
    payables: null,
    provider: null,
    providerTreasury: null,
  });
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setWarnings([]);

    const calls = [
      ['dashboard', fetchDashboardSummary(periodParams(period))],
      ['receivables', fetchFinanceReceivablesSummary()],
      ['treasury', fetchFinanceTreasurySummary()],
      ['payables', fetchAccountingObligationsSummary()],
      ['provider', fetchOutboundProviderHealth()],
      ['providerTreasury', fetchOutboundTreasuryHealth()],
    ];

    const results = await Promise.allSettled(calls.map(([, promise]) => promise));
    const next = {};
    const failed = [];

    results.forEach((result, index) => {
      const key = calls[index][0];
      if (result.status === 'fulfilled') next[key] = result.value?.data ?? null;
      else {
        next[key] = null;
        failed.push(key);
      }
    });

    setData(next);
    if (failed.length) {
      setWarnings(failed);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const summary = data.dashboard?.summary;
  const providerAvailable = data.provider?.available === true;

  return (
    <Container maxWidth="xl" sx={{ mt: 2, pb: 6 }}>
      <FinanceModuleNav />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'stretch', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, color: '#0F172A' }}>Visão Financeira KAVIAR</Typography>
          <Typography sx={{ mt: 0.5, color: '#64748B', fontSize: 13 }}>
            Receitas, despesas, recebíveis, obrigações, caixa e infraestrutura de pagamentos em uma única visão.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField select size="small" label="Período do resultado" value={period} onChange={(e) => setPeriod(e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="30d">Últimos 30 dias</MenuItem>
            <MenuItem value="90d">Últimos 90 dias</MenuItem>
            <MenuItem value="all">Todo o histórico</MenuItem>
          </TextField>
          <Button variant="outlined" onClick={load} disabled={loading} sx={{ textTransform: 'none' }}>Atualizar</Button>
        </Box>
      </Box>

      {warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Parte do painel não pôde ser carregada ({warnings.join(', ')}). Os demais blocos continuam disponíveis.
        </Alert>
      )}

      {loading && !summary ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard title="Receitas realizadas" value={formatCentsStringToBRL(summary?.realized_revenue_cents || '0')} icon={<TrendingUp />} tone="positive" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard title="Despesas realizadas" value={formatCentsStringToBRL(summary?.realized_expense_cents || '0')} icon={<TrendingDown />} tone="negative" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard title="Resultado realizado" value={formatCentsStringToBRL(summary?.realized_result_cents || '0')} icon={<AccountBalance />} tone="info" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Caixa / equivalentes"
                value={formatCentsStringToBRL(data.treasury?.current_total_cents || '0')}
                subtitle={`Projetado: ${formatCentsStringToBRL(data.treasury?.projected_total_cents || '0')}`}
                icon={<Savings />}
                tone={data.treasury?.negative_account_count > 0 ? 'negative' : 'positive'}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Contas a receber"
                value={formatCentsStringToBRL(data.receivables?.open_total_cents || '0')}
                subtitle={`${data.receivables?.open_count || 0} em aberto`}
                icon={<RequestQuote />}
                tone="info"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Recebíveis vencidos"
                value={formatCentsStringToBRL(data.receivables?.overdue_total_cents || '0')}
                subtitle={`${data.receivables?.overdue_count || 0} vencidos`}
                icon={<ReceiptLong />}
                tone={(data.receivables?.overdue_count || 0) > 0 ? 'negative' : 'default'}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Contas a pagar"
                value={formatCentsStringToBRL(String(data.payables?.total_pending_cents || '0'))}
                subtitle={`${data.payables?.pending || 0} pendentes · ${data.payables?.overdue || 0} vencidas`}
                icon={<Payments />}
                tone={(data.payables?.overdue || 0) > 0 ? 'warning' : 'default'}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Pagamentos automáticos"
                value={providerAvailable ? 'Disponível' : 'Indisponível'}
                subtitle={data.provider?.provider ? `Provedor: ${data.provider.provider}` : 'Provedor não confirmado'}
                icon={providerAvailable ? <CloudDone /> : <CloudOff />}
                tone={providerAvailable ? 'positive' : 'warning'}
              />
            </Grid>
          </Grid>

          {data.providerTreasury && (
            <Card elevation={0} sx={{ mb: 3, border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 900, color: '#0F172A' }}>Saúde dos pagamentos</Typography>
                    <Typography sx={{ mt: 0.25, fontSize: 12, color: '#64748B' }}>
                      Posição do provedor, obrigações aprovadas, valores em trânsito e necessidade de caixa.
                    </Typography>
                  </Box>
                  <Chip
                    label={data.providerTreasury.deficitCents !== '0' ? 'Atenção a déficit' : 'Sem déficit calculado'}
                    color={data.providerTreasury.deficitCents !== '0' ? 'warning' : 'success'}
                    variant="outlined"
                  />
                </Box>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid item xs={6} md={2.4}><Typography variant="caption" color="text.secondary">Saldo provedor</Typography><Typography fontWeight={800}>{formatCentsStringToBRL(data.providerTreasury.providerBalanceCents || '0')}</Typography></Grid>
                  <Grid item xs={6} md={2.4}><Typography variant="caption" color="text.secondary">Aprovado a pagar</Typography><Typography fontWeight={800}>{formatCentsStringToBRL(data.providerTreasury.approvedObligationsCents || '0')}</Typography></Grid>
                  <Grid item xs={6} md={2.4}><Typography variant="caption" color="text.secondary">Em trânsito</Typography><Typography fontWeight={800}>{formatCentsStringToBRL(data.providerTreasury.inTransitCents || '0')}</Typography></Grid>
                  <Grid item xs={6} md={2.4}><Typography variant="caption" color="text.secondary">Próximos 7 dias</Typography><Typography fontWeight={800}>{formatCentsStringToBRL(data.providerTreasury.dueNext7DaysCents || '0')}</Typography></Grid>
                  <Grid item xs={6} md={2.4}><Typography variant="caption" color="text.secondary">Déficit</Typography><Typography fontWeight={800}>{formatCentsStringToBRL(data.providerTreasury.deficitCents || '0')}</Typography></Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          <Typography sx={{ mb: 1.5, fontWeight: 900, color: '#0F172A' }}>Operação financeira</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}><QuickLink to="/admin/financeiro/contas-a-receber" title="Contas a receber" description="Aging, vencimentos e baixa dos recebíveis cadastrados no ledger." icon={<RequestQuote />} /></Grid>
            <Grid item xs={12} md={4}><QuickLink to="/admin/financeiro/contas-a-pagar" title="Contas a pagar" description="Obrigações do contador, boletos, notas fiscais e comprovantes." icon={<Payments />} /></Grid>
            <Grid item xs={12} md={4}><QuickLink to="/admin/financeiro/tesouraria" title="Tesouraria" description="Saldo atual e projetado por conta bancária, caixa ou carteira." icon={<Savings />} /></Grid>
            <Grid item xs={12} md={4}><QuickLink to="/admin/financeiro/lancamentos" title="Lançamentos" description="Ledger financeiro, DRE gerencial, liquidação, cancelamento e estorno." icon={<ReceiptLong />} /></Grid>
            <Grid item xs={12} md={4}><QuickLink to="/admin/financeiro/pagamentos" title="Pagamentos" description="Beneficiários, obrigações, payouts e reconciliação com o provedor." icon={<Paid />} /></Grid>
            <Grid item xs={12} md={4}><QuickLink to="/admin/financeiro" title="Estrutura financeira" description="Plano de contas, categorias e centros de custo." icon={<AccountBalance />} /></Grid>
          </Grid>
        </>
      )}
    </Container>
  );
}
