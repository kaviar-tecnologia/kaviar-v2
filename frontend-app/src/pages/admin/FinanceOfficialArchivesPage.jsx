import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid,
  MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import {
  ArrowBack, CloudUploadOutlined, FactCheckOutlined, FilePresentOutlined,
  LockOutlined, Refresh, SecurityOutlined, ShieldOutlined,
  WarningAmberOutlined, VerifiedUserOutlined,
} from '@mui/icons-material';
import { listLegalEntities } from '../../services/adminAccountingService';
import { listFinanceAccounts } from '../../services/adminFinanceService';
import {
  checkOfficialArchiveMalware, getOfficialArchiveRecovery,
  isOfficialArchiveApproved, listOfficialArchives, officialArchiveErrorMessage,
  officialArchiveStatus, uploadOfficialArchive,
} from '../../services/financeOfficialArchiveService';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const COLORS = {
  ink: '#101E35', muted: '#587088', border: '#DCE7F2', sky: '#E9F5FD',
  navy: '#0B1930', blue: '#2F75D6', teal: '#0EA5A3', white: '#FFFFFF',
};
const MAX_BYTES = 5 * 1024 * 1024;
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const sourceLabels = {
  PROVIDER_PORTAL_DECLARED: 'Portal do provedor (declarado)',
  EMAIL_ATTACHMENT_DECLARED: 'Anexo de e-mail (declarado)',
};
const actionLabels = {
  RESERVATION_RECENT_CHECK_LATER: 'Reserva recente · verificar depois',
  CHECK_S3_OBJECT_AND_AUDIT_MANUALLY: 'Conferir objeto e auditoria manualmente',
  REVIEW_RECORD_CLOCK_SKEW: 'Conferir horário do registro',
  STORAGE_BYTES_CONFIRMED_ORIGIN_UNVERIFIED: 'Integridade armazenada · origem não comprovada',
  AWAIT_GUARDDUTY_RESULT: 'Aguardar análise do GuardDuty',
  REVIEW_UNCLEAN_OR_FAILED_SCAN: 'Análise bloqueada · revisão manual',
};
const panelSx = { border: '1px solid ' + COLORS.border, borderRadius: 3, boxShadow: '0 12px 36px rgba(24, 54, 91, .055)', backgroundColor: COLORS.white };
const dt = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(d);
};
const readableBytes = (value) => typeof value === 'number'
  ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value / 1024) + ' KB'
  : '—';
const fieldSx = { '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 } };

function Metric({ title, value, subtitle, icon, accent }) {
  return (
    <Card sx={{ ...panelSx, height: '100%', overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ position: 'absolute', width: 80, height: 80, right: -26, top: -30, borderRadius: '50%', bgcolor: accent + '16' }} />
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ color: COLORS.muted, fontWeight: 700, fontSize: 12 }}>{title}</Typography>
          <Box sx={{ color: accent, display: 'flex' }}>{icon}</Box>
        </Box>
        <Typography sx={{ color: COLORS.ink, fontWeight: 850, fontSize: 30, lineHeight: 1.35, mt: 1 }}>{value}</Typography>
        <Typography sx={{ color: COLORS.muted, fontSize: 11.5 }}>{subtitle}</Typography>
      </CardContent>
    </Card>
  );
}

function TrustNotice() {
  return (
    <Alert icon={<SecurityOutlined />} severity="info" sx={{ mt: 2, border: '1px solid #BFDBFE', borderRadius: 2, bgcolor: '#EFF6FF' }}>
      <strong>Limites da verificação:</strong> GuardDuty sem ameaças e hash íntegro confirmam apenas a análise do arquivo armazenado.
      Não comprovam emissão pela SumUp/Asaas, recebimento financeiro, faturamento zero, conciliação ou fechamento contábil.
      A origem continua <strong>não verificada</strong>.
    </Alert>
  );
}

export default function FinanceOfficialArchivesPage() {
  const navigate = useNavigate();
  const { getAdminData } = useAdminAuth();
  const canOperate = getAdminData()?.role === 'SUPER_ADMIN';
  const today = new Date();
  const [scope, setScope] = useState({ legal_entity_id: '', year: today.getFullYear(), month: today.getMonth() + 1 });
  const [entities, setEntities] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [entityLoading, setEntityLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeError, setScopeError] = useState('');
  const [accountsError, setAccountsError] = useState('');
  const [listError, setListError] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [items, setItems] = useState([]);
  const [recovery, setRecovery] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [form, setForm] = useState({
    account_id: '', provider: '', declared_source_channel: '', file: null,
  });
  const uploadGuard = useRef(false);
  const checkGuard = useRef(false);
  const loadId = useRef(0);

  useEffect(() => {
    if (!canOperate) { setEntityLoading(false); return undefined; }
    let alive = true;
    listLegalEntities({ page: 1, limit: 100, is_active: 'true' })
      .then(response => {
        if (!alive) return;
        const entries = Array.isArray(response?.data) ? response.data.filter(e => e.is_active !== false) : [];
        setEntities(entries);
        setScope(prev => ({ ...prev, legal_entity_id: entries[0]?.id || '' }));
        if ((response?.pagination?.totalPages || 1) > 1)
          setScopeError('Há mais de 100 empresas. Consulte a equipe técnica para ampliar a seleção sem omitir empresas.');
      })
      .catch(() => { if (alive) setScopeError('Não foi possível carregar as empresas. Atualize a página.'); })
      .finally(() => { if (alive) setEntityLoading(false); });
    return () => { alive = false; };
  }, [canOperate]);

  useEffect(() => {
    if (!canOperate || !scope.legal_entity_id) { setAccounts([]); return undefined; }
    let alive = true;
    setAccounts([]);
    setAccountsLoading(true);
    setAccountsError('');
    setForm(prev => ({ ...prev, account_id: '' }));
    listFinanceAccounts({ page: 1, limit: 100, legal_entity_id: scope.legal_entity_id, is_active: 'true' })
      .then(response => {
        if (!alive) return;
        setAccounts((Array.isArray(response?.data) ? response.data : []).filter(a =>
          a.is_active !== false && a.legal_entity_id === scope.legal_entity_id &&
          ['BANK', 'PIX_WALLET', 'CLEARING'].includes(a.type) && a.currency === 'BRL'));
        if ((response?.pagination?.totalPages || 1) > 1)
          setAccountsError('Há mais de 100 contas. A seleção está parcial; consulte a equipe técnica.');
      })
      .catch(() => { if (alive) setAccountsError('Não foi possível carregar as contas desta empresa.'); })
      .finally(() => { if (alive) setAccountsLoading(false); });
    return () => { alive = false; };
  }, [scope.legal_entity_id, canOperate]);

  useEffect(() => {
    if (!canOperate || !scope.legal_entity_id) {
      setItems([]); setRecovery(null); setLoaded(false); return undefined;
    }
    const current = ++loadId.current;
    setScopeLoading(true);
    setLoaded(false);
    setListError('');
    setRecoveryError('');
    setItems([]);
    setRecovery(null);
    const params = { ...scope };
    Promise.allSettled([listOfficialArchives(params), getOfficialArchiveRecovery(params)])
      .then(([list, report]) => {
        if (current !== loadId.current) return;
        if (list.status === 'fulfilled' && list.value?.success && Array.isArray(list.value.data))
          setItems(list.value.data);
        else setListError(officialArchiveErrorMessage(list.reason, 'Não foi possível consultar os extratos.'));
        if (report.status === 'fulfilled' && report.value?.success && report.value.data)
          setRecovery(report.value.data);
        else setRecoveryError(officialArchiveErrorMessage(report.reason, 'Não foi possível carregar as pendências.'));
        setLoaded(true);
      })
      .finally(() => { if (current === loadId.current) setScopeLoading(false); });
    return () => { loadId.current++; };
  }, [scope, refreshCount, canOperate]);

  const scopeReady = Boolean(scope.legal_entity_id && !entityLoading);
  const selectedEntity = entities.find(e => e.id === scope.legal_entity_id);
  const metrics = useMemo(() => ({
    total: items.length,
    approved: items.filter(isOfficialArchiveApproved).length,
    pending: items.filter(x => x.status === 'STORED_PENDING_SCAN' && x.malwareScanStatus === 'PENDING').length,
    attention: items.filter(x =>
      x.status === 'RESERVED' ||
      ['THREATS_FOUND', 'FAILED', 'ACCESS_DENIED', 'UNSUPPORTED'].includes(x.malwareScanStatus) ||
      (x.status === 'STORED_UNVERIFIED' && !isOfficialArchiveApproved(x))
    ).length,
  }), [items]);
  const reload = useCallback(() => setRefreshCount(n => n + 1), []);

  const selectFile = (file) => {
    if (!file) { setForm(prev => ({ ...prev, file: null })); return; }
    if (!/\.(pdf|csv)$/i.test(file.name) || file.size < 6 || file.size > MAX_BYTES) {
      setFeedback({ severity: 'warning', message: 'Selecione um PDF ou CSV válido, entre 6 bytes e 5 MB.' });
      setForm(prev => ({ ...prev, file: null }));
      return;
    }
    setFeedback(null);
    setForm(prev => ({ ...prev, file }));
  };

  const closeDialog = () => {
    if (uploading) return;
    setDialogOpen(false);
    setForm({ account_id: '', provider: '', declared_source_channel: '', file: null });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (uploadGuard.current || !canOperate || !scopeReady || !form.account_id || !form.provider ||
        !form.declared_source_channel || !form.file ||
        !accounts.some(a => a.id === form.account_id)) return;
    uploadGuard.current = true;
    setUploading(true);
    setFeedback(null);
    try {
      const result = await uploadOfficialArchive({ ...scope, ...form });
      if (!result?.success || !result?.data?.id) throw new Error('INVALID_UPLOAD_RESPONSE');
      setDialogOpen(false);
      setForm({ account_id: '', provider: '', declared_source_channel: '', file: null });
      setFeedback({ severity: 'success', message: 'Arquivo registrado. Aguardando análise do GuardDuty; nenhuma receita ou conciliação foi criada.' });
      reload();
    } catch (error) {
      setFeedback({ severity: 'error', message: officialArchiveErrorMessage(error, 'Não foi possível confirmar o envio. Consulte as pendências antes de tentar novamente.') });
    } finally { setUploading(false); uploadGuard.current = false; }
  };

  const checkScan = async (id) => {
    if (!canOperate || checkGuard.current) return;
    checkGuard.current = true;
    setChecking(id);
    setFeedback(null);
    try {
      const result = await checkOfficialArchiveMalware(id);
      if (!result?.success || !result?.data) throw new Error('INVALID_SCAN_RESPONSE');
      const status = officialArchiveStatus(result.data);
      setFeedback({
        severity: isOfficialArchiveApproved(result.data) ? 'success' : status.tone === 'error' ? 'error' : 'info',
        message: isOfficialArchiveApproved(result.data)
          ? 'GuardDuty sem ameaças e integridade confirmada. A origem oficial permanece não verificada.'
          : status.label + '. Nenhum arquivo bloqueado foi liberado.',
      });
      reload();
    } catch (error) {
      setFeedback({ severity: 'error', message: officialArchiveErrorMessage(error, 'A análise ainda não pôde ser confirmada. Atualize o inventário antes de agir.') });
      reload();
    } finally { setChecking(''); checkGuard.current = false; }
  };

  if (!canOperate) return (
    <Container maxWidth="md" sx={{ py: 5 }}>
      <Alert severity="error">Este ambiente de extratos oficiais é exclusivo de SUPER_ADMIN.</Alert>
      <Button onClick={() => navigate('/admin/financeiro')} sx={{ mt: 2 }}>Voltar ao Financeiro</Button>
    </Container>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F3F7FC', pb: 7 }}>
      <Box sx={{ background: 'radial-gradient(circle at 87% 12%, #1F5C80 0%, transparent 38%), linear-gradient(118deg, #091529 0%, #112949 66%, #0C3748 100%)', color: '#fff', pt: { xs: 3, md: 4 }, pb: { xs: 9, md: 10 } }}>
        <Container maxWidth="xl">
          <Button onClick={() => navigate('/admin/financeiro')} startIcon={<ArrowBack />} sx={{ color: '#D3E6FF', textTransform: 'none', mb: 2 }}>
            Central Financeira
          </Button>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={8}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <Chip icon={<LockOutlined sx={{ color: '#9FE4DE !important' }} />} label="AMBIENTE RESTRITO" size="small"
                  sx={{ bgcolor: 'rgba(15,178,166,.16)', border: '1px solid rgba(149,233,221,.3)', color: '#B6F5EF', fontWeight: 800, letterSpacing: 1 }} />
                <Chip size="small" label="SUPER_ADMIN" sx={{ bgcolor: 'rgba(255,255,255,.10)', color: '#E8F2FF', fontWeight: 700 }} />
              </Stack>
              <Typography component="h1" sx={{ fontWeight: 900, fontSize: { xs: 29, md: 40 }, lineHeight: 1.1, letterSpacing: '-.035em' }}>
                Extratos oficiais
              </Typography>
              <Typography sx={{ color: '#B8CCE1', mt: 1.3, maxWidth: 650, fontSize: { xs: 13, md: 15 } }}>
                Cofre privado de evidências, análise de segurança por versão e trilha de auditoria.
                Operação documental sem movimentar o razão financeiro.
              </Typography>
              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} sx={{ mt: 2.5 }}>
                <Chip icon={<ShieldOutlined sx={{ color: '#94E8E0 !important' }} />} label="S3 privado · SSE-KMS" sx={{ color: '#E3F7FC', bgcolor: 'rgba(255,255,255,.09)' }} />
                <Chip icon={<SecurityOutlined sx={{ color: '#94E8E0 !important' }} />} label="GuardDuty por versão" sx={{ color: '#E3F7FC', bgcolor: 'rgba(255,255,255,.09)' }} />
                <Chip icon={<VerifiedUserOutlined sx={{ color: '#94E8E0 !important' }} />} label="Integridade SHA-256" sx={{ color: '#E3F7FC', bgcolor: 'rgba(255,255,255,.09)' }} />
              </Stack>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ bgcolor: 'rgba(255,255,255,.075)', color: '#fff', border: '1px solid rgba(255,255,255,.17)', borderRadius: 3, boxShadow: 'none', backdropFilter: 'blur(10px)' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ color: '#9CC3DD', fontSize: 11, fontWeight: 800, letterSpacing: 1.2 }}>CADEIA DE CONFIANÇA</Typography>
                  <Stack spacing={1.4} sx={{ mt: 2 }}>
                    {['01 · Arquivo registrado', '02 · GuardDuty analisa a versão', '03 · Hash verificado após análise'].map((step, i) => (
                      <Box key={step} sx={{ display: 'flex', alignItems: 'center', gap: 1.4 }}>
                        <Box sx={{ width: 23, height: 23, bgcolor: i === 2 ? '#1BC9B8' : 'rgba(255,255,255,.14)', borderRadius: '50%', flexShrink: 0, border: '1px solid rgba(255,255,255,.3)' }} />
                        <Typography sx={{ fontSize: 12.5, color: '#ECF7FF' }}>{step}</Typography>
                      </Box>
                    ))}
                  </Stack>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,.15)', my: 2 }} />
                  <Typography sx={{ fontSize: 11, color: '#B8CCE1' }}>A origem bancária e a conciliação são verificações independentes.</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ mt: -6, position: 'relative' }}>
        <Grid container spacing={1.6} sx={{ mb: 2.5 }}>
          {[
            { title: 'Arquivos registrados', value: listError || !loaded ? '—' : metrics.total, subtitle: 'No período e empresa', icon: <FilePresentOutlined />, accent: COLORS.blue },
            { title: 'Íntegros · sem ameaças', value: listError || !loaded ? '—' : metrics.approved, subtitle: 'Origem ainda não verificada', icon: <FactCheckOutlined />, accent: '#059669' },
            { title: 'Aguardando análise', value: listError || !loaded ? '—' : metrics.pending, subtitle: 'Consulta manual disponível', icon: <SecurityOutlined />, accent: '#0E7490' },
            { title: 'Requerem atenção', value: listError || !loaded ? '—' : metrics.attention, subtitle: 'Bloqueios ou reservas', icon: <WarningAmberOutlined />, accent: '#C17B18' },
          ].map(metric => <Grid item xs={6} lg={3} key={metric.title}><Metric {...metric} /></Grid>)}
        </Grid>

        <Card sx={{ ...panelSx, mb: 2.5 }}>
          <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: 2.5 } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
              <Box>
                <Typography sx={{ fontWeight: 850, color: COLORS.ink, fontSize: 17 }}>Escopo da consulta</Typography>
                <Typography sx={{ color: COLORS.muted, fontSize: 12 }}>Empresa e competência são obrigatórias; não há consulta consolidada entre CNPJs.</Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button startIcon={<Refresh />} variant="outlined" onClick={reload} disabled={!scopeReady || scopeLoading || uploading}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}>Atualizar</Button>
                <Button startIcon={<CloudUploadOutlined />} variant="contained" onClick={() => { setFeedback(null); setDialogOpen(true); }}
                  disabled={!scopeReady || accountsLoading || !!accountsError || !accounts.length}
                  sx={{ bgcolor: COLORS.navy, borderRadius: 2, textTransform: 'none', fontWeight: 800, boxShadow: 'none', '&:hover': { bgcolor: '#204067' } }}>
                  Enviar extrato
                </Button>
              </Stack>
            </Stack>
            <Grid container spacing={1.5}>
              <Grid item xs={12} md={6}>
                <TextField select fullWidth size="small" label="Empresa / filial" sx={fieldSx} disabled={entityLoading || uploading}
                  value={scope.legal_entity_id} onChange={e => { setFeedback(null); setScope(prev => ({ ...prev, legal_entity_id: e.target.value })); }}>
                  {entities.map(e => <MenuItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social} · {e.entity_type || 'Empresa'}</MenuItem>)}
                  {!entities.length && <MenuItem value="" disabled>Nenhuma empresa disponível</MenuItem>}
                </TextField>
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField fullWidth select size="small" label="Ano" sx={fieldSx} value={scope.year}
                  disabled={uploading} onChange={e => { setFeedback(null); setScope(prev => ({ ...prev, year: Number(e.target.value) })); }}>
                  {Array.from({ length: 6 }, (_, index) => today.getFullYear() - index).map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField fullWidth select size="small" label="Mês" sx={fieldSx} value={scope.month}
                  disabled={uploading} onChange={e => { setFeedback(null); setScope(prev => ({ ...prev, month: Number(e.target.value) })); }}>
                  {MONTHS.map((month, index) => <MenuItem key={month} value={index + 1}>{month}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
            {scopeError && <Alert severity="warning" sx={{ mt: 1.5 }}>{scopeError}</Alert>}
            {accountsError && <Alert severity="warning" sx={{ mt: 1.5 }}>{accountsError}</Alert>}
            {feedback && <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ mt: 1.5 }}>{feedback.message}</Alert>}
          </CardContent>
        </Card>

        <Grid container spacing={2}>
          <Grid item xs={12} lg={8}>
            <Card sx={{ ...panelSx, height: '100%' }}>
              <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.7 }}>
                  <Box>
                    <Typography component="h2" sx={{ fontWeight: 850, color: COLORS.ink, fontSize: 18 }}>Inventário documental</Typography>
                    <Typography sx={{ color: COLORS.muted, fontSize: 12 }}>
                      {selectedEntity ? (selectedEntity.nome_fantasia || selectedEntity.razao_social) : 'Selecione uma empresa'} · {MONTHS[scope.month - 1]} de {scope.year}
                    </Typography>
                  </Box>
                  {scopeLoading && <CircularProgress size={20} />}
                </Stack>
                {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}
                {!listError && loaded && items.length >= 100 && <Alert severity="warning" sx={{ mb: 2 }}>A lista exibe até 100 registros. Consulte a equipe operacional antes de considerar o inventário completo.</Alert>}
                <TableContainer sx={{ border: '1px solid ' + COLORS.border, borderRadius: 2 }}>
                  <Table size="small" aria-label="Inventário de extratos oficiais" sx={{ minWidth: 720 }}>
                    <TableHead sx={{ bgcolor: '#F3F8FD' }}>
                      <TableRow>
                        {['Documento', 'Provedor / origem', 'Registrado', 'Análise', 'Ação'].map(h =>
                          <TableCell key={h} sx={{ color: COLORS.muted, fontSize: 11, fontWeight: 850, py: 1.6 }}>{h}</TableCell>)}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map(item => {
                        const state = officialArchiveStatus(item);
                        const canCheck = item.status === 'STORED_PENDING_SCAN' && item.malwareScanStatus === 'PENDING';
                        return <TableRow hover key={item.id}>
                          <TableCell sx={{ py: 1.5, minWidth: 155 }}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <FilePresentOutlined sx={{ color: COLORS.blue }} />
                              <Box>
                                <Typography sx={{ fontWeight: 800, color: COLORS.ink, fontSize: 12 }}>
                                  {item.mediaType === 'application/pdf' ? 'Documento PDF' : 'Documento CSV'}
                                </Typography>
                                <Typography sx={{ color: COLORS.muted, fontSize: 10.5 }}>
                                  {readableBytes(item.byteCount)} · SHA-256 {String(item.contentSha256 || '').slice(0, 10)}…
                                </Typography>
                              </Box>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontWeight: 750, fontSize: 12 }}>{item.provider}</Typography>
                            <Typography sx={{ fontSize: 10.5, color: COLORS.muted }}>{sourceLabels[item.declaredSourceChannel] || 'Origem declarada'}</Typography>
                          </TableCell>
                          <TableCell sx={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{dt(item.recordedAt)}</TableCell>
                          <TableCell>
                            <Chip size="small" color={state.tone} label={state.label} variant="outlined" sx={{ fontWeight: 750, maxWidth: 220 }} />
                          </TableCell>
                          <TableCell>
                            {canCheck ? <Button size="small" onClick={() => checkScan(item.id)} disabled={!!checking || uploading} startIcon={checking === item.id ? <CircularProgress size={13} /> : <SecurityOutlined />}
                              sx={{ textTransform: 'none', fontWeight: 800, whiteSpace: 'nowrap' }}>Verificar análise</Button>
                              : <Typography sx={{ fontSize: 11.5, color: COLORS.muted }}>Somente consulta</Typography>}
                          </TableCell>
                        </TableRow>;
                      })}
                      {!items.length && <TableRow><TableCell colSpan={5} sx={{ py: 7, textAlign: 'center' }}>
                        {scopeLoading ? <CircularProgress size={25} /> : <Stack alignItems="center" spacing={1}>
                          <FilePresentOutlined sx={{ color: '#A1B7CA', fontSize: 35 }} />
                          <Typography sx={{ color: COLORS.ink, fontWeight: 800 }}>Nenhum documento listado</Typography>
                          <Typography sx={{ color: COLORS.muted, fontSize: 12 }}>Isso não comprova faturamento zero nem substitui os extratos oficiais.</Typography>
                        </Stack>}
                      </TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Typography sx={{ color: COLORS.muted, fontSize: 11, mt: 1.6 }}>
                  O sistema apresenta somente metadados. Não há download, exclusão nem liberação manual de arquivos bloqueados.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} lg={4}>
            <Card sx={{ ...panelSx, mb: 2 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <WarningAmberOutlined sx={{ color: '#B7791F' }} />
                  <Typography component="h2" sx={{ fontWeight: 850, color: COLORS.ink, fontSize: 17 }}>Pendências operacionais</Typography>
                </Stack>
                <Typography sx={{ color: COLORS.muted, fontSize: 12, mb: 2 }}>Inventário read-only; sem reenvio, exclusão ou conclusão automática.</Typography>
                {recoveryError && <Alert severity="warning" sx={{ mb: 1 }}>{recoveryError}</Alert>}
                {recovery && <>
                  <Grid container spacing={1}>
                    {[
                      ['Reservas', recovery.counts?.reserved],
                      ['Aguardando análise', recovery.counts?.awaitingScan],
                      ['Exigem revisão', recovery.counts?.scanNeedsReview],
                      ['Checagem manual S3', recovery.counts?.requiresManualObjectCheck],
                    ].map(([label, value]) => <Grid item xs={6} key={label}><Box sx={{ p: 1.4, bgcolor: COLORS.sky, borderRadius: 2 }}>
                      <Typography sx={{ color: COLORS.muted, fontSize: 10.5 }}>{label}</Typography>
                      <Typography sx={{ fontWeight: 850, fontSize: 22, color: COLORS.ink }}>{value ?? '—'}</Typography>
                    </Box></Grid>)}
                  </Grid>
                  <Divider sx={{ my: 2 }} />
                  {(recovery.entries || []).slice(0, 6).map(entry => <Box key={entry.id} sx={{ mb: 1.4, pb: 1.4, borderBottom: '1px solid #E8EFF6' }}>
                    <Typography sx={{ fontSize: 11.5, color: COLORS.ink, fontWeight: 700 }}>{entry.provider} · {actionLabels[entry.action] || 'Revisão manual'}</Typography>
                    <Typography sx={{ fontSize: 10.5, color: COLORS.muted }}>{dt(entry.recordedAt)}</Typography>
                  </Box>)}
                  {!recovery.entries?.length && <Typography sx={{ color: COLORS.muted, fontSize: 12 }}>Nenhuma pendência de arquivo registrada nesta competência.</Typography>}
                  {(recovery.entries?.length || 0) > 6 && <Typography sx={{ color: COLORS.muted, fontSize: 11 }}>Exibindo 6 de {recovery.entries.length} registros de acompanhamento.</Typography>}
                </>}
                {!recovery && !recoveryError && <Typography sx={{ color: COLORS.muted, fontSize: 12 }}>Selecione uma empresa para consultar o acompanhamento.</Typography>}
              </CardContent>
            </Card>
            <Card sx={{ borderRadius: 3, color: '#fff', background: 'linear-gradient(145deg, #123D51, #0E6470)', boxShadow: '0 14px 30px rgba(9, 71, 87, .15)' }}>
              <CardContent sx={{ p: 2.5 }}>
                <LockOutlined sx={{ color: '#A5F3E9', mb: 1 }} />
                <Typography sx={{ fontWeight: 850, fontSize: 16 }}>Cofre com acesso limitado</Typography>
                <Typography sx={{ fontSize: 12, color: '#D9F6F3', mt: 1 }}>O envio exige SUPER_ADMIN. Após a gravação, a verificação lê apenas a versão com resultado sem ameaças e confere a integridade antes de registrar o resultado.</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        <TrustNotice />
      </Container>

      <Dialog open={dialogOpen} onClose={uploading ? undefined : closeDialog} fullWidth maxWidth="sm"
        PaperProps={{ component: 'form', onSubmit: submit, sx: { borderRadius: 3, overflow: 'hidden' } }}>
        <Box sx={{ height: 6, background: 'linear-gradient(90deg, #16345B, #0DAFA6)' }} />
        <DialogTitle sx={{ color: COLORS.ink, fontWeight: 850, pb: .5 }}>Registrar extrato no cofre</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: COLORS.muted, fontSize: 12, mb: 2 }}>
            {selectedEntity?.nome_fantasia || selectedEntity?.razao_social || 'Empresa'} · {MONTHS[scope.month - 1]} de {scope.year}.
            O envio registra o documento como declarado; não valida sua origem oficial.
          </Typography>
          {feedback && <Alert severity={feedback.severity} sx={{ mb: 2 }}>{feedback.message}</Alert>}
          <Stack spacing={2}>
            <TextField select required size="small" label="Conta financeira" value={form.account_id} disabled={uploading || accountsLoading}
              onChange={e => setForm(prev => ({ ...prev, account_id: e.target.value }))} sx={fieldSx}>
              {accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.code ? a.code + ' · ' : ''}{a.name} ({a.type})</MenuItem>)}
              {!accounts.length && <MenuItem disabled value="">Nenhuma conta elegível</MenuItem>}
            </TextField>
            <Grid container spacing={1.5}>
              <Grid item xs={6}><TextField select required fullWidth size="small" label="Provedor" value={form.provider} disabled={uploading}
                onChange={e => setForm(prev => ({ ...prev, provider: e.target.value }))} sx={fieldSx}>
                <MenuItem value="SUMUP">SumUp</MenuItem><MenuItem value="ASAAS">Asaas</MenuItem>
              </TextField></Grid>
              <Grid item xs={6}><TextField select required fullWidth size="small" label="Origem declarada" value={form.declared_source_channel} disabled={uploading}
                onChange={e => setForm(prev => ({ ...prev, declared_source_channel: e.target.value }))} sx={fieldSx}>
                {Object.entries(sourceLabels).map(([value, label]) => <MenuItem value={value} key={value}>{label}</MenuItem>)}
              </TextField></Grid>
            </Grid>
            <Box sx={{ border: '1px dashed #8CB4D8', borderRadius: 2.5, p: 2.3, bgcolor: '#F2F8FF', textAlign: 'center' }}>
              <CloudUploadOutlined sx={{ color: COLORS.blue, fontSize: 32 }} />
              <Typography sx={{ color: COLORS.ink, fontWeight: 800, fontSize: 12, mt: .5 }}>
                {form.file?.name || 'Documento PDF ou CSV'}
              </Typography>
              <Typography sx={{ color: COLORS.muted, fontSize: 11, mb: 1 }}>{form.file ? readableBytes(form.file.size) : 'Um único arquivo · máximo 5 MB · CSV em UTF-8'}</Typography>
              <Button component="label" variant="outlined" size="small" disabled={uploading} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
                Escolher arquivo
                <input hidden type="file" accept=".pdf,.csv,application/pdf,text/csv" onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ''; }} />
              </Button>
            </Box>
            <Alert severity="warning" sx={{ fontSize: 12 }}>O arquivo não será disponibilizado para download por esta tela. Em caso de erro após enviar, consulte as pendências antes de reenviar.</Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={closeDialog} disabled={uploading} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={uploading || !form.file || !form.account_id || !form.provider || !form.declared_source_channel || !scopeReady}
            startIcon={uploading ? <CircularProgress size={17} color="inherit" /> : <LockOutlined />}
            sx={{ bgcolor: COLORS.navy, px: 2.5, borderRadius: 2, fontWeight: 800, textTransform: 'none' }}>
            {uploading ? 'Enviando com segurança...' : 'Registrar documento'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
