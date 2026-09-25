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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import { CloudDone, CloudOff, Refresh, Sync } from '@mui/icons-material';
import FinanceModuleNav from '../../components/admin/finance/FinanceModuleNav';
import {
  fetchOutboundProviderHealth,
  fetchOutboundTreasuryHealth,
  listOutboundObligations,
  listOutboundPayees,
  listOutboundPayouts,
  runOutboundReconciliation,
} from '../../services/adminFinanceService';
import { formatCentsStringToBRL } from '../../utils/brlCurrency';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusColor(status) {
  const s = String(status || '').toUpperCase();
  if (['DONE', 'CONFIRMED', 'PAID', 'COMPLETED', 'RECONCILED'].includes(s)) return 'success';
  if (['FAILED', 'ERROR', 'CANCELED', 'CANCELLED', 'BLOCKED'].some((v) => s.includes(v))) return 'error';
  if (['PENDING', 'APPROVED', 'RESERVED', 'PROCESSING', 'SUBMITTED'].some((v) => s.includes(v))) return 'warning';
  return 'default';
}

export default function FinancePaymentsOperationsPage() {
  const [tab, setTab] = useState(0);
  const [provider, setProvider] = useState(null);
  const [treasury, setTreasury] = useState(null);
  const [payees, setPayees] = useState([]);
  const [obligations, setObligations] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState([]);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setWarnings([]);
    const calls = [
      ['provider', fetchOutboundProviderHealth()],
      ['treasury', fetchOutboundTreasuryHealth()],
      ['payees', listOutboundPayees({ limit: 50, offset: 0 })],
      ['obligations', listOutboundObligations({ limit: 50, offset: 0 })],
      ['payouts', listOutboundPayouts({ limit: 50, offset: 0 })],
    ];
    const results = await Promise.allSettled(calls.map(([, promise]) => promise));
    const failed = [];

    results.forEach((result, index) => {
      const key = calls[index][0];
      if (result.status === 'rejected') {
        failed.push(key);
        return;
      }
      const payload = result.value?.data;
      if (key === 'provider') setProvider(payload || null);
      if (key === 'treasury') setTreasury(payload || null);
      if (key === 'payees') setPayees(Array.isArray(payload) ? payload : []);
      if (key === 'obligations') setObligations(Array.isArray(payload) ? payload : []);
      if (key === 'payouts') setPayouts(Array.isArray(payload) ? payload : []);
    });

    setWarnings(failed);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const reconcile = async () => {
    setReconciling(true);
    try {
      const result = await runOutboundReconciliation();
      setReconcileResult({ ok: true, data: result?.data || {} });
      setReconcileOpen(false);
      await load();
    } catch (err) {
      setReconcileResult({ ok: false, message: err?.message || 'Falha ao reconciliar pagamentos.' });
    } finally {
      setReconciling(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 2, pb: 6 }}>
      <FinanceModuleNav />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, color: '#0F172A' }}>Pagamentos e Repasses</Typography>
          <Typography sx={{ mt: 0.5, color: '#64748B', fontSize: 13 }}>
            Monitoramento de beneficiários, obrigações, payouts, provedor e reconciliação. Nenhum pagamento é marcado manualmente como concluído nesta tela.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<Refresh />} variant="outlined" onClick={load} disabled={loading} sx={{ textTransform: 'none' }}>Atualizar</Button>
          <Button startIcon={<Sync />} variant="contained" onClick={() => setReconcileOpen(true)} disabled={reconciling} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Reconciliar
          </Button>
        </Box>
      </Box>

      {warnings.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>Alguns blocos não responderam: {warnings.join(', ')}.</Alert>}
      {reconcileResult?.ok && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setReconcileResult(null)}>Reconciliação executada e painel atualizado.</Alert>}
      {reconcileResult && !reconcileResult.ok && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setReconcileResult(null)}>{reconcileResult.message}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ height: '100%', border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {provider?.available ? <CloudDone color="success" /> : <CloudOff color="warning" />}
                <Typography sx={{ fontWeight: 900 }}>Provedor</Typography>
              </Box>
              <Typography sx={{ mt: 1, fontSize: 22, fontWeight: 900, color: provider?.available ? '#166534' : '#92400E' }}>
                {provider?.available ? 'Disponível' : 'Indisponível'}
              </Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12, color: '#64748B' }}>{provider?.provider || 'não configurado'}{provider?.reason ? ` · ${provider.reason}` : ''}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ height: '100%', border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
            <CardContent>
              <Typography sx={{ fontSize: 11, color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Saldo no provedor</Typography>
              <Typography sx={{ mt: 1, fontSize: 22, fontWeight: 900 }}>{formatCentsStringToBRL(treasury?.providerBalanceCents || '0')}</Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12, color: '#64748B' }}>Em trânsito: {formatCentsStringToBRL(treasury?.inTransitCents || '0')}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ height: '100%', border: treasury?.deficitCents !== '0' ? '1px solid #FDE68A' : '1px solid #BBF7D0', bgcolor: treasury?.deficitCents !== '0' ? '#FFFBEB' : '#F0FDF4', borderRadius: 2.5 }}>
            <CardContent>
              <Typography sx={{ fontSize: 11, color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Déficit de liquidez</Typography>
              <Typography sx={{ mt: 1, fontSize: 22, fontWeight: 900, color: treasury?.deficitCents !== '0' ? '#92400E' : '#166534' }}>{formatCentsStringToBRL(treasury?.deficitCents || '0')}</Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12, color: '#64748B' }}>Próximos 7 dias: {formatCentsStringToBRL(treasury?.dueNext7DaysCents || '0')}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card elevation={0} sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 2, borderBottom: '1px solid #E2E8F0' }}>
          <Tab label={`Obrigações (${obligations.length})`} />
          <Tab label={`Payouts (${payouts.length})`} />
          <Tab label={`Beneficiários (${payees.length})`} />
        </Tabs>

        {loading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>
        ) : (
          <>
            {tab === 0 && (
              obligations.length ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}><TableCell sx={{ fontWeight: 800 }}>Finalidade</TableCell><TableCell sx={{ fontWeight: 800 }}>Descrição</TableCell><TableCell sx={{ fontWeight: 800 }}>Vencimento</TableCell><TableCell sx={{ fontWeight: 800 }}>Status</TableCell><TableCell align="right" sx={{ fontWeight: 800 }}>Valor líquido</TableCell></TableRow></TableHead>
                    <TableBody>
                      {obligations.map((row) => (
                        <TableRow key={row.id} hover>
                          <TableCell sx={{ fontSize: 12 }}>{row.purpose}</TableCell>
                          <TableCell><Typography sx={{ fontSize: 12, fontWeight: 700 }}>{row.description_safe || '—'}</Typography><Typography sx={{ fontSize: 10, color: '#64748B' }}>{row.id.slice(0, 12)}</Typography></TableCell>
                          <TableCell sx={{ fontSize: 12 }}>{formatDate(row.due_date)}</TableCell>
                          <TableCell><Chip size="small" label={row.status} color={statusColor(row.status)} /></TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800 }}>{formatCentsStringToBRL(row.net_amount_cents || '0')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : <Alert severity="info" sx={{ m: 2 }}>Nenhuma obrigação outbound encontrada.</Alert>
            )}

            {tab === 1 && (
              payouts.length ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}><TableCell sx={{ fontWeight: 800 }}>Provedor</TableCell><TableCell sx={{ fontWeight: 800 }}>Instrumento</TableCell><TableCell sx={{ fontWeight: 800 }}>Referência</TableCell><TableCell sx={{ fontWeight: 800 }}>Status</TableCell><TableCell sx={{ fontWeight: 800 }}>Confirmado</TableCell><TableCell align="right" sx={{ fontWeight: 800 }}>Valor</TableCell></TableRow></TableHead>
                    <TableBody>
                      {payouts.map((row) => (
                        <TableRow key={row.id} hover>
                          <TableCell sx={{ fontSize: 12 }}>{row.provider_name || '—'}</TableCell>
                          <TableCell sx={{ fontSize: 12 }}>{row.instrument || '—'}</TableCell>
                          <TableCell sx={{ fontSize: 11, fontFamily: 'monospace' }}>{row.external_reference || '—'}</TableCell>
                          <TableCell><Chip size="small" label={row.status} color={statusColor(row.status)} /></TableCell>
                          <TableCell sx={{ fontSize: 12 }}>{formatDate(row.confirmed_at || row.submitted_at)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800 }}>{formatCentsStringToBRL(row.amount_cents || '0')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : <Alert severity="info" sx={{ m: 2 }}>Nenhum payout encontrado.</Alert>
            )}

            {tab === 2 && (
              payees.length ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}><TableCell sx={{ fontWeight: 800 }}>Tipo</TableCell><TableCell sx={{ fontWeight: 800 }}>Documento</TableCell><TableCell sx={{ fontWeight: 800 }}>Status</TableCell><TableCell sx={{ fontWeight: 800 }}>Verificação</TableCell><TableCell sx={{ fontWeight: 800 }}>Criado</TableCell></TableRow></TableHead>
                    <TableBody>
                      {payees.map((row) => (
                        <TableRow key={row.id} hover>
                          <TableCell sx={{ fontSize: 12 }}>{row.payee_type}</TableCell>
                          <TableCell sx={{ fontSize: 12 }}>{row.cpf_cnpj_masked || '—'} · {row.document_type}</TableCell>
                          <TableCell><Chip size="small" label={row.status} color={statusColor(row.status)} /></TableCell>
                          <TableCell><Chip size="small" label={row.verification_status || '—'} variant="outlined" /></TableCell>
                          <TableCell sx={{ fontSize: 12 }}>{formatDate(row.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : <Alert severity="info" sx={{ m: 2 }}>Nenhum beneficiário encontrado.</Alert>
            )}
          </>
        )}
      </Card>

      <Dialog open={reconcileOpen} onClose={() => !reconciling && setReconcileOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Executar reconciliação</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info">
            A reconciliação consulta o provedor e atualiza o estado interno de pagamentos conforme as evidências retornadas. Ela não cria um pagamento manual nem força sucesso.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReconcileOpen(false)} disabled={reconciling}>Cancelar</Button>
          <Button variant="contained" startIcon={<Sync />} onClick={reconcile} disabled={reconciling}>{reconciling ? 'Reconciliando...' : 'Executar'}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
