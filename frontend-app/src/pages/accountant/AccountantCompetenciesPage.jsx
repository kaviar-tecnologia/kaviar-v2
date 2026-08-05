import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Chip, Button, Skeleton, Grid, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, Alert, Snackbar, IconButton } from '@mui/material';
import { CalendarMonth, Add, Business, ArrowBack, CheckCircle } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

const STATUS_LABELS = { OPEN: 'Aberta', WAITING_DOCUMENTS: 'Aguardando Documentos', UNDER_REVIEW: 'Em Análise', PENDING_CORRECTION: 'Correção Pendente', COMPLETED: 'Concluída', REOPENED: 'Reaberta', CANCELED: 'Cancelada' };
const STATUS_COLORS = { OPEN: '#3B82F6', WAITING_DOCUMENTS: '#F59E0B', UNDER_REVIEW: '#8B5CF6', PENDING_CORRECTION: '#EF4444', COMPLETED: '#22C55E', REOPENED: '#F59E0B', CANCELED: '#6B7280' };
const MONTHS = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function AccountantCompetenciesPage() {
  const navigate = useNavigate();
  const [competencies, setCompetencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    accountantApi.get('/api/accountant/portal/competencies').then(r => setCompetencies(r.data?.data || [])).catch(() => {}).finally(() => setLoading(false));
    accountantApi.get('/api/accountant/portal/companies').then(r => setCompanies(r.data?.data || [])).catch(() => {});
  }, []);

  const reload = () => accountantApi.get('/api/accountant/portal/competencies').then(r => setCompetencies(r.data?.data || [])).catch(() => {});

  return (
    <AccountantPortalLayout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>Competências</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, mt: 0.5 }}>{competencies.length > 0 ? `${competencies.length} competência${competencies.length > 1 ? 's' : ''}` : 'Acompanhe o fechamento mensal das empresas'}</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)} sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}>
          Nova Competência
        </Button>
      </Box>

      {loading ? [1,2,3].map(i => <Skeleton key={i} variant="rectangular" height={70} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', mb: 1.5 }} />) : competencies.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CalendarMonth sx={{ fontSize: 64, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>Nenhuma competência cadastrada</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, mt: 1 }}>Crie a primeira competência para acompanhar o fechamento mensal.</Typography>
        </Box>
      ) : (
        competencies.map(c => {
          const statusColor = STATUS_COLORS[c.status] || '#6B7280';
          return (
            <Card key={c.id} onClick={() => navigate(`/contador/competencias/${c.id}`)} sx={{ mb: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(212,175,55,0.3)' } }}>
              <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography sx={{ color: '#fff', fontWeight: 500, fontSize: 15 }}>{c.period_label}</Typography>
                      <Chip label={STATUS_LABELS[c.status]} size="small" sx={{ bgcolor: `${statusColor}20`, color: statusColor, fontSize: 10, height: 20 }} />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}><Business sx={{ fontSize: 11, mr: 0.3, verticalAlign: 'middle' }} />{c.legal_entity?.razao_social}</Typography>
                      {c.expected_deadline && <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Prazo: {new Date(c.expected_deadline + 'T12:00:00').toLocaleDateString('pt-BR')}</Typography>}
                      {c.documents_count > 0 && <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{c.documents_count} doc{c.documents_count > 1 ? 's' : ''}</Typography>}
                    </Box>
                  </Box>
                  {c.status === 'COMPLETED' && <CheckCircle sx={{ color: '#22C55E', fontSize: 20 }} />}
                </Box>
              </CardContent>
            </Card>
          );
        })
      )}

      <NewCompetencyDialog open={dialogOpen} onClose={() => setDialogOpen(false)} companies={companies} onSuccess={(msg) => { setDialogOpen(false); reload(); setSnackbar({ open: true, message: msg, severity: 'success' }); }} />
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </AccountantPortalLayout>
  );
}

function NewCompetencyDialog({ open, onClose, companies, onSuccess }) {
  const now = new Date();
  const [form, setForm] = useState({ legal_entity_id: '', month: now.getMonth() + 1, year: now.getFullYear(), expected_deadline: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await accountantApi.post('/api/accountant/portal/competencies', {
        legal_entity_id: form.legal_entity_id,
        month: form.month,
        year: form.year,
        expected_deadline: form.expected_deadline || null,
        notes: form.notes || null,
      });
      onSuccess('Competência criada com sucesso.');
    } catch (err) {
      const details = err.response?.data?.details;
      setError(details ? details.map(d => d.message).join('; ') : err.response?.data?.error || 'Erro');
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1E2433', border: '1px solid rgba(255,255,255,0.1)' } }}>
      <DialogTitle sx={{ color: '#fff' }}>Nova Competência</DialogTitle>
      <DialogContent>
        <form onSubmit={handleSubmit} id="comp-form">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth required>
              <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Empresa *</InputLabel>
              <Select value={form.legal_entity_id} onChange={e => setForm(f => ({ ...f, legal_entity_id: e.target.value }))} label="Empresa *" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.razao_social}</MenuItem>)}
              </Select>
            </FormControl>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Mês</InputLabel>
                <Select value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} label="Mês" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                  {MONTHS.slice(1).map((m, i) => <MenuItem key={i+1} value={i+1}>{m}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Ano" type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            </Box>
            <TextField label="Prazo esperado" type="date" value={form.expected_deadline} onChange={e => setForm(f => ({ ...f, expected_deadline: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <TextField label="Observações" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} multiline rows={2} fullWidth sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            {error && <Alert severity="error" sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{error}</Alert>}
          </Box>
        </form>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancelar</Button>
        <Button type="submit" form="comp-form" variant="contained" disabled={loading || !form.legal_entity_id} sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}>
          {loading ? 'Criando...' : 'Criar Competência'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
