import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Card, CardContent, Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Button, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Alert } from '@mui/material';
import { ArrowBack, Edit, PersonAdd, Delete, Map } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';
import MotoPassengerCompliance from '../../components/admin/MotoPassengerCompliance';
import TerritorialDatasetSection from '../../components/admin/TerritorialDatasetSection';
import { formatDate } from '../../utils/formatDate';

const STATUS_COLORS = { planning: '#6B7280', preparation: '#D97706', active: '#059669', inactive: '#DC2626' };
const STATUS_LABELS = { planning: 'Planejamento', preparation: 'Preparação', active: 'Ativo', inactive: 'Inativo' };

export default function TerritoryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [territory, setTerritory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [regulatoryNotes, setRegulatoryNotes] = useState('');
  const token = localStorage.getItem('kaviar_admin_token');
  const isSuperAdmin = JSON.parse(localStorage.getItem('kaviar_admin_data') || '{}').role === 'SUPER_ADMIN';

  const fetchTerritory = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/territories/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setTerritory(data.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchTerritory(); }, [id]);

  useEffect(() => {
    setRegulatoryNotes(territory?.regulatory_notes || '');
  }, [territory?.regulatory_notes]);

  const handleEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/territories/${id}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
      });
      if ((await res.json()).success) { setEditOpen(false); fetchTerritory(); }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleUnlinkAdmin = async (adminId, territoryId) => {
    if (!confirm('Remover acesso deste admin ao território?')) return;
    await fetch(`${API_BASE_URL}/api/admin/territories/regional-admins/${adminId}/territories/${territoryId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    fetchTerritory();
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress sx={{ color: '#B8942E' }} /></Box>;
  if (!territory) return <Typography>Território não encontrado</Typography>;

  const t = territory;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/admin/territories')}><ArrowBack /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ color: '#C8A84E', fontWeight: 800 }}>{t.name}</Typography>
          <Typography variant="body2" sx={{ color: '#6B7280' }}>{t.level}{t.uf ? ` • ${t.uf}` : ''}{t.parent?.name ? ` • Pai: ${t.parent.name}` : ''}</Typography>
        </Box>
        <Chip label={STATUS_LABELS[t.status]} sx={{ bgcolor: `${STATUS_COLORS[t.status]}15`, color: STATUS_COLORS[t.status], fontWeight: 600 }} />
        {isSuperAdmin && (
          <Button startIcon={<Map />} onClick={() => setPrepareOpen(true)} sx={{ color: '#B8942E' }}>Preparar cidade</Button>
        )}
        <Button startIcon={<Edit />} onClick={() => { setEditForm({ name: t.name, status: t.status, uf: t.uf || '', city_name: t.city_name || '', notes: t.notes || '' }); setEditOpen(true); }} sx={{ color: '#B8942E' }}>Editar</Button>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, '& .MuiTab-root': { fontWeight: 600, color: '#9CA3AF', '&:hover': { color: '#C8A84E' } }, '& .Mui-selected': { color: '#C8A84E !important' }, '& .MuiTabs-indicator': { bgcolor: '#B8942E', height: 3 } }}>
        <Tab label="Visão Geral" />
        <Tab label={`Bairros (${t.neighborhoods?.length || 0})`} />
        <Tab label={`Parceiros (${t.territorial_partners?.length || 0})`} />
        <Tab label={`Admins (${t.admin_access?.length || 0})`} />
        <Tab label="Finance" />
      </Tabs>

      {tab === 0 && (
        <Card sx={{ border: '1px solid #E8E5DE' }}>
          <CardContent>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 3 }}>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Nome</Typography><Typography sx={{ fontWeight: 600 }}>{t.name}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Tipo</Typography><Typography sx={{ fontWeight: 600 }}>{t.level}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Status</Typography><Typography sx={{ fontWeight: 600 }}>{STATUS_LABELS[t.status]}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>UF</Typography><Typography sx={{ fontWeight: 600 }}>{t.uf || '—'}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Cidade</Typography><Typography sx={{ fontWeight: 600 }}>{t.city_name || '—'}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Bairros</Typography><Typography sx={{ fontWeight: 600, color: '#B8942E' }}>{t.neighborhoods?.length || 0}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Parceiros</Typography><Typography sx={{ fontWeight: 600, color: '#B8942E' }}>{t.territorial_partners?.length || 0}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Admins Regionais</Typography><Typography sx={{ fontWeight: 600, color: '#B8942E' }}>{t.admin_access?.length || 0}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Criado em</Typography><Typography sx={{ fontWeight: 600 }}>{formatDate(t.created_at)}</Typography></Box>
            </Box>
            {t.notes && <Box sx={{ mt: 2, p: 2, bgcolor: '#FAFAF8', borderRadius: 1 }}><Typography variant="caption" sx={{ color: '#6B7280' }}>Observações</Typography><Typography>{t.notes}</Typography></Box>}

            {/* Conformidade Regulatória */}
            <Box sx={{ mt: 3, p: 2, border: '1px solid #E8E5DE', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>📋 Conformidade Regulatória</Typography>
              {t.status === 'active' && t.regulatory_status !== 'approved' && (
                <Alert severity="warning" sx={{ mb: 2 }}>Território operacionalmente ativo sem aprovação regulatória.</Alert>
              )}
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1.5 }}>
                <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Status regulatório</Typography>
                  <TextField select value={t.regulatory_status || 'not_evaluated'} onChange={async (e) => {
                    const res = await fetch(`${API_BASE_URL}/api/admin/territories/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ regulatory_status: e.target.value }) });
                    if ((await res.json()).success) fetchTerritory();
                  }} size="small" sx={{ minWidth: 200, mt: 0.5 }}>
                    <MenuItem value="not_evaluated">Não avaliado</MenuItem>
                    <MenuItem value="in_review">Em análise</MenuItem>
                    <MenuItem value="credentialing_required">Credenciamento necessário</MenuItem>
                    <MenuItem value="controlled_operation">Operação controlada</MenuItem>
                    <MenuItem value="approved">Aprovado</MenuItem>
                    <MenuItem value="blocked">Bloqueado</MenuItem>
                    <MenuItem value="suspended">Suspenso</MenuItem>
                  </TextField>
                </Box>
                {t.regulatory_checked_at && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Última verificação</Typography><Typography variant="body2">{formatDate(t.regulatory_checked_at, { showTime: true })}</Typography></Box>}
              </Box>
              <TextField label="Notas regulatórias" value={regulatoryNotes} onChange={(e) => setRegulatoryNotes(e.target.value)} onBlur={async () => {
                const nextValue = regulatoryNotes;
                if (nextValue !== (t.regulatory_notes || '')) {
                  const res = await fetch(`${API_BASE_URL}/api/admin/territories/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ regulatory_notes: nextValue }) });
                  const json = await res.json();
                  if (json.success) {
                    const updatedValue = json.data?.regulatory_notes ?? nextValue;
                    setRegulatoryNotes(updatedValue);
                    setTerritory((prev) => prev ? { ...prev, regulatory_notes: updatedValue } : prev);
                    fetchTerritory();
                  }
                }
              }} fullWidth size="small" multiline rows={2} sx={{ mt: 1 }} InputLabelProps={{ shrink: true }} />
            </Box>

            {/* Moto Passageiro Compliance */}
            <MotoPassengerCompliance
              territoryId={id}
              motoPassengerEnabled={t.moto_passenger_enabled || false}
              isSuperAdmin={JSON.parse(localStorage.getItem('kaviar_admin_data') || '{}').role === 'SUPER_ADMIN'}
              onTerritoryUpdate={fetchTerritory}
            />

            {/* Fase 4: Dataset territorial (ACQUIRE → PREVIEW → APPLY), somente SUPER_ADMIN */}
            <TerritorialDatasetSection territory={t} token={token} />
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <TableContainer component={Paper} sx={{ border: '1px solid #E8E5DE' }}>
          <Table size="small">
            <TableHead><TableRow sx={{ bgcolor: '#FAFAF8' }}><TableCell sx={{ fontWeight: 700 }}>Bairro</TableCell><TableCell>Cidade</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
            <TableBody>
              {(t.neighborhoods || []).map((n) => (
                <TableRow key={n.id}><TableCell>{n.name}</TableCell><TableCell>{n.city}</TableCell><TableCell><Chip label={n.is_active ? 'Ativo' : 'Inativo'} size="small" color={n.is_active ? 'success' : 'default'} /></TableCell></TableRow>
              ))}
              {!t.neighborhoods?.length && <TableRow><TableCell colSpan={3} sx={{ textAlign: 'center', color: '#6B7280' }}>Nenhum bairro vinculado</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 2 && (
        <TableContainer component={Paper} sx={{ border: '1px solid #E8E5DE' }}>
          <Table size="small">
            <TableHead><TableRow sx={{ bgcolor: '#FAFAF8' }}><TableCell sx={{ fontWeight: 700 }}>Parceiro</TableCell><TableCell>Tipo</TableCell><TableCell>Plano</TableCell><TableCell>Status</TableCell><TableCell>Contato</TableCell></TableRow></TableHead>
            <TableBody>
              {(t.territorial_partners || []).map((p) => (
                <TableRow key={p.id}><TableCell>{p.name}</TableCell><TableCell>{p.partner_type}</TableCell><TableCell>{p.plan}</TableCell><TableCell><Chip label={p.status} size="small" /></TableCell><TableCell>{p.responsible_name}</TableCell></TableRow>
              ))}
              {!t.territorial_partners?.length && <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', color: '#6B7280' }}>Nenhum parceiro vinculado</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 3 && (
        <TableContainer component={Paper} sx={{ border: '1px solid #E8E5DE' }}>
          <Table size="small">
            <TableHead><TableRow sx={{ bgcolor: '#FAFAF8' }}><TableCell sx={{ fontWeight: 700 }}>Admin</TableCell><TableCell>Email</TableCell><TableCell>Role</TableCell><TableCell>Acesso</TableCell><TableCell>Status</TableCell><TableCell>Ações</TableCell></TableRow></TableHead>
            <TableBody>
              {(t.admin_access || []).map((a) => (
                <TableRow key={a.id}><TableCell>{a.admin?.name}</TableCell><TableCell>{a.admin?.email}</TableCell><TableCell>{a.admin?.role}</TableCell><TableCell>{a.access_level}</TableCell><TableCell><Chip label={a.admin?.is_active ? 'Ativo' : 'Inativo'} size="small" color={a.admin?.is_active ? 'success' : 'default'} /></TableCell>
                  <TableCell><IconButton size="small" color="error" onClick={() => handleUnlinkAdmin(a.admin?.id, t.id)}><Delete fontSize="small" /></IconButton></TableCell></TableRow>
              ))}
              {!t.admin_access?.length && <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', color: '#6B7280' }}>Nenhum admin regional vinculado</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 4 && <FinanceTab territoryId={id} token={token} />}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: '#C8A84E', fontWeight: 700 }}>Editar Território</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Nome" value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} fullWidth />
          <TextField label="Status" select value={editForm.status || ''} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} fullWidth>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="UF" value={editForm.uf || ''} onChange={(e) => setEditForm({ ...editForm, uf: e.target.value.toUpperCase().slice(0, 2) })} sx={{ width: 100 }} />
            <TextField label="Cidade" value={editForm.city_name || ''} onChange={(e) => setEditForm({ ...editForm, city_name: e.target.value })} fullWidth />
          </Box>
          <TextField label="Observações" value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} multiline rows={2} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancelar</Button>
          <Button onClick={handleEdit} disabled={saving} variant="contained" sx={{ bgcolor: '#B8942E' }}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogActions>
      </Dialog>

      <PrepareCityDialog
        open={prepareOpen}
        onClose={() => setPrepareOpen(false)}
        territoryId={id}
        token={token}
        onDone={fetchTerritory}
      />
    </Box>
  );
}

function PrepareCityDialog({ open, onClose, territoryId, token, onDone }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) { setPlan(null); setError(''); setConfirmChecked(false); setResult(null); return; }
    (async () => {
      setLoading(true); setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/territories/${territoryId}/prepare-city/dry-run`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
        });
        const data = await res.json();
        if (data.success) setPlan(data.data);
        else setError(data.error || 'Falha no dry-run');
      } catch (e) { setError(String(e)); }
      setLoading(false);
    })();
  }, [open, territoryId, token]);

  const handleConfirm = async () => {
    setExecuting(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/territories/${territoryId}/prepare-city/confirm`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (data.success) { setResult(data.data); onDone && onDone(); }
      else setError(data.error || (data.risks ? data.risks.join(' | ') : 'Falha na execução'));
    } catch (e) { setError(String(e)); }
    setExecuting(false);
  };

  const Row = ({ label, value, color }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
      <Typography variant="body2" sx={{ color: '#6B7280' }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, color: color || '#111827' }}>{value}</Typography>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: '#C8A84E', fontWeight: 700 }}>Preparar cidade (dry-run)</DialogTitle>
      <DialogContent dividers>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress sx={{ color: '#B8942E' }} /></Box>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {result && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Importação concluída: {result.created} criados, {result.updated} atualizados, {result.geofencesWritten} geofences,
            {' '}{result.linkedToTerritory} vinculados ao território.
          </Alert>
        )}

        {plan && !result && (
          <>
            <Row label="Cidade" value={plan.city} />
            <Row label="UF" value={plan.uf || '—'} />
            <Row label="Território" value={`${plan.territory?.name || '—'} (${plan.territory?.status || '—'})`} />
            <Row label="Gestor territorial" value={plan.manager?.found ? plan.manager.names.join(', ') : 'nenhum ativo'} color={plan.manager?.found ? '#059669' : '#DC2626'} />
            <Box sx={{ my: 1, borderTop: '1px solid #E8E5DE' }} />
            <Row label="Bairros no arquivo" value={plan.totals?.featuresInFile} />
            <Row label="Válidos" value={plan.totals?.validNeighborhoods} />
            <Row label="Com geofence válida" value={plan.totals?.withValidGeofence} />
            <Row label="Duplicidades" value={plan.totals?.duplicatesInFile} color={plan.totals?.duplicatesInFile ? '#DC2626' : undefined} />
            <Row label="Geometrias inválidas" value={plan.totals?.invalidGeometries} color={plan.totals?.invalidGeometries ? '#D97706' : undefined} />
            <Row label="Seriam criados" value={plan.totals?.toCreate} color="#059669" />
            <Row label="Seriam atualizados" value={plan.totals?.toUpdate} color="#D97706" />
            <Row label="Vínculo territorial" value={plan.totals?.toLinkTerritory} color="#B8942E" />

            {plan.risks?.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>Riscos / pendências:</Typography>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {plan.risks.map((r, i) => <li key={i}><Typography variant="caption">{r}</Typography></li>)}
                </ul>
              </Alert>
            )}

            <Alert severity="info" sx={{ mt: 2 }}>
              A preparação <strong>não ativa</strong> a cidade nem libera modalidades bloqueadas por compliance.
              A cidade permanece no status atual até aprovação administrativa/regulatória.
            </Alert>

            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <input id="confirm-prepare" type="checkbox" checked={confirmChecked} disabled={!plan.canProceed}
                onChange={(e) => setConfirmChecked(e.target.checked)} />
              <label htmlFor="confirm-prepare">
                <Typography variant="body2">Confirmo a importação idempotente destes bairros em produção.</Typography>
              </label>
            </Box>
            {!plan.canProceed && <Typography variant="caption" sx={{ color: '#DC2626' }}>Plano não pode prosseguir — corrija as pendências acima.</Typography>}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: '#6B7280' }}>{result ? 'Fechar' : 'Cancelar'}</Button>
        {plan && !result && (
          <Button onClick={handleConfirm} disabled={!plan.canProceed || !confirmChecked || executing}
            variant="contained" sx={{ bgcolor: '#B8942E' }}>
            {executing ? 'Executando...' : 'Confirmar e importar'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function FinanceTab({ territoryId, token }) {
  const [data, setData] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ matrix_share_percent: 60, regional_share_percent: 40, partner_commission_percent: 5, description: '' });
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    try {
      const [finRes, rulesRes, simRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/territories/${territoryId}/finance`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/api/admin/territories/${territoryId}/finance-rules`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/api/admin/territories/${territoryId}/finance-simulation`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [finData, rulesData, simData] = await Promise.all([finRes.json(), rulesRes.json(), simRes.json()]);
      if (finData.success) setData(finData.data);
      if (rulesData.success) setRules(rulesData.data);
      if (simData.success) setSimulation(simData.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [territoryId]);

  const handleCreateRule = async () => {
    setSaving(true);
    const res = await fetch(`${API_BASE_URL}/api/admin/territories/${territoryId}/finance-rules`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(ruleForm),
    });
    const d = await res.json();
    if (d.success) { setRuleOpen(false); fetchAll(); }
    else alert(d.error || 'Erro');
    setSaving(false);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress sx={{ color: '#B8942E' }} /></Box>;

  const fmt = (v) => typeof v === 'number' ? v.toLocaleString('pt-BR') : '—';
  const fmtBRL = (v) => typeof v === 'number' ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
  const fmtCents = (v) => typeof v === 'number' ? `R$ ${(v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

  const d = data || {};
  const cards = [
    { label: 'Corridas Total', value: fmt(d.rides?.total), color: '#C8A84E' },
    { label: 'Concluídas', value: fmt(d.rides?.completed), color: '#34D399' },
    { label: 'Canceladas', value: fmt(d.rides?.canceled), color: '#F87171' },
    { label: 'Sem Motorista', value: fmt(d.rides?.no_driver), color: '#FBBF24' },
    { label: 'Motoristas', value: fmt(d.entities?.drivers), color: '#C8A84E' },
    { label: 'Passageiros', value: fmt(d.entities?.passengers), color: '#C8A84E' },
    { label: 'Parceiros', value: fmt(d.entities?.partners), color: '#C8A84E' },
    { label: 'Recargas Confirmadas', value: fmt(d.credits?.purchased), color: '#34D399' },
    { label: 'Taxas Cobradas', value: fmt(d.credits?.consumed), color: '#FBBF24' },
    { label: 'Receita Bruta Estimada', value: fmtBRL(d.revenue?.gross_estimated), color: '#34D399' },
    { label: 'Compensações', value: `${fmt(d.compensations?.total)} (${fmtCents(d.compensations?.amount_cents)})`, color: '#9CA3AF' },
    { label: 'Comissões Parceiros', value: fmtBRL(d.partner_finance?.commissions_total), color: '#C8A84E' },
    { label: 'Pagamentos Parceiros', value: fmtCents(d.partner_finance?.payments_total), color: '#9CA3AF' },
    { label: 'Mensalidades', value: fmtCents(d.partner_finance?.mensalidades_total), color: '#9CA3AF' },
  ];

  return (
    <Box sx={{ background: 'linear-gradient(135deg, #0D0D12 0%, #1A1A24 100%)', borderRadius: 3, p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h6" sx={{ color: '#C8A84E', fontWeight: 700 }}>💰 KAVIAR Finance — Territorial</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, px: 2, py: 1, bgcolor: 'rgba(184,148,46,0.08)', borderRadius: 1, border: '1px solid rgba(184,148,46,0.2)' }}>
        <Typography variant="caption" sx={{ color: '#B8942E' }}>ℹ️ Simulação financeira. Estes valores não representam repasse real, saldo disponível, cobrança, split ou pagamento automático.</Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 2, mb: 3 }}>
        {cards.map((c) => (
          <Box key={c.label} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(184,148,46,0.15)', transition: 'all 0.2s', '&:hover': { border: '1px solid rgba(184,148,46,0.4)', bgcolor: 'rgba(255,255,255,0.05)' } }}>
            <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</Typography>
            <Typography variant="h6" sx={{ color: c.color, fontWeight: 700, mt: 0.5 }}>{c.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* Regras Financeiras */}
      <Box sx={{ mb: 3, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px solid rgba(184,148,46,0.15)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" sx={{ color: '#C8A84E', fontWeight: 700 }}>📐 Regras Financeiras</Typography>
          <Button size="small" onClick={() => setRuleOpen(true)} sx={{ color: '#B8942E' }}>+ Nova Regra</Button>
        </Box>
        {rules.filter(r => r.is_active).map(r => (
          <Box key={r.id} sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Matriz</Typography><Typography sx={{ color: '#C8A84E', fontWeight: 700 }}>{Number(r.matrix_share_percent)}%</Typography></Box>
            <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Regional</Typography><Typography sx={{ color: '#34D399', fontWeight: 700 }}>{Number(r.regional_share_percent)}%</Typography></Box>
            <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Parceiro</Typography><Typography sx={{ color: '#9CA3AF', fontWeight: 700 }}>{Number(r.partner_commission_percent)}%</Typography></Box>
            {r.description && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Obs</Typography><Typography sx={{ color: '#9CA3AF' }}>{r.description}</Typography></Box>}
          </Box>
        ))}
        {!rules.some(r => r.is_active) && <Typography variant="body2" sx={{ color: '#4B5563' }}>Nenhuma regra ativa. Crie uma para simular.</Typography>}
      </Box>

      {/* Simulação */}
      {simulation?.has_rule && simulation.simulation && (
        <Box sx={{ mb: 3, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px solid rgba(34,211,153,0.2)' }}>
          <Typography variant="subtitle1" sx={{ color: '#34D399', fontWeight: 700, mb: 2 }}>📊 Simulação — {simulation.period?.label || 'Mês atual'}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2 }}>
            {[
              { label: 'Corridas', value: fmt(simulation.simulation.rides_completed), color: '#C8A84E' },
              { label: 'Taxa Plataforma', value: fmtBRL(simulation.simulation.platform_fee_total), color: '#C8A84E' },
              { label: 'Parte Matriz', value: fmtBRL(simulation.simulation.matrix_share_simulated), color: '#C8A84E' },
              { label: 'Parte Regional', value: fmtBRL(simulation.simulation.regional_share_simulated), color: '#34D399' },
              { label: 'Comissões Parceiros', value: fmtBRL(simulation.simulation.partner_commissions), color: '#FBBF24' },
              { label: 'Líquido Regional', value: fmtBRL(simulation.simulation.net_regional_simulated), color: '#34D399' },
            ].map(c => (
              <Box key={c.label} sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, border: '1px solid rgba(255,255,255,0.05)' }}>
                <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.65rem', textTransform: 'uppercase' }}>{c.label}</Typography>
                <Typography sx={{ color: c.color, fontWeight: 700 }}>{c.value}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px dashed rgba(184,148,46,0.2)' }}>
        <Typography variant="subtitle2" sx={{ color: '#6B7280', mb: 0.5 }}>📋 Em preparação</Typography>
        <Typography variant="body2" sx={{ color: '#4B5563' }}>Repasses • Saldo pendente • Participação do operador regional • Financeiro ativo por território</Typography>
      </Box>

      {/* Modal criar regra */}
      <Dialog open={ruleOpen} onClose={() => setRuleOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1A1A24', color: '#E5E7EB' } }}>
        <DialogTitle sx={{ color: '#C8A84E', fontWeight: 700 }}>Nova Regra Financeira</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ color: '#9CA3AF', mb: 0.5, display: 'block' }}>% Matriz</Typography>
              <TextField type="number" value={ruleForm.matrix_share_percent} onChange={(e) => { const v = Number(e.target.value); setRuleForm({ ...ruleForm, matrix_share_percent: v, regional_share_percent: 100 - v }); }} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ color: '#9CA3AF', mb: 0.5, display: 'block' }}>% Regional</Typography>
              <TextField type="number" value={ruleForm.regional_share_percent} onChange={(e) => { const v = Number(e.target.value); setRuleForm({ ...ruleForm, regional_share_percent: v, matrix_share_percent: 100 - v }); }} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} />
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: '#9CA3AF', mb: 0.5, display: 'block' }}>% Comissão Parceiro</Typography>
            <TextField type="number" value={ruleForm.partner_commission_percent} onChange={(e) => setRuleForm({ ...ruleForm, partner_commission_percent: Number(e.target.value) })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} />
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: '#9CA3AF', mb: 0.5, display: 'block' }}>Descrição (opcional)</Typography>
            <TextField value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} />
          </Box>
          <Typography variant="caption" sx={{ color: ruleForm.matrix_share_percent + ruleForm.regional_share_percent === 100 ? '#34D399' : '#F87171' }}>Soma: {ruleForm.matrix_share_percent + ruleForm.regional_share_percent}% {ruleForm.matrix_share_percent + ruleForm.regional_share_percent === 100 ? '✅' : '❌ deve ser 100%'}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRuleOpen(false)} sx={{ color: '#9CA3AF' }}>Cancelar</Button>
          <Button onClick={handleCreateRule} disabled={ruleForm.matrix_share_percent + ruleForm.regional_share_percent !== 100 || saving} variant="contained" sx={{ bgcolor: '#B8942E', '&:hover': { bgcolor: '#9A7B24' } }}>{saving ? 'Salvando...' : 'Criar Regra'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
