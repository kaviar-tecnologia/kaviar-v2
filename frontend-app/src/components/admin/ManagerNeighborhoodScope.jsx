import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { API_BASE_URL } from '../../config/api';

const style = { color: '#B8942E' };

export default function ManagerNeighborhoodScope({ territory, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [reason, setReason] = useState('');
  const [agreement, setAgreement] = useState('');
  const [mutualAgreement, setMutualAgreement] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelVersion, setCancelVersion] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);

  const endpoint = `${API_BASE_URL}/api/admin/manager-neighborhood-scopes/${territory.id}`;

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Falha ao consultar os bairros');
      setData(payload.data);
      setError('');
      setAssignmentId((old) => payload.data.assignments.some(a => a.id === old)
        ? old : (payload.data.assignments.find(a => a.admin?.role === 'TERRITORIAL_MANAGER' && !a.ended_at)?.id || ''));
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [territory.id, token]);

  const assignment = useMemo(
    () => data?.assignments?.find(a => a.id === assignmentId),
    [data, assignmentId],
  );
  const currentIds = assignment?.current_neighborhood_ids || [];
  const removed = currentIds.filter(id => !selectedIds.includes(id));
  const added = selectedIds.filter(id => !currentIds.includes(id));
  const scheduled = assignment?.history.find(v => !v.canceled_at && new Date(v.effective_from) > new Date(data?.server_now));

  // The form always starts from the actual current scope, never the planned one.
  useEffect(() => {
    setSelectedIds(assignment?.current_neighborhood_ids || []);
    setEffectiveFrom(''); setReason(''); setAgreement('');
    setMutualAgreement(false); setConfirmOpen(false);
  }, [assignmentId, assignment?.current_version_id, data?.server_now]);

  const changeSelection = (id) => setSelectedIds(old => old.includes(id)
    ? old.filter(value => value !== id) : [...old, id]);

  const request = async (path, body) => {
    const response = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Alteração não concluída');
    return payload;
  };

  const schedule = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      await request('/versions', {
        assignment_id: assignment.id,
        neighborhood_ids: selectedIds,
        effective_from: new Date(effectiveFrom).toISOString(),
        change_reason: reason,
        agreement_reference: agreement,
        mutual_agreement_confirmed: mutualAgreement,
        expected_current_version_id: assignment.current_version_id,
        confirmation: 'AGENDAR_ESCOPO_GESTOR',
      });
      setConfirmOpen(false);
      setNotice('Alteração registrada. A participação passa a seguir o novo recorte somente na data de vigência.');
      await load();
    } catch (e) { setError(e.message); setConfirmOpen(false); }
    setSaving(false);
  };

  const cancel = async () => {
    if (!cancelVersion || cancelReason.trim().length < 10) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await request(`/versions/${cancelVersion.id}/cancel`, {
        reason: cancelReason,
        confirmation: 'CANCELAR_ESCOPO_AGENDADO',
      });
      setCancelVersion(null); setCancelReason('');
      setNotice('Agendamento cancelado. O histórico foi preservado.');
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  if (loading && !data) return <CircularProgress size={24} sx={style} />;

  return (
    <Card sx={{ border: '1px solid #E8E5DE' }}>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Gestão dos bairros remunerados</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Controle financeiro por gestor. Não altera os  mapas oficiais, as geofences, o acesso administrativo nem ativa pagamentos.
          Só produz efeito nas operações reconhecidas a partir da vigência registrada.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
        {!data?.assignments?.length ? <Alert severity="warning">Não há vínculo financeiro de gestor neste território. O acesso administrativo, por si só, não cria esse vínculo.</Alert> : <>
          <TextField select fullWidth size="small" label="Gestor vinculado" value={assignmentId}
            onChange={e => setAssignmentId(e.target.value)} sx={{ mb: 2 }}>
            {data.assignments.map(a => <MenuItem key={a.id} value={a.id}>
              {a.admin?.name} — {a.status} ({a.admin?.email})
            </MenuItem>)}
          </TextField>
          {assignment && <>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip label={`${currentIds.length} bairros atualmente remuneráveis`} color="primary" variant="outlined" />
              <Chip label={`${selectedIds.length} selecionados`} variant="outlined" />
              <Chip label={`Vínculo: ${assignment.status}`} size="small" />
            </Box>
            {scheduled && <Alert severity="info" sx={{ mb: 2 }}>
              Há uma alteração para {new Date(scheduled.effective_from).toLocaleString('pt-BR')},
              com {scheduled.neighborhood_ids.length} bairros. Cancele-a antes de agendar outra.
            </Alert>}
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button size="small" onClick={() => setSelectedIds(data.neighborhoods.map(n => n.id))} disabled={Boolean(scheduled)}>Selecionar todos</Button>
              <Button size="small" onClick={() => setSelectedIds([])} disabled={Boolean(scheduled)}>Desmarcar todos</Button>
              <Button size="small" onClick={() => setSelectedIds(currentIds)} disabled={Boolean(scheduled)}>Restaurar seleção atual</Button>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', maxHeight: 290, overflowY: 'auto', border: '1px solid #E8E5DE', borderRadius: 1, p: 1, mb: 2 }}>
              {data.neighborhoods.map(n => (
                <FormControlLabel key={n.id} control={<Checkbox size="small" checked={selectedIds.includes(n.id)}
                  onChange={() => changeSelection(n.id)} disabled={Boolean(scheduled)} />}
                  label={<Typography variant="body2">{n.name}</Typography>} />
              ))}
            </Box>
            <Alert severity="warning" sx={{ mb: 2 }}>
              {removed.length} bairro(s) sairão do escopo remunerado; {added.length} entrarão.
              Corridas já reconhecidas não são recalculadas. O acordo deve ser documentado.
            </Alert>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', mb: 2 }}>
              <TextField size="small" type="datetime-local" label="Início da nova vigência" value={effectiveFrom}
                onChange={e => setEffectiveFrom(e.target.value)} InputLabelProps={{ shrink: true }} disabled={Boolean(scheduled)} />
              <TextField size="small" label="Referência do aviso ou acordo" value={agreement}
                onChange={e => setAgreement(e.target.value)} helperText="Ex.: protocolo de aviso, assinatura ou e-mail registrado" disabled={Boolean(scheduled)} />
              <TextField size="small" label="Motivo da alteração" value={reason} multiline minRows={2}
                onChange={e => setReason(e.target.value)} disabled={Boolean(scheduled)} />
            </Box>
            <FormControlLabel control={<Checkbox checked={mutualAgreement} onChange={e => setMutualAgreement(e.target.checked)} disabled={Boolean(scheduled)} />}
              label="Confirmo que há acordo mútuo documentado para redução com menos de 30 dias de antecedência" />
            <Box sx={{ mt: 2 }}>
              <Button variant="contained" sx={{ bgcolor: '#B8942E' }} disabled={saving || Boolean(scheduled) ||
                !effectiveFrom || Number.isNaN(new Date(effectiveFrom).getTime()) ||
                reason.trim().length < 10 || agreement.trim().length < 8 ||
                (removed.length === 0 && added.length === 0)}
                onClick={() => setConfirmOpen(true)}>Revisar e agendar alteração</Button>
            </Box>
            <Typography variant="subtitle2" sx={{ mt: 4, mb: 1, fontWeight: 700 }}>Histórico de versões</Typography>
            <Table size="small">
              <TableHead><TableRow><TableCell>Vigência</TableCell><TableCell>Bairros</TableCell><TableCell>Referência</TableCell><TableCell>Situação</TableCell><TableCell>Ação</TableCell></TableRow></TableHead>
              <TableBody>
                {(assignment.history || []).map(v => <TableRow key={v.id}>
                  <TableCell>{new Date(v.effective_from).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{v.neighborhood_ids.length}</TableCell>
                  <TableCell title={v.change_reason}>{v.agreement_reference}</TableCell>
                  <TableCell>{v.canceled_at ? 'Cancelada' : new Date(v.effective_from) > new Date(data.server_now) ? 'Agendada' : 'Vigente/histórica'}</TableCell>
              <TableCell>{!v.canceled_at && new Date(v.effective_from) > new Date(data.server_now)
                    ? <Button size="small" color="warning" onClick={() => { setCancelVersion(v); setCancelReason(''); }} disabled={saving}>Cancelar</Button> : '—'}</TableCell>
                </TableRow>)}
                {!assignment.history?.length && <TableRow><TableCell colSpan={5}>Sem versões: permanece o escopo integral anterior.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </>}
        </>}
        <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Confirmar alteração futura do escopo financeiro</DialogTitle>
          <DialogContent>
            <Typography>Gestor: {assignment?.admin?.name}</Typography>
            <Typography>De {currentIds.length} para {selectedIds.length} bairros</Typography>
            <Typography>Retirados: {removed.length} · Adicionados: {added.length}</Typography>
            <Typography>Vigência: {effectiveFrom && new Date(effectiveFrom).toLocaleString('pt-BR')}</Typography>
            <Alert severity="warning" sx={{ mt: 2 }}>Esta ação registra uma versão auditável que afetará a divisão financeira de operações futuras. Não altera pagamentos anteriores.</Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmOpen(false)} disabled={saving}>Voltar</Button>
            <Button variant="contained" disabled={saving} onClick={schedule} sx={{ bgcolor: '#B8942E' }}>
              {saving ? 'Registrando...' : 'Confirmar agendamento'}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog open={Boolean(cancelVersion)} onClose={() => !saving && setCancelVersion(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Cancelar alteração ainda não vigente</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>O agendamento será cancelado, mas a versão e os registros de auditoria permanecerão guardados.</Alert>
            <Typography sx={{ mb: 2 }}>Vigência que será cancelada: {cancelVersion && new Date(cancelVersion.effective_from).toLocaleString('pt-BR')}</Typography>
            <TextField label="Motivo do cancelamento" fullWidth multiline minRows={2}
              value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCancelVersion(null)} disabled={saving}>Voltar</Button>
            <Button color="warning" variant="contained" onClick={cancel} disabled={saving || cancelReason.trim().length < 10}>
              {saving ? 'Cancelando...' : 'Confirmar cancelamento'}
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
