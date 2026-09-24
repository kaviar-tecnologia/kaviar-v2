import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { adminApi } from '../../../services/adminApi';

const CATEGORIES = [
  'SOCIETARIO',
  'FISCAL',
  'TRABALHISTA',
  'CERTIFICADO',
  'PROCURACAO',
  'LICENCA',
  'INSCRICAO',
  'OUTRO',
];

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  category: 'OUTRO',
  requires_validity: false,
  renewal_alert_days: '',
  sort_order: 0,
  is_active: true,
};

export default function DocumentTypesTab() {
  const [types, setTypes] = useState([]);
  const [filters, setFilters] = useState({ search: '', category: '', is_active: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialog, setDialog] = useState({ open: false, editingId: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadTypes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.category) params.set('category', filters.category);
      if (filters.is_active) params.set('is_active', filters.is_active);
      const data = await adminApi.get(`/api/admin/accounting/document-types?${params.toString()}`);
      setTypes(data.data || []);
    } catch (err) {
      setError(err.message || 'Erro ao carregar tipos de documentos');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialog({ open: true, editingId: null });
  };

  const openEdit = (item) => {
    setForm({
      code: item.code,
      name: item.name,
      description: item.description || '',
      category: item.category,
      requires_validity: Boolean(item.requires_validity),
      renewal_alert_days: item.renewal_alert_days ?? '',
      sort_order: item.sort_order ?? 0,
      is_active: Boolean(item.is_active),
    });
    setDialog({ open: true, editingId: item.id });
  };

  const closeDialog = () => {
    if (saving) return;
    setDialog({ open: false, editingId: null });
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    const normalizedCode = form.code.trim().toUpperCase();
    if (!dialog.editingId && !/^[A-Z0-9_]{2,50}$/.test(normalizedCode)) {
      setError('Código deve ter de 2 a 50 caracteres e usar apenas A-Z, 0-9 e _.');
      return;
    }
    if (form.name.trim().length < 2) {
      setError('Nome deve ter pelo menos 2 caracteres.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const common = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        requires_validity: Boolean(form.requires_validity),
        renewal_alert_days: form.requires_validity && form.renewal_alert_days !== ''
          ? Number(form.renewal_alert_days)
          : null,
        sort_order: Number(form.sort_order) || 0,
      };

      if (dialog.editingId) {
        await adminApi.patch(`/api/admin/accounting/document-types/${dialog.editingId}`, {
          ...common,
          is_active: Boolean(form.is_active),
        });
        setSuccess('Tipo de documento atualizado.');
      } else {
        await adminApi.post('/api/admin/accounting/document-types', {
          code: normalizedCode,
          ...common,
        });
        setSuccess('Tipo de documento criado.');
      }

      closeDialog();
      await loadTypes();
    } catch (err) {
      setError(err.message || 'Erro ao salvar tipo de documento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827' }}>
            Tipos de Documentos
          </Typography>
          <Typography sx={{ color: '#6B7280', fontSize: 12 }}>
            Catálogo usado pelo Portal do Contador. O código é imutável após a criação.
          </Typography>
        </Box>
        <Button variant="contained" onClick={openCreate}>
          Novo tipo
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Buscar"
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          sx={{ minWidth: 220 }}
        />
        <TextField
          select
          size="small"
          label="Categoria"
          value={filters.category}
          onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">Todas</MenuItem>
          {CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
        </TextField>
        <TextField
          select
          size="small"
          label="Status"
          value={filters.is_active}
          onChange={(e) => setFilters((prev) => ({ ...prev, is_active: e.target.value }))}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="true">Ativos</MenuItem>
          <MenuItem value="false">Inativos</MenuItem>
        </TextField>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Código</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Categoria</TableCell>
              <TableCell>Validade</TableCell>
              <TableCell>Ordem</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ação</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && types.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">Nenhum tipo encontrado.</TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={7} align="center">Carregando...</TableCell>
              </TableRow>
            )}
            {!loading && types.map((item) => (
              <TableRow key={item.id}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{item.code}</TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{item.name}</Typography>
                  {item.description && <Typography sx={{ fontSize: 11, color: '#6B7280' }}>{item.description}</Typography>}
                </TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell>
                  {item.requires_validity
                    ? (item.renewal_alert_days ? `Alerta ${item.renewal_alert_days} dias` : 'Exige validade')
                    : 'Sem validade'}
                </TableCell>
                <TableCell>{item.sort_order}</TableCell>
                <TableCell>
                  <Chip size="small" label={item.is_active ? 'Ativo' : 'Inativo'} color={item.is_active ? 'success' : 'default'} />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(item)}>Editar</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialog.open} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog.editingId ? 'Editar tipo de documento' : 'Novo tipo de documento'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Código"
              value={form.code}
              disabled={Boolean(dialog.editingId)}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
              helperText={dialog.editingId ? 'O código não pode ser alterado após a criação.' : 'A-Z, 0-9 e _.'}
              required
            />
            <TextField
              label="Nome"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <TextField
              label="Descrição"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              multiline
              minRows={2}
            />
            <TextField
              select
              label="Categoria"
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            >
              {CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
            </TextField>
            <FormControlLabel
              control={<Switch checked={form.requires_validity} onChange={(e) => setForm((prev) => ({ ...prev, requires_validity: e.target.checked }))} />}
              label="Exige controle de validade"
            />
            {form.requires_validity && (
              <TextField
                label="Dias para alerta de renovação"
                type="number"
                inputProps={{ min: 1, max: 365 }}
                value={form.renewal_alert_days}
                onChange={(e) => setForm((prev) => ({ ...prev, renewal_alert_days: e.target.value }))}
              />
            )}
            <TextField
              label="Ordem"
              type="number"
              inputProps={{ min: 0 }}
              value={form.sort_order}
              onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
            />
            {dialog.editingId && (
              <FormControlLabel
                control={<Switch checked={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} />}
                label="Ativo"
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={saving}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
