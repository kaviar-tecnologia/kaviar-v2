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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { CheckCircle, OpenInNew, Refresh, RequestQuote, WarningAmber } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import FinanceModuleNav from '../../components/admin/finance/FinanceModuleNav';
import {
  fetchFinanceReceivablesSummary,
  listFinanceReceivables,
  postFinanceTransaction,
} from '../../services/adminFinanceService';
import { formatCentsStringToBRL } from '../../utils/brlCurrency';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const STATE_OPTIONS = [
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'OVERDUE', label: 'Vencidos' },
  { value: 'DUE_7', label: 'Vencem em 7 dias' },
  { value: 'DUE_30', label: 'Vencem em 30 dias' },
  { value: 'NO_DUE_DATE', label: 'Sem vencimento' },
  { value: 'SETTLED', label: 'Recebidos' },
  { value: 'ALL', label: 'Todos' },
];

const STATUS_LABELS = {
  DRAFT: 'Rascunho',
  PENDING: 'Pendente',
  POSTED: 'Recebido',
  RECONCILED: 'Conciliado',
  CLOSED: 'Fechado',
};

const DUE_LABELS = {
  OVERDUE: { label: 'Vencido', color: 'error' },
  DUE_TODAY: { label: 'Vence hoje', color: 'warning' },
  DUE_7: { label: 'Até 7 dias', color: 'warning' },
  DUE_30: { label: 'Até 30 dias', color: 'info' },
  FUTURE: { label: 'Futuro', color: 'default' },
  NO_DUE_DATE: { label: 'Sem vencimento', color: 'default' },
  SETTLED: { label: 'Recebido', color: 'success' },
};

function localToday() {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(value) {
  if (!value) return '—';
  const iso = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
}

function SummaryCard({ label, amount, count, tone = 'default' }) {
  const tones = {
    default: { border: '#E2E8F0', bg: '#FFFFFF', color: '#0F172A' },
    info: { border: '#BFDBFE', bg: '#EFF6FF', color: '#1D4ED8' },
    warning: { border: '#FDE68A', bg: '#FFFBEB', color: '#92400E' },
    danger: { border: '#FECACA', bg: '#FEF2F2', color: '#991B1B' },
    success: { border: '#BBF7D0', bg: '#F0FDF4', color: '#166534' },
  };
  const t = tones[tone] || tones.default;
  return (
    <Card elevation={0} sx={{ height: '100%', border: `1px solid ${t.border}`, bgcolor: t.bg, borderRadius: 2.5 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>{label}</Typography>
        <Typography sx={{ mt: 0.75, fontWeight: 900, fontSize: 20, color: t.color }}>{formatCentsStringToBRL(amount || '0')}</Typography>
        <Typography sx={{ mt: 0.25, fontSize: 11, color: '#64748B' }}>{count || 0} registro(s)</Typography>
      </CardContent>
    </Card>
  );
}

export default function FinanceReceivablesPage() {
  const { isSuperAdmin } = useAdminAuth();
  const canWrite = isSuperAdmin();
  const [query, setQuery] = useState({ page: 1, limit: 25, state: 'OPEN', search: '' });
  const [searchInput, setSearchInput] = useState('');
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settleRow, setSettleRow] = useState(null);
  const [settling, setSettling] = useState(false);
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listResult, summaryResult] = await Promise.all([
        listFinanceReceivables(query),
        fetchFinanceReceivablesSummary(),
      ]);
      setRows(listResult.data || []);
      setPagination(listResult.pagination || { page: 1, limit: query.limit, total: 0, totalPages: 1 });
      setSummary(summaryResult.data || null);
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar contas a receber.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const submitSearch = (event) => {
    event?.preventDefault();
    setQuery((current) => ({ ...current, page: 1, search: searchInput.trim() }));
  };

  const settle = async () => {
    if (!settleRow) return;
    setSettling(true);
    setError('');
    try {
      await postFinanceTransaction(settleRow.id, {
        expected_updated_at: settleRow.updated_at,
        settlement_date: localToday(),
      });
      setSettleRow(null);
      setSuccess('Recebimento registrado com sucesso.');
      await load();
    } catch (err) {
      setError(err?.message || 'Não foi possível registrar o recebimento.');
    } finally {
      setSettling(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 2, pb: 6 }}>
      <FinanceModuleNav />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, color: '#0F172A' }}>Contas a Receber</Typography>
          <Typography sx={{ mt: 0.5, color: '#64748B', fontSize: 13 }}>
            Controle de vencimentos, aging e baixa de recebíveis registrados no ledger financeiro.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<Refresh />} variant="outlined" onClick={load} disabled={loading} sx={{ textTransform: 'none' }}>Atualizar</Button>
          {canWrite && (
            <Button component={RouterLink} to="/admin/financeiro/lancamentos" endIcon={<OpenInNew />} variant="contained" sx={{ textTransform: 'none', fontWeight: 700 }}>
              Novo recebível
            </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}><SummaryCard label="Em aberto" amount={summary?.open_total_cents} count={summary?.open_count} tone="info" /></Grid>
        <Grid item xs={12} sm={6} md={2.4}><SummaryCard label="Vencidos" amount={summary?.overdue_total_cents} count={summary?.overdue_count} tone={(summary?.overdue_count || 0) > 0 ? 'danger' : 'default'} /></Grid>
        <Grid item xs={12} sm={6} md={2.4}><SummaryCard label="Próximos 7 dias" amount={summary?.due_7_total_cents} count={summary?.due_7_count} tone="warning" /></Grid>
        <Grid item xs={12} sm={6} md={2.4}><SummaryCard label="Próximos 30 dias" amount={summary?.due_30_total_cents} count={summary?.due_30_count} tone="default" /></Grid>
        <Grid item xs={12} sm={6} md={2.4}><SummaryCard label="Já recebidos" amount={summary?.settled_total_cents} count={summary?.settled_count} tone="success" /></Grid>
      </Grid>

      <Card elevation={0} sx={{ mb: 2, border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
        <CardContent>
          <Box component="form" onSubmit={submitSearch} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              label="Buscar"
              placeholder="Descrição, referência..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              sx={{ minWidth: { xs: '100%', sm: 280 } }}
            />
            <TextField
              select
              size="small"
              label="Situação"
              value={query.state}
              onChange={(e) => setQuery((current) => ({ ...current, page: 1, state: e.target.value }))}
              sx={{ minWidth: 190 }}
            >
              {STATE_OPTIONS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
            <Button type="submit" variant="outlined" sx={{ textTransform: 'none' }}>Aplicar</Button>
          </Box>
        </CardContent>
      </Card>

      <Card elevation={0} sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>
        ) : rows.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, px: 2 }}>
            <RequestQuote sx={{ fontSize: 42, color: '#94A3B8' }} />
            <Typography sx={{ mt: 1, fontWeight: 800, color: '#334155' }}>Nenhum recebível encontrado</Typography>
            <Typography sx={{ mt: 0.5, color: '#64748B', fontSize: 13 }}>Ajuste os filtros ou registre um lançamento do tipo “A receber”.</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                    <TableCell sx={{ fontWeight: 800 }}>Descrição</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Cliente / contraparte</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Vencimento</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Situação</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Conta</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Categoria</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>Valor</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>Ação</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const due = DUE_LABELS[row.due_state] || DUE_LABELS.FUTURE;
                    const open = row.status === 'DRAFT' || row.status === 'PENDING';
                    return (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{row.description}</Typography>
                          <Typography sx={{ fontSize: 11, color: '#64748B' }}>{row.external_reference || row.source_id || row.id.slice(0, 8)}</Typography>
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{row.metadata?.counterparty_name || '—'}</TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: 12 }}>{formatDate(row.due_date)}</Typography>
                          <Chip size="small" label={due.label} color={due.color} variant="outlined" sx={{ mt: 0.5 }} />
                        </TableCell>
                        <TableCell><Chip size="small" label={STATUS_LABELS[row.status] || row.status} color={open ? 'warning' : 'success'} /></TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{row.account?.name || '—'}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{row.category?.name || '—'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>{formatCentsStringToBRL(row.net_amount_cents)}</TableCell>
                        <TableCell align="right">
                          {canWrite && open ? (
                            <Button size="small" startIcon={<CheckCircle />} onClick={() => setSettleRow(row)} sx={{ textTransform: 'none' }}>
                              Receber
                            </Button>
                          ) : (
                            <Typography sx={{ fontSize: 11, color: '#94A3B8' }}>{open ? 'Somente leitura' : 'Concluído'}</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={pagination.total || 0}
              page={Math.max(0, (pagination.page || 1) - 1)}
              onPageChange={(_, page) => setQuery((current) => ({ ...current, page: page + 1 }))}
              rowsPerPage={query.limit}
              onRowsPerPageChange={(e) => setQuery((current) => ({ ...current, page: 1, limit: Number(e.target.value) }))}
              rowsPerPageOptions={[10, 25, 50, 100]}
              labelRowsPerPage="Por página"
            />
          </>
        )}
      </Card>

      <Dialog open={Boolean(settleRow)} onClose={() => !settling && setSettleRow(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirmar recebimento</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" icon={<WarningAmber />} sx={{ mb: 2 }}>
            A baixa registra o lançamento como liquidado no ledger e usa a data de hoje como recebimento.
          </Alert>
          <Typography sx={{ fontWeight: 700 }}>{settleRow?.description}</Typography>
          <Typography sx={{ mt: 0.5, color: '#64748B' }}>{formatCentsStringToBRL(settleRow?.net_amount_cents || '0')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettleRow(null)} disabled={settling}>Cancelar</Button>
          <Button variant="contained" color="success" onClick={settle} disabled={settling}>
            {settling ? 'Registrando...' : 'Confirmar recebimento'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
