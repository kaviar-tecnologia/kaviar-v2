import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Button, Chip, Switch, FormControlLabel, Skeleton, Alert, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, IconButton, Divider } from '@mui/material';
import { ArrowBack, Add, PlayArrow, History } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

const TYPE_LABELS = { HONORARIOS: 'Honorários', DAS_SIMPLES: 'DAS Simples', GUIA_IMPOSTO: 'Guia de Imposto', FGTS: 'FGTS', INSS: 'INSS', TAXA_MUNICIPAL: 'Taxa Municipal', BOLETO_FORNECEDOR: 'Fornecedor', OUTRO: 'Outro' };

export default function AccountantAutomationPage() {
  const navigate = useNavigate();
  const { entityId } = useParams();
  const [templates, setTemplates] = useState([]);
  const [config, setConfig] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entityName, setEntityName] = useState('');

  const fetchAll = () => {
    Promise.all([
      accountantApi.get(`/api/accountant/portal/recurring-templates?legal_entity_id=${entityId}`),
      accountantApi.get('/api/accountant/portal/automation-config'),
      accountantApi.get('/api/accountant/portal/automation-log'),
      accountantApi.get('/api/accountant/portal/companies'),
    ]).then(([tRes, cRes, lRes, compRes]) => {
      setTemplates(tRes.data?.data || []);
      const configs = cRes.data?.data || [];
      setConfig(configs.find(c => c.legal_entity_id === entityId) || null);
      setLogs((lRes.data?.data || []).filter(l => l.legal_entity_id === entityId).slice(0, 20));
      const company = (compRes.data?.data || []).find(c => c.id === entityId);
      if (company) setEntityName(company.razao_social);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [entityId]);

  const handleToggleConfig = async (field, value) => {
    try {
      await accountantApi.patch(`/api/accountant/portal/automation-config/${entityId}`, { [field]: value });
      setSnackbar({ open: true, message: 'Configuração atualizada.', severity: 'success' });
      fetchAll();
    } catch (err) { setSnackbar({ open: true, message: 'Erro ao salvar', severity: 'error' }); }
  };

  const handleRun = async () => {
    try {
      const res = await accountantApi.post('/api/accountant/portal/automation/run');
      const r = res.data?.data;
      setSnackbar({ open: true, message: `Executado: ${r.created_competencies} competência(s), ${r.created_obligations} obrigação(ões)`, severity: 'success' });
      fetchAll();
    } catch (err) { setSnackbar({ open: true, message: 'Erro na execução', severity: 'error' }); }
  };

  const handleToggleTemplate = async (id, isActive) => {
    try {
      await accountantApi.patch(`/api/accountant/portal/recurring-templates/${id}`, { is_active: !isActive });
      fetchAll();
    } catch { }
  };

  if (loading) return <AccountantPortalLayout><Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} /></AccountantPortalLayout>;

  return (
    <AccountantPortalLayout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate(`/contador/empresas/${entityId}`)} sx={{ color: 'rgba(255,255,255,0.5)' }}><ArrowBack /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>Automações</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{entityName}</Typography>
        </Box>
        <Button size="small" startIcon={<PlayArrow />} onClick={handleRun} sx={{ color: '#D4AF37', textTransform: 'none' }}>Executar Agora</Button>
      </Box>

      {/* Config */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Typography sx={{ color: '#D4AF37', fontWeight: 600, fontSize: 14, mb: 2 }}>Configuração</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <FormControlLabel control={<Switch checked={config?.is_active || false} onChange={(e) => handleToggleConfig('is_active', e.target.checked)} sx={{ '& .Mui-checked': { color: '#D4AF37' } }} />} label={<Typography sx={{ color: '#fff', fontSize: 13 }}>Automação ativa</Typography>} />
            <FormControlLabel control={<Switch checked={config?.auto_create_competency || false} onChange={(e) => handleToggleConfig('auto_create_competency', e.target.checked)} sx={{ '& .Mui-checked': { color: '#D4AF37' } }} />} label={<Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Criar competência mensal automaticamente</Typography>} />
            <FormControlLabel control={<Switch checked={config?.auto_create_obligations || false} onChange={(e) => handleToggleConfig('auto_create_obligations', e.target.checked)} sx={{ '& .Mui-checked': { color: '#D4AF37' } }} />} label={<Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Criar obrigações de modelos recorrentes</Typography>} />
            <FormControlLabel control={<Switch checked={config?.send_reminder_d7 || false} onChange={(e) => handleToggleConfig('send_reminder_d7', e.target.checked)} sx={{ '& .Mui-checked': { color: '#D4AF37' } }} />} label={<Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Lembrete D-7</Typography>} />
            <FormControlLabel control={<Switch checked={config?.send_reminder_d1 || false} onChange={(e) => handleToggleConfig('send_reminder_d1', e.target.checked)} sx={{ '& .Mui-checked': { color: '#D4AF37' } }} />} label={<Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Lembrete D-1</Typography>} />
          </Box>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 14 }}>Modelos Recorrentes</Typography>
            <Button size="small" startIcon={<Add />} onClick={() => setDialogOpen(true)} sx={{ color: '#D4AF37', textTransform: 'none', fontSize: 12 }}>Novo Modelo</Button>
          </Box>
          {templates.length === 0 ? (
            <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', py: 2 }}>Nenhum modelo cadastrado</Typography>
          ) : templates.map(t => (
            <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ color: '#fff', fontSize: 13 }}>{t.description}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{t.amount_display} • Dia {t.day_of_month_due} • {TYPE_LABELS[t.obligation_type] || t.obligation_type}</Typography>
              </Box>
              <Chip label={t.is_active ? 'Ativo' : 'Inativo'} size="small" sx={{ bgcolor: t.is_active ? '#22C55E20' : '#6B728020', color: t.is_active ? '#22C55E' : '#6B7280', fontSize: 10, height: 20, cursor: 'pointer' }} onClick={() => handleToggleTemplate(t.id, t.is_active)} />
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* Log */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <CardContent>
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 14, mb: 1.5 }}>Histórico ({logs.length})</Typography>
          {logs.length === 0 ? (
            <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', py: 2 }}>Nenhuma execução registrada</Typography>
          ) : logs.slice(0, 10).map(l => (
            <Box key={l.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: l.success ? '#22C55E' : '#EF4444' }} />
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{l.action}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, ml: 'auto' }}>{new Date(l.created_at).toLocaleString('pt-BR')}</Typography>
            </Box>
          ))}
        </CardContent>
      </Card>

      <NewTemplateDialog open={dialogOpen} onClose={() => setDialogOpen(false)} entityId={entityId} onSuccess={(msg) => { setDialogOpen(false); fetchAll(); setSnackbar({ open: true, message: msg, severity: 'success' }); }} />
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </AccountantPortalLayout>
  );
}

function NewTemplateDialog({ open, onClose, entityId, onSuccess }) {
  const [form, setForm] = useState({ description: '', obligation_type: 'HONORARIOS', amount: '', day_of_month_due: 20, days_before_due_to_create: 15, notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const amountCents = Math.round(parseFloat(form.amount.replace(',', '.')) * 100);
      if (isNaN(amountCents) || amountCents <= 0) { setError('Valor inválido'); setLoading(false); return; }
      await accountantApi.post('/api/accountant/portal/recurring-templates', {
        legal_entity_id: entityId,
        obligation_type: form.obligation_type,
        description: form.description,
        amount_cents: amountCents,
        day_of_month_due: form.day_of_month_due,
        days_before_due_to_create: form.days_before_due_to_create,
        notes: form.notes || null,
      });
      onSuccess('Modelo criado com sucesso.');
      setForm({ description: '', obligation_type: 'HONORARIOS', amount: '', day_of_month_due: 20, days_before_due_to_create: 15, notes: '' });
    } catch (err) { setError(err.response?.data?.error || 'Erro'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1E2433', border: '1px solid rgba(255,255,255,0.1)' } }}>
      <DialogTitle sx={{ color: '#fff' }}>Novo Modelo Recorrente</DialogTitle>
      <DialogContent>
        <form onSubmit={handleSubmit} id="template-form">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Descrição *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <FormControl fullWidth>
              <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Tipo</InputLabel>
              <Select value={form.obligation_type} onChange={e => setForm(f => ({ ...f, obligation_type: e.target.value }))} label="Tipo" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </Select>
            </FormControl>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <TextField label="Valor (R$) *" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required placeholder="405,00" sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
              <TextField label="Dia vencimento" type="number" value={form.day_of_month_due} onChange={e => setForm(f => ({ ...f, day_of_month_due: parseInt(e.target.value) || 20 }))} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
              <TextField label="Antecedência (dias)" type="number" value={form.days_before_due_to_create} onChange={e => setForm(f => ({ ...f, days_before_due_to_create: parseInt(e.target.value) || 15 }))} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            </Box>
            {error && <Alert severity="error" sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{error}</Alert>}
          </Box>
        </form>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancelar</Button>
        <Button type="submit" form="template-form" variant="contained" disabled={loading || !form.description || !form.amount} sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}>
          {loading ? 'Criando...' : 'Criar Modelo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
