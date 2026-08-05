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
      // Normalize document: strip dots, slashes, dashes (send only digits)
      const payload = {
        ...form,
        document_number: form.document_number.replace(/[.\-\/\s]/g, ''),
        email: form.email.trim().toLowerCase(),
        crc: form.crc?.trim() || null,
        crc_uf: form.crc_uf?.trim().toUpperCase() || null,
        telefone: form.telefone?.trim() || null,
        nome_fantasia: form.nome_fantasia?.trim() || null,
      };
      if (mode === 'edit') {
        await updateAccountingFirm(firmId, payload);
        onSuccess('Escritório atualizado com sucesso.');
      } else {
        await createAccountingFirm(payload);
        onSuccess('Escritório criado com sucesso.');
      }
    } catch (err) {
      const data = err.response?.data;
      let msg = data?.error || err.message || 'Erro ao salvar escritório';
      // Show field-level validation details if available
      if (data?.details?.length) {
        const fields = data.details.map(d => `${d.path?.join('.') || 'campo'}: ${d.message}`).join('; ');
        msg = `${msg} — ${fields}`;
      }
      setError(msg);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="firm-dialog-title">
      <DialogTitle id="firm-dialog-title">{mode === 'edit' ? 'Editar Escritório' : 'Novo Escritório'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        {fetching ? (
          <CircularProgress sx={{ alignSelf: 'center', my: 4 }} />
        ) : (
          <>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField id="firm-razao-social" label="Razão Social" value={form.razao_social} onChange={handleChange('razao_social')} required size="small" />
            <TextField id="firm-nome-fantasia" label="Nome Fantasia" value={form.nome_fantasia} onChange={handleChange('nome_fantasia')} size="small" />
            <FormControl size="small">
              <InputLabel id="firm-document-type-label">Tipo de Documento</InputLabel>
              <Select id="firm-document-type" labelId="firm-document-type-label" value={form.document_type} label="Tipo de Documento" onChange={handleChange('document_type')}>
                <MenuItem value="CNPJ">CNPJ</MenuItem>
                <MenuItem value="CPF">CPF</MenuItem>
              </Select>
            </FormControl>
            <TextField id="firm-document-number" label="Número do Documento" value={form.document_number} onChange={handleChange('document_number')} size="small" />
            <TextField id="firm-crc" label="CRC" value={form.crc} onChange={handleChange('crc')} size="small" placeholder="Registro CRC" />
            <FormControl size="small">
              <InputLabel id="firm-crc-uf-label">UF do CRC</InputLabel>
              <Select id="firm-crc-uf" labelId="firm-crc-uf-label" value={form.crc_uf} label="UF do CRC" onChange={handleChange('crc_uf')}>
                <MenuItem value="">—</MenuItem>
                {UF_LIST.map((uf) => <MenuItem key={uf} value={uf}>{uf}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField id="firm-email" label="Email" value={form.email} onChange={handleChange('email')} type="email" size="small" />
            <TextField id="firm-telefone" label="Telefone" value={form.telefone} onChange={handleChange('telefone')} size="small" />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading || fetching}>
          {loading ? <CircularProgress size={20} /> : 'Salvar escritório'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
