import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, MenuItem, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import { Add, ArrowBack, Link as LinkIcon, Refresh } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import {
  closeFinanceEntityTerritoryAssignment,
  createFinanceEntityTerritoryAssignment,
  listFinanceEntityTerritoryAssignments,
  listTerritories,
} from '../../services/adminFinanceService';
import { listLegalEntities } from '../../services/adminAccountingService';

const today = () => new Date().toISOString().slice(0, 10);
const date = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';

export default function FinanceEntityTerritoriesPage() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAdminAuth();
  const canWrite = isSuperAdmin();
  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [filters, setFilters] = useState({ legal_entity_id: '', territory_id: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ legal_entity_id: '', territory_id: '', effective_from: today(), notes: '' });

  const loadRefs = async () => {
    const [entityRes, territoryRes] = await Promise.all([
      listLegalEntities({ page: 1, limit: 100, is_active: 'true' }),
      listTerritories(),
    ]);
    setEntities(entityRes?.data || []);
    setTerritories(territoryRes?.data || []);
  };

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await listFinanceEntityTerritoryAssignments({
        ...(filters.legal_entity_id ? { legal_entity_id: filters.legal_entity_id } : {}),
        ...(filters.territory_id ? { territory_id: filters.territory_id } : {}),
        active_only: 'false',
      });
      setRows(res?.data || []);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os vínculos territoriais.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    Promise.all([loadRefs(), load()]).catch((err) => setError(err.message || 'Erro ao carregar estrutura societária.'));
  }, []);

  const createAssignment = async () => {
    if (!form.legal_entity_id || !form.territory_id || !form.effective_from) {
      setError('Informe empresa/filial, território e início da vigência.');
      return;
    }
    setSubmitting(true); setError('');
    try {
      await createFinanceEntityTerritoryAssignment({
        legal_entity_id: form.legal_entity_id,
        territory_id: form.territory_id,
        effective_from: form.effective_from,
        notes: form.notes.trim() || null,
      });
      setDialogOpen(false);
      setForm({ legal_entity_id: '', territory_id: '', effective_from: today(), notes: '' });
      setSuccess('Vínculo entre empresa/filial e território criado com sucesso.');
      await load();
    } catch (err) {
      setError(err.message || 'Não foi possível criar o vínculo.');
    } finally { setSubmitting(false); }
  };

  const closeAssignment = async (row) => {
    const effectiveUntil = window.prompt('Data final da responsabilidade (AAAA-MM-DD):', today());
    if (!effectiveUntil) return;
    setError('');
    try {
      await closeFinanceEntityTerritoryAssignment(row.id, { effective_until: effectiveUntil });
      setSuccess('Vínculo territorial encerrado sem alterar o histórico financeiro.');
      await load();
    } catch (err) {
      setError(err.message || 'Não foi possível encerrar o vínculo.');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F6F8FB', py: 3 }}>
      <Container maxWidth="xl">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Button startIcon={<ArrowBack />} onClick={() => navigate('/admin/financeiro')} sx={{ mb: 1, textTransform: 'none' }}>Financeiro</Button>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#0F172A' }}>Filiais e Territórios</Typography>
            <Typography sx={{ color: '#64748B' }}>Define qual CNPJ responde financeiramente por cada cidade/território, com vigência histórica.</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<Refresh />} onClick={load} disabled={loading}>Atualizar</Button>
            {canWrite && <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>Novo vínculo</Button>}
          </Box>
        </Box>

        <Alert severity="info" sx={{ mb: 2 }}>
          Um território operacional deve ter uma empresa/filial responsável no período antes de gerar pagamentos territoriais. Encerrar um vínculo não reatribui lançamentos históricos.
        </Alert>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

        <Card sx={{ mb: 2, border: '1px solid #E2E8F0' }}><CardContent>
          <Grid container spacing={1.5}>
            <Grid item xs={12} md={6}><TextField select fullWidth size="small" label="Empresa / filial" value={filters.legal_entity_id} onChange={(e) => setFilters((p) => ({ ...p, legal_entity_id: e.target.value }))}>
              <MenuItem value="">Todas</MenuItem>{entities.map((e) => <MenuItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social} — {e.entity_type}</MenuItem>)}
            </TextField></Grid>
            <Grid item xs={12} md={5}><TextField select fullWidth size="small" label="Território" value={filters.territory_id} onChange={(e) => setFilters((p) => ({ ...p, territory_id: e.target.value }))}>
              <MenuItem value="">Todos</MenuItem>{territories.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </TextField></Grid>
            <Grid item xs={12} md={1}><Button fullWidth variant="outlined" onClick={load}>Filtrar</Button></Grid>
          </Grid>
        </CardContent></Card>

        <Card sx={{ border: '1px solid #E2E8F0' }}><Box sx={{ overflowX: 'auto' }}>
          <Table size="small"><TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>
            <TableCell>Empresa / filial</TableCell><TableCell>CNPJ</TableCell><TableCell>Território</TableCell><TableCell>Vigência</TableCell><TableCell>Status</TableCell><TableCell>Observação</TableCell>{canWrite && <TableCell align="right">Ação</TableCell>}
          </TableRow></TableHead><TableBody>
            {loading ? <TableRow><TableCell colSpan={canWrite ? 7 : 6} align="center" sx={{ py: 5 }}><CircularProgress size={24} /></TableCell></TableRow> :
              rows.map((row) => <TableRow key={row.id} hover>
                <TableCell>{row.legal_entity?.nome_fantasia || row.legal_entity?.razao_social || '—'} <Chip size="small" label={row.legal_entity?.entity_type || '—'} sx={{ ml: 0.5 }} /></TableCell>
                <TableCell>{row.legal_entity?.cnpj || '—'}</TableCell>
                <TableCell>{row.territory?.name || '—'}</TableCell>
                <TableCell>{date(row.effective_from)} → {row.effective_until ? date(row.effective_until) : 'aberta'}</TableCell>
                <TableCell><Chip size="small" color={row.is_active ? 'success' : 'default'} label={row.is_active ? 'Ativo' : 'Encerrado'} /></TableCell>
                <TableCell>{row.notes || '—'}</TableCell>
                {canWrite && <TableCell align="right">{row.is_active && <Button size="small" color="warning" onClick={() => closeAssignment(row)}>Encerrar</Button>}</TableCell>}
              </TableRow>)
            }
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={canWrite ? 7 : 6} align="center" sx={{ py: 5, color: '#64748B' }}>Nenhum vínculo cadastrado.</TableCell></TableRow>}
          </TableBody></Table>
        </Box></Card>

        <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><LinkIcon /> Vincular filial ao território</DialogTitle>
          <DialogContent dividers><Grid container spacing={2}>
            <Grid item xs={12}><TextField select fullWidth size="small" required label="Empresa / filial" value={form.legal_entity_id} onChange={(e) => setForm((p) => ({ ...p, legal_entity_id: e.target.value }))}>
              {entities.map((e) => <MenuItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social} — {e.cnpj}</MenuItem>)}
            </TextField></Grid>
            <Grid item xs={12}><TextField select fullWidth size="small" required label="Território" value={form.territory_id} onChange={(e) => setForm((p) => ({ ...p, territory_id: e.target.value }))}>
              {territories.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </TextField></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" required type="date" label="Responsável a partir de" value={form.effective_from} onChange={(e) => setForm((p) => ({ ...p, effective_from: e.target.value }))} InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" multiline minRows={2} label="Observação" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></Grid>
          </Grid></DialogContent>
          <DialogActions><Button onClick={() => setDialogOpen(false)} disabled={submitting}>Cancelar</Button><Button variant="contained" onClick={createAssignment} disabled={submitting}>{submitting ? 'Salvando...' : 'Criar vínculo'}</Button></DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
