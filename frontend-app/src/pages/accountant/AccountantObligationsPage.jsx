import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Chip, Button, Skeleton, Grid, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, Alert, Snackbar, IconButton, Tooltip } from '@mui/material';
import { Receipt, Add, Business, ArrowBack, Send, CheckCircle, CloudDownload } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

const TYPE_LABELS = { HONORARIOS: 'Honorários', DAS_SIMPLES: 'DAS Simples', GUIA_IMPOSTO: 'Guia de Imposto', FGTS: 'FGTS', INSS: 'INSS', TAXA_MUNICIPAL: 'Taxa Municipal', BOLETO_FORNECEDOR: 'Boleto Fornecedor', OUTRO: 'Outro' };
const STATUS_LABELS = { DRAFT: 'Rascunho', SENT_TO_COMPANY: 'Enviado', VIEWED: 'Visualizado', SCHEDULED: 'Programado', PAID: 'Pago', PROOF_UPLOADED: 'Comprovante Enviado', UNDER_VERIFICATION: 'Em Verificação', VERIFIED: 'Verificado', RECONCILED: 'Conciliado', REJECTED: 'Rejeitado', CANCELED: 'Cancelado' };
const STATUS_COLORS = { DRAFT: '#6B7280', SENT_TO_COMPANY: '#3B82F6', VIEWED: '#8B5CF6', SCHEDULED: '#6366F1', PAID: '#10B981', PROOF_UPLOADED: '#F59E0B', UNDER_VERIFICATION: '#F59E0B', VERIFIED: '#22C55E', RECONCILED: '#22C55E', REJECTED: '#EF4444', CANCELED: '#6B7280' };
const DUE_COLORS = { OK: '#22C55E', DUE_SOON: '#F59E0B', DUE_TODAY: '#EF4444', OVERDUE: '#EF4444', CLOSED: '#6B7280' };
const DUE_LABELS = { OK: '', DUE_SOON: 'Vence em breve', DUE_TODAY: 'Vence hoje', OVERDUE: 'Vencido', CLOSED: '' };

export default function AccountantObligationsPage() {
  const navigate = useNavigate();
  const { entityId } = useParams();
  const [obligations, setObligations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entityName, setEntityName] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchData = () => {
    const params = entityId ? `?legal_entity_id=${entityId}` : '';
    accountantApi.get(`/api/accountant/portal/obligations${params}`)
      .then(r => setObligations(r.data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [entityId]);
  useEffect(() => {
    if (entityId) {
      accountantApi.get('/api/accountant/portal/companies').then(r => {
        const c = (r.data?.data || []).find(x => x.id === entityId);
        if (c) setEntityName(c.razao_social);
      }).catch(() => {});
    }
  }, [entityId]);

  const handleTransition = async (obId, status) => {
    try {
      await accountantApi.post(`/api/accountant/portal/obligations/${obId}/transition`, { status });
      setSnackbar({ open: true, message: 'Status atualizado.', severity: 'success' });
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Erro', severity: 'error' });
    }
  };

  return (
    <AccountantPortalLayout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        {entityId && <IconButton onClick={() => navigate(`/contador/empresas/${entityId}`)} sx={{ color: 'rgba(255,255,255,0.5)' }}><ArrowBack /></IconButton>}
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>Contas a Pagar</Typography>
          {entityName && <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{entityName}</Typography>}
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)} sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}>
          Nova Obrigação
        </Button>
      </Box>

      {loading ? [1,2,3].map(i => <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', mb: 1.5 }} />) : obligations.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Receipt sx={{ fontSize: 64, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>Nenhuma obrigação cadastrada</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, mt: 1 }}>Cadastre a primeira obrigação clicando em "Nova Obrigação".</Typography>
        </Box>
      ) : (
        obligations.map(ob => {
          const statusColor = STATUS_COLORS[ob.status] || '#6B7280';
          const dueColor = DUE_COLORS[ob.due_status] || '#6B7280';
          return (
            <Card key={ob.id} sx={{ mb: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${ob.due_status === 'OVERDUE' ? '#EF444430' : 'rgba(255,255,255,0.08)'}`, borderRadius: 2 }}>
              <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography sx={{ color: '#fff', fontWeight: 500, fontSize: 14 }}>{ob.description}</Typography>
                      <Chip label={STATUS_LABELS[ob.status]} size="small" sx={{ bgcolor: `${statusColor}20`, color: statusColor, fontSize: 10, height: 20 }} />
                      {ob.due_status !== 'OK' && ob.due_status !== 'CLOSED' && (
                        <Chip label={DUE_LABELS[ob.due_status]} size="small" sx={{ bgcolor: `${dueColor}20`, color: dueColor, fontSize: 10, height: 20 }} />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Typography sx={{ color: '#D4AF37', fontSize: 14, fontWeight: 600 }}>{ob.amount_display}</Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Vencimento: {ob.due_date ? new Date(ob.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{TYPE_LABELS[ob.obligation_type] || ob.obligation_type}</Typography>
                      {!entityId && <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}><Business sx={{ fontSize: 11, mr: 0.3, verticalAlign: 'middle' }} />{ob.legal_entity?.razao_social}</Typography>}
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {ob.status === 'DRAFT' && (
                      <Tooltip title="Enviar para empresa"><IconButton size="small" onClick={() => handleTransition(ob.id, 'SENT_TO_COMPANY')} sx={{ color: '#3B82F6' }}><Send fontSize="small" /></IconButton></Tooltip>
                    )}
                    {['PROOF_UPLOADED', 'UNDER_VERIFICATION'].includes(ob.status) && (
                      <Tooltip title="Verificar e conciliar"><IconButton size="small" onClick={() => handleTransition(ob.id, 'VERIFIED')} sx={{ color: '#22C55E' }}><CheckCircle fontSize="small" /></IconButton></Tooltip>
                    )}
                    {ob.status === 'VERIFIED' && (
                      <Tooltip title="Marcar como conciliado"><IconButton size="small" onClick={() => handleTransition(ob.id, 'RECONCILED')} sx={{ color: '#22C55E' }}><CheckCircle fontSize="small" /></IconButton></Tooltip>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          );
        })
      )}

      <NewObligationDialog open={dialogOpen} onClose={() => setDialogOpen(false)} entityId={entityId} onSuccess={(msg) => { setDialogOpen(false); fetchData(); setSnackbar({ open: true, message: msg, severity: 'success' }); }} />
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </AccountantPortalLayout>
  );
}

function NewObligationDialog({ open, onClose, entityId, onSuccess }) {
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({ legal_entity_id: entityId || '', obligation_type: 'HONORARIOS', description: '', beneficiary: '', amount: '', due_date: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!entityId) accountantApi.get('/api/accountant/portal/companies').then(r => setCompanies(r.data?.data || [])).catch(() => {});
  }, [entityId]);

  useEffect(() => { if (entityId) setForm(f => ({ ...f, legal_entity_id: entityId })); }, [entityId]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const amountCents = Math.round(parseFloat(form.amount.replace(',', '.')) * 100);
      if (isNaN(amountCents) || amountCents <= 0) { setError('Valor inválido'); setLoading(false); return; }
      
      // Ensure due_date is YYYY-MM-DD
      const dueDate = form.due_date; // HTML date input always returns YYYY-MM-DD
      if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { setError('Data de vencimento inválida'); setLoading(false); return; }

      await accountantApi.post('/api/accountant/portal/obligations', {
        legal_entity_id: form.legal_entity_id,
        obligation_type: form.obligation_type,
        description: form.description,
        beneficiary: form.beneficiary || null,
        amount_cents: amountCents,
        due_date: dueDate,
        notes: form.notes || null,
      });
      onSuccess('Obrigação criada com sucesso.');
      setForm({ legal_entity_id: entityId || '', obligation_type: 'HONORARIOS', description: '', beneficiary: '', amount: '', due_date: '', notes: '' });
    } catch (err) { 
      const details = err.response?.data?.details;
      if (details && Array.isArray(details)) {
        const msgs = details.map(d => `${d.path?.join('.') || 'campo'}: ${d.message}`).join('; ');
        setError(msgs);
      } else {
        setError(err.response?.data?.error || 'Erro ao criar');
      }
    }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1E2433', border: '1px solid rgba(255,255,255,0.1)' } }}>
      <DialogTitle sx={{ color: '#fff' }}>Nova Obrigação de Pagamento</DialogTitle>
      <DialogContent>
        <form onSubmit={handleSubmit} id="ob-form">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {!entityId && (
              <FormControl fullWidth required>
                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Empresa *</InputLabel>
                <Select value={form.legal_entity_id} onChange={e => setForm(f => ({ ...f, legal_entity_id: e.target.value }))} label="Empresa *" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                  {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.razao_social}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <FormControl fullWidth>
              <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Tipo</InputLabel>
              <Select value={form.obligation_type} onChange={e => setForm(f => ({ ...f, obligation_type: e.target.value }))} label="Tipo" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Descrição *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <TextField label="Beneficiário" value={form.beneficiary} onChange={e => setForm(f => ({ ...f, beneficiary: e.target.value }))} fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label="Valor (R$) *" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required placeholder="405,00" sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
              <TextField label="Vencimento *" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} required InputLabelProps={{ shrink: true }} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            </Box>
            <TextField label="Observações" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} multiline rows={2} fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            {error && <Alert severity="error" sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{error}</Alert>}
          </Box>
        </form>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancelar</Button>
        <Button type="submit" form="ob-form" variant="contained" disabled={loading || !form.legal_entity_id || !form.description || !form.amount || !form.due_date} sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}>
          {loading ? 'Salvando...' : 'Criar Obrigação'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
