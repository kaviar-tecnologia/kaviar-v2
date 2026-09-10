import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Edit, Refresh } from '@mui/icons-material';
import { listArPlaces, createArPlace, getArPlaceById, updateArPlace } from '../../services/adminArPlacesService';
import api from '../../api';
import { canEditArPlaces, getAllowedArPlaceTransitions } from './arPlacesPermissions';

const TYPE_OPTIONS = ['HOTEL', 'COMMERCE', 'TOURISM', 'CARE', 'PET', 'AIRPORT'];
const STATUS_OPTIONS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INACTIVE'];

const defaultFilters = {
  type: '',
  status: '',
  city: '',
  state: '',
  territoryId: '',
};

const defaultForm = {
  id: null,
  place_id: '',
  name: '',
  type: 'HOTEL',
  city: '',
  state: '',
  address: '',
  latitude: '',
  longitude: '',
  territory_id: '',
  status: 'DRAFT',
  summary: '',
  description: '',
  learn_more: '',
  useful_info: '',
  grounding_rule: '',
  boundary_rule: '',
};

function getAdminRole() {
  try {
    const raw = localStorage.getItem('kaviar_admin_data');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.role || '';
  } catch {
    return '';
  }
}

function stateChipColor(status) {
  if (status === 'APPROVED') return 'success';
  if (status === 'SUBMITTED') return 'warning';
  if (status === 'REJECTED' || status === 'INACTIVE') return 'error';
  return 'default';
}

export default function ArPlacesPage() {
  const role = getAdminRole();
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isManager = role === 'TERRITORIAL_MANAGER';
  const isOperator = role === 'TERRITORIAL_OPERATOR';
  const canEdit = canEditArPlaces(role);

  const [filters, setFilters] = useState(defaultFilters);
  const [territories, setTerritories] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const availableTransitions = useMemo(
    () => getAllowedArPlaceTransitions(role, form.status),
    [role, form.status],
  );

  async function loadTerritories() {
    if (!(isSuperAdmin || isManager)) return;
    const endpoint = isSuperAdmin ? '/api/admin/territories' : '/api/admin/commerce/my-territories';
    try {
      const response = await api.get(endpoint);
      const payload = response.data?.data || [];
      const normalized = isSuperAdmin ? payload.filter((item) => item?.is_active !== false) : payload;
      setTerritories(normalized.map((item) => ({ id: item.id, name: item.name })));
    } catch {
      setTerritories([]);
    }
  }

  async function loadPlaces(nextFilters = filters) {
    setLoading(true);
    setError('');
    try {
      const payload = await listArPlaces(nextFilters);
      setPlaces(payload.data || []);
    } catch (requestError) {
      setError(requestError.message || 'Erro ao carregar locais AR.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTerritories();
  }, []);

  useEffect(() => {
    loadPlaces();
  }, [filters.type, filters.status, filters.city, filters.state, filters.territoryId]);

  function openCreateDialog() {
    setForm({ ...defaultForm, territory_id: territories.length === 1 ? territories[0].id : '', status: 'DRAFT' });
    setDialogOpen(true);
  }

  async function openEditDialog(placeId) {
    try {
      const payload = await getArPlaceById(placeId);
      const record = payload.data;
      const content = (record.contents || []).find((item) => item.locale === 'pt-BR') || record.contents?.[0] || {};
      setForm({
        id: record.id,
        place_id: record.place_id,
        name: record.name,
        type: record.type,
        city: record.city,
        state: record.state,
        address: record.address || '',
        latitude: String(record.latitude),
        longitude: String(record.longitude),
        territory_id: record.territory_id || '',
        status: record.status,
        summary: content.summary || '',
        description: content.description || '',
        learn_more: content.learn_more || '',
        useful_info: content.useful_info || '',
        grounding_rule: content.grounding_rule || '',
        boundary_rule: content.boundary_rule || '',
      });
      setDialogOpen(true);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Erro ao carregar local AR.');
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');

    const basePayload = {
      place_id: form.place_id.trim(),
      name: form.name.trim(),
      type: form.type,
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      address: form.address.trim() || null,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      territory_id: form.territory_id || null,
      content: {
        locale: 'pt-BR',
        summary: form.summary || null,
        description: form.description || null,
        learn_more: form.learn_more || null,
        useful_info: form.useful_info || null,
        grounding_rule: form.grounding_rule || null,
        boundary_rule: form.boundary_rule || null,
      },
    };

    try {
      if (form.id) {
        await updateArPlace(form.id, { ...basePayload, status: form.status });
      } else {
        await createArPlace(basePayload);
      }
      setDialogOpen(false);
      setForm(defaultForm);
      await loadPlaces();
    } catch (requestError) {
      setError(requestError.message || 'Erro ao salvar local AR.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>KAVIAR AR · Locais AR</Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={1.5}>
            <Grid item xs={12} md={2}>
              <TextField fullWidth size="small" select label="Tipo" value={filters.type} onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}>
                <MenuItem value="">Todos</MenuItem>
                {TYPE_OPTIONS.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField fullWidth size="small" select label="Status" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
                <MenuItem value="">Todos</MenuItem>
                {STATUS_OPTIONS.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField fullWidth size="small" label="Cidade" value={filters.city} onChange={(e) => setFilters((prev) => ({ ...prev, city: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={1.5}>
              <TextField fullWidth size="small" label="UF" value={filters.state} onChange={(e) => setFilters((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))} />
            </Grid>
            {(isSuperAdmin || isManager) && (
              <Grid item xs={12} md={2.5}>
                <TextField fullWidth size="small" select label="Território" value={filters.territoryId} onChange={(e) => setFilters((prev) => ({ ...prev, territoryId: e.target.value }))}>
                  <MenuItem value="">Todos</MenuItem>
                  {territories.map((territory) => <MenuItem key={territory.id} value={territory.id}>{territory.name}</MenuItem>)}
                </TextField>
              </Grid>
            )}
            <Grid item xs={12} md={2}>
              <Button fullWidth variant="outlined" startIcon={<Refresh />} onClick={() => loadPlaces()}>
                Atualizar
              </Button>
            </Grid>
            {!isOperator && (
              <Grid item xs={12} md={2}>
                <Button fullWidth variant="contained" startIcon={<Add />} onClick={openCreateDialog}>
                  Novo local
                </Button>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>placeId</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Cidade/UF</TableCell>
                <TableCell>Território</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {places.map((place) => (
                <TableRow key={place.id}>
                  <TableCell>{place.name}</TableCell>
                  <TableCell>{place.place_id}</TableCell>
                  <TableCell>{place.type}</TableCell>
                  <TableCell>{place.city}/{place.state}</TableCell>
                  <TableCell>{place.territory?.name || '—'}</TableCell>
                  <TableCell><Chip size="small" label={place.status} color={stateChipColor(place.status)} /></TableCell>
                  <TableCell align="right">
                    {canEdit && (
                      <Button size="small" startIcon={<Edit />} onClick={() => openEditDialog(place.id)}>
                        Editar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!loading && places.length === 0 && (
            <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>Nenhum local AR encontrado.</Typography>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{form.id ? 'Editar Local AR' : 'Novo Local AR'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
            <Grid item xs={12} md={6}><TextField fullWidth label="Nome" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="placeId" value={form.place_id} onChange={(e) => setForm((prev) => ({ ...prev, place_id: e.target.value }))} /></Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth select label="Tipo" value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>
                {TYPE_OPTIONS.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}><TextField fullWidth label="Cidade" value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth label="UF" value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))} /></Grid>
            <Grid item xs={12} md={8}><TextField fullWidth label="Endereço" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} /></Grid>
            <Grid item xs={12} md={2}><TextField fullWidth label="Latitude" value={form.latitude} onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value }))} /></Grid>
            <Grid item xs={12} md={2}><TextField fullWidth label="Longitude" value={form.longitude} onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value }))} /></Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth select label="Território" value={form.territory_id} onChange={(e) => setForm((prev) => ({ ...prev, territory_id: e.target.value }))}>
                <MenuItem value="">Sem território</MenuItem>
                {territories.map((territory) => <MenuItem key={territory.id} value={territory.id}>{territory.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Status atual: <strong>{form.status}</strong>
              </Typography>
              {!form.id && (
                <Typography variant="caption" color="text.secondary">
                  Todo novo local AR inicia em DRAFT.
                </Typography>
              )}
              {form.id && canEdit && availableTransitions.length > 0 && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {availableTransitions.map((transition) => (
                    <Button
                      key={transition.nextStatus}
                      size="small"
                      variant={form.status === transition.nextStatus ? 'contained' : 'outlined'}
                      onClick={() => setForm((prev) => ({ ...prev, status: transition.nextStatus }))}
                    >
                      {transition.label}
                    </Button>
                  ))}
                </Box>
              )}
            </Grid>
            <Grid item xs={12}><Typography variant="subtitle2">Conteúdo (pt-BR)</Typography></Grid>
            <Grid item xs={12}><TextField fullWidth label="Resumo" value={form.summary} onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth multiline minRows={3} label="Descrição" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Saiba mais" value={form.learn_more} onChange={(e) => setForm((prev) => ({ ...prev, learn_more: e.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth multiline minRows={2} label="Informações úteis" value={form.useful_info} onChange={(e) => setForm((prev) => ({ ...prev, useful_info: e.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Regra de grounding" value={form.grounding_rule} onChange={(e) => setForm((prev) => ({ ...prev, grounding_rule: e.target.value }))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Limite/boundary" value={form.boundary_rule} onChange={(e) => setForm((prev) => ({ ...prev, boundary_rule: e.target.value }))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
          {canEdit && <Button onClick={handleSubmit} variant="contained" disabled={saving}>{form.id ? 'Salvar' : 'Criar'}</Button>}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
