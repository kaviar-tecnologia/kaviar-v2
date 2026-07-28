import { useState, useEffect } from 'react';
import {
  Paper, Typography, Box, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Grid, Alert, CircularProgress, Chip,
  MenuItem, Divider, Collapse, IconButton
} from '@mui/material';
import { Edit, ExpandMore, ExpandLess } from '@mui/icons-material';
import api from '../../api/index';
import { formatDate } from '../../utils/formatDate';

const EDITABLE_FIELDS = [
  { key: 'phone', label: 'Telefone', type: 'text' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'vehicle_plate', label: 'Placa', type: 'text' },
  { key: 'vehicle_model', label: 'Modelo', type: 'text' },
  { key: 'vehicle_color', label: 'Cor', type: 'text' },
  { key: 'pix_key', label: 'Chave PIX', type: 'text' },
  { key: 'pix_key_type', label: 'Tipo PIX', type: 'select', options: ['cpf', 'cnpj', 'email', 'phone', 'random'] },
];

export function DriverEditCard({ driverId, driver, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const isSuperAdmin = () => {
    const data = localStorage.getItem('kaviar_admin_data');
    return data ? JSON.parse(data)?.role === 'SUPER_ADMIN' : false;
  };

  const openEdit = () => {
    const initial = {};
    EDITABLE_FIELDS.forEach(f => { initial[f.key] = driver?.[f.key] ?? ''; });
    setForm(initial);
    setResult(null);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      // Only send changed fields
      const payload = {};
      EDITABLE_FIELDS.forEach(f => {
        const newVal = form[f.key] ?? '';
        const oldVal = driver?.[f.key] ?? '';
        if (String(newVal) !== String(oldVal)) payload[f.key] = newVal || null;
      });

      if (Object.keys(payload).length === 0) {
        setResult({ severity: 'info', message: 'Nenhuma alteração detectada' });
        return;
      }

      const res = await api.patch(`/api/admin/drivers/${driverId}`, payload);
      if (res.data.success) {
        setResult({ severity: 'success', message: `Atualizado: ${Object.keys(payload).join(', ')}` });
        if (onUpdated) onUpdated();
        setTimeout(() => setOpen(false), 1500);
      } else {
        setResult({ severity: 'error', message: res.data.error || 'Erro ao salvar' });
      }
    } catch (e) {
      setResult({ severity: 'error', message: e.response?.data?.error || 'Erro ao salvar alterações' });
    } finally { setSaving(false); }
  };

  const loadAudit = async () => {
    if (audit.length > 0) { setAuditOpen(!auditOpen); return; }
    setAuditLoading(true);
    setAuditOpen(true);
    try {
      const res = await api.get(`/api/admin/drivers/${driverId}/audit`);
      setAudit(res.data.data || []);
    } catch { setAudit([]); }
    finally { setAuditLoading(false); }
  };

  if (!isSuperAdmin()) return null;

  return (
    <Paper sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="h6">Edição de Dados</Typography>
        <Box display="flex" gap={1}>
          <Button size="small" variant="text" onClick={loadAudit} endIcon={auditOpen ? <ExpandLess /> : <ExpandMore />}>
            Histórico
          </Button>
          <Button size="small" variant="contained" startIcon={<Edit />} onClick={openEdit}>
            Editar
          </Button>
        </Box>
      </Box>

      <Typography variant="body2" color="text.secondary">
        Campos operacionais editáveis: telefone, email, veículo, PIX.
      </Typography>

      {/* Audit log */}
      <Collapse in={auditOpen}>
        <Box sx={{ mt: 2 }}>
          {auditLoading ? <CircularProgress size={20} /> : audit.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Nenhuma alteração registrada</Typography>
          ) : audit.map((log) => (
            <Box key={log.id} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Chip label={log.action} size="small" variant="outlined" />
                <Typography variant="caption" color="text.secondary">
                  {formatDate(log.created_at, { showTime: true })}
                </Typography>
              </Box>
              {log.old_value && log.new_value && (
                <Box sx={{ mt: 0.5 }}>
                  {Object.keys(log.new_value).map(k => (
                    <Typography key={k} variant="caption" display="block" color="text.secondary">
                      <strong>{k}</strong>: {String(log.old_value[k] ?? '—')} → {String(log.new_value[k] ?? '—')}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </Collapse>

      {/* Edit dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar Motorista</DialogTitle>
        <DialogContent>
          {result && <Alert severity={result.severity} sx={{ mb: 2 }}>{result.message}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {EDITABLE_FIELDS.map(f => (
              <Grid item xs={12} sm={6} key={f.key}>
                {f.type === 'select' ? (
                  <TextField select fullWidth size="small" label={f.label} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                  </TextField>
                ) : (
                  <TextField fullWidth size="small" label={f.label} type={f.type} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
