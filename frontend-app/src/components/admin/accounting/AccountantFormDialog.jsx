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
  createAccountant,
  getAccountant,
  listAccountingFirms,
  updateAccountant,
} from '../../../services/adminAccountingService';

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

function emptyForm() {
  return {
    nome_completo: '',
    email: '',
    cpf: '',
    crc: '',
    crc_uf: '',
    accounting_firm_id: '',
  };
}

export default function AccountantFormDialog({ open, mode, accountantId, onClose, onSuccess }) {
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [firms, setFirms] = useState([]);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    listAccountingFirms({ limit: 100 })
      .then((res) => setFirms(res.data || []))
      .catch(() => {});
    if (mode === 'edit' && accountantId) {
      setFetching(true);
      getAccountant(accountantId)
        .then((res) => {
          const acc = res.data || res;
          setForm({
            nome_completo: acc.nome_completo || '',
            email: acc.email || '',
            cpf: acc.cpf_masked || '',
            crc: acc.crc || '',
            crc_uf: acc.crc_uf || '',
            accounting_firm_id: acc.accounting_firm_id || '',
          });
        })
        .catch((err) => setError(err.message))
        .finally(() => setFetching(false));
    } else {
      setForm(emptyForm());
    }
  }, [open, mode, accountantId]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const validate = () => {
    if (!form.nome_completo.trim()) return 'Nome completo é obrigatório.';
    if (!form.email.trim()) return 'Email é obrigatório.';
    if (mode === 'create' && (!form.cpf.trim() || form.cpf.replace(/\D/g, '').length !== 11)) {
      return 'CPF deve ter 11 dígitos.';
    }
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
        nome_completo: form.nome_completo,
        email: form.email,
        crc: form.crc || null,
        crc_uf: form.crc_uf || null,
        accounting_firm_id: form.accounting_firm_id || null,
      };
      if (mode === 'create') {
        payload.cpf = form.cpf.replace(/\D/g, '');
      }
      if (mode === 'edit') {
        await updateAccountant(accountantId, payload);
        onSuccess('Contador atualizado com sucesso.');
      } else {
        await createAccountant(payload);
        onSuccess('Contador criado com sucesso.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="accountant-dialog-title">
      <DialogTitle id="accountant-dialog-title">{mode === 'edit' ? 'Editar Contador' : 'Novo Contador'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        {fetching ? (
          <CircularProgress sx={{ alignSelf: 'center', my: 4 }} />
        ) : (
          <>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField id="accountant-nome-completo" label="Nome Completo" value={form.nome_completo} onChange={handleChange('nome_completo')} required size="small" />
            <TextField id="accountant-email" label="Email" value={form.email} onChange={handleChange('email')} type="email" required size="small" />
            {mode === 'create' ? (
              <TextField id="accountant-cpf" label="CPF" value={form.cpf} onChange={handleChange('cpf')} size="small" placeholder="Somente números" inputProps={{ maxLength: 14 }} />
            ) : (
              <TextField id="accountant-cpf" label="CPF (mascarado)" value={form.cpf} size="small" disabled />
            )}
            <TextField id="accountant-crc" label="CRC" value={form.crc} onChange={handleChange('crc')} size="small" />
            <FormControl size="small">
              <InputLabel id="accountant-crc-uf-label">UF do CRC</InputLabel>
              <Select id="accountant-crc-uf" labelId="accountant-crc-uf-label" value={form.crc_uf} label="UF do CRC" onChange={handleChange('crc_uf')}>
                <MenuItem value="">—</MenuItem>
                {UF_LIST.map((uf) => <MenuItem key={uf} value={uf}>{uf}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel id="accountant-firm-label">Escritório</InputLabel>
              <Select id="accountant-firm" labelId="accountant-firm-label" value={form.accounting_firm_id} label="Escritório" onChange={handleChange('accounting_firm_id')}>
                <MenuItem value="">— Nenhum —</MenuItem>
                {firms.map((f) => (
                  <MenuItem key={f.id} value={f.id}>{f.razao_social}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading || fetching}>
          {loading ? <CircularProgress size={20} /> : 'Salvar contador'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
