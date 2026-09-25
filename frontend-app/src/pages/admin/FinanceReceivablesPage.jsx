import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Grid, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { ArrowBack, ReceiptLong, Refresh, TrendingUp } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { fetchDashboardSummary, listFinanceBusinessUnits, listFinanceTransactions } from '../../services/adminFinanceService';
import { listLegalEntities } from '../../services/adminAccountingService';
import { formatCentsStringToBRL } from '../../utils/brlCurrency';

const STATUS_LABELS = {
  DRAFT: 'Rascunho', PENDING: 'Pendente', POSTED: 'Liquidado', RECONCILED: 'Conciliado',
  CLOSED: 'Fechado', CANCELED: 'Cancelado', REVERSED: 'Estornado', BLOCKED: 'Bloqueado',
};
const statusColor = (status) => ['POSTED', 'RECONCILED', 'CLOSED'].includes(status) ? 'success' : status === 'PENDING' ? 'warning' : ['CANCELED', 'REVERSED', 'BLOCKED'].includes(status) ? 'error' : 'default';
const formatDate = (value) => {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
};

export default function FinanceReceivablesPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: '', legal_entity_id: '', business_unit_id: '' });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [summary, setSummary] = useState(null);
  const [legalEntities, setLegalEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = useMemo(() => ({
    page, limit: 50, direction: 'IN', transaction_type: 'RECEIVABLE',
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.legal_entity_id ? { legal_entity_id: filters.legal_entity_id } : {}),
    ...(filters.business_unit_id ? { business_unit_id: filters.business_unit_id } : {}),
  }), [page, filters]);

  const dashboardParams = useMemo(() => {
    const { page: _page, limit: _limit, ...rest } = params;
    return rest;
  }, [params]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [list, dashboard] = await Promise.all([listFinanceTransactions(params), fetchDashboardSummary(dashboardParams)]);
      setRows(Array.isArray(list?.data) ? list.data : []);
      setPagination(list?.pagination || { total: 0, totalPages: 0 });
      setSummary(dashboard?.data || null);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar as contas a receber.');
    } finally { setLoading(false); }
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

  useEffect(() => { load(); }, [params]);

  const setFilter = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F6F8FB', py: 3 }}>
      <Container maxWidth="xl">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Button startIcon={<ArrowBack />} onClick={() => navigate('/admin/financeiro')} sx={{ mb: 1, textTransform: 'none' }}>Financeiro</Button>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#0F172A' }}>Contas a Receber</Typography>
            <Typography sx={{ color: '#64748B' }}>Recebíveis segmentados por CNPJ, produto e situação financeira.</Typography>
          </Box>
          <Button variant="outlined" startIcon={<Refresh />} onClick={load} disabled={loading}>Atualizar</Button>
        </Box>

        <Card sx={{ border: '1px solid #E2E8F0', mb: 2 }}>
          <CardContent>
            <Grid container spacing={1.5}>
              <Grid item xs={12} md={4}><TextField select fullWidth size="small" label="Empresa / filial" value={filters.legal_entity_id} onChange={(e) => setFilter('legal_entity_id', e.target.value)}>
                <MenuItem value="">Consolidado</MenuItem>{legalEntities.map((e) => <MenuItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social} — {e.entity_type}</MenuItem>)}
              </TextField></Grid>
              <Grid item xs={12} md={4}><TextField select fullWidth size="small" label="Produto / linha de negócio" value={filters.business_unit_id} onChange={(e) => setFilter('business_unit_id', e.target.value)}>
                <MenuItem value="">Todos</MenuItem>{businessUnits.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
              </TextField></Grid>
              <Grid item xs={12} md={4}><TextField select fullWidth size="small" label="Status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                <MenuItem value="">Todos</MenuItem>{Object.entries(STATUS_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField></Grid>
            </Grid>
          </CardContent>
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={2} sx={{ mb: 2 }}>
          {[
            ['Receitas previstas', summary?.summary?.forecast_revenue_cents || '0'],
            ['Receitas realizadas', summary?.summary?.realized_revenue_cents || '0'],
            ['Total pendente', summary?.summary?.pending_total_cents || '0'],
            ['Total vencido', summary?.summary?.overdue_total_cents || '0'],
          ].map(([label, value], index) => (
            <Grid item xs={12} sm={6} md={3} key={label}><Card sx={{ height: '100%', border: '1px solid #E2E8F0' }}><CardContent>
              <Typography sx={{ color: '#64748B', fontSize: 12 }}>{label}</Typography>
              <Typography sx={{ fontWeight: 800, fontSize: 24, color: index === 3 ? '#B91C1C' : '#0F172A' }}>{formatCentsStringToBRL(String(value))}</Typography>
            </CardContent></Card></Grid>
          ))}
        </Grid>

        <Card sx={{ border: '1px solid #E2E8F0' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}><ReceiptLong color="primary" /><Typography variant="h6" sx={{ fontWeight: 700 }}>Recebíveis registrados</Typography><Chip size="small" label={`${pagination.total || 0} itens`} /></Box>
            {loading ? <Box sx={{ py: 7, textAlign: 'center' }}><CircularProgress /></Box> : <Box sx={{ overflowX: 'auto' }}>
              <Table size="small"><TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>
                <TableCell>Descrição</TableCell><TableCell>Empresa</TableCell><TableCell>Produto</TableCell><TableCell>Vencimento</TableCell><TableCell>Status</TableCell><TableCell align="right">Valor líquido</TableCell>
              </TableRow></TableHead><TableBody>
                {rows.map((row) => <TableRow key={row.id} hover>
                  <TableCell><Typography sx={{ fontWeight: 600, fontSize: 13 }}>{row.description || 'Recebível'}</Typography><Typography sx={{ fontSize: 11, color: '#64748B' }}>{row.external_reference || row.source_id || row.id}</Typography></TableCell>
                  <TableCell>{row.legal_entity?.nome_fantasia || row.legal_entity?.razao_social || '—'}</TableCell>
                  <TableCell>{row.business_unit?.name || '—'}</TableCell>
                  <TableCell>{formatDate(row.due_date)}</TableCell>
                  <TableCell><Chip size="small" color={statusColor(row.status)} label={STATUS_LABELS[row.status] || row.status} /></TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCentsStringToBRL(String(row.net_amount_cents || '0'))}</TableCell>
                </TableRow>)}
                {rows.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6, color: '#64748B' }}>Nenhum recebível encontrado.</TableCell></TableRow>}
              </TableBody></Table>
            </Box>}
            {pagination.totalPages > 1 && <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
              <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Chip icon={<TrendingUp />} label={`Página ${page} de ${pagination.totalPages}`} />
              <Button size="small" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </Box>}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
