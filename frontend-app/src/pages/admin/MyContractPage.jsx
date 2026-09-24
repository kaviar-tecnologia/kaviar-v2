import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Box, Typography, Card, CardContent, Chip, Button, Alert, CircularProgress, Grid } from '@mui/material';
import { CheckCircle, Block, ArrowBack } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';
import { formatDate } from '../../utils/formatDate';

const GOLD = '#B8942E';

const TERM_TEXT = `TERMO DE OPERADOR TERRITORIAL CAPTADOR — KAVIAR v1.0

1. PARTES
A plataforma KAVIAR é de propriedade da KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA, inscrita no CNPJ 67.783.601/0001-99 ("KAVIAR" ou "Plataforma").
O Operador Territorial Captador ("Operador") é a pessoa física ou jurídica que aceita este termo para atuar como parceiro/captador autônomo em território definido pela Plataforma.

2. NATUREZA DA RELAÇÃO
O Operador atua como parceiro/captador autônomo. Não há vínculo empregatício, salário fixo, obrigação de jornada, subordinação ou exclusividade automática entre o Operador e a KAVIAR.

3. TERRITÓRIO
O território vinculado define a área de atuação e acompanhamento do Operador. O território não confere propriedade, franquia, licença exclusiva nem direito real sobre a área.

4. LIMITAÇÕES
O Operador NÃO pode:
• Se apresentar como funcionário, sócio, representante legal ou procurador da KAVIAR;
• Cobrar valores em nome do KAVIAR sem autorização formal por escrito;
• Prometer aprovação de motoristas, passageiros, parceiros ou comércios;
• Alterar preços, taxas, comissões, créditos ou regras operacionais da Plataforma;
• Tomar decisões que vinculem a KAVIAR perante terceiros.

5. INDICAÇÕES
O Operador pode indicar motoristas usando seu link de indicação pessoal. Eventual bônus ou benefício por indicação segue exclusivamente as regras vigentes do sistema, podendo ser alteradas pela Plataforma a qualquer momento.

6. CONFIDENCIALIDADE E LGPD
O Operador deve manter sigilo sobre dados e informações acessadas no painel, incluindo dados pessoais de motoristas, passageiros e parceiros. O uso deve respeitar a Lei Geral de Proteção de Dados (LGPD) e as políticas de privacidade do KAVIAR.

7. SUSPENSÃO E CANCELAMENTO
A KAVIAR pode suspender ou cancelar o acesso do Operador em caso de fraude, abuso, mau uso, descumprimento deste termo, conduta incompatível ou risco à operação, sem aviso prévio quando justificado por urgência.

8. ALTERAÇÕES
Este termo pode ser atualizado pela Plataforma. Mudanças relevantes podem exigir novo aceite. A versão vigente estará sempre disponível no painel do Operador.

9. FORO
Fica eleito o foro da Comarca da Capital do Estado do Rio de Janeiro/RJ, correspondente à sede da KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA, CNPJ 67.783.601/0001-99, salvo disposição específica em contrato definitivo.`;

const RESPONSIBILITIES = [
  'Captar motoristas, parceiros e associações no território',
  'Acompanhar métricas e operação local',
  'Cadastrar interessados para análise da central',
  'Manter sigilo sobre dados acessados (LGPD)',
  'Reportar problemas à central KAVIAR',
  'Atuar apenas dentro do território vinculado',
];

const LIMITS = [
  'Não pode prometer aprovação de motoristas',
  'Não pode cobrar valores em nome do KAVIAR sem autorização formal',
  'Não pode alterar preços, taxas ou comissões',
  'Não pode garantir repasses específicos',
  'Não pode se apresentar como sócio, dono, franqueado ou funcionário da KAVIAR',
  'Não pode acessar ou solicitar dados fora do território',
  'Não pode prometer contratos a parceiros ou associações sem validação da central',
];

export default function MyContractPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const token = localStorage.getItem('kaviar_admin_token');
  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;

  const fetchProfile = () => {
    fetch(`${API_BASE_URL}/api/admin/my-operator-profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setProfile(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProfile(); }, []);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/my-operator-profile/accept-terms`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) fetchProfile();
    } catch {}
    setAccepting(false);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress sx={{ color: GOLD }} /></Box>;

  if (!profile) return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" sx={{ color: GOLD, fontWeight: 800, mb: 2 }}>📋 Meu Contrato</Typography>
      <Alert severity="info">Seu perfil de operador está sendo preparado. Tente novamente em instantes.</Alert>
    </Box>
  );

  // ─── TERRITORIAL_MANAGER view ──────────────────────────────────────────────
  if (profile.relationship_type === 'territorial_manager') {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#FAFAF8', pt: 2, pb: 6 }}>
        <Box sx={{ maxWidth: 720, mx: 'auto', px: 2 }}>
          <Button component={Link} to="/admin" startIcon={<ArrowBack />} size="small" sx={{ color: '#6B7280', mb: 2 }}>Voltar ao painel</Button>

          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            <span style={{ color: GOLD }}>📋</span> Meu Contrato — Gestor Territorial
          </Typography>

          {/* Perfil */}
          <Card sx={{ mb: 2, border: '1px solid #E8E5DE', borderTop: `3px solid ${GOLD}`, borderRadius: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>Perfil</Typography>
              <Grid container spacing={1}>
                <Grid item xs={12} sm={6}><Typography sx={{ fontSize: 12, color: '#6B7280' }}>Nome</Typography><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{profile.display_name}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography sx={{ fontSize: 12, color: '#6B7280' }}>Território</Typography><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{profile.territory?.name || '—'}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography sx={{ fontSize: 12, color: '#6B7280' }}>Função</Typography><Typography sx={{ fontSize: 14, fontWeight: 600 }}>Gestor Territorial</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography sx={{ fontSize: 12, color: '#6B7280' }}>Desde</Typography><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{profile.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '—'}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography sx={{ fontSize: 12, color: '#6B7280' }}>Versão contratual</Typography><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{profile.terms_version || 'Aguardando geração v1.2'}</Typography></Grid>
                {admin?.email && <Grid item xs={12} sm={6}><Typography sx={{ fontSize: 12, color: '#6B7280' }}>Email</Typography><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{admin.email}</Typography></Grid>}
                <Grid item xs={12} sm={6}>
                  <Typography sx={{ fontSize: 12, color: '#6B7280' }}>Contrato</Typography>
                  {profile.contract_url && profile.contract_status === 'signed' && (
                    <Chip label="Contrato formalizado" size="small" sx={{ mt: 0.5, bgcolor: 'rgba(16,185,129,0.1)', color: '#059669', fontSize: 11, fontWeight: 600 }} />
                  )}
                  {profile.contract_url && profile.contract_status === 'pending' && (
                    <Chip label="Contrato disponível para análise" size="small" sx={{ mt: 0.5, bgcolor: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontSize: 11, fontWeight: 600 }} />
                  )}
                  {!profile.contract_url && profile.contract_status === 'signed' && (
                    <Chip label="Aceite online legado — contrato v1.2 formal pendente" size="small" sx={{ mt: 0.5, bgcolor: 'rgba(217,119,6,0.1)', color: '#D97706', fontSize: 11, fontWeight: 600 }} />
                  )}
                  {!profile.contract_url && profile.contract_status === 'available' && (
                    <Chip label="Modelo disponível — aguardando assinatura" size="small" sx={{ mt: 0.5, bgcolor: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontSize: 11, fontWeight: 600 }} />
                  )}
                  {!profile.contract_url && profile.contract_status === 'submitted' && (
                    <Chip label="Contrato enviado — em análise" size="small" sx={{ mt: 0.5, bgcolor: 'rgba(217,119,6,0.1)', color: '#D97706', fontSize: 11, fontWeight: 600 }} />
                  )}
                  {!profile.contract_url && profile.contract_status === 'pending' && (
                    <Chip label="Contrato em preparação" size="small" sx={{ mt: 0.5, bgcolor: 'rgba(107,114,128,0.1)', color: '#6B7280', fontSize: 11, fontWeight: 600 }} />
                  )}
                  {profile.contract_status === 'rejected' && (
                    <Chip label="Rejeitado — novo envio necessário" size="small" sx={{ mt: 0.5, bgcolor: 'rgba(239,68,68,0.1)', color: '#DC2626', fontSize: 11, fontWeight: 600 }} />
                  )}
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Abrir contrato */}
          {profile.contract_url && (
            <Card sx={{ mb: 2, border: '1px solid #E8E5DE', borderRadius: 2 }}>
              <CardContent sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>Contrato formalizado</Typography>
                  <Typography sx={{ fontSize: 11, color: '#6B7280' }}>PDF disponível para visualização</Typography>
                </Box>
                <Button variant="outlined" size="small" sx={{ borderColor: GOLD, color: GOLD, fontWeight: 600, '&:hover': { bgcolor: 'rgba(184,148,46,0.06)', borderColor: GOLD } }}
                  onClick={async () => { try { const res = await fetch(`${API_BASE_URL}/api/admin/my-operator-profile/contract-url`, { headers: { Authorization: `Bearer ${token}` } }); const data = await res.json(); if (data.success && data.data?.url) window.open(data.data.url, '_blank'); else alert('Contrato não disponível.'); } catch { alert('Erro ao abrir contrato.'); } }}>
                  Abrir contrato
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Alerta de contrato disponível */}
          {profile.contract_template_url && !profile.contract_url && profile.contract_status === 'available' && (
            <Alert severity="info" icon={false} sx={{ mb: 2, border: '2px solid #3B82F6', borderRadius: 2, bgcolor: '#EFF6FF', '& .MuiAlert-message': { width: '100%' } }}>
              <Typography sx={{ fontWeight: 700, color: '#1E40AF', fontSize: 13, mb: 0.5 }}>📋 Seu contrato está disponível para conferência e assinatura</Typography>
              <Typography sx={{ color: '#1E40AF', fontSize: 12 }}>Baixe a minuta v1.2, confira o Anexo Comercial, o Anexo Territorial e o Anexo LGPD, assine e envie o PDF pelo próprio painel.</Typography>
              <Typography sx={{ color: '#1E40AF', fontSize: 11, mt: 0.5, fontWeight: 600 }}>A assinatura não cria Ativação Financeira; a participação começa somente após ativação expressa e elegível no sistema.</Typography>
            </Alert>
          )}

          {/* Modelo de contrato disponível + envio */}
          {profile.contract_template_url && !profile.contract_url && (
            <Card sx={{ mb: 2, border: '1px solid #E8E5DE', borderRadius: 2, borderLeft: '4px solid #3B82F6' }}>
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>Modelo de contrato disponível</Typography>
                    <Typography sx={{ fontSize: 11, color: '#6B7280' }}>Baixe a versão {profile.terms_version || 'v1.2'}, assine e envie o PDF assinado abaixo.</Typography>
                  </Box>
                  <Button variant="outlined" size="small" sx={{ borderColor: '#3B82F6', color: '#3B82F6' }}
                    onClick={async () => { try { const res = await fetch(`${API_BASE_URL}/api/admin/my-operator-profile/contract-template-url`, { headers: { Authorization: `Bearer ${token}` } }); const data = await res.json(); if (data.success && data.data?.url) window.open(data.data.url, '_blank'); else alert('Modelo não disponível.'); } catch { alert('Erro ao abrir modelo.'); } }}>
                    Baixar modelo
                  </Button>
                </Box>

                {/* Upload do PDF assinado */}
                {['available', 'rejected'].includes(profile.contract_status) && (
                  <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#F9FAFB', borderRadius: 1, border: '1px dashed #D1D5DB' }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#374151', mb: 1 }}>Enviar contrato assinado</Typography>
                    {profile.contract_status === 'rejected' && profile.contract_rejection_reason && (
                      <Alert severity="error" sx={{ mb: 1, py: 0.5, '& .MuiAlert-message': { fontSize: 11 } }}>
                        Motivo da rejeição: {profile.contract_rejection_reason}
                      </Alert>
                    )}
                    <input type="file" accept="application/pdf" id="submit-contract-input" style={{ display: 'none' }} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.type !== 'application/pdf') { alert('Apenas PDF é permitido.'); return; }
                      if (file.size > 10 * 1024 * 1024) { alert('Arquivo excede 10 MB.'); return; }
                      try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await fetch(`${API_BASE_URL}/api/admin/my-operator-profile/submit-contract`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
                        const data = await res.json();
                        if (data.success) { alert('Contrato enviado com sucesso! Aguarde a análise.'); fetchProfile(); }
                        else alert(data.error || 'Erro ao enviar contrato.');
                      } catch { alert('Erro de conexão ao enviar contrato.'); }
                      e.target.value = '';
                    }} />
                    <Button variant="contained" size="small" sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#9A7B24' } }}
                      onClick={() => document.getElementById('submit-contract-input')?.click()}>
                      Selecionar e enviar PDF assinado
                    </Button>
                    <Typography sx={{ fontSize: 10, color: '#9CA3AF', mt: 0.5 }}>Apenas PDF, máximo 10 MB.</Typography>
                  </Box>
                )}

                {/* Estado: enviado, aguardando */}
                {profile.contract_status === 'submitted' && (
                  <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#FFFBEB', borderRadius: 1, border: '1px solid #FDE68A' }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#92400E' }}>Contrato enviado — aguardando análise da central</Typography>
                    <Typography sx={{ fontSize: 11, color: '#B45309', mt: 0.5 }}>Você será notificado quando o contrato for aprovado ou se houver necessidade de correção.</Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* Responsabilidades */}
          <Card sx={{ mb: 2, border: '1px solid #E8E5DE', borderRadius: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>Suas Responsabilidades</Typography>
              {RESPONSIBILITIES.map(r => (
                <Box key={r} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
                  <CheckCircle sx={{ fontSize: 16, color: '#10B981', mt: 0.2 }} />
                  <Typography sx={{ fontSize: 13, color: '#374151' }}>{r}</Typography>
                </Box>
              ))}
            </CardContent>
          </Card>

          {/* Limites */}
          <Card sx={{ mb: 2, border: '1px solid #E8E5DE', borderRadius: 2 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>Limites do Acesso</Typography>
              {LIMITS.map(l => (
                <Box key={l} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
                  <Block sx={{ fontSize: 16, color: '#EF4444', mt: 0.2 }} />
                  <Typography sx={{ fontSize: 13, color: '#374151' }}>{l}</Typography>
                </Box>
              ))}
            </CardContent>
          </Card>

          {/* Institucional */}
          <Card sx={{ mb: 2, border: '1px solid #E8E5DE', borderRadius: 2, bgcolor: '#FAFAF8' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#1A1A1A', mb: 0.5 }}>KAVIAR</Typography>
              <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
                Plataforma KAVIAR — KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA — CNPJ 67.783.601/0001-99.
              </Typography>
            </CardContent>
          </Card>

          {/* Aviso legal */}
          <Alert severity="warning" icon={false} sx={{ bgcolor: 'rgba(184,148,46,0.06)', border: '1px solid #E8E5DE', '& .MuiAlert-message': { color: '#6B7280', fontSize: 11, lineHeight: 1.6 } }}>
            Este acesso é operacional e restrito ao território vinculado. Não transfere propriedade do sistema, franquia, licença exclusiva, sociedade ou vínculo empregatício. O contrato específico do Gestor Territorial será formalizado pela central KAVIAR. Valores financeiros exibidos no painel são informativos e estimados. Contrato assinado, por si só, não cria Ativação Financeira; a participação depende de assignment territorial elegível e ativação expressa no sistema.
          </Alert>
        </Box>
      </Box>
    );
  }

  // ─── TERRITORIAL_OPERATOR / outros ─────────────────────────────────────────
  const termsAccepted = !!profile.terms_accepted_at;

  return (
    <Box>
      <Typography variant="h5" sx={{ color: GOLD, fontWeight: 800, mb: 2 }}>📋 Meu Contrato</Typography>

      <Card sx={{ border: '1px solid #E8E5DE', mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{profile.display_name}</Typography>
          {profile.territory && <Typography variant="body2" sx={{ color: '#6B7280', mb: 1 }}>Território: {profile.territory.name}</Typography>}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2"><strong>Status:</strong></Typography>
            <Chip label={termsAccepted ? 'Termos aceitos' : 'Pendente de aceite'} size="small" color={termsAccepted ? 'success' : 'warning'} />
          </Box>
          {termsAccepted && <Typography variant="body2" sx={{ color: '#059669', mt: 1 }}>Aceito em {formatDate(profile.terms_accepted_at, { showTime: true })} • Versão: {profile.terms_version}</Typography>}
        </CardContent>
      </Card>

      <Card sx={{ border: '1px solid #E8E5DE', mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: GOLD }}>Termo de Operador Territorial Captador</Typography>
          <Box sx={{ maxHeight: 400, overflow: 'auto', bgcolor: '#FAFAF8', p: 2, borderRadius: 1, border: '1px solid #E8E5DE' }}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line', color: '#374151', fontSize: 12, lineHeight: 1.7 }}>{TERM_TEXT}</Typography>
          </Box>
        </CardContent>
      </Card>

      {!termsAccepted && (
        <Card sx={{ border: '2px solid #D97706', mb: 3 }}>
          <CardContent sx={{ textAlign: 'center', py: 3 }}>
            <Typography sx={{ mb: 2, fontWeight: 600, color: '#92400E' }}>Ao clicar abaixo, você declara que leu e aceita todos os termos acima.</Typography>
            <Button onClick={handleAccept} disabled={accepting} variant="contained" size="large" sx={{ bgcolor: GOLD, px: 4, '&:hover': { bgcolor: '#9A7B24' } }}>
              {accepting ? 'Registrando...' : 'Aceito os termos'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Alert severity="warning" sx={{ mt: 2, fontSize: 11 }}>Este é um registro interno digital. Não substitui contrato jurídico formal nem orientação contábil/tributária.</Alert>
    </Box>
  );
}
