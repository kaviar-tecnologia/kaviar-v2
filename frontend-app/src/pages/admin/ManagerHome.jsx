import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Container, Typography, Box, Card, CardContent, Grid, Button, CircularProgress, Alert, TextField, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Chip } from '@mui/material';
import { DirectionsCar, Explore, Handshake, Apartment, Description, PersonAdd, AddBusiness, GroupAdd, AccountBalance, Star, Pets, Shield, Storefront, ChatBubble, BarChart, Public } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';
import { managerPortalRequest } from '../../services/managerPortalApi';
import { AR_PLACES_DASHBOARD_CARD, canAccessArPlaces } from './arPlacesPermissions';

const GOLD = '#C99A16';
const GOLD_LIVE = '#E0B324';
const GOLD_LIGHT = '#FFF7DF';
const KAVIAR_BLACK = '#090A0F';
const PREMIUM_WHITE = '#FFFDF8';
const TEXT_GRAY = '#667085';
const PARTNER_TYPES = [
  { value: 'association', label: 'Associação' },
  { value: 'condominium', label: 'Condomínio' },
  { value: 'business', label: 'Comércio/Empresa' },
  { value: 'community_leader', label: 'Liderança Comunitária' },
  { value: 'institution', label: 'Instituição' },
  { value: 'other', label: 'Outro' },
];

export default function ManagerHome() {
  const [metrics, setMetrics] = useState(null);
  const [territory, setTerritoryData] = useState(null);
  const [territoryName, setTerritoryName] = useState(null);
  const [territoryLoaded, setTerritoryLoaded] = useState(false);
  const [myTerritories, setMyTerritories] = useState([]);
  const [territoriesLoaded, setTerritoriesLoaded] = useState(false);
  const [territoriesError, setTerritoriesError] = useState(false);
  const [referralError, setReferralError] = useState('');
  const [sessionError, setSessionError] = useState(false);
  const [myNeighborhoods, setMyNeighborhoods] = useState([]);
  const [referral, setReferral] = useState(null);
  const [drafts, setDrafts] = useState(null);
  const [teamStats, setTeamStats] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [partnerDialog, setPartnerDialog] = useState(false);
  const [operatorDialog, setOperatorDialog] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;
  const canAccessArPlacesCard = canAccessArPlaces(admin?.role);
  const token = localStorage.getItem('kaviar_admin_token');
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    setReferralError('');
    setSessionError(false);
    setTerritoriesLoaded(false);
    setTerritoriesError(false);
    setMyTerritories([]);
    setMyNeighborhoods([]);
    setReferral(null);
    setMetrics(null);
    setTerritoryData(null);
    setDrafts(null);
    setTeamStats(null);
    setTeamMembers([]);
    try {
      const paths = [
        '/api/admin/dashboard/metrics',
        '/api/admin/dashboard/territory',
        '/api/admin/operator/referrals',
        '/api/admin/manager/drafts',
        '/api/admin/manager/finance/team-lead-stats',
        '/api/admin/manager/finance/team',
        '/api/admin/commerce/my-territories',
        '/api/admin/my-operator-profile/territory-info',
      ];
      const results = await Promise.allSettled(paths.map(path => managerPortalRequest(path)));
      const get = index => results[index].status === 'fulfilled' ? results[index].value : null;
      const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.some(failure => failure.status === 401)) {
        setSessionError(true);
        setError('Sessão inválida ou expirada. Entre novamente para consultar seus dados.');
      } else if (failures.length) {
        setError('Alguns dados do painel não puderam ser consultados. Tente novamente ou procure a central.');
      }

      const metricsData = get(0);
      if (metricsData) setMetrics(metricsData.metrics || metricsData);
      if (get(1)) setTerritoryData(get(1).data);
      if (get(2)) setReferral(get(2).data);
      else setReferralError(results[2].reason?.message || 'Não foi possível consultar a indicação.');
      if (get(3)) setDrafts(get(3).data);
      if (get(4)) setTeamStats(get(4));
      if (get(5)) setTeamMembers(get(5).data);

      const commerce = get(6);
      const own = get(7);
      const territories = Array.isArray(commerce?.data) ? [...commerce.data] : [];
      if (own?.data?.territory_id && !territories.some(t => t.id === own.data.territory_id)) {
        territories.push({
          id: own.data.territory_id, name: own.data.territory_name,
          status: own.data.territory_status, is_active: own.data.territory_active,
        });
      }
      setMyTerritories(territories);
      setTerritoriesError(!commerce || !own);
      setTerritoriesLoaded(true);
      if (territories.length) {
        const tIds = territories.map(t => t.id);
        try {
          const neighborhoods = await managerPortalRequest('/api/governance/neighborhoods');
          if (Array.isArray(neighborhoods.data)) {
            setMyNeighborhoods(neighborhoods.data.filter(n => n.is_active && tIds.includes(n.territory_id)));
          }
        } catch {
          setError('Não foi possível consultar os bairros. Tente novamente ou procure a central.');
        }
      }
    } catch {
      setError('Não foi possível carregar o painel. Tente novamente ou procure a central.');
    }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('kaviar_admin_token');
    localStorage.removeItem('kaviar_admin_data');
    window.location.href = '/admin/login';
  };

  if (loading) return (
    <Container maxWidth="lg" sx={{ mt: 6, textAlign: 'center' }}>
      <CircularProgress sx={{ color: GOLD }} />
      <Typography sx={{ mt: 2, color: TEXT_GRAY }}>Carregando território...</Typography>
    </Container>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: PREMIUM_WHITE, pt: 2, pb: 6 }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, p: 2, bgcolor: '#fff', borderRadius: 3, border: '1px solid rgba(201,154,22,0.25)', borderTop: `2px solid ${GOLD}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <span style={{ color: GOLD }}>KAVIAR</span> Gestor Territorial
            </Typography>
            <Typography sx={{ color: TEXT_GRAY, fontSize: 12 }}>{admin?.name || 'Gestor'} — {myTerritories.length === 1 ? `Território: ${myTerritories[0].name}` : myTerritories.length > 1 ? `${myTerritories.length} territórios vinculados` : territoriesError ? 'Território: consulta indisponível' : territoriesLoaded ? 'Nenhum território retornado' : 'Território: carregando...'}</Typography>
          </Box>
          <Button onClick={handleLogout} variant="outlined" size="small" sx={{ borderColor: 'rgba(201,154,22,0.25)', color: TEXT_GRAY, '&:hover': { borderColor: GOLD, color: GOLD } }}>
            Sair
          </Button>
        </Box>

        {/* Meu Território */}
        {myTerritories.length > 0 && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: '#fff', borderRadius: 2, border: '1px solid rgba(201,154,22,0.15)' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: TEXT_GRAY, textTransform: 'uppercase', mb: 0.5 }}>Meu território</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: myNeighborhoods.length > 0 ? 1 : 0 }}>
              {myTerritories.map(t => <Chip key={t.id} label={t.status === 'planning' || t.is_active === false ? `${t.name} · Em planejamento` : t.name} size="small" sx={{ bgcolor: GOLD_LIGHT, color: KAVIAR_BLACK, fontWeight: 700, fontSize: 12 }} />)}
            </Box>
            {myNeighborhoods.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography sx={{ fontSize: 10, color: TEXT_GRAY, textTransform: 'uppercase', mb: 0.5 }}>Bairros atendidos</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {myNeighborhoods.map(n => <Chip key={n.id} label={n.name} size="small" variant="outlined" sx={{ fontSize: 10, height: 22, borderColor: 'rgba(201,154,22,0.3)', color: TEXT_GRAY }} />)}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {error && <Alert severity="warning" sx={{ mb: 3 }}>{error} {sessionError ? <Button component={Link} to="/admin/login" state={{ from: { pathname: '/admin' } }}>Entrar novamente</Button> : <Button onClick={fetchData}>Tentar novamente</Button>}</Alert>}
        {submitMsg && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSubmitMsg('')}>{submitMsg}</Alert>}

        {/* KPIs */}
        {metrics && (
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {[
              { label: 'Motoristas', value: metrics.drivers?.total ?? 0 },
              { label: 'Online', value: metrics.drivers?.online ?? 0 },
              { label: 'Passageiros', value: metrics.passengers?.total ?? 0 },
              { label: 'Corridas', value: metrics.rides?.total ?? 0 },
            ].map(k => (
              <Grid item xs={6} sm={3} key={k.label}>
                <Card sx={{ bgcolor: '#fff', borderTop: `2px solid ${GOLD}`, border: '1px solid rgba(201,154,22,0.25)', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <CardContent sx={{ textAlign: 'center', py: 2 }}>
                    <Typography sx={{ fontSize: 28, fontWeight: 800, color: KAVIAR_BLACK }}>{k.value}</Typography>
                    <Typography sx={{ fontSize: 11, color: TEXT_GRAY, fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Territory metrics */}
        {territory && territory.total > 0 && (
          <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid rgba(201,154,22,0.25)', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: TEXT_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>Corridas por Território</Typography>
              <Grid container spacing={1}>
                {[
                  { label: 'Local', value: territory.local },
                  { label: 'Vizinho', value: territory.adjacent },
                  { label: 'Externo', value: territory.external },
                  { label: 'Retorno', value: territory.homebound },
                  { label: 'Total', value: territory.total },
                ].map(t => (
                  <Grid item xs key={t.label}>
                    <Box sx={{ textAlign: 'center', py: 1, bgcolor: GOLD_LIGHT, borderRadius: 1 }}>
                      <Typography sx={{ fontSize: 20, fontWeight: 800, color: KAVIAR_BLACK }}>{t.value}</Typography>
                      <Typography sx={{ fontSize: 9, color: TEXT_GRAY, fontWeight: 600, textTransform: 'uppercase' }}>{t.label}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Referral quick stats */}
        {referral?.has_code && (
          <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid rgba(201,154,22,0.25)', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography sx={{ fontSize: 10, color: TEXT_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Captação</Typography>
                <Typography sx={{ fontSize: 11, color: GOLD, fontFamily: 'monospace' }}>{referral.referral_code}</Typography>
              </Box>
              <Grid container spacing={1}>
                {[
                  { label: 'Indicados', value: referral.stats.total },
                  { label: 'Pendentes', value: referral.stats.pending },
                  { label: 'Aprovados', value: referral.stats.qualified },
                ].map(s => (
                  <Grid item xs={4} key={s.label}>
                    <Box sx={{ textAlign: 'center', py: 0.5 }}>
                      <Typography sx={{ fontSize: 18, fontWeight: 800, color: KAVIAR_BLACK }}>{s.value}</Typography>
                      <Typography sx={{ fontSize: 9, color: TEXT_GRAY, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Links de indicação */}
        <ReferralLinksCard referral={referral} error={referralError} adminName={admin?.name} loading={loading} />

        {/* Equipe & Captação */}
        {teamMembers.length > 0 && (
          <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid rgba(201,154,22,0.25)', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: TEXT_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5 }}>Equipe & Captação</Typography>
              <Grid container spacing={1} sx={{ mb: 1.5 }}>
                {[
                  { label: 'Leads Hoje', value: teamStats?.leads_today ?? 0, color: GOLD },
                  { label: 'Leads Mês', value: teamStats?.leads_month ?? 0, color: '#3B82F6' },
                  { label: 'Total Leads', value: teamStats?.data?.reduce((s, m) => s + m.total_leads, 0) ?? 0, color: '#6366F1' },
                  { label: 'Ativos', value: teamMembers.filter(m => m.status === 'active').length, color: '#10B981' },
                  { label: 'Inativos', value: teamMembers.filter(m => m.status !== 'active').length, color: '#6B7280' },
                  { label: 'Termos ✓', value: teamMembers.filter(m => m.contract_status === 'signed').length, color: '#10B981' },
                  { label: 'Termos ⏳', value: teamMembers.filter(m => m.contract_status !== 'signed').length, color: '#F59E0B' },
                ].map(k => (
                  <Grid item xs={4} sm key={k.label}>
                    <Box sx={{ textAlign: 'center', py: 0.5 }}>
                      <Typography sx={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</Typography>
                      <Typography sx={{ fontSize: 9, color: TEXT_GRAY, fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
              {teamStats?.by_type && Object.keys(teamStats.by_type).length > 0 && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontSize: 9, color: TEXT_GRAY, textTransform: 'uppercase', mb: 0.5 }}>Por Tipo</Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {Object.entries(teamStats.by_type).map(([type, count]) => (
                      <Chip key={type} label={`${type}: ${count}`} size="small" sx={{ fontSize: 10 }} />
                    ))}
                  </Box>
                </Box>
              )}
              {teamStats?.data?.length > 0 && (
                <Box>
                  <Typography sx={{ fontSize: 9, color: TEXT_GRAY, textTransform: 'uppercase', mb: 0.5 }}>Ranking Captadores</Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {teamStats.data.filter(m => m.total_leads > 0).sort((a, b) => b.total_leads - a.total_leads).map((m, i) => (
                      <Chip key={m.member_id} label={`${i + 1}. ${m.member_name}: ${m.total_leads}`} size="small" sx={{ fontSize: 10, bgcolor: i === 0 ? `${GOLD}20` : undefined, color: i === 0 ? GOLD : undefined }} />
                    ))}
                  </Box>
                </Box>
              )}
              {teamMembers.some(m => m.contract_status !== 'signed' && m.status === 'active') && (
                <Alert severity="warning" sx={{ mt: 1.5, py: 0, fontSize: 11 }}>
                  ⚠️ {teamMembers.filter(m => m.contract_status !== 'signed' && m.status === 'active').length} membro(s) ativo(s) sem termo assinado
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Modules */}
        <Typography sx={{ fontSize: 12, color: TEXT_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5, fontWeight: 600 }}>Módulos</Typography>
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {[
            { Icon: DirectionsCar, title: 'Motoristas', desc: 'Motoristas do território', to: '/admin/drivers' },
            { Icon: ChatBubble, title: 'Central WhatsApp', desc: 'Convites e atendimento do território', to: '/admin/whatsapp' },
            { Icon: Explore, title: 'Corridas', desc: 'Corridas do território', to: '/admin/rides' },
            { Icon: BarChart, title: 'Cockpit Operacional', desc: 'Acompanhe corridas, motoristas, territórios e histórico do dia.', to: '/admin/operations' },
            { Icon: PersonAdd, title: 'Indicações', desc: 'Link de captação e indicados', to: '/admin/manager-referrals' },
            { Icon: Handshake, title: 'Parceiros', desc: 'Parceiros territoriais', to: '/admin/territorial-partners' },
            { Icon: Apartment, title: 'Associações', desc: 'Operadores e associações locais', to: '/admin/local-operators' },
            { Icon: AccountBalance, title: 'Financeiro', desc: 'Extrato territorial estimado', to: '/admin/manager-finance' },
            { Icon: Description, title: 'Tabela de Preços', desc: 'Pisos mínimos e propostas', to: '/admin/manager-territory-floors' },
            { Icon: Star, title: 'Reputação', desc: 'Avaliações dos motoristas', to: '/admin/manager-reputation' },
            { Icon: Pets, title: 'KAVIAR Pet', desc: 'Pedidos Pet assistidos', to: '/admin/private-rides' },
            { Icon: PersonAdd, title: 'Meu Cadastro', desc: 'Informe CPF e endereço para a minuta v1.2', to: '/admin/meu-cadastro' },
            { Icon: Description, title: 'Meu Contrato', desc: 'Contrato v1.2 e Ativação Financeira', to: '/admin/meu-contrato' },
            { Icon: Description, title: 'Materiais do Gestor', desc: 'Proposta v1.2, piloto pré-contratual e FAQ', to: '/admin/comercial-gestor' },
            { Icon: AddBusiness, title: 'CRM KAVIAR', desc: 'Leads, prospecção e comércios locais', to: '/admin/crm' },
            { Icon: Description, title: 'Consulta Regulatória Municipal', desc: 'Documento institucional e envio via WhatsApp oficial', to: '/admin/regulatory-consultation' },
            { Icon: Storefront, title: 'Comércios do Território', desc: 'Cadastre, organize e acompanhe os negócios locais', to: '/admin/commerce' },
            ...(canAccessArPlacesCard ? [{ Icon: Public, title: AR_PLACES_DASHBOARD_CARD.title, desc: AR_PLACES_DASHBOARD_CARD.desc, to: AR_PLACES_DASHBOARD_CARD.to }] : []),
            { Icon: Shield, title: 'KAVIAR para Mulheres', desc: 'Indicadores e acompanhamento territorial', to: '/admin/manager-women' },
            { Icon: Shield, title: 'Alertas do Território', desc: 'Acompanhe alertas de emergência do seu território', to: '/admin/manager-emergency-alerts' },
            { Icon: GroupAdd, title: 'Minha Equipe', desc: 'Cadastro interno de captadores e operadores', to: '/admin/manager-team' },
          ].map(c => (
            <Grid item xs={12} sm={6} md={4} key={c.title}>
              <Card component={Link} to={c.to} sx={{ bgcolor: '#fff', border: '1px solid rgba(201,154,22,0.25)', borderRadius: 3, textDecoration: 'none', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', '&:hover': { borderColor: GOLD_LIVE, transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(201,154,22,0.12)' }, '&:focus-visible': { outline: '3px solid rgba(224,179,36,0.45)', outlineOffset: '2px', borderColor: GOLD_LIVE }, transition: 'all 0.2s' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.75, px: 2.5 }}>
                  <Box sx={{ width: 38, height: 38, borderRadius: '50%', bgcolor: GOLD_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <c.Icon sx={{ fontSize: 18, color: GOLD }} />
                  </Box>
                  <Box>
                    <Typography sx={{ color: KAVIAR_BLACK, fontWeight: 600, fontSize: 13 }}>{c.title}</Typography>
                    <Typography sx={{ color: TEXT_GRAY, fontSize: 11 }}>{c.desc}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Cadastro Pendente */}
        <Typography sx={{ fontSize: 12, color: TEXT_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5, fontWeight: 600 }}>Cadastrar para Análise</Typography>
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6}>
            <Card role="button" tabIndex={0} onClick={() => setPartnerDialog(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPartnerDialog(true); } }} sx={{ bgcolor: '#fff', border: '1px solid rgba(201,154,22,0.25)', borderRadius: 3, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', '&:hover': { borderColor: GOLD_LIVE, transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(201,154,22,0.12)' }, '&:focus-visible': { outline: '3px solid rgba(224,179,36,0.45)', outlineOffset: '2px', borderColor: GOLD_LIVE }, transition: 'all 0.2s' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.75, px: 2.5 }}>
                <Box sx={{ width: 38, height: 38, borderRadius: '50%', bgcolor: GOLD_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AddBusiness sx={{ fontSize: 18, color: GOLD }} />
                </Box>
                <Box>
                  <Typography sx={{ color: KAVIAR_BLACK, fontWeight: 600, fontSize: 13 }}>Indicar Parceiro</Typography>
                  <Typography sx={{ color: TEXT_GRAY, fontSize: 11 }}>Cadastrar parceiro territorial para análise</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card role="button" tabIndex={0} onClick={() => setOperatorDialog(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOperatorDialog(true); } }} sx={{ bgcolor: '#fff', border: '1px solid rgba(201,154,22,0.25)', borderRadius: 3, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', '&:hover': { borderColor: GOLD_LIVE, transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(201,154,22,0.12)' }, '&:focus-visible': { outline: '3px solid rgba(224,179,36,0.45)', outlineOffset: '2px', borderColor: GOLD_LIVE }, transition: 'all 0.2s' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.75, px: 2.5 }}>
                <Box sx={{ width: 38, height: 38, borderRadius: '50%', bgcolor: GOLD_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <GroupAdd sx={{ fontSize: 18, color: GOLD }} />
                </Box>
                <Box>
                  <Typography sx={{ color: KAVIAR_BLACK, fontWeight: 600, fontSize: 13 }}>Indicar Associação</Typography>
                  <Typography sx={{ color: TEXT_GRAY, fontSize: 11 }}>Cadastrar associação/entidade para análise</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Drafts list */}
        {drafts && (drafts.partners?.length > 0 || drafts.operators?.length > 0) && (
          <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid rgba(201,154,22,0.25)', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, color: TEXT_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5 }}>Meus Cadastros Pendentes</Typography>
              {drafts.partners?.map(p => (
                <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75, borderBottom: '1px solid #F3F4F6' }}>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: KAVIAR_BLACK }}>{p.name}</Typography>
                    <Typography sx={{ fontSize: 11, color: TEXT_GRAY }}>{p.responsible_name} • {p.partner_type}</Typography>
                  </Box>
                  <Chip label="Parceiro" size="small" sx={{ bgcolor: `${GOLD}18`, color: GOLD, fontSize: 10, height: 22 }} />
                </Box>
              ))}
              {drafts.operators?.map(o => (
                <Box key={o.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75, borderBottom: '1px solid #F3F4F6' }}>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: KAVIAR_BLACK }}>{o.organization_name}</Typography>
                    <Typography sx={{ fontSize: 11, color: TEXT_GRAY }}>{o.responsible_name} • {o.responsible_role}</Typography>
                  </Box>
                  <Chip label="Associação" size="small" sx={{ bgcolor: 'rgba(46,148,184,0.1)', color: '#2E94B8', fontSize: 10, height: 22 }} />
                </Box>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <Box sx={{ textAlign: 'center', pt: 2, borderTop: '1px solid rgba(201,154,22,0.2)' }}>
          <Typography sx={{ color: TEXT_GRAY, fontSize: 10 }}>
            KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA — CNPJ 67.783.601/0001-99
          </Typography>
          <Typography sx={{ color: '#D1D5DB', fontSize: 9, mt: 0.5 }}>
            Gestor Territorial — acesso operacional restrito ao território vinculado
          </Typography>
        </Box>

        {/* Dialog: Parceiro */}
        <PartnerDraftDialog open={partnerDialog} onClose={() => setPartnerDialog(false)} headers={headers} onSuccess={(msg) => { setPartnerDialog(false); setSubmitMsg(msg); fetchData(); }} />

        {/* Dialog: Associação */}
        <OperatorDraftDialog open={operatorDialog} onClose={() => setOperatorDialog(false)} headers={headers} onSuccess={(msg) => { setOperatorDialog(false); setSubmitMsg(msg); fetchData(); }} />
      </Container>
    </Box>
  );
}

// ─── Partner Draft Dialog ────────────────────────────────────────────────────
function PartnerDraftDialog({ open, onClose, headers, onSuccess }) {
  const [form, setForm] = useState({ name: '', partner_type: 'association', responsible_name: '', responsible_role: '', phone: '', email: '', address: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.responsible_name.trim()) { setErr('Nome do parceiro e responsável são obrigatórios'); return; }
    setSubmitting(true); setErr('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/manager/partners/draft`, { method: 'POST', headers, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok || !data.success) { setErr(data.error || 'Erro ao enviar'); return; }
      setForm({ name: '', partner_type: 'association', responsible_name: '', responsible_role: '', phone: '', email: '', address: '', notes: '' });
      onSuccess('Parceiro cadastrado para análise da central KAVIAR.');
    } catch { setErr('Erro de conexão'); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Indicar Parceiro para Análise</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Typography sx={{ fontSize: 12, color: '#6B7280', mb: 2 }}>O cadastro será enviado para revisão da central KAVIAR. O território será atribuído automaticamente.</Typography>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Grid container spacing={1.5}>
          <Grid item xs={12}><TextField fullWidth size="small" label="Nome do parceiro *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" select label="Tipo" value={form.partner_type} onChange={e => setForm(f => ({ ...f, partner_type: e.target.value }))}>{PARTNER_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Cargo do responsável" value={form.responsible_role} onChange={e => setForm(f => ({ ...f, responsible_role: e.target.value }))} /></Grid>
          <Grid item xs={12}><TextField fullWidth size="small" label="Nome do responsável *" value={form.responsible_name} onChange={e => setForm(f => ({ ...f, responsible_name: e.target.value }))} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Telefone/WhatsApp" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Grid>
          <Grid item xs={12}><TextField fullWidth size="small" label="Endereço / Bairro" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></Grid>
          <Grid item xs={12}><TextField fullWidth size="small" label="Observação" multiline rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: '#6B7280' }}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={submitting} variant="contained" sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#9A7A24' } }}>
          {submitting ? 'Enviando...' : 'Enviar para Análise'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Operator Draft Dialog ───────────────────────────────────────────────────
function OperatorDraftDialog({ open, onClose, headers, onSuccess }) {
  const [form, setForm] = useState({ organization_name: '', responsible_name: '', responsible_role: '', phone: '', email: '', neighborhood: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async () => {
    if (!form.organization_name.trim() || !form.responsible_name.trim() || !form.responsible_role.trim()) { setErr('Nome da entidade, responsável e cargo são obrigatórios'); return; }
    setSubmitting(true); setErr('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/manager/operators/draft`, { method: 'POST', headers, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok || !data.success) { setErr(data.error || 'Erro ao enviar'); return; }
      setForm({ organization_name: '', responsible_name: '', responsible_role: '', phone: '', email: '', neighborhood: '', notes: '' });
      onSuccess('Associação/entidade cadastrada para análise da central KAVIAR.');
    } catch { setErr('Erro de conexão'); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Indicar Associação/Entidade para Análise</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Typography sx={{ fontSize: 12, color: '#6B7280', mb: 2 }}>O cadastro será enviado para revisão da central KAVIAR. A cidade será atribuída automaticamente pelo seu território.</Typography>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Grid container spacing={1.5}>
          <Grid item xs={12}><TextField fullWidth size="small" label="Nome da associação/entidade *" value={form.organization_name} onChange={e => setForm(f => ({ ...f, organization_name: e.target.value }))} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Nome do responsável *" value={form.responsible_name} onChange={e => setForm(f => ({ ...f, responsible_name: e.target.value }))} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Cargo/Função *" value={form.responsible_role} onChange={e => setForm(f => ({ ...f, responsible_role: e.target.value }))} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Telefone/WhatsApp" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Grid>
          <Grid item xs={12}><TextField fullWidth size="small" label="Bairro / Localidade" value={form.neighborhood} onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))} /></Grid>
          <Grid item xs={12}><TextField fullWidth size="small" label="Observação" multiline rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: '#6B7280' }}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={submitting} variant="contained" sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#9A7A24' } }}>
          {submitting ? 'Enviando...' : 'Enviar para Análise'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Referral Links Card ─────────────────────────────────────────────────────
function ReferralLinksCard({ referral, error, adminName, loading }) {
  if (loading) return null;

  const rawCode = referral?.referral_code;
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';

  if (!code) {
    return (
      <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid rgba(201,154,22,0.25)', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <CardContent sx={{ p: 2 }}>
          <Typography sx={{ fontSize: 10, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>Links de indicação KAVIAR</Typography>
          <Typography sx={{ fontSize: 12, color: '#DC2626' }}>{error || (referral?.has_code === false ? (referral.message || 'Ainda não há código de indicação cadastrado. Procure a central KAVIAR.') : 'Não foi possível confirmar o código de indicação. Procure a central KAVIAR.')}</Typography>
        </CardContent>
      </Card>
    );
  }

  const links = [
    { label: 'Motoristas', url: `https://kaviar.com.br/motorista?ref=${code}` },
    { label: 'Passageiros', url: `https://kaviar.com.br/passageiro?ref=${code}` },
  ];

  const copyToClipboard = async (text) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch (error) {
      console.warn('Não foi possível copiar link', error);
    }
  };

  return (
    <Card sx={{ mb: 3, bgcolor: '#fff', border: '1px solid rgba(201,154,22,0.25)', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <CardContent sx={{ p: 2 }}>
        <Typography sx={{ fontSize: 10, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.5 }}>Links de indicação KAVIAR</Typography>
        <Typography sx={{ fontSize: 12, color: '#090A0F', mb: 1.5 }}>{adminName || 'Gestor'} — Código: <b style={{ fontFamily: 'monospace', color: '#C99A16' }}>{code}</b></Typography>
        {links.map(link => (
          <Box key={link.label} sx={{ mb: 1.5, p: 1.5, bgcolor: '#FFF7DF', borderRadius: 2 }}>
            <Typography sx={{ fontSize: 11, color: '#667085', fontWeight: 600, mb: 0.5 }}>Link para {link.label}</Typography>
            <Typography sx={{ fontSize: 11, color: '#090A0F', fontFamily: 'monospace', wordBreak: 'break-all', mb: 1 }}>{link.url}</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" onClick={() => copyToClipboard(link.url)} sx={{ fontSize: 11, color: '#C99A16', textTransform: 'none' }}>📋 Copiar</Button>
              <Button size="small" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(link.url)}`, '_blank')} sx={{ fontSize: 11, color: '#25D366', textTransform: 'none' }}>💬 WhatsApp</Button>
            </Box>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}
