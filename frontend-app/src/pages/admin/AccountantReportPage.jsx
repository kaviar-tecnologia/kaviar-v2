/**
 * Área do Contador V1 — Somente Leitura
 *
 * Exibe resumo financeiro de corridas, listagem detalhada com filtros
 * e exportação CSV. Nenhuma ação de escrita, pagamento ou estorno.
 *
 * Formatação monetária: string-only, sem parseFloat/Number para cálculos.
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
  Container,
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
import {
  Assessment,
  Download,
  FilterList,
  Lock,
  Refresh,
} from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';

// ── Helpers ─────────────────────────────────────────────────────────────────────

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

/**
 * Format a decimal string "1234.50" to "R$ 1.234,50" without parseFloat.
 * Only string manipulation — no floating point conversion.
 */
function formatCurrencyFromDecimal(value) {
  if (value == null || value === '') return '—';
  const str = String(value).trim();
  // Validate: optional sign, digits, dot, 2 digits
  if (!/^-?\d+\.\d{2}$/.test(str)) return '—';

  const isNegative = str.startsWith('-');
  const abs = isNegative ? str.slice(1) : str;
  const [intPart, fracPart] = abs.split('.');

  // Add thousands separator
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted = `R$ ${withSep},${fracPart}`;
  return isNegative ? `- ${formatted}` : formatted;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'completed', label: 'Concluída' },
  { value: 'canceled_by_passenger', label: 'Cancelada (passageiro)' },
  { value: 'canceled_by_driver', label: 'Cancelada (motorista)' },
  { value: 'requested', label: 'Solicitada' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'no_driver', label: 'Sem motorista' },
];

const STATUS_LABELS = {
  completed: 'Concluída',
  canceled_by_passenger: 'Cancel. passageiro',
  canceled_by_driver: 'Cancel. motorista',
  requested: 'Solicitada',
  offered: 'Ofertada',
  accepted: 'Aceita',
  arrived: 'Chegou',
  in_progress: 'Em andamento',
  no_driver: 'Sem motorista',
};

const STATUS_COLORS = {
  completed: '#16a34a',
  canceled_by_passenger: '#dc2626',
  canceled_by_driver: '#dc2626',
  in_progress: '#2563eb',
  requested: '#d97706',
  no_driver: '#6b7280',
};

const FINANCIAL_STATUS_LABELS = {
  SETTLED: 'Liquidado',
  UNSETTLED: 'Não liquidado',
  UNAVAILABLE: 'Indisponível',
};

const FINANCIAL_STATUS_COLORS = {
  SETTLED: '#16a34a',
  UNSETTLED: '#d97706',
  UNAVAILABLE: '#6b7280',
};

/**
 * Translate territory codes to human-readable labels.
 * Preserves unknown codes as-is.
 */
const TERRITORY_LABELS = {
  local: 'Local',
  adjacent: 'Adjacente',
  external: 'Externo',
  homebound: 'Retorno',
};

function formatTerritory(value) {
  if (value == null || value === '') return '—';
  return TERRITORY_LABELS[value] || value;
}

/**
 * Derive a display-friendly financial status considering data completeness.
 * A completed ride without settlement and without driver indicates a test or
 * incomplete flow — shown as "Dados incompletos" to avoid misinterpretation.
 */
function getFinancialStatusDisplay(ride) {
  const status = ride.financial_status;
  if (ride.status === 'completed' && status !== 'SETTLED' && !ride.driver_id) {
    return { label: 'Dados incompletos', color: '#dc2626' };
  }
  return {
    label: FINANCIAL_STATUS_LABELS[status] || status,
    color: FINANCIAL_STATUS_COLORS[status] || '#6b7280',
  };
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function AccountantReportPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  // Filters
  const [startDate, setStartDate] = useState(thirtyDaysAgoStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [status, setStatus] = useState('');
  const [territory, setTerritory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const fetchReport = useCallback(async (pageNum = 0, limit = rowsPerPage) => {
    setLoading(true);
    setError('');
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      if (status) params.set('status', status);
      if (territory) params.set('territory', territory);
      if (search) params.set('search', search);
      params.set('page', String(pageNum + 1));
      params.set('limit', String(limit));

      const res = await fetch(`${API_BASE_URL}/api/admin/finance/accountant-report?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        setError('Sessão expirada. Faça login novamente.');
        return;
      }
      if (res.status === 403) {
        setError('Acesso negado. Permissão insuficiente.');
        return;
      }

      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Erro ao carregar relatório');
        return;
      }

      setData(json.data);
    } catch (err) {
      setError('Erro de rede ao carregar relatório');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, status, territory, search, rowsPerPage]);

  useEffect(() => {
    fetchReport(page, rowsPerPage);
  }, [page, rowsPerPage]);

  const handleFilter = () => {
    setPage(0);
    fetchReport(0, rowsPerPage);
  };

  const handleExportCSV = async () => {
    const token = getToken();
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (status) params.set('status', status);
    if (territory) params.set('territory', territory);
    if (search) params.set('search', search);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/finance/accountant-report/csv?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        // Try to parse error JSON
        try {
          const errJson = await res.json();
          setError(errJson.error || `Erro ${res.status} ao exportar CSV`);
        } catch {
          setError(`Erro ${res.status} ao exportar CSV`);
        }
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kaviar-relatorio-contador-${startDate}-a-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Erro de rede ao exportar CSV');
    }
  };

  const summary = data?.summary;
  const rides = data?.rides || [];
  const pagination = data?.pagination;

  return (
    <Container maxWidth="lg" sx={{ mt: 2, pb: 6 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#F8FAFC' }}>
            📊 Área do Contador
          </Typography>
          <Typography variant="body2" sx={{ color: '#CBD5E1', mt: 0.5 }}>
            Relatório financeiro de corridas — somente leitura
          </Typography>
        </Box>
        <Chip
          icon={<Lock sx={{ fontSize: 14 }} />}
          label="Somente Leitura"
          size="small"
          sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 600, border: '1px solid #FDE68A' }}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
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
              <TextField
                label="Data inicial"
                type="date"
                size="small"
                fullWidth
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                label="Data final"
                type="date"
                size="small"
                fullWidth
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                label="Status"
                select
                size="small"
                fullWidth
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                label="Território"
                size="small"
                fullWidth
                value={territory}
                onChange={(e) => setTerritory(e.target.value)}
                placeholder="Ex: local"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                label="Buscar ID/Motorista"
                size="small"
                fullWidth
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ID ou nome"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleFilter}
                  startIcon={<Refresh sx={{ fontSize: 16 }} />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: '#2563EB',
                    '&:hover': { bgcolor: '#1D4ED8' },
                  }}
                >
                  Filtrar
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleExportCSV}
                  startIcon={<Download sx={{ fontSize: 16 }} />}
                  disabled={!data || rides.length === 0}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
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
            { label: 'Total de Corridas', value: summary.total_rides, color: '#1A1A1A' },
            { label: 'Concluídas', value: summary.completed_rides, color: '#16A34A' },
            { label: 'Canceladas', value: summary.canceled_rides, color: '#DC2626' },
            { label: 'Valor Bruto', value: formatCurrencyFromDecimal(summary.gross_total), color: '#7C3AED' },
            { label: 'Taxa KAVIAR', value: formatCurrencyFromDecimal(summary.platform_fee_total), color: '#B8942E' },
            { label: 'Valor Motoristas', value: formatCurrencyFromDecimal(summary.driver_earnings_total), color: '#2563EB' },
          ].map((item) => (
            <Grid item xs={6} sm={4} md={2} key={item.label}>
              <Card sx={{ border: '1px solid #E5E7EB', borderTop: `3px solid ${item.color}` }}>
                <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
                  <Typography sx={{ color: item.color, fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
                    {item.value}
                  </Typography>
                  <Typography sx={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', mt: 0.5 }}>
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
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Data</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Motorista</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Passageiro</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Território</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Bruto</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Taxa</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Motorista</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Financeiro</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rides.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 6, color: '#9CA3AF' }}>
                      <Assessment sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
                      <Typography variant="body2">Nenhuma corrida encontrada no período selecionado.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rides.map((ride) => (
                    <TableRow key={ride.id} hover>
                      <TableCell sx={{ fontSize: 11 }}>{formatDate(ride.created_at)}</TableCell>
                      <TableCell sx={{ fontSize: 10, fontFamily: 'monospace', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ride.id?.slice(0, 8)}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11 }}>{ride.driver_name || '—'}</TableCell>
                      <TableCell sx={{ fontSize: 11 }}>{ride.passenger_first_name || '—'}</TableCell>
                      <TableCell sx={{ fontSize: 11 }}>{formatTerritory(ride.settlement_territory)}</TableCell>
                      <TableCell sx={{ fontSize: 11 }} align="right">{formatCurrencyFromDecimal(ride.final_price)}</TableCell>
                      <TableCell sx={{ fontSize: 11 }} align="right">{formatCurrencyFromDecimal(ride.fee_amount)}</TableCell>
                      <TableCell sx={{ fontSize: 11 }} align="right">{formatCurrencyFromDecimal(ride.driver_earnings)}</TableCell>
                      <TableCell>
                        <Chip
                          label={STATUS_LABELS[ride.status] || ride.status}
                          size="small"
                          sx={{
                            fontSize: 10,
                            height: 20,
                            fontWeight: 600,
                            bgcolor: `${STATUS_COLORS[ride.status] || '#6B7280'}15`,
                            color: STATUS_COLORS[ride.status] || '#6B7280',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const fs = getFinancialStatusDisplay(ride);
                          return (
                            <Chip
                              label={fs.label}
                              size="small"
                              sx={{
                                fontSize: 10,
                                height: 20,
                                fontWeight: 600,
                                bgcolor: `${fs.color}15`,
                                color: fs.color,
                              }}
                            />
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  ))
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
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[25, 50, 100, 200]}
              labelRowsPerPage="Linhas:"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          )}
        </Card>
      )}
    </Container>
  );
}
