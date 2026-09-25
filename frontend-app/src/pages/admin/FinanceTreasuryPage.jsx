import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Grid, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { AccountBalanceWallet, ArrowBack, CloudDone, CloudOff, Refresh, Shield } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { fetchFinanceObligationsSummary, fetchFinanceProviderHealth, fetchFinanceTreasuryHealth, listFinanceBusinessUnits, listOutboundObligations, listOutboundPayouts } from '../../services/adminFinanceService';
import { listLegalEntities } from '../../services/adminAccountingService';
import { formatCentsStringToBRL } from '../../utils/brlCurrency';

const brl = (value) => formatCentsStringToBRL(String(value || '0'));
const date = (value) => value ? new Intl.DateTimeFormat('pt-BR').format(new Date(value)) : '—';

export default function FinanceTreasuryPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ legal_entity_id: '', business_unit_id: '' });
  const [health, setHealth] = useState(null);
  const [provider, setProvider] = useState(null);
  const [accountingSummary, setAccountingSummary] = useState(null);
  const [obligations, setObligations] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [legalEntities, setLegalEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const scopedParams = useMemo(() => ({
    limit: 25,
    ...(filters.legal_entity_id ? { legal_entity_id: filters.legal_entity_id } : {}),
    ...(filters.business_unit_id ? { business_unit_id: filters.business_unit_id } : {}),
  }), [filters]);

  const load = async () => {
    setLoading(true); setError('');
    const results = await Promise.allSettled([
      fetchFinanceTreasuryHealth(),
      fetchFinanceProviderHealth(),
      fetchFinanceObligationsSummary(),
      listOutboundObligations(scopedParams),
      listOutboundPayouts(scopedParams),
    ]);
    const [h, p, a, o, po] = results;
    if (h.status === 'fulfilled') setHealth(h.value?.data || null);
    if (p.status === 'fulfilled') setProvider(p.value?.data || null);
    if (a.status === 'fulfilled') setAccountingSummary(a.value?.data || null);
    if (o.status === 'fulfilled') setObligations(Array.isArray(o.value?.data) ? o.value.data : []);
    if (po.status === 'fulfilled') setPayouts(Array.isArray(po.value?.data) ? po.value.data : []);
    if (results.every((r) => r.status === 'rejected')) setError('Não foi possível carregar os dados da tesouraria.');
    setLoading(false);
  };

  useEffect(() => {
    Promise.allSettled([
      listLegalEntities({ page: 1, limit: 100, is_active: 'true' }),
      listFinanceBusinessUnits(),
    ]).then(([entities, units]) => {
      if (entities.status === 'fulfilled') setLegalEntities(entities.value?.data || []);
      if (units.status === 'fulfilled') setBusinessUnits(units.value?.data || []);
    });
  }, []);

  useEffect(() => { load(); }, [scopedParams]);

  const treasuryAvailable = Boolean(provider?.available && health?.accountOwnershipConfirmed);
  const selectedScope = filters.legal_entity_id || filters.business_unit_id;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F6F8FB', py: 3 }}>
      <Container maxWidth="xl">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Button startIcon={<ArrowBack />} onClick={() => navigate('/admin/financeiro')} sx={{ mb: 1, textTransform: 'none' }}>Financeiro</Button>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#0F172A' }}>Tesouraria e Pagamentos</Typography>
            <Typography sx={{ color: '#64748B' }}>Compromissos por CNPJ e produto; saldo do provedor permanece consolidado enquanto houver uma única conexão de pagamento.</Typography>
          </Box>
          <Button variant="outlined" startIcon={<Refresh />} onClick={load} disabled={loading}>Atualizar</Button>
        </Box>

        <Card sx={{ border: '1px solid #E2E8F0', mb: 2 }}><CardContent>
          <Grid container spacing={1.5}>
            <Grid item xs={12} md={6}><TextField select fullWidth size="small" label="Empresa / filial" value={filters.legal_entity_id} onChange={(e) => setFilters((prev) => ({ ...prev, legal_entity_id: e.target.value }))}>
              <MenuItem value="">Consolidado</MenuItem>{legalEntities.map((e) => <MenuItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social} — {e.entity_type}</MenuItem>)}
            </TextField></Grid>
            <Grid item xs={12} md={6}><TextField select fullWidth size="small" label="Produto / linha de negócio" value={filters.business_unit_id} onChange={(e) => setFilters((prev) => ({ ...prev, business_unit_id: e.target.value }))}>
              <MenuItem value="">Todos</MenuItem>{businessUnits.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
            </TextField></Grid>
          </Grid>
        </CardContent></Card>

        {selectedScope && <Alert severity="info" sx={{ mb: 2 }}>Os quadros de obrigações e pagamentos abaixo estão filtrados. Os cards de saldo/saúde do provedor são consolidados e não representam saldo bancário individual de uma filial.</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading && !health && <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>}

        <Grid container spacing={2} sx={{ mb: 2 }}>
          {[
            ['Saldo no provedor', health?.providerBalanceCents],
            ['Vence em 7 dias', health?.dueNext7DaysCents],
            ['Vence em 30 dias', health?.dueNext30DaysCents],
            ['Déficit projetado', health?.deficitCents],
          ].map(([label, value], index) => (
            <Grid item xs={12} sm={6} md={3} key={label}><Card sx={{ border: '1px solid #E2E8F0', height: '100%' }}><CardContent>
              <Typography sx={{ color: '#64748B', fontSize: 12 }}>{label}</Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 800, color: index === 3 && Number(value || 0) > 0 ? '#B91C1C' : '#0F172A' }}>{treasuryAvailable ? brl(value) : 'Não disponível'}</Typography>
            </CardContent></Card></Grid>
          ))}
        </Grid>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} md={6}><Card sx={{ border: '1px solid #E2E8F0', height: '100%' }}><CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>{provider?.available ? <CloudDone color="success" /> : <CloudOff color="warning" />}<Typography sx={{ fontWeight: 700 }}>Provedor financeiro</Typography></Box>
            <Typography sx={{ fontSize: 14 }}>Provider: <strong>{provider?.provider || 'não configurado'}</strong></Typography>
            <Chip size="small" color={provider?.available ? 'success' : 'warning'} label={provider?.available ? 'Disponível' : 'Indisponível / desabilitado'} sx={{ mt: 1 }} />
            {provider?.reason && <Typography sx={{ mt: 1, color: '#64748B', fontSize: 12 }}>{provider.reason}</Typography>}
          </CardContent></Card></Grid>
          <Grid item xs={12} md={6}><Card sx={{ border: '1px solid #E2E8F0', height: '100%' }}><CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}><Shield color={health?.accountOwnershipConfirmed ? 'success' : 'warning'} /><Typography sx={{ fontWeight: 700 }}>Controles de tesouraria</Typography></Box>
            <Typography sx={{ fontSize: 14 }}>Titularidade confirmada: <strong>{health?.accountOwnershipConfirmed ? 'Sim' : 'Não'}</strong></Typography>
            <Typography sx={{ fontSize: 14 }}>Obrigações aprovadas (consolidado): <strong>{treasuryAvailable ? brl(health?.approvedObligationsCents) : 'Não disponível'}</strong></Typography>
            <Typography sx={{ fontSize: 14 }}>Em trânsito (consolidado): <strong>{treasuryAvailable ? brl(health?.inTransitCents) : 'Não disponível'}</strong></Typography>
            <Typography sx={{ fontSize: 14 }}>Obrigações do portal contábil pendentes: <strong>{accountingSummary?.pending || 0}</strong></Typography>
          </CardContent></Card></Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12} lg={6}><Card sx={{ border: '1px solid #E2E8F0' }}><CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}><AccountBalanceWallet color="primary" /><Typography variant="h6" sx={{ fontWeight: 700 }}>Obrigações outbound</Typography></Box>
            <Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}><TableCell>Descrição</TableCell><TableCell>Empresa</TableCell><TableCell>Produto</TableCell><TableCell>Vencimento</TableCell><TableCell>Status</TableCell><TableCell align="right">Valor</TableCell></TableRow></TableHead><TableBody>
              {obligations.map((item) => <TableRow key={item.id}><TableCell>{item.description_safe || item.purpose}</TableCell><TableCell>{item.legal_entity_nome_fantasia || item.legal_entity_razao_social || '—'}</TableCell><TableCell>{item.business_unit_name || '—'}</TableCell><TableCell>{date(item.due_date)}</TableCell><TableCell><Chip size="small" label={item.status} /></TableCell><TableCell align="right">{brl(item.net_amount_cents)}</TableCell></TableRow>)}
              {obligations.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: '#64748B' }}>Nenhuma obrigação outbound.</TableCell></TableRow>}
            </TableBody></Table></Box>
          </CardContent></Card></Grid>

          <Grid item xs={12} lg={6}><Card sx={{ border: '1px solid #E2E8F0' }}><CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Pagamentos recentes</Typography>
            <Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}><TableCell>Provedor</TableCell><TableCell>Empresa</TableCell><TableCell>Produto</TableCell><TableCell>Status</TableCell><TableCell align="right">Valor</TableCell></TableRow></TableHead><TableBody>
              {payouts.map((item) => <TableRow key={item.id}><TableCell>{item.provider_name || '—'}</TableCell><TableCell>{item.legal_entity_nome_fantasia || item.legal_entity_razao_social || '—'}</TableCell><TableCell>{item.business_unit_name || '—'}</TableCell><TableCell><Chip size="small" label={item.status} /></TableCell><TableCell align="right">{brl(item.amount_cents)}</TableCell></TableRow>)}
              {payouts.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: '#64748B' }}>Nenhum pagamento enviado.</TableCell></TableRow>}
            </TableBody></Table></Box>
          </CardContent></Card></Grid>
        </Grid>
      </Container>
    </Box>
  );
}
