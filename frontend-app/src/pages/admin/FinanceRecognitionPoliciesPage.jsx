import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Drawer,
  Grid,
  IconButton,
  MenuItem,
  Snackbar,
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
import { Add, Close, Refresh } from '@mui/icons-material';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import {
  getFinanceRecognitionPolicyById,
  listFinanceRecognitionPolicies,
} from '../../services/adminFinanceService';
import RecognitionPolicyFormDialog from '../../components/admin/finance/RecognitionPolicyFormDialog';
import FinanceModuleNav from '../../components/admin/finance/FinanceModuleNav';
import {
  RECOGNITION_POLICY_COLORS,
  RECOGNITION_POLICY_LABELS,
  RECOGNITION_POLICY_OPTIONS,
  RECOGNITION_SCOPE_LABELS,
  RECOGNITION_SCOPE_OPTIONS,
  RECOGNITION_STATUS_COLORS,
  RECOGNITION_STATUS_LABELS,
  RECOGNITION_STATUS_OPTIONS,
  RECOGNITION_SUBJECT_LABELS,
  RECOGNITION_SUBJECT_OPTIONS,
  buildScopeDisplay,
  formatDateTime,
  formatPolicyDate,
  getPolicyContextNotice,
} from '../../utils/adminFinanceRecognitionUtils';

const BLUE = {
  pageBg: 'linear-gradient(180deg, #EEF6FF 0%, #E3F0FF 100%)',
  sectionBg: '#F8FBFF',
  cardBg: '#FFFFFF',
  border: '#BFDBFE',
  borderStrong: '#60A5FA',
  text: '#0F172A',
  subtext: '#475569',
  primary: '#2563EB',
  secondary: '#1D4ED8',
  accent: '#22D3EE',
};

const defaultPagination = { page: 1, limit: 25, total: 0, totalPages: 0 };
const EMPTY_COUNTS = { DRAFT: undefined, APPROVED: undefined, REVOKED: undefined, SUPERSEDED: undefined };

const defaultQuery = {
  page: 1,
  limit: 25,
  status: '',
  subject: '',
  policy: '',
  scope_type: '',
  city: '',
  state: '',
};

function LabeledField({ label, value, mono }) {
  if (!value) return null;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: 11, color: BLUE.subtext, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 14, color: BLUE.text, fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-word' }}>
        {value}
      </Typography>
    </Box>
  );
}

function StatusChip({ status }) {
  const label = RECOGNITION_STATUS_LABELS[status] || status;
  const colors = RECOGNITION_STATUS_COLORS[status] || { bgcolor: '#F1F5F9', color: '#475569' };
  return (
    <Chip
      size="small"
      label={label}
      role="status"
      aria-label={`Status: ${label}`}
      sx={{ bgcolor: colors.bgcolor, color: colors.color, fontWeight: 600, fontSize: 11 }}
    />
  );
}

function PolicyChip({ policy }) {
  const label = RECOGNITION_POLICY_LABELS[policy] || policy;
  const colors = RECOGNITION_POLICY_COLORS[policy] || { bgcolor: '#F1F5F9', color: '#475569' };
  return (
    <Chip
      size="small"
      label={label}
      sx={{ bgcolor: colors.bgcolor, color: colors.color, fontWeight: 600, fontSize: 11 }}
    />
  );
}

function SummaryCard({ label, count, statusKey, activeFilter, onFilterClick }) {
  const colors = RECOGNITION_STATUS_COLORS[statusKey] || { bgcolor: '#F1F5F9', color: '#475569' };
  const isActive = activeFilter === statusKey;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onFilterClick(statusKey)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFilterClick(statusKey); } }}
      aria-label={`Filtrar por status: ${label}${isActive ? ' (ativo)' : ''}`}
      aria-pressed={isActive}
      sx={{
        border: `1px solid ${isActive ? colors.color : BLUE.border}`,
        borderTop: `3px solid ${colors.color}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        bgcolor: isActive ? `${colors.bgcolor}` : BLUE.cardBg,
        '&:hover': { borderColor: colors.color, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
        '&:focus-visible': { outline: `2px solid ${colors.color}`, outlineOffset: 2 },
      }}
    >
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Typography sx={{ fontSize: 11, color: BLUE.subtext, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
          {label}
        </Typography>
        {count === undefined ? (
          <CircularProgress size={16} sx={{ color: colors.color }} />
        ) : count === null ? (
          <Typography sx={{ fontSize: 22, fontWeight: 800, color: colors.color, lineHeight: 1 }}>—</Typography>
        ) : (
          <Typography sx={{ fontSize: 22, fontWeight: 800, color: colors.color, lineHeight: 1 }}>
            {count}
          </Typography>
        )}
        {isActive && (
          <Typography sx={{ fontSize: 10, color: colors.color, mt: 0.5 }}>filtro ativo</Typography>
        )}
      </CardContent>
    </Card>
  );
}

function PolicyDetailDrawer({ open, policyId, onClose, isSuperAdmin, onEdit }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [policy, setPolicy] = useState(null);
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!open || !policyId) {
      setPolicy(null);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setPolicy(null);
    getFinanceRecognitionPolicyById(policyId)
      .then((res) => {
        if (cancelled) return;
        if (res?.data) {
          setPolicy(res.data);
        } else {
          setError('Política não encontrada.');
          onClose();
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.status === 404) {
          setError('Política não encontrada.');
          onClose();
        } else {
          setError(err?.message || 'Erro ao carregar detalhes da política.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, policyId, onClose]);

  const notice = policy ? getPolicyContextNotice(policy) : '';
  const noticeColorMap = {
    DRAFT: 'info',
    APPROVED: 'success',
    REVOKED: 'error',
    SUPERSEDED: 'warning',
  };

  return (
    <Drawer
      ref={drawerRef}
      anchor="right"
      open={open}
      onClose={onClose}
      aria-labelledby="policy-detail-title"
      PaperProps={{
        sx: { width: { xs: '100%', sm: 520 }, maxWidth: '100%', display: 'flex', flexDirection: 'column' },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2, borderBottom: `1px solid ${BLUE.border}`, bgcolor: BLUE.sectionBg }}>
        <Typography id="policy-detail-title" sx={{ fontWeight: 700, fontSize: 16, color: BLUE.text }}>
          Detalhes da política
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Fechar painel de detalhes">
          <Close />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
            <CircularProgress sx={{ color: BLUE.primary }} />
          </Box>
        )}

        {!loading && error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
            <Box sx={{ mt: 1 }}>
              <Button size="small" onClick={() => setError('')}>Tentar novamente</Button>
            </Box>
          </Alert>
        )}

        {!loading && policy && (
          <>
            {notice && (
              <Alert severity={noticeColorMap[policy.status] || 'info'} sx={{ mb: 2, fontSize: 13 }}>
                {notice}
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <StatusChip status={policy.status} />
              <PolicyChip policy={policy.policy} />
            </Box>

            {isSuperAdmin && policy.status === 'DRAFT' && onEdit && (
              <Box sx={{ mb: 2 }}>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Add />}
                  onClick={() => { onClose(); onEdit(policy.id); }}
                  aria-label={`Editar política ${policy.code}`}
                >
                  Editar
                </Button>
              </Box>
            )}

            <Divider sx={{ mb: 2 }} />

            <Typography sx={{ fontWeight: 700, fontSize: 13, color: BLUE.subtext, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Identificação
            </Typography>

            <LabeledField label="Código" value={policy.code} mono />
            <LabeledField label="Operação" value={RECOGNITION_SUBJECT_LABELS[policy.subject] || policy.subject} />
            <LabeledField label="Classificação" value={RECOGNITION_POLICY_LABELS[policy.policy] || policy.policy} />
            <LabeledField label="Status" value={RECOGNITION_STATUS_LABELS[policy.status] || policy.status} />

            <Divider sx={{ my: 2 }} />

            <Typography sx={{ fontWeight: 700, fontSize: 13, color: BLUE.subtext, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Escopo
            </Typography>

            <LabeledField label="Tipo de escopo" value={RECOGNITION_SCOPE_LABELS[policy.scope_type] || policy.scope_type} />
            {policy.territory && <LabeledField label="Território" value={policy.territory.name} />}
            {policy.city && <LabeledField label="Cidade" value={policy.city} />}
            {policy.state && <LabeledField label="Estado (UF)" value={policy.state} />}
            {policy.cost_center && (
              <LabeledField label="Centro de custo" value={`${policy.cost_center.name} (${policy.cost_center.code})`} />
            )}

            <Divider sx={{ my: 2 }} />

            <Typography sx={{ fontWeight: 700, fontSize: 13, color: BLUE.subtext, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Vigência
            </Typography>

            <LabeledField label="Vigência a partir de" value={formatPolicyDate(policy.effective_from) || '—'} />
            <LabeledField label="Vigência até" value={formatPolicyDate(policy.effective_until) || 'Sem data final'} />

            {policy.reason && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography sx={{ fontWeight: 700, fontSize: 13, color: BLUE.subtext, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Justificativa
                </Typography>
                <LabeledField label="Justificativa" value={policy.reason} />
              </>
            )}

            {policy.notes && (
              <LabeledField label="Notas" value={policy.notes} />
            )}

            <Divider sx={{ my: 2 }} />

            <Typography sx={{ fontWeight: 700, fontSize: 13, color: BLUE.subtext, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Auditoria
            </Typography>

            {policy.approved_at && (
              <LabeledField label="Aprovada em" value={formatDateTime(policy.approved_at)} />
            )}
            {policy.approved_by_admin && (
              <LabeledField label="Aprovada por" value={`${policy.approved_by_admin.name} (${policy.approved_by_admin.role})`} />
            )}
            {policy.created_by_admin && (
              <LabeledField label="Criada por" value={`${policy.created_by_admin.name} (${policy.created_by_admin.role})`} />
            )}
            {policy.updated_by_admin && (
              <LabeledField label="Atualizada por" value={`${policy.updated_by_admin.name} (${policy.updated_by_admin.role})`} />
            )}
            <LabeledField label="Criada em" value={formatDateTime(policy.created_at)} />
            <LabeledField label="Atualizada em" value={formatDateTime(policy.updated_at)} />
          </>
        )}
      </Box>
    </Drawer>
  );
}

const getPaginationAriaLabel = (type) => {
  if (type === 'first') return 'Ir para a primeira página';
  if (type === 'last') return 'Ir para a última página';
  if (type === 'next') return 'Ir para a próxima página';
  return 'Ir para a página anterior';
};

const formatPaginationDisplayedRows = ({ from, to, count, page }) => {
  const totalLabel = count !== -1 ? count : `mais de ${to}`;
  return `Página ${page + 1}: ${from}-${to} de ${totalLabel}`;
};

export default function FinanceRecognitionPoliciesPage() {
  const { getAdminData } = useAdminAuth();

  let admin = null;
  try { admin = getAdminData(); } catch (_) { admin = null; }

  const adminRole = admin?.role || '';
  const isSuperAdmin = adminRole === 'SUPER_ADMIN';

  // ── Main list state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState(defaultQuery);
  const [policies, setPolicies] = useState([]);
  const [pagination, setPagination] = useState(defaultPagination);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Status counts (loaded once, independent of filters) ──────────────────────
  const [counts, setCounts] = useState(EMPTY_COUNTS);

  // ── Detail drawer ─────────────────────────────────────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPolicyId, setDetailPolicyId] = useState(null);

  // ── Form dialog ───────────────────────────────────────────────────────────────
  const [formDialog, setFormDialog] = useState({ open: false, mode: 'create', policyId: null });

  // ── Toast ─────────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // ── Load main list ────────────────────────────────────────────────────────────
  const loadPolicies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (query.status) params.status = query.status;
      if (query.subject) params.subject = query.subject;
      if (query.policy) params.policy = query.policy;
      if (query.scope_type) params.scope_type = query.scope_type;
      if (query.city) params.city = query.city;
      if (query.state) params.state = query.state;
      params.page = query.page;
      params.limit = query.limit;

      const res = await listFinanceRecognitionPolicies(params);
      setPolicies(Array.isArray(res?.data) ? res.data : []);
      setPagination(res?.pagination || defaultPagination);
    } catch (err) {
      setError(err?.message || 'Erro ao carregar políticas de reconhecimento.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  // ── Load global status counts ─────────────────────────────────────────────────
  const loadCounts = useCallback(() => {
    const statuses = ['DRAFT', 'APPROVED', 'REVOKED', 'SUPERSEDED'];
    Promise.all(
      statuses.map((s) =>
        listFinanceRecognitionPolicies({ status: s, page: 1, limit: 1 })
          .then((r) => ({ status: s, total: r?.pagination?.total ?? 0 }))
          .catch(() => ({ status: s, total: null }))
      )
    ).then((results) => {
      const next = {};
      results.forEach(({ status, total }) => { next[status] = total; });
      setCounts(next);
    });
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // ── Form dialog success handler ───────────────────────────────────────────────
  const handleFormSuccess = useCallback((message) => {
    setFormDialog({ open: false, mode: 'create', policyId: null });
    setToast({ open: true, message, severity: 'success' });
    loadPolicies();
    loadCounts();
  }, [loadPolicies, loadCounts]);

  // ── Client-side code filter applied on top of loaded results ─────────────────
  // REMOVED: backend has no `code` query param; client-side filter was page-scoped only.
  // Filtering by code was misleading — would show "Nenhuma política encontrada"
  // for codes existing on other pages. Use server-side filters instead.

  // ── Derived alert: no approved policy ────────────────────────────────────────
  const hasApproved = typeof counts.APPROVED === 'number' && counts.APPROVED > 0;

  // ── Filter handlers ───────────────────────────────────────────────────────────
  const handleQueryChange = useCallback((field, value) => {
    setQuery((prev) => ({ ...prev, page: 1, [field]: value }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setQuery(defaultQuery);
  }, []);

  const handleStatusCardClick = useCallback((statusKey) => {
    setQuery((prev) => ({
      ...prev,
      page: 1,
      status: prev.status === statusKey ? '' : statusKey,
    }));
  }, []);

  // ── Detail drawer ─────────────────────────────────────────────────────────────
  const openDetail = useCallback((id) => {
    setDetailPolicyId(id);
    setDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailPolicyId(null);
  }, []);

  const activeFiltersCount = [
    query.status, query.subject, query.policy, query.scope_type,
    query.city, query.state,
  ].filter(Boolean).length;

  return (
    <Box sx={{ minHeight: '100vh', background: BLUE.pageBg, py: 3 }}>
      <Container maxWidth="xl">
        <FinanceModuleNav />

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <Card sx={{ mb: 2.5, border: `1px solid ${BLUE.borderStrong}`, background: `linear-gradient(120deg, ${BLUE.cardBg} 0%, ${BLUE.sectionBg} 100%)`, boxShadow: '0 10px 25px rgba(37,99,235,0.10)' }}>
          <CardContent sx={{ py: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
              <Box>
                <Typography sx={{ color: BLUE.primary, fontWeight: 800, fontSize: 24 }}>
                  Políticas financeiras
                </Typography>
                <Typography sx={{ color: BLUE.subtext, mt: 0.5, fontSize: 14 }}>
                  Consulte as regras que controlam o reconhecimento das operações da KAVIAR.
                </Typography>
                <Typography sx={{ color: BLUE.subtext, mt: 0.5, fontSize: 12 }}>
                  Regras que determinam como as operações da KAVIAR serão reconhecidas pelo sistema financeiro.
                </Typography>
              </Box>
              {isSuperAdmin && (
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setFormDialog({ open: true, mode: 'create', policyId: null })}
                  sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                  aria-label="Criar nova política financeira"
                >
                  Nova política
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* ── No approved policy alert ──────────────────────────────────────── */}
        {typeof counts.APPROVED === 'number' && !hasApproved && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Nenhuma política financeira está aprovada. Os lançamentos automáticos dependentes dessas regras ainda não devem ser ativados.
          </Alert>
        )}

        {/* ── FINANCE role notice ───────────────────────────────────────────── */}
        {adminRole === 'FINANCE' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Alterações em políticas financeiras são restritas ao SUPER_ADMIN.
          </Alert>
        )}

        {/* ── Summary cards ─────────────────────────────────────────────────── */}
        <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
          {[
            { key: 'DRAFT', label: 'Rascunhos' },
            { key: 'APPROVED', label: 'Aprovadas' },
            { key: 'REVOKED', label: 'Revogadas' },
            { key: 'SUPERSEDED', label: 'Substituídas' },
          ].map(({ key, label }) => (
            <Grid item xs={6} sm={3} key={key}>
              <SummaryCard
                label={label}
                count={counts[key]}
                statusKey={key}
                activeFilter={query.status}
                onFilterClick={handleStatusCardClick}
              />
            </Grid>
          ))}
        </Grid>

        {/* ── Filters ───────────────────────────────────────────────────────── */}
        <Card sx={{ mb: 2, border: `1px solid ${BLUE.border}` }}>
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography sx={{ fontWeight: 600, fontSize: 13, color: BLUE.text }}>
                Filtros
                {activeFiltersCount > 0 && (
                  <Chip size="small" label={activeFiltersCount} sx={{ ml: 1, bgcolor: BLUE.primary, color: '#fff', height: 18, fontSize: 10 }} />
                )}
              </Typography>
              {activeFiltersCount > 0 && (
                <Button size="small" onClick={handleClearFilters} sx={{ fontSize: 11, color: BLUE.primary }}>
                  Limpar filtros
                </Button>
              )}
            </Box>

            <Grid container spacing={1.5}>
              {/* Status */}
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  label="Status"
                  value={query.status}
                  onChange={(e) => handleQueryChange('status', e.target.value)}
                  inputProps={{ 'aria-label': 'Filtrar por status' }}
                >
                  <MenuItem value="">Todos</MenuItem>
                  {RECOGNITION_STATUS_OPTIONS.map((s) => (
                    <MenuItem key={s} value={s}>{RECOGNITION_STATUS_LABELS[s]}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Subject / Operação */}
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  label="Operação"
                  value={query.subject}
                  onChange={(e) => handleQueryChange('subject', e.target.value)}
                  inputProps={{ 'aria-label': 'Filtrar por operação' }}
                >
                  <MenuItem value="">Todas</MenuItem>
                  {RECOGNITION_SUBJECT_OPTIONS.map((s) => (
                    <MenuItem key={s} value={s}>{RECOGNITION_SUBJECT_LABELS[s]}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Policy / Classificação */}
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  label="Classificação"
                  value={query.policy}
                  onChange={(e) => handleQueryChange('policy', e.target.value)}
                  inputProps={{ 'aria-label': 'Filtrar por classificação' }}
                >
                  <MenuItem value="">Todas</MenuItem>
                  {RECOGNITION_POLICY_OPTIONS.map((p) => (
                    <MenuItem key={p} value={p}>{RECOGNITION_POLICY_LABELS[p]}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Scope type */}
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  label="Escopo"
                  value={query.scope_type}
                  onChange={(e) => handleQueryChange('scope_type', e.target.value)}
                  inputProps={{ 'aria-label': 'Filtrar por escopo' }}
                >
                  <MenuItem value="">Todos</MenuItem>
                  {RECOGNITION_SCOPE_OPTIONS.map((s) => (
                    <MenuItem key={s} value={s}>{RECOGNITION_SCOPE_LABELS[s]}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Cidade */}
              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  fullWidth
                  size="small"
                  label="Cidade"
                  value={query.city}
                  onChange={(e) => handleQueryChange('city', e.target.value)}
                  inputProps={{ 'aria-label': 'Filtrar por cidade' }}
                />
              </Grid>

              {/* Estado (UF) */}
              <Grid item xs={12} sm={4} md={2}>
                <TextField
                  fullWidth
                  size="small"
                  label="Estado (UF)"
                  value={query.state}
                  onChange={(e) => handleQueryChange('state', e.target.value)}
                  inputProps={{ maxLength: 2, 'aria-label': 'Filtrar por estado' }}
                />
              </Grid>

              {/* Territory ID — removed: no seletor disponível; usuário não deve digitar UUID técnico */}
              {/* Cost center ID — removed: idem; endpoint de listagem existe mas sem componente reutilizável */}

              {/* Refresh */}
              <Grid item xs={12} sm={6} md={2}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={loadPolicies}
                  sx={{ height: '40px' }}
                  aria-label="Atualizar lista"
                >
                  {error ? 'Tentar novamente' : 'Atualizar'}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* ── Error ─────────────────────────────────────────────────────────── */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
            <Box sx={{ mt: 1 }}>
              <Button size="small" onClick={loadPolicies}>Tentar novamente</Button>
            </Box>
          </Alert>
        )}

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <Card sx={{ border: `1px solid ${BLUE.border}` }}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="Tabela de políticas de reconhecimento financeiro">
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { bgcolor: BLUE.sectionBg, fontWeight: 700, fontSize: 12, color: BLUE.subtext, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' } }}>
                  <TableCell>Código</TableCell>
                  <TableCell>Operação</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Escopo</TableCell>
                  <TableCell>Classificação</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Vigência</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Atualização</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                      <CircularProgress size={24} sx={{ color: BLUE.primary }} />
                    </TableCell>
                  </TableRow>
                ) : policies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Box sx={{ py: 6, textAlign: 'center' }}>
                        <Typography sx={{ color: BLUE.subtext }}>Nenhuma política encontrada.</Typography>
                        {activeFiltersCount > 0 && (
                          <Button size="small" onClick={handleClearFilters} sx={{ mt: 1, color: BLUE.primary }}>
                            Limpar filtros
                          </Button>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  policies.map((item) => (
                    <TableRow hover key={item.id}>
                      {/* Código */}
                      <TableCell>
                        <Typography
                          component="span"
                          sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: '#F1F5F9', px: 0.75, py: 0.25, borderRadius: 0.5, color: BLUE.text, whiteSpace: 'nowrap' }}
                        >
                          {item.code}
                        </Typography>
                      </TableCell>

                      {/* Operação */}
                      <TableCell sx={{ fontSize: 13, color: BLUE.text }}>
                        {RECOGNITION_SUBJECT_LABELS[item.subject] || item.subject}
                      </TableCell>

                      {/* Escopo — hidden on xs */}
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, fontSize: 13, color: BLUE.subtext }}>
                        {buildScopeDisplay(item)}
                      </TableCell>

                      {/* Classificação */}
                      <TableCell>
                        <PolicyChip policy={item.policy} />
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusChip status={item.status} />
                      </TableCell>

                      {/* Vigência — hidden on xs */}
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, fontSize: 12, color: BLUE.subtext, whiteSpace: 'nowrap' }}>
                        {formatPolicyDate(item.effective_from) || '—'}
                        {' → '}
                        {formatPolicyDate(item.effective_until) || 'Sem data final'}
                      </TableCell>

                      {/* Atualização — hidden on xs/sm/md */}
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, fontSize: 12, color: BLUE.subtext, whiteSpace: 'nowrap' }}>
                        {formatDateTime(item.updated_at)}
                      </TableCell>

                      {/* Ações */}
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => openDetail(item.id)}
                            sx={{ fontSize: 11, minWidth: 'auto', borderColor: BLUE.border, color: BLUE.primary, '&:hover': { borderColor: BLUE.primary } }}
                            aria-label={`Ver detalhes da política ${item.code}`}
                          >
                            Ver detalhes
                          </Button>
                          {isSuperAdmin && item.status === 'DRAFT' && (
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => setFormDialog({ open: true, mode: 'edit', policyId: item.id })}
                              sx={{ fontSize: 11, minWidth: 'auto' }}
                              aria-label={`Editar política ${item.code}`}
                            >
                              Editar
                            </Button>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={pagination.total || 0}
            page={Math.max((pagination.page || 1) - 1, 0)}
            getItemAriaLabel={getPaginationAriaLabel}
            labelRowsPerPage="Itens por página:"
            labelDisplayedRows={formatPaginationDisplayedRows}
            onPageChange={(_, nextPage) => setQuery((prev) => ({ ...prev, page: nextPage + 1 }))}
            rowsPerPage={query.limit}
            onRowsPerPageChange={(e) => setQuery((prev) => ({ ...prev, page: 1, limit: Number(e.target.value) }))}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Card>

      </Container>

      {/* ── Detail drawer ─────────────────────────────────────────────────────── */}
      <PolicyDetailDrawer
        open={detailOpen}
        policyId={detailPolicyId}
        onClose={closeDetail}
        isSuperAdmin={isSuperAdmin}
        onEdit={(id) => setFormDialog({ open: true, mode: 'edit', policyId: id })}
      />

      {/* ── Form dialog ──────────────────────────────────────────────────────── */}
      <RecognitionPolicyFormDialog
        open={formDialog.open}
        mode={formDialog.mode}
        policyId={formDialog.policyId}
        onClose={() => setFormDialog((prev) => ({ ...prev, open: false }))}
        onSuccess={handleFormSuccess}
      />

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast((prev) => ({ ...prev, open: false }))}
          severity={toast.severity}
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
