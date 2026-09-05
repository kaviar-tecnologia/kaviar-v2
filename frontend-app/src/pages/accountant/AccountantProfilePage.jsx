import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Skeleton, TextField, Button, Alert, Divider,
} from '@mui/material';
import { Person, Business, VpnKey, Domain, CheckCircle, Save } from '@mui/icons-material';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';
import { useAccountantAuth } from '../../auth/AccountantAuthContext';

const cardStyle = { bgcolor: '#1A1F2E', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 2, height: '100%' };
const labelStyle = { color: 'rgba(255,255,255,0.5)', fontSize: 12 };
const valueStyle = { color: '#fff', fontWeight: 500 };
const inputSx = {
  '& .MuiInputBase-input': { color: '#fff' },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(212,175,55,0.25)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(212,175,55,0.4)' },
};

const scopeLabels = {
  COMPLETO: 'Completo', FISCAL: 'Fiscal', CONTABIL: 'Contábil', FOLHA: 'Folha / DP',
  SOCIETARIO: 'Societário', FINANCEIRO: 'Financeiro', MUNICIPAL: 'Municipal',
};

const statusLabels = {
  ACTIVE: { label: 'Ativa', color: '#10B981' },
  INVITED: { label: 'Convidada', color: '#F59E0B' },
  SUSPENDED: { label: 'Suspensa', color: '#EF4444' },
  DEACTIVATED: { label: 'Desativada', color: '#6B7280' },
};

const permissionLabels = [
  ['can_view', 'Visualizar'],
  ['can_upload', 'Enviar'],
  ['can_download', 'Baixar'],
  ['can_request_correction', 'Solicitar correção'],
  ['can_mark_processed', 'Marcar processado'],
  ['can_close_period', 'Fechar período'],
];

function formatCnpj(cnpj) {
  if (!cnpj || cnpj.length !== 14) return cnpj || '—';
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function ReadField({ label, value }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={labelStyle}>{label}</Typography>
      <Typography sx={valueStyle}>{value ?? '—'}</Typography>
    </Box>
  );
}

export default function AccountantProfilePage() {
  const { accountant: ctxAccountant, updateAccountant } = useAccountantAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Formulário de dados pessoais
  const [form, setForm] = useState({ nome_completo: '', job_title: '', department: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // Redefinição de senha (reutiliza forgot-password)
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState(null);

  const applyProfile = (data) => {
    setProfile(data);
    setForm({
      nome_completo: data.nome_completo || '',
      job_title: data.job_title || '',
      department: data.department || '',
    });
  };

  useEffect(() => {
    let active = true;
    accountantApi.get('/api/accountant/auth/me')
      .then((r) => { if (active) applyProfile(r.data?.data || {}); })
      .catch((e) => { if (active) setLoadError(e.response?.data?.error || 'Erro ao carregar perfil'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const dirty = profile && (
    form.nome_completo !== (profile.nome_completo || '') ||
    form.job_title !== (profile.job_title || '') ||
    form.department !== (profile.department || '')
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    setSaveError(null);
    try {
      const res = await accountantApi.patch('/api/accountant/auth/me', {
        nome_completo: form.nome_completo,
        job_title: form.job_title,
        department: form.department,
      });
      const updated = res.data?.data;
      if (updated) {
        applyProfile(updated);
        updateAccountant(updated); // atualiza o contexto (header etc.)
      }
      setSaveMsg('Perfil atualizado com sucesso.');
    } catch (e) {
      setSaveError(e.response?.data?.error || 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!profile?.email) return;
    setResetting(true);
    setResetMsg(null);
    try {
      await accountantApi.post('/api/accountant/auth/forgot-password', { email: profile.email });
      setResetMsg('Enviamos um link de redefinição de senha para o seu e-mail.');
    } catch {
      // Resposta é genérica por segurança; mostramos a mesma mensagem.
      setResetMsg('Se o e-mail estiver cadastrado, um link de redefinição será enviado.');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <AccountantPortalLayout>
        <Skeleton variant="rectangular" height={48} sx={{ bgcolor: '#1A1F2E', borderRadius: 2, mb: 2 }} />
        <Grid container spacing={2}>
          {[1, 2, 3].map(i => (
            <Grid item xs={12} md={6} key={i}>
              <Skeleton variant="rectangular" height={220} sx={{ bgcolor: '#1A1F2E', borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      </AccountantPortalLayout>
    );
  }

  if (loadError) {
    return (
      <AccountantPortalLayout>
        <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, mb: 2 }}>Meu Perfil</Typography>
        <Alert severity="error">{loadError}</Alert>
      </AccountantPortalLayout>
    );
  }

  const st = statusLabels[profile.status] || { label: profile.status, color: '#6B7280' };

  return (
    <AccountantPortalLayout>
      <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, mb: 3 }}>Meu Perfil</Typography>

      <Grid container spacing={2}>
        {/* ── Dados pessoais (editável) ── */}
        <Grid item xs={12} md={6}>
          <Card sx={cardStyle}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Person sx={{ color: '#D4AF37' }} />
                <Typography sx={{ color: '#fff', fontWeight: 600 }}>Dados pessoais</Typography>
              </Box>

              {saveMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaveMsg(null)}>{saveMsg}</Alert>}
              {saveError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError(null)}>{saveError}</Alert>}

              <TextField
                label="Nome completo" fullWidth size="small" sx={{ ...inputSx, mb: 2 }}
                value={form.nome_completo}
                onChange={(e) => setForm(f => ({ ...f, nome_completo: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Cargo / função" fullWidth size="small" sx={{ ...inputSx, mb: 2 }}
                value={form.job_title}
                onChange={(e) => setForm(f => ({ ...f, job_title: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Departamento" fullWidth size="small" sx={{ ...inputSx, mb: 2 }}
                value={form.department}
                onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />

              <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 2 }} />

              {/* E-mail é somente leitura (sem fluxo seguro de troca neste PR) */}
              <ReadField label="E-mail (não editável)" value={profile.email} />
              {profile.cpf && <ReadField label="CPF" value={profile.cpf} />}
              {profile.crc && <ReadField label="CRC" value={`${profile.crc}${profile.crc_uf ? '/' + profile.crc_uf : ''}`} />}

              <Button
                variant="contained" startIcon={<Save />} disabled={!dirty || saving || !form.nome_completo.trim()}
                onClick={handleSave}
                sx={{ mt: 1, bgcolor: '#D4AF37', color: '#1A1F2E', fontWeight: 700, '&:hover': { bgcolor: '#c19f2f' } }}
              >
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* ── Escritório + Conta ── */}
        <Grid item xs={12} md={6}>
          <Card sx={cardStyle}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Business sx={{ color: '#D4AF37' }} />
                <Typography sx={{ color: '#fff', fontWeight: 600 }}>Escritório contábil</Typography>
              </Box>
              <ReadField label="Razão social" value={profile.firm?.razao_social} />
              {profile.firm?.nome_fantasia && <ReadField label="Nome fantasia" value={profile.firm.nome_fantasia} />}
              {profile.firm?.crc && <ReadField label="CRC do escritório" value={`${profile.firm.crc}${profile.firm.crc_uf ? '/' + profile.firm.crc_uf : ''}`} />}
              {profile.firm?.telefone && <ReadField label="Telefone" value={profile.firm.telefone} />}

              <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 2 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography sx={{ color: '#fff', fontWeight: 600 }}>Conta</Typography>
              </Box>
              <Box sx={{ mb: 1.5 }}>
                <Typography sx={labelStyle}>Status</Typography>
                <Chip label={st.label} size="small" sx={{ bgcolor: `${st.color}22`, color: st.color, fontWeight: 600 }} />
              </Box>
              <ReadField label="Contador responsável" value={profile.is_responsible_accountant ? 'Sim' : 'Não'} />
              <ReadField label="Último acesso" value={formatDateTime(profile.last_login_at)} />
            </CardContent>
          </Card>
        </Grid>

        {/* ── Acessos e vínculos (read-only) ── */}
        <Grid item xs={12}>
          <Card sx={cardStyle}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Domain sx={{ color: '#D4AF37' }} />
                <Typography sx={{ color: '#fff', fontWeight: 600 }}>Acessos e vínculos</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, ml: 1 }}>(somente leitura)</Typography>
              </Box>

              {(!profile.entity_links || profile.entity_links.length === 0) ? (
                <Alert severity="info">Nenhuma empresa vinculada.</Alert>
              ) : (
                <Grid container spacing={2}>
                  {profile.entity_links.map((link) => (
                    <Grid item xs={12} md={6} key={link.id}>
                      <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography sx={{ color: '#fff', fontWeight: 600 }}>
                            {link.legal_entity?.razao_social || '—'}
                          </Typography>
                          {link.is_primary && (
                            <Chip label="Principal" size="small" sx={{ bgcolor: 'rgba(212,175,55,0.15)', color: '#D4AF37' }} />
                          )}
                        </Box>
                        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, mb: 1 }}>
                          {formatCnpj(link.legal_entity?.cnpj)}
                        </Typography>
                        <Box sx={{ mb: 1 }}>
                          <Typography sx={labelStyle}>Escopo</Typography>
                          <Chip label={scopeLabels[link.scope] || link.scope} size="small"
                            sx={{ bgcolor: 'rgba(59,130,246,0.15)', color: '#818CF8', fontWeight: 600 }} />
                        </Box>
                        <Typography sx={labelStyle}>Permissões</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          {permissionLabels.filter(([key]) => link[key]).map(([key, lbl]) => (
                            <Chip key={key} icon={<CheckCircle sx={{ fontSize: 14 }} />} label={lbl} size="small"
                              sx={{ bgcolor: 'rgba(16,185,129,0.12)', color: '#10B981' }} />
                          ))}
                          {permissionLabels.every(([key]) => !link[key]) && (
                            <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Sem permissões</Typography>
                          )}
                        </Box>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ── Segurança / senha (reutiliza forgot-password) ── */}
        <Grid item xs={12}>
          <Card sx={cardStyle}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <VpnKey sx={{ color: '#D4AF37' }} />
                <Typography sx={{ color: '#fff', fontWeight: 600 }}>Segurança</Typography>
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', mb: 2, fontSize: 14 }}>
                Para alterar sua senha, enviaremos um link seguro de redefinição para o seu e-mail cadastrado.
              </Typography>
              {resetMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setResetMsg(null)}>{resetMsg}</Alert>}
              <Button
                variant="outlined" disabled={resetting} onClick={handlePasswordReset}
                sx={{ color: '#D4AF37', borderColor: 'rgba(212,175,55,0.4)', '&:hover': { borderColor: '#D4AF37' } }}
              >
                {resetting ? 'Enviando…' : 'Redefinir senha por e-mail'}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </AccountantPortalLayout>
  );
}
