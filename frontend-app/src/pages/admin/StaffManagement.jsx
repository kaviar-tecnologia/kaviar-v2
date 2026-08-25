import { useState, useEffect } from 'react';
import { Container, Typography, Box, Card, CardContent, Grid, Chip, IconButton, TextField, Button, CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Switch, FormControlLabel, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { Add, Edit, Phone, Email, LocationOn } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';
import { formatDate } from '../../utils/formatDate';

export default function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', lead_regions: '', role: 'LEAD_AGENT' });
  const [saving, setSaving] = useState(false);

  const token = () => localStorage.getItem('kaviar_admin_token');
  const headers = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });

  useEffect(() => { fetchStaff(); }, []);

  const fetchStaff = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/staff`, { headers: headers() });
      const json = await res.json();
      if (json.success) setStaff(json.data);
      else setError(json.error);
    } catch { setError('Erro ao carregar'); }
    finally { setLoading(false); }
  };

  const openNew = () => { setEditing(null); setForm({ name: '', email: '', password: '', phone: '', lead_regions: '', role: 'LEAD_AGENT' }); setDialog(true); };
  const openEdit = (s) => { setEditing(s); setForm({ name: s.name, email: s.email, password: '', phone: s.phone || '', lead_regions: s.lead_regions || '' }); setDialog(true); };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const url = editing ? `${API_BASE_URL}/api/admin/staff/${editing.id}` : `${API_BASE_URL}/api/admin/staff`;
      const method = editing ? 'PATCH' : 'POST';
      const body = editing
        ? { name: form.name, phone: form.phone, lead_regions: form.lead_regions, ...(form.password && { password: form.password }) }
        : form;
      const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { setDialog(false); fetchStaff(); }
      else setError(json.error);
    } catch { setError('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (s) => {
    try {
      await fetch(`${API_BASE_URL}/api/admin/staff/${s.id}`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ is_active: !s.is_active }),
      });
      fetchStaff();
    } catch { setError('Erro ao atualizar status'); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Funcionários</Typography>
          <Typography variant="body2" color="text.secondary">Equipe comercial e operação de leads</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} sx={{ bgcolor: '#FFD700', color: '#000' }} onClick={openNew}>
          Novo funcionário
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2}>
        {staff.map((s) => (
          <Grid item xs={12} sm={6} md={4} key={s.id}>
            <Card variant="outlined" sx={{ borderRadius: 3, opacity: s.is_active ? 1 : 0.6 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>{s.name}</Typography>
                    <Chip label={s.role} size="small" color={s.role === 'LEAD_AGENT' ? 'primary' : 'default'} sx={{ mt: 0.5 }} />
                  </Box>
                  <Box>
                    <IconButton size="small" onClick={() => openEdit(s)}><Edit fontSize="small" /></IconButton>
                  </Box>
                </Box>

                <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Email fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">{s.email}</Typography>
                  </Box>
                  {s.phone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Phone fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary">{s.phone}</Typography>
                    </Box>
                  )}
                  {s.lead_regions && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LocationOn fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary">{s.lead_regions}</Typography>
                    </Box>
                  )}
                </Box>

                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <FormControlLabel
                    control={<Switch checked={s.is_active} onChange={() => toggleActive(s)} size="small" />}
                    label={<Typography variant="caption">{s.is_active ? 'Ativo' : 'Inativo'}</Typography>}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(s.created_at)}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {staff.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography color="text.secondary">Nenhum funcionário cadastrado</Typography>
        </Box>
      )}

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Editar funcionário' : 'Novo funcionário'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} fullWidth required />
          <TextField label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} fullWidth required disabled={!!editing} />
          <TextField label={editing ? 'Nova senha (deixe vazio para manter)' : 'Senha'} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} fullWidth required={!editing} />
          {!editing && (
            <FormControl fullWidth>
              <InputLabel>Perfil</InputLabel>
              <Select
                value={form.role}
                label="Perfil"
                onChange={e => setForm({ ...form, role: e.target.value })}
              >
                <MenuItem value="LEAD_AGENT">Funcionário comercial</MenuItem>
                <MenuItem value="EXECUTIVE_ADMIN">Sócia Executiva</MenuItem>
              </Select>
            </FormControl>
          )}
          <TextField label="Telefone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} fullWidth />
          <TextField label="Regiões (ex: RJ,SP)" value={form.lead_regions} onChange={e => setForm({ ...form, lead_regions: e.target.value })} fullWidth helperText="Separe por vírgula. Ex: RJ,SP,MG" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ bgcolor: '#FFD700', color: '#000' }}>
            {saving ? 'Salvando...' : editing ? 'Salvar' : 'Cadastrar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
