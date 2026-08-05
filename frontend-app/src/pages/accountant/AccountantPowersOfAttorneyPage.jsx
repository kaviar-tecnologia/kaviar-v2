import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Chip, Button, Skeleton, Grid, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, Alert, Snackbar } from '@mui/material';
import { Gavel, Add, Business } from '@mui/icons-material';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

const SCOPE_LABELS = { ECAC: 'e-CAC (Receita Federal)', PREFEITURA: 'Prefeitura', SEFAZ: 'SEFAZ', JUNTA_COMERCIAL: 'Junta Comercial', INSS: 'INSS', FGTS: 'FGTS', OUTRO: 'Outro órgão' };
const STATUS_LABELS = { ACTIVE: { label: 'Ativa', color: '#22C55E' }, REVOKED: { label: 'Revogada', color: '#EF4444' }, REPLACED: { label: 'Substituída', color: '#6B7280' }, SUSPENDED: { label: 'Suspensa', color: '#F59E0B' } };
const TEMPORAL_LABELS = { NO_EXPIRY: { label: 'Sem Validade', color: '#6B7280' }, VALID: { label: 'Válida', color: '#22C55E' }, EXPIRING_SOON: { label: 'Vencendo', color: '#F59E0B' }, EXPIRED: { label: 'Vencida', color: '#EF4444' } };

export default function AccountantPowersOfAttorneyPage() {
  const [poas, setPoas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    accountantApi.get('/api/accountant/portal/powers-of-attorney').then(r => setPoas(r.data?.data || [])).catch(() => {}).finally(() => setLoading(false));
    accountantApi.get('/api/accountant/portal/companies').then(r => setCompanies(r.data?.data || [])).catch(() => {});
  }, []);

  const reload = () => { accountantApi.get('/api/accountant/portal/powers-of-attorney').then(r => setPoas(r.data?.data || [])).catch(() => {}); };

  return (
    <AccountantPortalLayout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>Procurações</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, mt: 0.5 }}>{poas.length > 0 ? `${poas.length} procuração${poas.length > 1 ? 'ões' : ''}` : 'Gerencie procurações das empresas vinculadas'}</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)} sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}>
          Nova Procuração
        </Button>
      </Box>

      {loading ? (
        <Grid container spacing={2}>{[1,2,3].map(i => <Grid item xs={12} key={i}><Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} /></Grid>)}</Grid>
      ) : poas.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Gavel sx={{ fontSize: 64, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>Nenhuma procuração cadastrada</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, mt: 1 }}>Cadastre a primeira procuração clicando em "Nova Procuração".</Typography>
        </Box>
      ) : (
        poas.map(poa => {
          const statusInfo = STATUS_LABELS[poa.status] || { label: poa.status, color: '#6B7280' };
          const temporalInfo = TEMPORAL_LABELS[poa.temporal_status] || { label: '', color: '#6B7280' };
          return (
            <Card key={poa.id} sx={{ mb: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Gavel sx={{ fontSize: 16, color: '#D4AF37' }} />
                      <Typography sx={{ color: '#fff', fontWeight: 500, fontSize: 15 }}>{SCOPE_LABELS[poa.scope] || poa.scope}</Typography>
                      <Chip label={statusInfo.label} size="small" sx={{ bgcolor: `${statusInfo.color}20`, color: statusInfo.color, fontSize: 11, height: 22 }} />
                      {poa.temporal_status && poa.temporal_status !== 'NO_EXPIRY' && poa.temporal_status !== 'VALID' && (
                        <Chip label={temporalInfo.label} size="small" sx={{ bgcolor: `${temporalInfo.color}20`, color: temporalInfo.color, fontSize: 11, height: 22 }} />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Outorgante: {poa.grantor_name}</Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Outorgado: {poa.grantee_name}</Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}><Business sx={{ fontSize: 11, mr: 0.3, verticalAlign: 'middle' }} />{poa.legal_entity?.razao_social}</Typography>
                    </Box>
                  </Box>
                  {poa.days_until_expiry !== null && poa.days_until_expiry <= 30 && poa.days_until_expiry >= 0 && (
                    <Chip label={`${poa.days_until_expiry}d`} size="small" sx={{ bgcolor: '#F59E0B20', color: '#F59E0B', fontWeight: 600 }} />
                  )}
                </Box>
              </CardContent>
            </Card>
          );
        })
      )}

      <NewPOADialog open={dialogOpen} onClose={() => setDialogOpen(false)} companies={companies} onSuccess={(msg) => { setDialogOpen(false); reload(); setSnackbar({ open: true, message: msg, severity: 'success' }); }} />
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </AccountantPortalLayout>
  );
}

function NewPOADialog({ open, onClose, companies, onSuccess }) {
  const [form, setForm] = useState({ legal_entity_id: '', scope: 'ECAC', grantor_name: '', grantee_name: '', issued_at: '', expires_at: '', protocol_number: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const payload = { ...form, issued_at: form.issued_at ? new Date(form.issued_at).toISOString() : null, expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null };
      await accountantApi.post('/api/accountant/portal/powers-of-attorney', payload);
      onSuccess('Procuração cadastrada com sucesso.');
      setForm({ legal_entity_id: '', scope: 'ECAC', grantor_name: '', grantee_name: '', issued_at: '', expires_at: '', protocol_number: '', notes: '' });
    } catch (err) { setError(err.response?.data?.error || 'Erro ao cadastrar'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1E2433', border: '1px solid rgba(255,255,255,0.1)' } }}>
      <DialogTitle sx={{ color: '#fff' }}>Nova Procuração</DialogTitle>
      <DialogContent>
        <form onSubmit={handleSubmit} id="poa-form">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth required>
              <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Empresa *</InputLabel>
              <Select value={form.legal_entity_id} onChange={e => setForm(f => ({ ...f, legal_entity_id: e.target.value }))} label="Empresa *" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.razao_social}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Órgão</InputLabel>
              <Select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} label="Órgão" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                {Object.entries(SCOPE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Outorgante (quem concede) *" value={form.grantor_name} onChange={e => setForm(f => ({ ...f, grantor_name: e.target.value }))} required fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <TextField label="Outorgado (quem recebe) *" value={form.grantee_name} onChange={e => setForm(f => ({ ...f, grantee_name: e.target.value }))} required fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label="Data de emissão" type="date" value={form.issued_at} onChange={e => setForm(f => ({ ...f, issued_at: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
              <TextField label="Validade" type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            </Box>
            <TextField label="Número do protocolo" value={form.protocol_number} onChange={e => setForm(f => ({ ...f, protocol_number: e.target.value }))} fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <TextField label="Observações" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} multiline rows={2} fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            {error && <Alert severity="error" sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{error}</Alert>}
          </Box>
        </form>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancelar</Button>
        <Button type="submit" form="poa-form" variant="contained" disabled={loading || !form.legal_entity_id || !form.grantor_name || !form.grantee_name} sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}>
          {loading ? 'Salvando...' : 'Cadastrar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
