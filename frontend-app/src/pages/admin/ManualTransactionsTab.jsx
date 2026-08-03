/**
 * Manual Transactions Tab — Lançamentos Manuais
 * Read-only view with filters, summary cards, table, CSV export, and pagination.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
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
import { Assessment, Download, FilterList, Refresh } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';

function getToken() {
  return localStorage.getItem('kaviar_admin_token');
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function formatCentsToReais(value) {
  if (value == null || value === '') return '—';
  const str = String(value).trim();
  if (!/^-?\d+$/.test(str)) return '—';
  const isNegative = str.startsWith('-');
  const abs = isNegative ? str.slice(1) : str;
  const padded = abs.padStart(3, '0');
  const intPart = padded.slice(0, -2);
  const fracPart = padded.slice(-2);
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted = `R$ ${withSep},${fracPart}`;
  return isNegative ? `- ${formatted}` : formatted;
}

const STATUS_LABELS = {
  DRAFT: 'Rascunho',
  PENDING: 'Pendente',
  POSTED: 'Liquidado',
  CANCELED: 'Cancelado',
  REVERSED: 'Estornado',
  BLOCKED: 'Bloqueado',
  RECONCILED: 'Conciliado',
  CLOSED: 'Fechado',
};

const STATUS_COLORS = {
  DRAFT: '#6B7280',
  PENDING: '#D97706',
  POSTED: '#16A34A',
  CANCELED: '#DC2626',
  REVERSED: '#9333EA',
  BLOCKED: '#DC2626',
  RECONCILED: '#2563EB',
  CLOSED: '#374151',
};

const DIRECTION_LABELS = { IN: 'Entrada', OUT: 'Saída' };

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'POSTED', label: 'Liquidado' },
  { value: 'CANCELED', label: 'Cancelado' },
  { value: 'REVERSED', label: 'Estornado' },
  { value: 'BLOCKED', label: 'Bloqueado' },
  { value: 'RECONCILED', label: 'Conciliado' },
  { value: 'CLOSED', label: 'Fechado' },
];

const DIRECTION_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'IN', label: 'Entrada' },
  { value: 'OUT', label: 'Saída' },
];

function getStatusDisplay(tx) {
  if (tx.transaction_type === 'REVERSAL' && tx.status === 'POSTED') {
    return { label: 'Liquidado · Reversão', color: STATUS_COLORS.POSTED };
  }
  if (tx.status === 'REVERSED' && tx.reversal) {
    return { label: 'Estornado', color: STATUS_COLORS.REVERSED, reversalId: tx.reversal.id };
  }
  return { label: STATUS_LABELS[tx.status] || tx.status, color: STATUS_COLORS[tx.status] || '#6B7280' };
}

export default function ManualTransactionsTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const [startDate, setStartDate] = useState(thirtyDaysAgoStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const fetchData = useCallback(async (pageNum = 0, limit = rowsPerPage) => {
    setLoading(true);
    setError('');
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      if (status) params.set('status', status);
      if (direction) params.set('direction', direction);
      params.set('page', String(pageNum + 1));
      params.set('limit', String(limit));

      const res = await fetch(
        `${API_BASE_URL}/api/admin/finance/accountant-report/manual-transactions?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.status === 401) { setError('Sessão expirada. Faça login novamente.'); return; }
      if (res.status === 403) { setError('Acesso negado. Permissão insuficiente.'); return; }

      const json = await res.json();
      if (!json.success) { setError(json.error || 'Erro ao carregar lançamentos manuais'); return; }
      setData(json.data);
    } catch {
      setError('Erro de rede ao carregar lançamentos manuais');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, status, direction, rowsPerPage]);

  useEffect(() => { fetchData(page, rowsPerPage); }, [page, rowsPerPage]);

  const handleFilter = () => { setPage(0); fetchData(0, rowsPerPage); };

  const handleExportCSV = async () => {
    const token = getToken();
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (status) params.set('status', status);
    if (direction) params.set('direction', direction);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/finance/accountant-report/manual-transactions/csv?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        try { const err = await res.json(); setError(err.error || `Erro ${res.status}`); }
        catch { setError(`Erro ${res.status} ao exportar CSV`); }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kaviar-transacoes-manuais-${startDate}-a-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Erro de rede ao exportar CSV');
    }
  };

  const summary = data?.summary;
  const transactions = data?.transactions || [];
  const pagination = data?.pagination;

  const realizedIn = summary?.realized_in_total_cents;
  const realizedOut = summary?.realized_out_total_cents;
  const netFlow = (realizedIn != null && realizedOut != null)
    ? String(BigInt(realizedIn) - BigInt(realizedOut))
    : null;

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')} data-testid="manual-error">
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3, border: '1px solid #E5E7EB' }}>
        <CardContent sx={{ py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <FilterList sx={{ fontSize: 18, color: '#6B7280' }} />
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Filtros</Typography>
          </Box>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={2}>
              <TextField label="Data inicial" type="date" size="small" fullWidth
                value={startDate} onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField label="Data final" type="date" size="small" fullWidth
                value={endDate} onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField label="Status" select size="small" fullWidth
                value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField label="Direção" select size="small" fullWidth
                value={direction} onChange={(e) => setDirection(e.target.value)}>
                {DIRECTION_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" size="small" onClick={handleFilter}
                  startIcon={<Refresh sx={{ fontSize: 16 }} />}
                  sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#2563EB', '&:hover': { bgcolor: '#1D4ED8' } }}>
                  Filtrar
                </Button>
                <Button variant="outlined" size="small" onClick={handleExportCSV}
                  startIcon={<Download sx={{ fontSize: 16 }} />}
                  disabled={!data || transactions.length === 0}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                  data-testid="manual-csv-btn">
                  CSV
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && !data && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Summary Cards */}
      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Entradas realizadas', value: formatCentsToReais(realizedIn), color: '#16A34A' },
            { label: 'Saídas realizadas', value: formatCentsToReais(realizedOut), color: '#DC2626' },
            { label: 'Fluxo líquido manual', value: formatCentsToReais(netFlow), color: '#7C3AED' },
          ].map((item) => (
            <Grid item xs={12} sm={4} key={item.label}>
              <Card sx={{ border: '1px solid #E5E7EB', borderTop: `3px solid ${item.color}` }}>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography sx={{ color: item.color, fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
                    {item.value}
                  </Typography>
                  <Typography sx={{ color: '#6B7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', mt: 0.5 }}>
                    {item.label}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Table */}
      {data && (
        <Card sx={{ border: '1px solid #E5E7EB' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Data ref.</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Descrição</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Conta</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Categoria</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Centro custo</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Direção</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Tipo</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Valor líquido</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6, color: '#9CA3AF' }}>
                      <Assessment sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
                      <Typography variant="body2">Nenhum lançamento manual encontrado no período.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx) => {
                    const statusDisplay = getStatusDisplay(tx);
                    return (
                      <TableRow key={tx.id} hover>
                        <TableCell sx={{ fontSize: 11 }}>{tx.reporting_date || '—'}</TableCell>
                        <TableCell sx={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.description || '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: 11 }}>{tx.account?.name || '—'}</TableCell>
                        <TableCell sx={{ fontSize: 11 }}>{tx.category?.name || '—'}</TableCell>
                        <TableCell sx={{ fontSize: 11 }}>{tx.cost_center?.name || '—'}</TableCell>
                        <TableCell sx={{ fontSize: 11 }}>
                          <Chip label={DIRECTION_LABELS[tx.direction] || tx.direction} size="small"
                            sx={{ fontSize: 10, height: 20, fontWeight: 600,
                              bgcolor: tx.direction === 'IN' ? '#DCFCE7' : '#FEE2E2',
                              color: tx.direction === 'IN' ? '#16A34A' : '#DC2626' }} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 11 }}>{tx.transaction_type || '—'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Chip label={statusDisplay.label} size="small"
                              sx={{ fontSize: 10, height: 20, fontWeight: 600,
                                bgcolor: `${statusDisplay.color}15`, color: statusDisplay.color }} />
                            {statusDisplay.reversalId && (
                              <Typography component="span" sx={{ fontSize: 10, color: '#9333EA', cursor: 'pointer', textDecoration: 'underline' }}>
                                ver reversão
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: 11, fontWeight: 600 }} align="right">
                          {formatCentsToReais(tx.net_amount_cents)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {pagination && (
            <TablePagination
              component="div"
              count={pagination.total}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[25, 50, 100, 200]}
              labelRowsPerPage="Linhas:"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          )}
        </Card>
      )}
    </Box>
  );
}
