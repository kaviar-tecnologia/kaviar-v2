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
  createAccountingFirm,
  getAccountingFirm,
  updateAccountingFirm,
} from '../../../services/adminAccountingService';

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

function emptyForm() {
  return {
    razao_social: '',
    nome_fantasia: '',
    document_type: 'CNPJ',
    document_number: '',
    crc: '',
    crc_uf: '',
    email: '',
    telefone: '',
  };
}

export default function FirmFormDialog({ open, mode, firmId, onClose, onSuccess }) {
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (mode === 'edit' && firmId) {
      setFetching(true);
      getAccountingFirm(firmId)
        .then((res) => {
          const firm = res.data || res;
          setForm({
            razao_social: firm.razao_social || '',
            nome_fantasia: firm.nome_fantasia || '',
            document_type: firm.document_type || 'CNPJ',
            document_number: firm.document_number || '',
            crc: firm.crc || '',
            crc_uf: firm.crc_uf || '',
            email: firm.email || '',
            telefone: firm.telefone || '',
          });
        })
        .catch((err) => setError(err.message))
        .finally(() => setFetching(false));
    } else {
      setForm(emptyForm());
    }
  }, [open, mode, firmId]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const validate = () => {
    if (!form.razao_social.trim()) return 'Razão social é obrigatória.';
    if (!form.document_number.trim()) return 'Documento é obrigatório.';
    if (!form.email.trim()) return 'Email é obrigatório.';
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
      if (mode === 'edit') {
        await updateAccountingFirm(firmId, form);
        onSuccess('Escritório atualizado com sucesso.');
      } else {
        await createAccountingFirm(form);
        onSuccess('Escritório criado com sucesso.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{mode === 'edit' ? 'Editar Escritório' : 'Novo Escritório'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        {fetching ? (
          <CircularProgress sx={{ alignSelf: 'center', my: 4 }} />
        ) : (
          <>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Razão Social" value={form.razao_social} onChange={handleChange('razao_social')} required size="small" />
            <TextField label="Nome Fantasia" value={form.nome_fantasia} onChange={handleChange('nome_fantasia')} size="small" />
            <FormControl size="small">
              <InputLabel>Tipo de Documento</InputLabel>
              <Select value={form.document_type} label="Tipo de Documento" onChange={handleChange('document_type')}>
                <MenuItem value="CNPJ">CNPJ</MenuItem>
                <MenuItem value="CPF">CPF</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Número do Documento" value={form.document_number} onChange={handleChange('document_number')} size="small" />
            <TextField label="CRC" value={form.crc} onChange={handleChange('crc')} size="small" placeholder="Registro CRC" />
            <FormControl size="small">
              <InputLabel>UF do CRC</InputLabel>
              <Select value={form.crc_uf} label="UF do CRC" onChange={handleChange('crc_uf')}>
                <MenuItem value="">—</MenuItem>
                {UF_LIST.map((uf) => <MenuItem key={uf} value={uf}>{uf}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Email" value={form.email} onChange={handleChange('email')} type="email" size="small" />
            <TextField label="Telefone" value={form.telefone} onChange={handleChange('telefone')} size="small" />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading || fetching}>
          {loading ? <CircularProgress size={20} /> : mode === 'edit' ? 'Salvar' : 'Criar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
