/**
 * Lançamentos Financeiros — Gestão Manual
 * SUPER_ADMIN: CRUD completo
 * FINANCE: Somente leitura + exportação
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, MenuItem, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import { Add, Download, FilterList, Refresh } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';

function getToken() { return localStorage.getItem('kaviar_admin_token'); }
function getAdmin() { const d = localStorage.getItem('kaviar_admin_data'); return d ? JSON.parse(d) : null; }

const DIRECTION_LABELS = { IN: 'Entrada', OUT: 'Saída' };
const STATUS_LABELS = { DRAFT: 'Rascunho', PENDING: 'Pendente', POSTED: 'Liquidado', CANCELED: 'Cancelado', REVERSED: 'Estornado', BLOCKED: 'Bloqueado', RECONCILED: 'Conciliado', CLOSED: 'Fechado' };
const STATUS_COLORS = { DRAFT: '#6b7280', PENDING: '#d97706', POSTED: '#16a34a', CANCELED: '#dc2626', REVERSED: '#7c3aed', BLOCKED: '#991b1b', RECONCILED: '#0891b2', CLOSED: '#374151' };
const TYPE_LABELS = { INCOME: 'Receita', EXPENSE: 'Despesa', TRANSFER: 'Transferência', RECEIVABLE: 'A receber', PAYABLE: 'A pagar', ADJUSTMENT: 'Ajuste', TAX: 'Imposto', FEE: 'Taxa', COMPENSATION: 'Compensação' };
const PAYMENT_LABELS = { PIX: 'Pix', BANK_TRANSFER: 'Transferência', TED: 'TED', DOC: 'DOC', CASH: 'Dinheiro', CARD: 'Cartão', BOLETO: 'Boleto', INTERNAL: 'Interno', NONE: 'Nenhum' };

function formatCents(cents) {
  if (cents == null) return '—';
  const n = typeof cents === 'string' ? parseInt(cents, 10) : Number(cents);
  if (isNaN(n)) return '—';
  const abs = Math.abs(n);
  const intPart = String(Math.floor(abs / 100));
  const fracPart = String(abs % 100).padStart(2, '0');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted = `R$ ${withSep},${fracPart}`;
  return n < 0 ? `- ${formatted}` : formatted;
}

function formatDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('pt-BR');
}

export default function FinanceTransactionsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [filters, setFilters] = useState({ direction: '', status: '', transaction_type: '', search: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const admin = getAdmin();
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';

  const fetchData = useCallback(async (p = page, l = limit) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(p + 1));
      params.set('limit', String(l));
      if (filters.direction) params.set('direction', filters.direction);
      if (filters.status) params.set('status', filters.status);
      if (filters.transaction_type) params.set('transaction_type', filters.transaction_type);
      if (filters.search) params.set('search', filters.search);
      params.set('source_type', 'MANUAL');

      const res = await fetch(`${API_BASE_URL}/api/admin/finance/transactions?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) { setError(`Erro ${res.status}`); return; }
      const json = await res.json();
      if (json.success) setData(json);
    } catch { setError('Erro de rede'); }
    finally { setLoading(false); }
  }, [page, limit, filters]);

  useEffect(() => { fetchData(); }, [page, limit]);

  const handleFilter = () => { setPage(0); fetchData(0, limit); };

  const handleAction = async (id, action, body = {}) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/finance/transactions/${id}/${action}`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Erro'); return; }
      fetchData();
    } catch { setError('Erro de rede'); }
  };

  const rows = data?.data || [];
  const pagination = data?.pagination;

  return (
    <Container maxWidth="lg" sx={{ mt: 2, pb: 6 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#F8FAFC' }}>💼 Lançamentos Financeiros</Typography>
          <Typography variant="body2" sx={{ color: '#CBD5E1', mt: 0.5 }}>Gestão de despesas e receitas manuais</Typography>
        </Box>
        {isSuperAdmin && (
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}>
            Novo Lançamento
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Filters */}
      <Card sx={{ mb: 3, border: '1px solid #E5E7EB' }}>
        <CardContent sx={{ py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <FilterList sx={{ fontSize: 18, color: '#6B7280' }} />
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Filtros</Typography>
          </Box>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <TextField label="Buscar" size="small" fullWidth value={filters.search}
                onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))} placeholder="Descrição, referência..." />
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField label="Direção" select size="small" fullWidth value={filters.direction}
                onChange={(e) => setFilters(f => ({ ...f, direction: e.target.value }))}>
                <MenuItem value="">Todas</MenuItem>
                <MenuItem value="IN">Entrada</MenuItem>
                <MenuItem value="OUT">Saída</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField label="Status" select size="small" fullWidth value={filters.status}
                onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}>
                <MenuItem value="">Todos</MenuItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField label="Tipo" select size="small" fullWidth value={filters.transaction_type}
                onChange={(e) => setFilters(f => ({ ...f, transaction_type: e.target.value }))}>
                <MenuItem value="">Todos</MenuItem>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Button variant="contained" size="small" startIcon={<Refresh />} onClick={handleFilter}
                sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#2563EB', '&:hover': { bgcolor: '#1D4ED8' } }}>
                Filtrar
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Table */}
      <Card sx={{ border: '1px solid #E5E7EB' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Data</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Descrição</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Categoria</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Centro Custo</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Direção</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Valor</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Vencimento</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Status</TableCell>
                {isSuperAdmin && <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Ações</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6, color: '#9CA3AF' }}>
                  Nenhum lançamento encontrado.
                </TableCell></TableRow>
              ) : rows.map((txn) => (
                <TableRow key={txn.id} hover>
                  <TableCell sx={{ fontSize: 11 }}>{formatDate(txn.competence_date)}</TableCell>
                  <TableCell sx={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {txn.description}
                  </TableCell>
                  <TableCell sx={{ fontSize: 11 }}>{txn.category?.name || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 11 }}>{txn.cost_center?.name || '—'}</TableCell>
                  <TableCell>
                    <Chip label={DIRECTION_LABELS[txn.direction] || txn.direction} size="small"
                      sx={{ fontSize: 10, height: 20, fontWeight: 600, bgcolor: txn.direction === 'IN' ? '#dcfce7' : '#fef2f2', color: txn.direction === 'IN' ? '#16a34a' : '#dc2626' }} />
                  </TableCell>
                  <TableCell sx={{ fontSize: 11, fontWeight: 600 }} align="right">{formatCents(txn.net_amount_cents)}</TableCell>
                  <TableCell sx={{ fontSize: 11 }}>{formatDate(txn.due_date)}</TableCell>
                  <TableCell>
                    <Chip label={STATUS_LABELS[txn.status] || txn.status} size="small"
                      sx={{ fontSize: 10, height: 20, fontWeight: 600, bgcolor: `${STATUS_COLORS[txn.status] || '#6b7280'}15`, color: STATUS_COLORS[txn.status] || '#6b7280' }} />
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell sx={{ fontSize: 10 }}>
                      {(txn.status === 'DRAFT' || txn.status === 'PENDING') && (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Button size="small" sx={{ fontSize: 9, minWidth: 'auto', px: 1 }}
                            onClick={() => handleAction(txn.id, 'post')}>Liquidar</Button>
                          <Button size="small" color="error" sx={{ fontSize: 9, minWidth: 'auto', px: 1 }}
                            onClick={() => { const r = prompt('Motivo do cancelamento:'); if (r) handleAction(txn.id, 'cancel', { canceled_reason: r }); }}>Cancelar</Button>
                        </Box>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {pagination && (
          <TablePagination component="div" count={pagination.total} page={page}
            onPageChange={(_, p) => setPage(p)} rowsPerPage={limit}
            onRowsPerPageChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]} labelRowsPerPage="Linhas:" />
        )}
      </Card>

      {/* Create Dialog - simplified */}
      <CreateTransactionDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); fetchData(); }} />
    </Container>
  );
}

function CreateTransactionDialog({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ account_id: '', category_id: '', cost_center_id: '', direction: 'OUT', transaction_type: 'EXPENSE', payment_method: 'PIX', competence_date: '', transaction_date: '', due_date: '', gross_amount_cents: '', net_amount_cents: '', description: '', memo: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [costCenters, setCostCenters] = useState([]);

  useEffect(() => {
    if (!open) return;
    const token = getToken();
    Promise.all([
      fetch(`${API_BASE_URL}/api/admin/finance/accounts?limit=100`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/admin/finance/categories?limit=100`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/admin/finance/cost-centers?limit=100`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([a, c, cc]) => {
      if (a.success) setAccounts(a.data);
      if (c.success) setCategories(c.data);
      if (cc.success) setCostCenters(cc.data);
    }).catch(() => {});
  }, [open]);

  const handleSubmit = async () => {
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/finance/transactions`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, fee_amount_cents: '0', discount_amount_cents: '0', retention_amount_cents: '0' }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Erro ao criar'); return; }
      onCreated();
    } catch { setError('Erro de rede'); }
    finally { setSubmitting(false); }
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Novo Lançamento Manual</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}><TextField label="Descrição *" fullWidth size="small" value={form.description} onChange={set('description')} /></Grid>
          <Grid item xs={6}><TextField label="Conta *" select fullWidth size="small" value={form.account_id} onChange={set('account_id')}>
            {accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.name} ({a.code})</MenuItem>)}
          </TextField></Grid>
          <Grid item xs={6}><TextField label="Categoria" select fullWidth size="small" value={form.category_id} onChange={set('category_id')}>
            <MenuItem value="">—</MenuItem>
            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField></Grid>
          <Grid item xs={6}><TextField label="Centro de Custo" select fullWidth size="small" value={form.cost_center_id} onChange={set('cost_center_id')}>
            <MenuItem value="">—</MenuItem>
            {costCenters.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField></Grid>
          <Grid item xs={3}><TextField label="Direção *" select fullWidth size="small" value={form.direction} onChange={set('direction')}>
            <MenuItem value="OUT">Saída</MenuItem><MenuItem value="IN">Entrada</MenuItem>
          </TextField></Grid>
          <Grid item xs={3}><TextField label="Tipo *" select fullWidth size="small" value={form.transaction_type} onChange={set('transaction_type')}>
            <MenuItem value="EXPENSE">Despesa</MenuItem><MenuItem value="INCOME">Receita</MenuItem>
            <MenuItem value="PAYABLE">A pagar</MenuItem><MenuItem value="RECEIVABLE">A receber</MenuItem>
            <MenuItem value="TAX">Imposto</MenuItem><MenuItem value="FEE">Taxa</MenuItem>
          </TextField></Grid>
          <Grid item xs={4}><TextField label="Competência *" type="date" fullWidth size="small" value={form.competence_date} onChange={set('competence_date')} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={4}><TextField label="Data Transação *" type="date" fullWidth size="small" value={form.transaction_date} onChange={set('transaction_date')} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={4}><TextField label="Vencimento" type="date" fullWidth size="small" value={form.due_date} onChange={set('due_date')} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={4}><TextField label="Valor Bruto (centavos) *" fullWidth size="small" value={form.gross_amount_cents} onChange={set('gross_amount_cents')} placeholder="15000 = R$150,00" /></Grid>
          <Grid item xs={4}><TextField label="Valor Líquido (centavos) *" fullWidth size="small" value={form.net_amount_cents} onChange={set('net_amount_cents')} placeholder="15000 = R$150,00" /></Grid>
          <Grid item xs={4}><TextField label="Forma de Pagamento" select fullWidth size="small" value={form.payment_method} onChange={set('payment_method')}>
            <MenuItem value="PIX">Pix</MenuItem><MenuItem value="BOLETO">Boleto</MenuItem>
            <MenuItem value="BANK_TRANSFER">Transferência</MenuItem><MenuItem value="CARD">Cartão</MenuItem>
            <MenuItem value="CASH">Dinheiro</MenuItem><MenuItem value="NONE">Nenhum</MenuItem>
          </TextField></Grid>
          <Grid item xs={12}><TextField label="Observações" fullWidth size="small" multiline rows={2} value={form.memo} onChange={set('memo')} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting}
          sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}>Criar Lançamento</Button>
      </DialogActions>
    </Dialog>
  );
}
