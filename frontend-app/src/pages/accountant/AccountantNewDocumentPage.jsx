import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel,
  Card, CardContent, IconButton, Alert,
} from '@mui/material';
import { ArrowBack, Add } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

export default function AccountantNewDocumentPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    legal_entity_id: '',
    document_type_id: '',
    reference_number: '',
    issued_at: '',
    valid_from: '',
    expires_at: '',
    notes: '',
  });

  useEffect(() => {
    accountantApi.get('/api/accountant/portal/companies')
      .then(res => setCompanies(res.data?.data || []))
      .catch(() => {});
    accountantApi.get('/api/accountant/portal/document-types?limit=100')
      .then(res => setDocTypes(res.data?.data || []))
      .catch(() => {});
  }, []);

  const handleChange = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        legal_entity_id: form.legal_entity_id,
        document_type_id: form.document_type_id,
        reference_number: form.reference_number || null,
        issued_at: form.issued_at ? new Date(form.issued_at).toISOString() : null,
        valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        notes: form.notes || null,
      };

      const res = await accountantApi.post('/api/accountant/portal/documents', payload);
      const newDoc = res.data?.data;
      if (newDoc?.id) {
        navigate(`/contador/documentos/${newDoc.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar documento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccountantPortalLayout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <IconButton onClick={() => navigate('/contador/documentos')} sx={{ color: 'rgba(255,255,255,0.5)' }}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>
            Novo Documento
          </Typography>
        </Box>

        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, maxWidth: 600 }}>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <FormControl fullWidth required>
                  <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Empresa</InputLabel>
                  <Select
                    value={form.legal_entity_id}
                    onChange={e => handleChange('legal_entity_id', e.target.value)}
                    label="Empresa"
                    sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                  >
                    {companies.map(c => (
                      <MenuItem key={c.id} value={c.id}>{c.razao_social}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth required>
                  <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Tipo de Documento</InputLabel>
                  <Select
                    value={form.document_type_id}
                    onChange={e => handleChange('document_type_id', e.target.value)}
                    label="Tipo de Documento"
                    sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                  >
                    {docTypes.map(dt => (
                      <MenuItem key={dt.id} value={dt.id}>{dt.name} ({dt.category})</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label="Número de Referência"
                  value={form.reference_number}
                  onChange={e => handleChange('reference_number', e.target.value)}
                  fullWidth
                  sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}
                />

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                  <TextField
                    label="Data de Emissão"
                    type="date"
                    value={form.issued_at}
                    onChange={e => handleChange('issued_at', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}
                  />
                  <TextField
                    label="Válido a partir de"
                    type="date"
                    value={form.valid_from}
                    onChange={e => handleChange('valid_from', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}
                  />
                  <TextField
                    label="Vencimento"
                    type="date"
                    value={form.expires_at}
                    onChange={e => handleChange('expires_at', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}
                  />
                </Box>

                <TextField
                  label="Observações"
                  value={form.notes}
                  onChange={e => handleChange('notes', e.target.value)}
                  multiline
                  rows={3}
                  fullWidth
                  sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}
                />

                {error && <Alert severity="error" sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{error}</Alert>}

                <Button
                  type="submit"
                  variant="contained"
                  disabled={loading || !form.legal_entity_id || !form.document_type_id}
                  startIcon={<Add />}
                  sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, alignSelf: 'flex-end', '&:hover': { bgcolor: '#B8960C' } }}
                >
                  {loading ? 'Criando...' : 'Criar Documento'}
                </Button>
              </Box>
            </form>
          </CardContent>
        </Card>
      </Box>
    </AccountantPortalLayout>
  );
}
