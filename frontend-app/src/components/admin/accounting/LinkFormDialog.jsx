import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import {
  createAccountantLink,
  getAccountantLink,
  listAccountants,
  listLegalEntities,
  updateAccountantLink,
} from '../../../services/adminAccountingService';

const SCOPE_OPTIONS = ['COMPLETO', 'FISCAL', 'CONTABIL', 'FOLHA', 'SOCIETARIO', 'FINANCEIRO', 'MUNICIPAL'];

function emptyForm() {
  return {
    accountant_id: '',
    legal_entity_id: '',
    scope: 'COMPLETO',
    can_view: true,
    can_upload: false,
    can_download: true,
    can_request_correction: false,
    can_mark_processed: false,
    can_close_period: false,
    inherits_children: false,
    starts_at: new Date().toISOString().split('T')[0], // Today as default
    ends_at: '',
  };
}

export default function LinkFormDialog({ open, mode, linkId, onClose, onSuccess }) {
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [accountants, setAccountants] = useState([]);
  const [entities, setEntities] = useState([]);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    Promise.all([
      listAccountants({ limit: 100 }),
      listLegalEntities({ limit: 100 }),
    ]).then(([accRes, entRes]) => {
      setAccountants(accRes.data || []);
      setEntities(entRes.data || []);
    }).catch(() => {});

    if (mode === 'edit' && linkId) {
      setFetching(true);
      getAccountantLink(linkId)
        .then((res) => {
          const link = res.data || res;
          setForm({
            accountant_id: link.accountant_id || '',
            legal_entity_id: link.legal_entity_id || '',
            scope: link.scope || 'COMPLETO',
            can_view: link.can_view ?? true, can_upload: link.can_upload ?? false, can_download: link.can_download ?? true, can_request_correction: link.can_request_correction ?? false, can_mark_processed: link.can_mark_processed ?? false, can_close_period: link.can_close_period ?? false,
            inherits_children: link.inherits_children ?? false,
            starts_at: link.starts_at ? link.starts_at.slice(0, 10) : '',
            ends_at: link.ends_at ? link.ends_at.slice(0, 10) : '',
          });
        })
        .catch((err) => setError(err.message))
        .finally(() => setFetching(false));
    } else {
      setForm(emptyForm());
    }
  }, [open, mode, linkId]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleBooleanToggle = (field) => () => {
    setForm((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const validate = () => {
    if (!form.accountant_id) return 'Selecione um membro da equipe.';
    if (!form.legal_entity_id) return 'Selecione uma empresa.';
    if (!form.scope) return 'Escopo é obrigatório.';
    return null;
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    submittingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const payload = {
        accountant_id: form.accountant_id,
        legal_entity_id: form.legal_entity_id,
        scope: form.scope,
        can_view: form.can_view,
        can_upload: form.can_upload,
        can_download: form.can_download,
        can_request_correction: form.can_request_correction,
        can_mark_processed: form.can_mark_processed,
        can_close_period: form.can_close_period,
        inherits_children: form.inherits_children,
        starts_at: form.starts_at ? new Date(form.starts_at + 'T00:00:00Z').toISOString() : new Date().toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at + 'T23:59:59Z').toISOString() : null,
      };
      if (mode === 'edit') {
        await updateAccountantLink(linkId, payload);
        onSuccess('Vínculo atualizado com sucesso.');
      } else {
        await createAccountantLink(payload);
        onSuccess('Vínculo criado com sucesso.');
      }
    } catch (err) {
      const data = err.response?.data;
      let msg = data?.error || err.message || 'Erro ao salvar vínculo';
      if (data?.details?.length) {
        msg = `${msg} — ${data.details.map(d => `${d.path?.join('.') || 'campo'}: ${d.message}`).join('; ')}`;
      }
      setError(msg);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="link-dialog-title">
      <DialogTitle id="link-dialog-title">{mode === 'edit' ? 'Editar Vínculo' : 'Novo Vínculo'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        {fetching ? (
          <CircularProgress sx={{ alignSelf: 'center', my: 4 }} />
        ) : (
          <>
            {error && <Alert severity="error">{error}</Alert>}
            <FormControl size="small" required>
              <InputLabel id="link-accountant-label">Membro da equipe</InputLabel>
              <Select id="link-accountant" labelId="link-accountant-label" value={form.accountant_id} label="Membro da equipe" onChange={handleChange('accountant_id')}>
                <MenuItem value="">— Selecionar —</MenuItem>
                {accountants.map((a) => (
                  <MenuItem key={a.id} value={a.id}>{a.nome_completo}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" required>
              <InputLabel id="link-entity-label">Empresa</InputLabel>
              <Select id="link-entity" labelId="link-entity-label" value={form.legal_entity_id} label="Empresa" onChange={handleChange('legal_entity_id')}>
                <MenuItem value="">— Selecionar —</MenuItem>
                {entities.map((e) => (
                  <MenuItem key={e.id} value={e.id}>{e.razao_social}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel id="link-scope-label">Escopo</InputLabel>
              <Select id="link-scope" labelId="link-scope-label" value={form.scope} label="Escopo" onChange={handleChange('scope')}>
                {SCOPE_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
            <Box>
              <InputLabel sx={{ fontSize: 12, mb: 0.5 }}>Permissões</InputLabel>
              <FormControlLabel control={<Checkbox size="small" checked={form.can_view} onChange={handleBooleanToggle('can_view')} />} label="Visualizar" sx={{ display: 'block', '& .MuiFormControlLabel-label': { fontSize: 13 } }} />
              <FormControlLabel control={<Checkbox size="small" checked={form.can_upload} onChange={handleBooleanToggle('can_upload')} />} label="Enviar documentos" sx={{ display: 'block', '& .MuiFormControlLabel-label': { fontSize: 13 } }} />
              <FormControlLabel control={<Checkbox size="small" checked={form.can_download} onChange={handleBooleanToggle('can_download')} />} label="Baixar documentos" sx={{ display: 'block', '& .MuiFormControlLabel-label': { fontSize: 13 } }} />
              <FormControlLabel control={<Checkbox size="small" checked={form.can_request_correction} onChange={handleBooleanToggle('can_request_correction')} />} label="Solicitar correção" sx={{ display: 'block', '& .MuiFormControlLabel-label': { fontSize: 13 } }} />
              <FormControlLabel control={<Checkbox size="small" checked={form.can_mark_processed} onChange={handleBooleanToggle('can_mark_processed')} />} label="Marcar processado" sx={{ display: 'block', '& .MuiFormControlLabel-label': { fontSize: 13 } }} />
              <FormControlLabel control={<Checkbox size="small" checked={form.can_close_period} onChange={handleBooleanToggle('can_close_period')} />} label="Concluir competência" sx={{ display: 'block', '& .MuiFormControlLabel-label': { fontSize: 13 } }} />
            </Box>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={form.inherits_children}
                  onChange={(e) => setForm((prev) => ({ ...prev, inherits_children: e.target.checked }))}
                />
              }
              label="Herdar para filiais"
              sx={{ '& .MuiFormControlLabel-label': { fontSize: 13 } }}
            />
            <TextField
              id="link-starts-at"
              label="Data de início"
              type="date"
              value={form.starts_at}
              onChange={handleChange('starts_at')}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              id="link-ends-at"
              label="Data de término"
              type="date"
              value={form.ends_at}
              onChange={handleChange('ends_at')}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading || fetching}>
          {loading ? <CircularProgress size={20} /> : 'Salvar vínculo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
