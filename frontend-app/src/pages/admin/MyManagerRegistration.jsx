import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress,
  FormControlLabel, MenuItem, TextField, Typography,
} from '@mui/material';
import { API_BASE_URL } from '../../config/api';

const GOLD = '#B8942E';
const MISSING_LABELS = {
  full_name: 'nome completo', email: 'e-mail', phone: 'telefone',
  cpf: 'CPF', address: 'endereço completo', pix_key: 'chave Pix',
};

export default function MyManagerRegistration() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    document_cpf: '', address: '', document_rg: '',
    pix_key: '', pix_key_type: 'cpf', confirm_identity: false,
  });

  const load = async () => {
    const token = localStorage.getItem('kaviar_admin_token');
    try {
      const res = await fetch(API_BASE_URL + '/api/admin/my-operator-profile/registration', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Não foi possível carregar o cadastro.');
      setProfile(data.data);
      setForm(previous => ({
        ...previous, document_cpf: '', address: data.data.address || '',
        document_rg: '', pix_key: '', confirm_identity: false,
      }));
    } catch (err) {
      setError(err.message || 'Erro ao consultar o cadastro.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setField = (field, value) => setForm(previous => ({ ...previous, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    if (!profile?.canEdit || saving) return;
    setError(''); setSuccess(''); setSaving(true);
    try {
      const token = localStorage.getItem('kaviar_admin_token');
      const res = await fetch(API_BASE_URL + '/api/admin/my-operator-profile/registration', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Não foi possível salvar o cadastro.');
      setProfile(data.data);
      setForm(previous => ({
        ...previous, document_cpf: '', address: data.data.address || '',
        document_rg: '', pix_key: '', confirm_identity: false,
      }));
      setSuccess('Dados salvos. A central KAVIAR fará a conferência documental antes de qualquer aprovação.');
    } catch (err) {
      setError(err.message || 'Erro ao salvar o cadastro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FAFAF8', py: 4, px: 2 }}>
      <Box sx={{ maxWidth: 760, mx: 'auto' }}>
        <Button component={Link} to="/admin" sx={{ color: GOLD, mb: 2 }}>Voltar ao painel</Button>
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1A1A', mb: 1 }}>Meu Cadastro — Gestora Territorial</Typography>
        <Typography sx={{ color: '#6B7280', mb: 2 }}>
          Informe seus dados para a futura minuta contratual v1.2. Seus dados não ativam contrato nem repasses automaticamente.
        </Typography>
        {loading && <CircularProgress sx={{ color: GOLD }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
        {profile && (
          <Card sx={{ border: '1px solid #E8E5DE', borderTop: '4px solid ' + GOLD, borderRadius: 2 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>{profile.fullName}</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 13 }}>E-mail: {profile.email}</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 13 }}>Telefone: {profile.phone || 'A confirmar com a central'}</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 13 }}>Território: {profile.territory}</Typography>
              <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip size="small" label={profile.readyForReview ? 'Dados enviados para conferência' : 'Cadastro incompleto'} color={profile.readyForReview ? 'info' : 'warning'} />
                <Chip size="small" label={'Documentos: ' + profile.documentStatus} />
                <Chip size="small" label={'Contrato: ' + profile.contractStatus} />
              </Box>
              {profile.missingFields?.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Pendente: {profile.missingFields.map(field => MISSING_LABELS[field] || field).join(', ')}.
                </Alert>
              )}
              <Alert severity="info" sx={{ mt: 2 }}>
                CPF e Pix são exibidos somente de forma mascarada após o envio. RG/CIN e Pix são opcionais
                para gerar a minuta; o Pix deverá ser conferido antes de qualquer repasse.
              </Alert>
              {profile.canEdit ? (
                <Box component="form" onSubmit={save} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 3 }}>
                  <TextField label="CPF" value={form.document_cpf}
                    onChange={event => setField('document_cpf', event.target.value)}
                    helperText={profile.hasCpf ? 'CPF registrado: ' + profile.cpfMasked + '. Deixe vazio para manter ou digite o novo CPF para correção.' : 'Obrigatório. Informe o seu próprio CPF.'}
                    inputProps={{ inputMode: 'numeric', autoComplete: 'off', maxLength: 20 }} fullWidth />
                  <TextField label="Endereço residencial completo" required multiline minRows={2}
                    value={form.address} onChange={event => setField('address', event.target.value)}
                    placeholder="Rua, número, complemento, bairro, cidade/UF e CEP"
                    helperText="Informe logradouro, número, bairro, cidade/UF e CEP. Mínimo de 20 caracteres." fullWidth />
                  <TextField label="RG/CIN (opcional)" value={form.document_rg}
                    onChange={event => setField('document_rg', event.target.value)}
                    helperText={profile.hasRg ? 'Documento já cadastrado; deixe vazio para manter.' : ''}
                    inputProps={{ maxLength: 60 }} fullWidth />
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <TextField label="Chave Pix (opcional)" value={form.pix_key}
                      onChange={event => setField('pix_key', event.target.value)}
                      helperText={profile.hasPix ? 'Chave cadastrada: ' + profile.pixMasked + '. Deixe vazio para manter.' : 'A titularidade será conferida pela central.'}
                      sx={{ flex: 1, minWidth: 220 }} />
                    <TextField select label="Tipo de Pix" value={form.pix_key_type}
                      onChange={event => setField('pix_key_type', event.target.value)} sx={{ minWidth: 130 }}>
                      <MenuItem value="cpf">CPF</MenuItem>
                      <MenuItem value="cnpj">CNPJ</MenuItem>
                      <MenuItem value="email">E-mail</MenuItem>
                      <MenuItem value="phone">Telefone</MenuItem>
                      <MenuItem value="random">Aleatória</MenuItem>
                    </TextField>
                  </Box>
                  <FormControlLabel
                    control={<Checkbox checked={form.confirm_identity}
                      onChange={event => setField('confirm_identity', event.target.checked)} />}
                    label="Confirmo que os dados são meus e autorizo seu uso pela KAVIAR para cadastro e preparação contratual." />
                  <Button type="submit" variant="contained" disabled={!form.confirm_identity || saving}
                    sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#9A7B24' }, alignSelf: 'flex-start' }}>
                    {saving ? 'Salvando...' : 'Salvar dados do cadastro'}
                  </Button>
                </Box>
              ) : (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Edição bloqueada neste estágio. Se precisar corrigir dados, solicite revisão à central KAVIAR.
                </Alert>
              )}
              <Button component={Link} to="/admin/meu-contrato" sx={{ mt: 2, color: GOLD }}>
                Ir para Meu Contrato
              </Button>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
}
