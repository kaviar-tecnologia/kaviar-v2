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

const SCOPE_OPTIONS = ['FULL', 'FISCAL', 'CONTABIL', 'DEPARTAMENTO_PESSOAL', 'CONSULTORIA'];
const PERMISSION_OPTIONS = ['VIEW_TRANSACTIONS', 'VIEW_REPORTS', 'EXPORT_DATA', 'MANAGE_DOCUMENTS', 'SUBMIT_DECLARATIONS'];

function emptyForm() {
  return {
    accountant_id: '',
    legal_entity_id: '',
    scope: 'FULL',
    permissions: [],
    inherits_children: false,
    starts_at: '',
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
      listAccountants({ limit: 200 }),
      listLegalEntities({ limit: 200 }),
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
            scope: link.scope || 'FULL',
            permissions: link.permissions || [],
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

  const handlePermissionToggle = (perm) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const validate = () => {
    if (!form.accountant_id) return 'Selecione um contador.';
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
        ...form,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      };
      if (mode === 'edit') {
        await updateAccountantLink(linkId, payload);
        onSuccess('Vínculo atualizado com sucesso.');
      } else {
        await createAccountantLink(payload);
        onSuccess('Vínculo criado com sucesso.');
      }
    } catch (err) {
      setError(err.message);
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
              <InputLabel id="link-accountant-label">Contador</InputLabel>
              <Select id="link-accountant" labelId="link-accountant-label" value={form.accountant_id} label="Contador" onChange={handleChange('accountant_id')}>
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
              {PERMISSION_OPTIONS.map((perm) => (
                <FormControlLabel
                  key={perm}
                  control={
                    <Checkbox
                      size="small"
                      checked={form.permissions.includes(perm)}
                      onChange={() => handlePermissionToggle(perm)}
                    />
                  }
                  label={perm}
                  sx={{ display: 'block', '& .MuiFormControlLabel-label': { fontSize: 13 } }}
                />
              ))}
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
