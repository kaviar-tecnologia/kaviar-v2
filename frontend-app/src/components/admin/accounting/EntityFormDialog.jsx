import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import {
  createLegalEntity,
  getLegalEntity,
  listLegalEntities,
  updateLegalEntity,
} from '../../../services/adminAccountingService';

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

function emptyForm() {
  return {
    razao_social: '',
    nome_fantasia: '',
    cnpj: '',
    entity_type: 'MATRIZ',
    parent_entity_id: '',
    uf: '',
    municipio: '',
    endereco: '',
  };
}

const cnpjMask = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const cnpjToDigits = (value) => value.replace(/\D/g, '');

export default function EntityFormDialog({ open, mode, entityId, onClose, onSuccess }) {
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [parentEntities, setParentEntities] = useState([]);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (mode === 'edit' && entityId) {
      setFetching(true);
      getLegalEntity(entityId)
        .then((res) => {
          const entity = res.data || res;
          setForm({
            razao_social: entity.razao_social || '',
            nome_fantasia: entity.nome_fantasia || '',
            cnpj: cnpjMask(entity.cnpj || ''),
            entity_type: entity.entity_type || 'MATRIZ',
            parent_entity_id: entity.parent_entity_id || '',
            uf: entity.uf || '',
            municipio: entity.municipio || '',
            endereco: entity.endereco || '',
          });
        })
        .catch((err) => setError(err.message))
        .finally(() => setFetching(false));
    } else {
      setForm(emptyForm());
    }
    listLegalEntities({ entity_type: 'MATRIZ', limit: 200 })
      .then((res) => setParentEntities(res.data || []))
      .catch(() => {});
  }, [open, mode, entityId]);

  const handleChange = (field) => (e) => {
    const value = e.target.value;
    if (field === 'cnpj') {
      setForm((prev) => ({ ...prev, cnpj: cnpjMask(value) }));
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
    }
  };

  const validate = () => {
    if (!form.razao_social.trim()) return 'Razão social é obrigatória.';
    const cnpjDigits = cnpjToDigits(form.cnpj);
    if (!cnpjDigits || cnpjDigits.length !== 14) return 'CNPJ deve ter 14 dígitos.';
    if (!form.entity_type) return 'Tipo é obrigatório.';
    if (form.entity_type === 'FILIAL' && !form.parent_entity_id) return 'Filial exige empresa matriz.';
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
        cnpj: cnpjToDigits(form.cnpj),
        parent_entity_id: form.parent_entity_id || null,
      };
      if (mode === 'edit') {
        await updateLegalEntity(entityId, payload);
        onSuccess('Empresa atualizada com sucesso.');
      } else {
        await createLegalEntity(payload);
        onSuccess('Empresa criada com sucesso.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="entity-dialog-title">
      <DialogTitle id="entity-dialog-title">{mode === 'edit' ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        {fetching ? (
          <CircularProgress sx={{ alignSelf: 'center', my: 4 }} />
        ) : (
          <>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField id="entity-razao-social" label="Razão Social" value={form.razao_social} onChange={handleChange('razao_social')} required size="small" />
            <TextField id="entity-nome-fantasia" label="Nome Fantasia" value={form.nome_fantasia} onChange={handleChange('nome_fantasia')} size="small" />
            <TextField id="entity-cnpj" label="CNPJ" value={form.cnpj} onChange={handleChange('cnpj')} placeholder="XX.XXX.XXX/XXXX-XX" size="small" inputProps={{ maxLength: 18 }} />
            <FormControl size="small">
              <InputLabel id="entity-type-label">Tipo</InputLabel>
              <Select id="entity-type" labelId="entity-type-label" value={form.entity_type} label="Tipo" onChange={handleChange('entity_type')}>
                <MenuItem value="MATRIZ">Matriz</MenuItem>
                <MenuItem value="FILIAL">Filial</MenuItem>
              </Select>
            </FormControl>
            {form.entity_type === 'FILIAL' && (
              <FormControl size="small">
                <InputLabel id="entity-parent-label">Empresa Matriz</InputLabel>
                <Select id="entity-parent" labelId="entity-parent-label" value={form.parent_entity_id} label="Empresa Matriz" onChange={handleChange('parent_entity_id')}>
                  <MenuItem value="">— Selecionar —</MenuItem>
                  {parentEntities.map((e) => (
                    <MenuItem key={e.id} value={e.id}>{e.razao_social}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <FormControl size="small">
              <InputLabel id="entity-uf-label">UF</InputLabel>
              <Select id="entity-uf" labelId="entity-uf-label" value={form.uf} label="UF" onChange={handleChange('uf')}>
                <MenuItem value="">—</MenuItem>
                {UF_LIST.map((uf) => <MenuItem key={uf} value={uf}>{uf}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField id="entity-municipio" label="Município" value={form.municipio} onChange={handleChange('municipio')} size="small" />
            <TextField id="entity-endereco" label="Endereço" value={form.endereco} onChange={handleChange('endereco')} size="small" multiline rows={2} />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading || fetching}>
          {loading ? <CircularProgress size={20} /> : 'Salvar empresa'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
