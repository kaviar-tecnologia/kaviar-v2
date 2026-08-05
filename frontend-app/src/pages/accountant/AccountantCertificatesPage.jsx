import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Chip, Button, Skeleton, Grid, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, Alert, Snackbar, IconButton } from '@mui/material';
import { VpnKey, Add, Business, CheckCircle, Warning, Cancel, ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

const TYPE_LABELS = { E_CNPJ_A1: 'e-CNPJ A1', E_CNPJ_A3: 'e-CNPJ A3', E_CPF_A1: 'e-CPF A1', E_CPF_A3: 'e-CPF A3', NF_E: 'NF-e', OTHER: 'Outro' };
const STATUS_LABELS = { ACTIVE: { label: 'Ativo', color: '#22C55E' }, REVOKED: { label: 'Revogado', color: '#EF4444' }, REPLACED: { label: 'Substituído', color: '#6B7280' } };
const TEMPORAL_LABELS = { NO_EXPIRY: { label: 'Sem Validade', color: '#6B7280' }, VALID: { label: 'Válido', color: '#22C55E' }, EXPIRING_SOON: { label: 'Vencendo', color: '#F59E0B' }, EXPIRED: { label: 'Vencido', color: '#EF4444' } };

export default function AccountantCertificatesPage() {
  const navigate = useNavigate();
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    accountantApi.get('/api/accountant/portal/certificates').then(r => setCerts(r.data?.data || [])).catch(() => {}).finally(() => setLoading(false));
    accountantApi.get('/api/accountant/portal/companies').then(r => setCompanies(r.data?.data || [])).catch(() => {});
  }, []);

  const reload = () => { accountantApi.get('/api/accountant/portal/certificates').then(r => setCerts(r.data?.data || [])).catch(() => {}); };

  return (
    <AccountantPortalLayout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>Certificados Digitais</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, mt: 0.5 }}>{certs.length > 0 ? `${certs.length} certificado${certs.length > 1 ? 's' : ''}` : 'Gerencie certificados das empresas vinculadas'}</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)} sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}>
          Novo Certificado
        </Button>
      </Box>

      {loading ? (
        <Grid container spacing={2}>{[1,2,3].map(i => <Grid item xs={12} key={i}><Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} /></Grid>)}</Grid>
      ) : certs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <VpnKey sx={{ fontSize: 64, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>Nenhum certificado cadastrado</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, mt: 1 }}>Cadastre o primeiro certificado digital clicando em "Novo Certificado".</Typography>
        </Box>
      ) : (
        certs.map(cert => {
          const statusInfo = STATUS_LABELS[cert.status] || { label: cert.status, color: '#6B7280' };
          const temporalInfo = TEMPORAL_LABELS[cert.temporal_status] || { label: '', color: '#6B7280' };
          return (
            <Card key={cert.id} sx={{ mb: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <VpnKey sx={{ fontSize: 16, color: '#D4AF37' }} />
                      <Typography sx={{ color: '#fff', fontWeight: 500, fontSize: 15 }}>{TYPE_LABELS[cert.certificate_type] || cert.certificate_type}</Typography>
                      <Chip label={statusInfo.label} size="small" sx={{ bgcolor: `${statusInfo.color}20`, color: statusInfo.color, fontSize: 11, height: 22 }} />
                      {cert.temporal_status !== 'NO_EXPIRY' && cert.temporal_status !== 'VALID' && (
                        <Chip label={temporalInfo.label} size="small" sx={{ bgcolor: `${temporalInfo.color}20`, color: temporalInfo.color, fontSize: 11, height: 22 }} />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{cert.holder_name}</Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}><Business sx={{ fontSize: 11, mr: 0.3, verticalAlign: 'middle' }} />{cert.legal_entity?.razao_social}</Typography>
                      {cert.expires_at && <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Vence: {new Date(cert.expires_at).toLocaleDateString('pt-BR')}</Typography>}
                    </Box>
                  </Box>
                  {cert.days_until_expiry !== null && cert.days_until_expiry <= 30 && cert.days_until_expiry >= 0 && (
                    <Chip label={`${cert.days_until_expiry}d`} size="small" sx={{ bgcolor: '#F59E0B20', color: '#F59E0B', fontWeight: 600 }} />
                  )}
                </Box>
              </CardContent>
            </Card>
          );
        })
      )}

      <NewCertificateDialog open={dialogOpen} onClose={() => setDialogOpen(false)} companies={companies} onSuccess={(msg) => { setDialogOpen(false); reload(); setSnackbar({ open: true, message: msg, severity: 'success' }); }} />
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </AccountantPortalLayout>
  );
}

function NewCertificateDialog({ open, onClose, companies, onSuccess }) {
  const [form, setForm] = useState({ legal_entity_id: '', certificate_type: 'E_CNPJ_A1', holder_name: '', expires_at: '', storage_location: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await accountantApi.post('/api/accountant/portal/certificates', { ...form, expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : undefined });
      onSuccess('Certificado cadastrado com sucesso.');
      setForm({ legal_entity_id: '', certificate_type: 'E_CNPJ_A1', holder_name: '', expires_at: '', storage_location: '', notes: '' });
    } catch (err) { setError(err.response?.data?.error || 'Erro ao cadastrar'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1E2433', border: '1px solid rgba(255,255,255,0.1)' } }}>
      <DialogTitle sx={{ color: '#fff' }}>Novo Certificado Digital</DialogTitle>
      <DialogContent>
        <form onSubmit={handleSubmit} id="cert-form">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth required>
              <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Empresa *</InputLabel>
              <Select value={form.legal_entity_id} onChange={e => setForm(f => ({ ...f, legal_entity_id: e.target.value }))} label="Empresa *" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.razao_social}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Tipo</InputLabel>
              <Select value={form.certificate_type} onChange={e => setForm(f => ({ ...f, certificate_type: e.target.value }))} label="Tipo" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Responsável / Titular *" value={form.holder_name} onChange={e => setForm(f => ({ ...f, holder_name: e.target.value }))} required fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <TextField label="Validade *" type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} required InputLabelProps={{ shrink: true }} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <TextField label="Local de armazenamento" value={form.storage_location} onChange={e => setForm(f => ({ ...f, storage_location: e.target.value }))} placeholder="Ex: Computador do contador, Token USB" fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <TextField label="Observações" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} multiline rows={2} fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            {error && <Alert severity="error" sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{error}</Alert>}
          </Box>
        </form>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancelar</Button>
        <Button type="submit" form="cert-form" variant="contained" disabled={loading || !form.legal_entity_id || !form.holder_name || !form.expires_at} sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}>
          {loading ? 'Salvando...' : 'Cadastrar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
