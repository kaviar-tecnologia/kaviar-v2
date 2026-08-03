/**
 * Lançamentos Financeiros — Gestão Manual
 * SUPER_ADMIN: CRUD completo | FINANCE: Somente leitura
 * Uses: useAdminAuth, adminFinanceService, parseBRLToCentsString, formatCentsStringToBRL
 * No Number/parseFloat/Math for money. CAS via expected_updated_at.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, TextField, Typography,
} from '@mui/material';
import { Add, FilterList, Refresh } from '@mui/icons-material';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import {
  listFinanceTransactions, listFinanceAccounts, listFinanceCategories,
  listFinanceCostCenters, createFinanceTransaction, updateFinanceTransaction,
  postFinanceTransaction, cancelFinanceTransaction,
} from '../../services/adminFinanceService';
import { parseBRLToCentsString, formatCentsStringToBRL } from '../../utils/brlCurrency';

// ── Labels ─────────────────────────────────────────────────────────────────
const DIR_LABELS = { IN: 'Entrada', OUT: 'Saída' };
const STATUS_LABELS = { DRAFT: 'Rascunho', PENDING: 'Pendente', POSTED: 'Liquidado', CANCELED: 'Cancelado', REVERSED: 'Estornado', BLOCKED: 'Bloqueado', RECONCILED: 'Conciliado', CLOSED: 'Fechado' };
const STATUS_COLORS = { DRAFT: '#6b7280', PENDING: '#d97706', POSTED: '#16a34a', CANCELED: '#dc2626', REVERSED: '#7c3aed' };
const TYPE_OPTIONS_IN = [{ value: 'INCOME', label: 'Receita' }, { value: 'RECEIVABLE', label: 'A receber' }, { value: 'DEPOSIT', label: 'Depósito' }];
const TYPE_OPTIONS_OUT = [{ value: 'EXPENSE', label: 'Despesa' }, { value: 'PAYABLE', label: 'A pagar' }, { value: 'TAX', label: 'Imposto' }, { value: 'FEE', label: 'Taxa' }, { value: 'WITHDRAWAL', label: 'Retirada' }];
const PAYMENT_OPTIONS = [{ v: 'PIX', l: 'Pix' }, { v: 'BOLETO', l: 'Boleto' }, { v: 'BANK_TRANSFER', l: 'Transferência' }, { v: 'CARD', l: 'Cartão' }, { v: 'CASH', l: 'Dinheiro' }, { v: 'NONE', l: 'Nenhum' }];
const COUNTERPARTY_TYPES = [{ v: 'ACCOUNTING', l: 'Contabilidade' }, { v: 'MARKETING', l: 'Divulgação' }, { v: 'LEGAL', l: 'Jurídico' }, { v: 'PARTNER', l: 'Sócio' }, { v: 'TERRITORIAL_MANAGER', l: 'Gestor' }, { v: 'GOVERNMENT', l: 'Governo/Prefeitura' }, { v: 'TECHNOLOGY', l: 'Tecnologia' }, { v: 'OTHER', l: 'Outro' }];

function formatDate(v) { if (!v) return '—'; return new Date(v).toLocaleDateString('pt-BR'); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function FinanceTransactionsPage() {
  const { getAdminData, isSuperAdmin } = useAdminAuth();
  const canWrite = isSuperAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [filters, setFilters] = useState({ direction: '', status: '', transaction_type: '', search: '' });
  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editDialog, setEditDialog] = useState(null); // txn to edit
  const [postDialog, setPostDialog] = useState(null); // txn to liquidate
  const [cancelDialog, setCancelDialog] = useState(null); // txn to cancel
  const [conflictMsg, setConflictMsg] = useState('');
  // Reference data
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [costCenters, setCostCenters] = useState([]);

  const fetchRefs = useCallback(async () => {
    const [a, c, cc] = await Promise.all([
      listFinanceAccounts({ limit: 100 }),
      listFinanceCategories({ limit: 200 }),
      listFinanceCostCenters({ limit: 100 }),
    ]);
    if (a?.data) setAccounts(a.data);
    if (c?.data) setCategories(c.data);
    if (cc?.data) setCostCenters(cc.data);
  }, []);

  const fetchData = useCallback(async (p = page, l = limit) => {
    setLoading(true); setError('');
    try {
      const params = { page: p + 1, limit: l, source_type: 'MANUAL', ...filters };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const result = await listFinanceTransactions(params);
      setData(result);
    } catch (err) { setError(err?.message || 'Erro ao carregar'); }
    finally { setLoading(false); }
  }, [page, limit, filters]);

  useEffect(() => { fetchRefs(); }, []);
  useEffect(() => { fetchData(); }, [page, limit]);

  const handleFilter = () => { setPage(0); fetchData(0, limit); };

  const handlePost = async (txn, settlementDate) => {
    try {
      await postFinanceTransaction(txn.id, { expected_updated_at: txn.updated_at, settlement_date: settlementDate });
      setPostDialog(null); fetchData();
    } catch (err) {
      const msg = err?.message || err?.error || 'Erro ao liquidar';
      if (msg.includes('409') || msg.includes('Conflito') || msg.includes('alterado')) {
        setConflictMsg('O lançamento foi alterado por outro administrador. Recarregue os dados.');
        setPostDialog(null);
      } else { setError(msg); }
    }
  };

  const handleCancel = async (txn, reason) => {
    try {
      await cancelFinanceTransaction(txn.id, { expected_updated_at: txn.updated_at, canceled_reason: reason });
      setCancelDialog(null); fetchData();
    } catch (err) {
      const msg = err?.message || err?.error || 'Erro ao cancelar';
      if (msg.includes('409') || msg.includes('Conflito') || msg.includes('alterado')) {
        setConflictMsg('O lançamento foi alterado por outro administrador. Recarregue os dados.');
        setCancelDialog(null);
      } else { setError(msg); }
    }
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
        {canWrite && (
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}>
            Novo Lançamento
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {conflictMsg && <Alert severity="warning" sx={{ mb: 2 }} action={<Button size="small" onClick={() => { setConflictMsg(''); fetchData(); }}>Recarregar</Button>}>{conflictMsg}</Alert>}

      {/* Filters */}
      <Card sx={{ mb: 3, border: '1px solid #E5E7EB' }}>
        <CardContent sx={{ py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <FilterList sx={{ fontSize: 18, color: '#6B7280' }} />
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Filtros</Typography>
          </Box>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}><TextField label="Buscar" size="small" fullWidth value={filters.search} onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))} /></Grid>
            <Grid item xs={6} sm={2}><TextField label="Direção" select size="small" fullWidth value={filters.direction} onChange={(e) => setFilters(f => ({ ...f, direction: e.target.value }))}>
              <MenuItem value="">Todas</MenuItem><MenuItem value="IN">Entrada</MenuItem><MenuItem value="OUT">Saída</MenuItem>
            </TextField></Grid>
            <Grid item xs={6} sm={2}><TextField label="Status" select size="small" fullWidth value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}>
              <MenuItem value="">Todos</MenuItem>{Object.entries(STATUS_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField></Grid>
            <Grid item xs={6} sm={2}><Button variant="contained" size="small" startIcon={<Refresh />} onClick={handleFilter} sx={{ textTransform: 'none', fontWeight: 600 }}>Filtrar</Button></Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading && !data && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}

      {/* Table */}
      {data && (
        <Card sx={{ border: '1px solid #E5E7EB' }}>
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow sx={{ bgcolor: '#F9FAFB' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Competência</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Descrição</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Categoria</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Direção</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Valor</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Vencimento</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Status</TableCell>
                {canWrite && <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Ações</TableCell>}
              </TableRow></TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6, color: '#9CA3AF' }}>Nenhum lançamento encontrado.</TableCell></TableRow>
                ) : rows.map((txn) => (
                  <TableRow key={txn.id} hover>
                    <TableCell sx={{ fontSize: 11 }}>{formatDate(txn.competence_date)}</TableCell>
                    <TableCell sx={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.description}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{txn.category?.name || '—'}</TableCell>
                    <TableCell><Chip label={DIR_LABELS[txn.direction] || txn.direction} size="small" sx={{ fontSize: 10, height: 20, fontWeight: 600, bgcolor: txn.direction === 'IN' ? '#dcfce7' : '#fef2f2', color: txn.direction === 'IN' ? '#16a34a' : '#dc2626' }} /></TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600 }} align="right">{formatCentsStringToBRL(txn.net_amount_cents)}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{formatDate(txn.due_date)}</TableCell>
                    <TableCell><Chip label={STATUS_LABELS[txn.status] || txn.status} size="small" sx={{ fontSize: 10, height: 20, fontWeight: 600, bgcolor: `${STATUS_COLORS[txn.status] || '#6b7280'}15`, color: STATUS_COLORS[txn.status] || '#6b7280' }} /></TableCell>
                    {canWrite && <TableCell sx={{ fontSize: 10 }}>
                      {(txn.status === 'DRAFT' || txn.status === 'PENDING') && (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Button size="small" sx={{ fontSize: 9, minWidth: 'auto', px: 1 }} onClick={() => setEditDialog(txn)}>Editar</Button>
                          <Button size="small" sx={{ fontSize: 9, minWidth: 'auto', px: 1 }} onClick={() => setPostDialog(txn)}>Liquidar</Button>
                          <Button size="small" color="error" sx={{ fontSize: 9, minWidth: 'auto', px: 1 }} onClick={() => setCancelDialog(txn)}>Cancelar</Button>
                        </Box>
                      )}
                      {txn.status === 'POSTED' && <Typography sx={{ fontSize: 9, color: '#6b7280' }}>Estorno necessário</Typography>}
                    </TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {pagination && <TablePagination component="div" count={pagination.total} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={limit} onRowsPerPageChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Linhas:" />}
        </Card>
      )}

      {/* Create Dialog */}
      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); fetchData(); }} accounts={accounts} categories={categories} costCenters={costCenters} />

      {/* Edit Dialog */}
      {editDialog && <EditDialog txn={editDialog} onClose={() => setEditDialog(null)} onSaved={() => { setEditDialog(null); fetchData(); }} onConflict={() => { setEditDialog(null); setConflictMsg('O lançamento foi alterado por outro administrador. Recarregue os dados.'); }} accounts={accounts} categories={categories} costCenters={costCenters} />}

      {/* Post (Liquidate) Dialog */}
      {postDialog && <PostDialog txn={postDialog} onClose={() => setPostDialog(null)} onConfirm={handlePost} />}

      {/* Cancel Dialog */}
      {cancelDialog && <CancelDialog txn={cancelDialog} onClose={() => setCancelDialog(null)} onConfirm={handleCancel} />}
    </Container>
  );
}

// ── Create Dialog ──────────────────────────────────────────────────────────
function CreateDialog({ open, onClose, onCreated, accounts, categories, costCenters }) {
  const [form, setForm] = useState({ account_id: '', category_id: '', cost_center_id: '', direction: 'OUT', transaction_type: 'EXPENSE', payment_method: 'PIX', competence_date: todayISO(), transaction_date: todayISO(), due_date: '', valor: '', description: '', memo: '', metadata: {} });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setMeta = (k) => (e) => setForm(f => ({ ...f, metadata: { ...f.metadata, [k]: e.target.value || null } }));

  const typeOptions = form.direction === 'IN' ? TYPE_OPTIONS_IN : TYPE_OPTIONS_OUT;

  const handleSubmit = async () => {
    const cents = parseBRLToCentsString(form.valor);
    if (!cents) { setError('Valor inválido. Use formato: 150,00'); return; }
    if (!form.account_id) { setError('Selecione uma conta.'); return; }
    if (!form.category_id) { setError('Selecione uma categoria.'); return; }
    if (!form.description.trim()) { setError('Descrição obrigatória.'); return; }
    setSubmitting(true); setError('');
    try {
      const body = {
        account_id: form.account_id, category_id: form.category_id,
        cost_center_id: form.cost_center_id || undefined,
        direction: form.direction, transaction_type: form.transaction_type,
        payment_method: form.payment_method || undefined,
        competence_date: form.competence_date, transaction_date: form.transaction_date,
        due_date: form.due_date || undefined,
        gross_amount_cents: cents, net_amount_cents: cents,
        description: form.description.trim(), memo: form.memo || undefined,
        metadata: Object.keys(form.metadata).length > 0 ? form.metadata : undefined,
      };
      await createFinanceTransaction(body);
      onCreated();
    } catch (err) {
      setError(err?.message || 'Erro ao criar lançamento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Novo Lançamento Manual</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}><TextField label="Descrição *" fullWidth size="small" value={form.description} onChange={set('description')} /></Grid>
          <Grid item xs={6}><TextField label="Conta *" select fullWidth size="small" value={form.account_id} onChange={set('account_id')}>{accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}</TextField></Grid>
          <Grid item xs={6}><TextField label="Categoria *" select fullWidth size="small" value={form.category_id} onChange={set('category_id')}>{categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}</TextField></Grid>
          <Grid item xs={4}><TextField label="Direção *" select fullWidth size="small" value={form.direction} onChange={(e) => { setForm(f => ({ ...f, direction: e.target.value, transaction_type: e.target.value === 'IN' ? 'INCOME' : 'EXPENSE' })); }}><MenuItem value="OUT">Saída</MenuItem><MenuItem value="IN">Entrada</MenuItem></TextField></Grid>
          <Grid item xs={4}><TextField label="Tipo *" select fullWidth size="small" value={form.transaction_type} onChange={set('transaction_type')}>{typeOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField></Grid>
          <Grid item xs={4}><TextField label="Valor (R$) *" fullWidth size="small" value={form.valor} onChange={set('valor')} placeholder="150,00" /></Grid>
          <Grid item xs={4}><TextField label="Competência *" type="date" fullWidth size="small" value={form.competence_date} onChange={set('competence_date')} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={4}><TextField label="Data Transação *" type="date" fullWidth size="small" value={form.transaction_date} onChange={set('transaction_date')} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={4}><TextField label="Vencimento" type="date" fullWidth size="small" value={form.due_date} onChange={set('due_date')} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={4}><TextField label="Pagamento" select fullWidth size="small" value={form.payment_method} onChange={set('payment_method')}>{PAYMENT_OPTIONS.map(o => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}</TextField></Grid>
          <Grid item xs={4}><TextField label="Centro de Custo" select fullWidth size="small" value={form.cost_center_id} onChange={set('cost_center_id')}><MenuItem value="">—</MenuItem>{costCenters.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}</TextField></Grid>
          <Grid item xs={4}><TextField label="Contraparte" select fullWidth size="small" value={form.metadata.counterparty_type || ''} onChange={setMeta('counterparty_type')}><MenuItem value="">—</MenuItem>{COUNTERPARTY_TYPES.map(o => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}</TextField></Grid>
          <Grid item xs={6}><TextField label="Nome da contraparte" fullWidth size="small" value={form.metadata.counterparty_name || ''} onChange={setMeta('counterparty_name')} /></Grid>
          <Grid item xs={6}><TextField label="Período de referência" fullWidth size="small" value={form.metadata.reference_period || ''} onChange={setMeta('reference_period')} placeholder="2026-08" /></Grid>
          <Grid item xs={12}><TextField label="Observações" fullWidth size="small" multiline rows={2} value={form.memo} onChange={set('memo')} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting} sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}>{submitting ? 'Criando...' : 'Criar Lançamento'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Post (Liquidate) Dialog ────────────────────────────────────────────────
function PostDialog({ txn, onClose, onConfirm }) {
  const [date, setDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);
  const handle = async () => { setSubmitting(true); await onConfirm(txn, date); setSubmitting(false); };
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Confirmar Liquidação</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2"><strong>Descrição:</strong> {txn.description}</Typography>
          <Typography variant="body2"><strong>Conta:</strong> {txn.account?.name}</Typography>
          <Typography variant="body2"><strong>Categoria:</strong> {txn.category?.name}</Typography>
          <Typography variant="body2"><strong>Direção:</strong> {DIR_LABELS[txn.direction]}</Typography>
          <Typography variant="body2"><strong>Valor:</strong> {formatCentsStringToBRL(txn.net_amount_cents)}</Typography>
          <Typography variant="body2"><strong>Data transação:</strong> {formatDate(txn.transaction_date)}</Typography>
          <TextField label="Data de liquidação" type="date" size="small" fullWidth sx={{ mt: 2 }} value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button variant="contained" onClick={handle} disabled={submitting} color="success">{submitting ? 'Liquidando...' : 'Confirmar Liquidação'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Cancel Dialog ──────────────────────────────────────────────────────────
function CancelDialog({ txn, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const handle = async () => { if (!reason.trim()) return; setSubmitting(true); await onConfirm(txn, reason.trim()); setSubmitting(false); };
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: '#dc2626' }}>Cancelar Lançamento</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mt: 1 }}><strong>{txn.description}</strong> — {formatCentsStringToBRL(txn.net_amount_cents)}</Typography>
        <TextField label="Motivo do cancelamento *" fullWidth size="small" sx={{ mt: 2 }} value={reason} onChange={(e) => setReason(e.target.value)} multiline rows={2} placeholder="Informe o motivo..." />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Voltar</Button>
        <Button variant="contained" color="error" onClick={handle} disabled={submitting || !reason.trim()}>{submitting ? 'Cancelando...' : 'Confirmar Cancelamento'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Edit Dialog ────────────────────────────────────────────────────────────
function EditDialog({ txn, onClose, onSaved, onConflict, accounts, categories, costCenters }) {
  const centsToDisplay = (v) => {
    if (!v) return '';
    const s = String(v);
    if (s.length <= 2) return `0,${s.padStart(2, '0')}`;
    return s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s.slice(-2);
  };

  const [form, setForm] = useState({
    description: txn.description || '',
    account_id: txn.account_id || txn.account?.id || '',
    category_id: txn.category_id || txn.category?.id || '',
    cost_center_id: txn.cost_center_id || txn.cost_center?.id || '',
    direction: txn.direction || 'OUT',
    transaction_type: txn.transaction_type || 'EXPENSE',
    payment_method: txn.payment_method || 'PIX',
    competence_date: txn.competence_date?.slice?.(0, 10) || '',
    transaction_date: txn.transaction_date?.slice?.(0, 10) || '',
    due_date: txn.due_date?.slice?.(0, 10) || '',
    valor: centsToDisplay(txn.net_amount_cents || txn.gross_amount_cents),
    memo: txn.memo || '',
    metadata: txn.metadata || {},
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setMeta = (k) => (e) => setForm(f => ({ ...f, metadata: { ...f.metadata, [k]: e.target.value || null } }));
  const typeOptions = form.direction === 'IN' ? TYPE_OPTIONS_IN : TYPE_OPTIONS_OUT;

  const handleSave = async () => {
    const cents = parseBRLToCentsString(form.valor);
    if (!cents) { setError('Valor inválido.'); return; }
    if (!form.description.trim()) { setError('Descrição obrigatória.'); return; }
    setSubmitting(true); setError('');
    try {
      const body = {
        expected_updated_at: txn.updated_at,
        description: form.description.trim(),
        account_id: form.account_id || undefined,
        category_id: form.category_id || undefined,
        cost_center_id: form.cost_center_id || undefined,
        direction: form.direction,
        transaction_type: form.transaction_type,
        payment_method: form.payment_method || undefined,
        competence_date: form.competence_date || undefined,
        transaction_date: form.transaction_date || undefined,
        due_date: form.due_date || null,
        gross_amount_cents: cents,
        net_amount_cents: cents,
        memo: form.memo || undefined,
        metadata: Object.keys(form.metadata).length > 0 ? form.metadata : undefined,
      };
      await updateFinanceTransaction(txn.id, body);
      onSaved();
    } catch (err) {
      const msg = err?.message || 'Erro ao editar';
      if (msg.includes('409') || msg.includes('Conflito') || msg.includes('alterado')) {
        onConflict();
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Editar Lançamento</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}><TextField label="Descrição *" fullWidth size="small" value={form.description} onChange={set('description')} /></Grid>
          <Grid item xs={6}><TextField label="Conta *" select fullWidth size="small" value={form.account_id} onChange={set('account_id')}>{accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}</TextField></Grid>
          <Grid item xs={6}><TextField label="Categoria *" select fullWidth size="small" value={form.category_id} onChange={set('category_id')}>{categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}</TextField></Grid>
          <Grid item xs={4}><TextField label="Direção" select fullWidth size="small" value={form.direction} onChange={(e) => { setForm(f => ({ ...f, direction: e.target.value, transaction_type: e.target.value === 'IN' ? 'INCOME' : 'EXPENSE' })); }}><MenuItem value="OUT">Saída</MenuItem><MenuItem value="IN">Entrada</MenuItem></TextField></Grid>
          <Grid item xs={4}><TextField label="Tipo" select fullWidth size="small" value={form.transaction_type} onChange={set('transaction_type')}>{typeOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField></Grid>
          <Grid item xs={4}><TextField label="Valor (R$) *" fullWidth size="small" value={form.valor} onChange={set('valor')} placeholder="150,00" /></Grid>
          <Grid item xs={4}><TextField label="Competência" type="date" fullWidth size="small" value={form.competence_date} onChange={set('competence_date')} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={4}><TextField label="Data Transação" type="date" fullWidth size="small" value={form.transaction_date} onChange={set('transaction_date')} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={4}><TextField label="Vencimento" type="date" fullWidth size="small" value={form.due_date} onChange={set('due_date')} InputLabelProps={{ shrink: true }} helperText="Limpe para remover" /></Grid>
          <Grid item xs={4}><TextField label="Pagamento" select fullWidth size="small" value={form.payment_method} onChange={set('payment_method')}>{PAYMENT_OPTIONS.map(o => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}</TextField></Grid>
          <Grid item xs={4}><TextField label="Centro de Custo" select fullWidth size="small" value={form.cost_center_id} onChange={set('cost_center_id')}><MenuItem value="">—</MenuItem>{costCenters.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}</TextField></Grid>
          <Grid item xs={4}><TextField label="Contraparte" fullWidth size="small" value={form.metadata.counterparty_name || ''} onChange={setMeta('counterparty_name')} /></Grid>
          <Grid item xs={12}><TextField label="Observações" fullWidth size="small" multiline rows={2} value={form.memo} onChange={set('memo')} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave} disabled={submitting} sx={{ bgcolor: '#2563EB', '&:hover': { bgcolor: '#1D4ED8' } }}>{submitting ? 'Salvando...' : 'Salvar Alterações'}</Button>
      </DialogActions>
    </Dialog>
  );
}
