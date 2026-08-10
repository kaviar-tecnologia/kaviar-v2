import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Switch, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControl,
  InputLabel, Alert, CircularProgress, Tooltip, FormControlLabel, Table,
  TableHead, TableRow, TableCell, TableBody, Paper
} from '@mui/material';
import { ContentCopy, Add, Edit } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';

const STATUS_LABELS = {
  IMPLANTACAO: 'Implantação',
  RECRUTAMENTO: 'Recrutamento',
  OPERACAO: 'Operação',
  PAUSADA: 'Pausada',
};
const STATUS_COLORS = {
  IMPLANTACAO: 'warning',
  RECRUTAMENTO: 'info',
  OPERACAO: 'success',
  PAUSADA: 'default',
};
const VALID_STATUSES = ['IMPLANTACAO', 'RECRUTAMENTO', 'OPERACAO', 'PAUSADA'];

function getToken() {
  return localStorage.getItem('kaviar_admin_token');
}

export default function DriverCityLandingsPage() {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [newCity, setNewCity] = useState({ city: '', state: '', public_status: 'IMPLANTACAO', landing_enabled: false, whatsapp_number: '' });
  const [saving, setSaving] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(null); // city object to toggle
  const [editing, setEditing] = useState(null); // city object being edited
  const [editForm, setEditForm] = useState({ public_status: '', whatsapp_number: '' });

  const fetchCities = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/driver-city-landings`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setCities(data.data);
      else setError(data.error || 'Erro ao carregar cidades');
    } catch {
      setError('Erro de conexão');
    }
    setLoading(false);
  };

  useEffect(() => { fetchCities(); }, []);

  const handleToggle = async (city) => {
    setConfirmToggle(null); setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/driver-city-landings/${city.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ landing_enabled: !city.landing_enabled }),
      });
      const data = await res.json();
      if (data.success) {
        setCities(prev => prev.map(c => c.id === city.id ? { ...c, landing_enabled: !city.landing_enabled } : c));
        setSuccess(`${city.city} ${!city.landing_enabled ? 'ativada' : 'desativada'}`);
      } else {
        setError(data.error || 'Erro ao alterar');
      }
    } catch {
      setError('Erro de conexão');
    }
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!newCity.city.trim() || !newCity.state.trim()) { setError('Cidade e UF são obrigatórios'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/driver-city-landings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          city: newCity.city.trim(),
          state: newCity.state.trim().toUpperCase(),
          public_status: newCity.public_status,
          landing_enabled: newCity.landing_enabled,
          whatsapp_number: newCity.whatsapp_number.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Cidade criada! URL: ${data.data.public_url}`);
        setCreating(false);
        setNewCity({ city: '', state: '', public_status: 'IMPLANTACAO', landing_enabled: false, whatsapp_number: '' });
        fetchCities();
      } else {
        setError(data.error || 'Erro ao criar');
      }
    } catch {
      setError('Erro de conexão');
    }
    setSaving(false);
  };

  const openEdit = (city) => {
    setEditing(city);
    setEditForm({ public_status: city.public_status, whatsapp_number: city.whatsapp_number || '' });
  };

  const handleEdit = async () => {
    if (!editing) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/driver-city-landings/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          public_status: editForm.public_status,
          whatsapp_number: editForm.whatsapp_number.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCities(prev => prev.map(c => c.id === editing.id ? { ...c, public_status: editForm.public_status, whatsapp_number: data.data.whatsapp_number } : c));
        setSuccess(`${editing.city} atualizada`);
        setEditing(null);
      } else {
        setError(data.error || 'Erro ao salvar');
      }
    } catch {
      setError('Erro de conexão');
    }
    setSaving(false);
  };

  const copyLink = (url) => {
    const full = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(full).then(() => setSuccess('Link copiado!')).catch(() => {});
    setTimeout(() => setSuccess(''), 2000);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Landing de Motoristas por Cidade</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setCreating(true)} size="small">
          Nova cidade
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper sx={{ overflow: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><strong>Cidade</strong></TableCell>
              <TableCell><strong>UF</strong></TableCell>
              <TableCell><strong>Fase</strong></TableCell>
              <TableCell><strong>URL</strong></TableCell>
              <TableCell align="center"><strong>Landing</strong></TableCell>
              <TableCell align="center"><strong>Ações</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {cities.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.city}</TableCell>
                <TableCell>{c.state}</TableCell>
                <TableCell>
                  <Chip label={STATUS_LABELS[c.public_status] || c.public_status} color={STATUS_COLORS[c.public_status] || 'default'} size="small" />
                </TableCell>
                <TableCell sx={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.public_url}
                </TableCell>
                <TableCell align="center">
                  <Switch
                    checked={c.landing_enabled}
                    onChange={() => setConfirmToggle(c)}
                    disabled={saving}
                    color="success"
                    size="small"
                  />
                  {c.landing_enabled ? '🟢' : '⚪'}
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="Editar">
                    <IconButton size="small" onClick={() => openEdit(c)}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {c.landing_enabled && (
                    <Tooltip title="Copiar link">
                      <IconButton size="small" onClick={() => copyLink(c.public_url)}>
                        <ContentCopy fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {cities.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: '#999' }}>
                  Nenhuma cidade cadastrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* Confirm toggle dialog */}
      <Dialog open={!!confirmToggle} onClose={() => setConfirmToggle(null)}>
        <DialogTitle>Confirmar alteração</DialogTitle>
        <DialogContent>
          <Typography>
            {confirmToggle?.landing_enabled
              ? `Desativar landing de ${confirmToggle?.city}/${confirmToggle?.state}?`
              : `Ativar landing de ${confirmToggle?.city}/${confirmToggle?.state}?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmToggle(null)}>Cancelar</Button>
          <Button variant="contained" onClick={() => handleToggle(confirmToggle)} disabled={saving}>
            {saving ? <CircularProgress size={18} /> : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create city dialog */}
      <Dialog open={creating} onClose={() => setCreating(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nova cidade</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Cidade *" size="small" value={newCity.city} onChange={e => setNewCity(p => ({ ...p, city: e.target.value }))} />
          <TextField label="UF *" size="small" inputProps={{ maxLength: 2 }} value={newCity.state} onChange={e => setNewCity(p => ({ ...p, state: e.target.value }))} placeholder="SP" />
          <FormControl size="small">
            <InputLabel>Fase pública</InputLabel>
            <Select value={newCity.public_status} label="Fase pública" onChange={e => setNewCity(p => ({ ...p, public_status: e.target.value }))}>
              {VALID_STATUSES.map(s => <MenuItem key={s} value={s}>{STATUS_LABELS[s]}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="WhatsApp (opcional)" size="small" value={newCity.whatsapp_number} onChange={e => setNewCity(p => ({ ...p, whatsapp_number: e.target.value }))} placeholder="5519999999999" />
          <FormControlLabel
            control={<Switch checked={newCity.landing_enabled} onChange={e => setNewCity(p => ({ ...p, landing_enabled: e.target.checked }))} />}
            label="Landing ativa"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {saving ? <CircularProgress size={18} /> : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit city dialog */}
      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar cidade</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Cidade" size="small" value={editing?.city || ''} disabled />
          <TextField label="UF" size="small" value={editing?.state || ''} disabled />
          <FormControl size="small">
            <InputLabel>Fase pública</InputLabel>
            <Select value={editForm.public_status} label="Fase pública" onChange={e => setEditForm(p => ({ ...p, public_status: e.target.value }))}>
              {VALID_STATUSES.map(s => <MenuItem key={s} value={s}>{STATUS_LABELS[s]}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="WhatsApp (somente dígitos)" size="small" value={editForm.whatsapp_number} onChange={e => setEditForm(p => ({ ...p, whatsapp_number: e.target.value }))} placeholder="5519999999999" helperText="10 a 15 dígitos. Deixe vazio para usar o padrão KAVIAR." />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleEdit} disabled={saving}>
            {saving ? <CircularProgress size={18} /> : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
