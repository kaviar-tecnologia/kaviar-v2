import { Routes, Route, Link, Navigate } from "react-router-dom";
import { API_BASE_URL } from '../../config/api';
import { Container, Typography, Box, Card, CardContent, Button, Grid, Chip, Alert, CircularProgress, ToggleButton, ToggleButtonGroup, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Tab, TextField } from "@mui/material";
import { AdminPanelSettings, Dashboard, Group, Analytics, DirectionsCar, Security, PersonAdd, Tour, People, LocationCity, Elderly, PendingActions, CheckCircle, Map, Shield, CreditCard, ChatBubble, Apartment, GridOn, DriveEta, Person, Explore, Lock, Flight, Star, Storefront, BarChart, Handshake, CardGiftcard, Paid, SupportAgent, Public, Pets, Science, Description, MarkEmailRead, Assessment, Business, SmartToy } from "@mui/icons-material";
import { ProtectedAdminRoute } from "./ProtectedAdminRoute";
import AdminLogin from "./AdminLogin";
import AdminErrorBoundary from "./AdminErrorBoundary";
import DomainHeader from "../common/DomainHeader";
import FeatureFlags from "../../pages/admin/FeatureFlags";
import PricingProfiles from "../../pages/admin/PricingProfiles";
import TerritoryPriceFloors from "../../pages/admin/TerritoryPriceFloors";
import ManagerPriceFloors from "../../pages/admin/ManagerPriceFloors";
import CreditPackagesAdmin from "../../pages/admin/CreditPackagesAdmin";
import WomenPreferenceAudit from "../../pages/admin/WomenPreferenceAudit";
import RideSimulator from "../../pages/admin/RideSimulator";
// import BetaMonitor from "../../pages/admin/BetaMonitor"; // HIBERNADO — reaproveitável
import OperationsMonitor from "../../pages/admin/OperationsMonitor";
import ExecutiveOperations from "../../pages/admin/ExecutiveOperations";
import EmergencyEvents from "../../pages/admin/EmergencyEvents";
import MatchMonitor from "../../pages/admin/MatchMonitor";
import CommunitiesManagement from "../../pages/admin/CommunitiesManagement";
import NeighborhoodsManagement from "../../pages/admin/NeighborhoodsManagement";
import NeighborhoodsByCity from "../../pages/admin/NeighborhoodsByCity";
import DriversManagement from "../../pages/admin/DriversManagement";
import { RatingsOverviewCard } from "./RatingsOverviewCard";
import PassengersManagement from "../../pages/admin/PassengersManagement";
import PassengerDetail from "../../pages/admin/PassengerDetail";
import GuidesManagement from "../../pages/admin/GuidesManagement";
import GeofenceManagement from "../../pages/admin/GeofenceManagement";
import BonusMetrics from "../../pages/admin/BonusMetrics";
import KaviarLab from "../../pages/admin/KaviarLab";
import DriverApproval from "../../pages/admin/DriverApproval";
import ModalityApproval from "../../pages/admin/ModalityApproval";
import DriversList from "../../pages/admin/DriversList";
import DriverDetail from "../../pages/admin/DriverDetail";
import { RideList, RideDetail, RideAudit } from "../../pages/admin/rides";
import TourPackages from "../../pages/admin/premium-tourism/TourPackages";
import TourBookings from "../../pages/admin/premium-tourism/TourBookings";
import RatingsPage from "../../pages/admin/ratings/RatingsPage";
import CompensationsPage from "../../pages/admin/CompensationsPage";
import LocalSupportDrivers from "../../pages/admin/LocalSupportDrivers";
import VitrineLocalList from "../../pages/admin/vitrine-local/VitrineLocalList";
import VitrineLocalForm from "../../pages/admin/vitrine-local/VitrineLocalForm";
import TourPackageForm from "../../pages/admin/premium-tourism/TourPackageForm";
import TourPartners from "../../pages/admin/premium-tourism/TourPartners";
import TourReports from "../../pages/admin/premium-tourism/TourReports";
import TourSettings from "../../pages/admin/premium-tourism/TourSettings";
import ChangePassword from "../../pages/admin/ChangePassword";
import WhatsAppCentral from "../../pages/admin/WhatsAppCentral";
import ForgotPassword from "../../pages/admin/ForgotPassword";
import InvestorInvites from "../../pages/admin/InvestorInvites";
import InvestorVision from "../../pages/admin/InvestorVision";
import ConsultantLeads from "../../pages/admin/ConsultantLeads";
import DriverCityLandingsPage from "../../pages/admin/DriverCityLandingsPage";
import LeadPerformance from "../../pages/admin/LeadPerformance";
import LocalOperators from "../../pages/admin/LocalOperators";
import TerritorialPartners from "../../pages/admin/TerritorialPartners";
import PrivateRides from "../../pages/admin/PrivateRides";
import StaffManagement from "../../pages/admin/StaffManagement";
import AuditLogs from "../../pages/admin/AuditLogs";
import ReferralManagement from "../../pages/admin/ReferralManagement";
import FinancePayments from "../../pages/admin/FinancePayments";
import FinanceiroPage from "../../pages/admin/FinanceiroPage";
import FinanceRecognitionPoliciesPage from "../../pages/admin/FinanceRecognitionPoliciesPage";
import AccountantReportPage from "../../pages/admin/AccountantReportPage";
import FinanceTransactionsPage from "../../pages/admin/FinanceTransactionsPage";
import FinancePayablesPage from "../../pages/admin/FinancePayablesPage";
import TerritoriesPage from "../../pages/admin/TerritoriesPage";
import TerritoryDetailPage from "../../pages/admin/TerritoryDetailPage";
import RegionalAdminsPage from "../../pages/admin/RegionalAdminsPage";
import TerritorialPayoutsPage from "../../pages/admin/TerritorialPayoutsPage";
import LegalCompliancePage from "../../pages/admin/LegalCompliancePage";
import ComercialGestorPage from "../../pages/admin/ComercialGestorPage";
import CrmPage from "../../pages/admin/CrmPage";
import RegulatoryConsultationPage from "../../pages/admin/RegulatoryConsultationPage";
import RegulatoryCitiesPage from "../../pages/admin/RegulatoryCitiesPage";
import InsuranceCoveragesPage from "../../pages/admin/InsuranceCoveragesPage";
import CommerceAccountsPage from "../../pages/admin/CommerceAccountsPage";
import MyContractPage from "../../pages/admin/MyContractPage";
import ManagerFinance from "../../pages/admin/ManagerFinance";
import ManagerTeamPage from "../../pages/admin/ManagerTeamPage";
import ManagerReputation from "../../pages/admin/ManagerReputation";
import ManagerReferrals from "../../pages/admin/ManagerReferrals";
import ManagerEmergencyAlerts from "../../pages/admin/ManagerEmergencyAlerts";
import ManagerWomenCoverage from "../../pages/admin/ManagerWomenCoverage";
import InvestorsPage from "../../pages/admin/InvestorsPage";
import EmailTestingPage from "../../pages/admin/EmailTestingPage";
import InstitutionalInboxPage from "../../pages/admin/InstitutionalInboxPage";
import GroupsManagement from "../../pages/admin/GroupsManagement";
import AdminFixedRoutes from "../../pages/admin/AdminFixedRoutes";
import PetCentral from "../../pages/admin/PetCentral";
import PetOperators from "../../pages/admin/PetOperators";
import PetHomologations from "../../pages/admin/PetHomologations";
import PetHomologationDetail from "../../pages/admin/PetHomologationDetail";
import OperatorHome from "../../pages/admin/OperatorHome";
import ManagerHome from "../../pages/admin/ManagerHome";
import AccountingPortalPage from "../../pages/admin/accounting/AccountingPortalPage";
import KaviarAiPage from "../../pages/admin/KaviarAiPage";
import kaviarLogo from "../../assets/logo-kaviar-full.svg";
import { useState, useEffect } from 'react';

function FinanceHomeRedirect() {
  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;
  if (admin?.role === 'FINANCE') return <Navigate to="/admin/financeiro" replace />;
  if (admin?.role === 'EXECUTIVE_ADMIN') return <Navigate to="/admin/chat-kaviar" replace />;
  if (admin?.role === 'TERRITORIAL_OPERATOR') return <OperatorHome />;
  if (admin?.role === 'TERRITORIAL_MANAGER') return <ManagerHome />;
  if (['PET_OPERATOR', 'PET_SUPERVISOR', 'PET_ADMIN'].includes(admin?.role)) return <Navigate to="/admin/pet" replace />;
  return <AdminHome />;
}


function AdminHeader() {
  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;
  const isAngelViewer = admin?.role === 'ANGEL_VIEWER';
  
  const handleLogout = () => {
    localStorage.removeItem('kaviar_admin_token');
    localStorage.removeItem('kaviar_admin_data');
    window.location.href = '/admin/login';
  };
  
  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      mb: 3,
      p: 2,
      bgcolor: '#FFFFFF',
      borderRadius: 2,
      border: '1px solid #E8E5DE',
      borderTop: '3px solid #B8942E',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Typography variant="h6" sx={{ color: '#1A1A1A', fontWeight: 700 }}>
          <span style={{ color: '#B8942E' }}>KAVIAR</span> Admin — {admin?.name || 'Usuário'}
        </Typography>
        <Typography sx={{ color: '#9CA3AF', fontSize: 10, mt: 0.2 }}>KAVIAR — Rio de Janeiro/RJ — Atendimento digital</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
          <Chip label={admin?.role || 'ADMIN'} size="small" sx={{ fontSize: 10, height: 20, bgcolor: 'rgba(184,148,46,0.08)', color: '#B8942E', fontWeight: 600 }} />
          {isAngelViewer && (
            <Chip 
              label="👁️ Modo Leitura" 
              size="small"
              sx={{ 
                bgcolor: '#FFF3E0', 
                color: '#E65100',
                fontWeight: 'bold',
                border: '1px solid #FFE0B2'
              }} 
            />
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative', zIndex: 1 }}>
        <img src={kaviarLogo} alt="KAVIAR" style={{ height: 48, opacity: 1 }} />
        <Button 
          onClick={handleLogout} 
          variant="outlined"
          size="small"
          sx={{
            borderColor: '#E8E5DE',
            color: '#6B7280',
            '&:hover': {
              borderColor: '#B8942E',
              color: '#B8942E',
              bgcolor: 'rgba(184,148,46,0.04)'
            }
          }}
        >
          Sair
        </Button>
      </Box>
    </Box>
  );
}

function AdminHome() {
  const [dashboardData, setDashboardData] = useState(null);
  const [territoryData, setTerritoryData] = useState(null);
  const [opsPeriod, setOpsPeriod] = useState('today');
  const [opsData, setOpsData] = useState(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';
  const canAccessFinance = ['SUPER_ADMIN', 'FINANCE'].includes(admin?.role);
  const canAccessOperations = ['SUPER_ADMIN', 'OPERATOR', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR'].includes(admin?.role);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchModules, setSearchModules] = useState('');
  const [filterSection, setFilterSection] = useState('Todos');

  useEffect(() => {
    fetchDashboardData();
    fetchTerritoryData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = localStorage.getItem('kaviar_admin_token');
      if (!token) {
        throw new Error('Token não encontrado');
      }

      // Buscar dados do dashboard
      const [driversResponse, guidesResponse, neighborhoodsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/drivers`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/api/admin/guides`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/api/neighborhoods`)
      ]);

      // Se 401, mostrar erro no dashboard (ProtectedAdminRoute cuida do redirect real)
      if (driversResponse.status === 401 || guidesResponse.status === 401) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const driversData = await driversResponse.json();
      const guidesData = await guidesResponse.json();
      const neighborhoodsData = await neighborhoodsResponse.json();

      // Calcular estatísticas
      const drivers = driversData.success ? driversData.data : [];
      const guides = guidesData.success ? guidesData.data : [];
      const neighborhoods = neighborhoodsData.success ? neighborhoodsData.data : [];

      const stats = {
        totalDrivers: drivers.length,
        totalGuides: guides.length,
        totalPassengers: 0, // Endpoint não existe
        totalNeighborhoods: neighborhoods.length
      };

      const pending = {
        drivers: drivers.filter(d => d.status === 'pending').length,
        guides: guides.filter(g => g.status === 'pending').length,
        passengers: 0
      };

      setDashboardData({ stats, pending });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(error.message || 'Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchTerritoryData = async () => {
    try {
      const token = localStorage.getItem('kaviar_admin_token');
      const res = await fetch(`${API_BASE_URL}/api/admin/dashboard/territory`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setTerritoryData(data.data);
    } catch {}
  };

  const fetchOpsData = async (period) => {
    setOpsLoading(true);
    try {
      const token = localStorage.getItem('kaviar_admin_token');
      const res = await fetch(`${API_BASE_URL}/api/admin/dashboard/operations?period=${period}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setOpsData(json.data);
    } catch {}
    finally { setOpsLoading(false); }
  };

  useEffect(() => { fetchOpsData(opsPeriod); }, [opsPeriod]);

  const { stats = {}, pending = {} } = dashboardData || {};

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <AdminHeader />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress sx={{ color: '#B8942E', mb: 2 }} />
            <Typography variant="h6" sx={{ color: '#6B7280' }}>
              Carregando painel administrativo...
            </Typography>
          </Box>
        </Box>
      </Container>
    );
  }

  return (
    <Box sx={{ background: 'radial-gradient(circle at top right, rgba(0,166,90,0.035), transparent 34%), radial-gradient(circle at top left, rgba(184,148,46,0.035), transparent 30%), linear-gradient(180deg, #FAFAF8 0%, #F5F5F1 100%)', minHeight: '100vh', pt: 1, position: 'relative' }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 280, background: 'radial-gradient(ellipse at top center, rgba(184,148,46,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
    <Container maxWidth="lg" sx={{ mt: 3, pb: 6, position: 'relative', zIndex: 1 }}>
      <AdminHeader />
      
      {/* Header compacto */}
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.3 }}>Painel Administrativo</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.3px' }}>KAVIAR Dashboard</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {['ANGEL_VIEWER', 'INVESTOR_VIEW'].includes(admin?.role) && (
        <Card sx={{ mb: 3, bgcolor: '#FFFFFF', border: '1px solid #E8E5DE', cursor: 'pointer', borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', '&:hover': { borderColor: '#B8942E', boxShadow: '0 2px 8px rgba(184,148,46,0.1)' } }}
          onClick={() => window.location.href = '/admin/visao'}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
            <Box>
              <Typography sx={{ color: '#1A1A1A', fontWeight: 700, fontSize: 15 }}>Visão do Projeto</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 12, mt: 0.3 }}>Visão estratégica, modelo e potencial de expansão</Typography>
            </Box>
            <Typography sx={{ color: '#B8942E', fontSize: 20 }}>→</Typography>
          </CardContent>
        </Card>
      )}

      {admin?.role === 'ANGEL_VIEWER' && (
        <Card sx={{ mb: 3, bgcolor: '#FFFFFF', border: '1px solid #E8E5DE', cursor: 'pointer', borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', '&:hover': { borderColor: '#B8942E', boxShadow: '0 2px 8px rgba(184,148,46,0.1)' } }}
          onClick={() => window.location.href = '/admin/meu-contrato'}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
            <Box>
              <Typography sx={{ color: '#1A1A1A', fontWeight: 700, fontSize: 15 }}>📋 Meu Contrato</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 12, mt: 0.3 }}>Visualizar contrato, termos e status</Typography>
            </Box>
            <Typography sx={{ color: '#B8942E', fontSize: 20 }}>→</Typography>
          </CardContent>
        </Card>
      )}

      {/* ── KPIs + Aprovações ── */}
      {!loading && dashboardData && (
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {/* KPIs */}
          {[
            { icon: <People sx={{ fontSize: 20, color: '#B8942E' }} />, value: stats.totalPassengers || 0, label: 'Passageiros' },
            { icon: <DirectionsCar sx={{ fontSize: 20, color: '#B8942E' }} />, value: stats.totalDrivers || 0, label: 'Motoristas' },
            { icon: <LocationCity sx={{ fontSize: 20, color: '#B8942E' }} />, value: stats.totalNeighborhoods || 0, label: 'Bairros' },
            { icon: <Tour sx={{ fontSize: 20, color: '#B8942E' }} />, value: stats.totalGuides || 0, label: 'Guias' },
          ].map(k => (
            <Grid item xs={6} sm={3} key={k.label}>
              <Card sx={{ background: 'linear-gradient(135deg, #FFFDF7 0%, #FFFFFF 100%)', borderTop: '3px solid #B8942E', border: '1px solid #E8E5DE', borderRadius: 2, boxShadow: '0 2px 8px rgba(184,148,46,0.06)' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5, px: 1.5 }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: 'rgba(184,148,46,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                    {k.icon}
                  </Box>
                  <Typography sx={{ color: '#1A1A1A', fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>{k.value}</Typography>
                  <Typography sx={{ color: '#6B7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', mt: 0.5 }}>{k.label}</Typography>
                  <Typography sx={{ color: '#9CA3AF', fontSize: 9, mt: 0.2 }}>Total cadastrado</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}

          {/* Aprovações inline */}
          {[
            { value: pending.drivers || 0, label: 'Motoristas pendentes', to: '/admin/drivers/approval', active: pending.drivers > 0 },
            { value: 0, label: 'Modalidades pendentes', to: '/admin/modality-approval', active: true },
            { value: pending.passengers || 0, label: 'Passageiros pendentes', to: '/admin/passengers?status=pending', active: pending.passengers > 0 },
            { value: pending.guides || 0, label: 'Guias pendentes', to: '/admin/guides?status=pending', active: pending.guides > 0 },
          ].map(p => (
            <Grid item xs={4} key={p.label}>
              <Card component={p.active ? Link : 'div'} to={p.active ? p.to : undefined} sx={{ bgcolor: p.active ? '#FFFBEB' : '#F9FAFB', borderLeft: `4px solid ${p.active ? '#D97706' : '#E5E7EB'}`, border: '1px solid #E8E5DE', borderRadius: 2, textDecoration: 'none', transition: 'all 0.2s', boxShadow: 'none', ...(p.active && { '&:hover': { borderLeftColor: '#B45309', transform: 'translateY(-1px)', boxShadow: '0 3px 8px rgba(217,119,6,0.12)' } }) }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, px: 2 }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: p.active ? 'rgba(217,119,6,0.1)' : '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ color: p.active ? '#D97706' : '#D1D5DB', fontSize: 16, fontWeight: 800 }}>{p.value}</Typography>
                  </Box>
                  <Typography sx={{ color: p.active ? '#92400E' : '#9CA3AF', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{p.label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* ── Operações + Avaliações lado a lado ── */}
      <Grid container spacing={2} sx={{ mb: 3, alignItems: 'flex-start' }}>
        {/* Operações */}
        <Grid item xs={12} md={7}>
          {territoryData && territoryData.total > 0 && (
            <Card sx={{ background: 'linear-gradient(135deg, #FAFAF8 0%, #FFFFFF 100%)', border: '1px solid #E8E5DE', borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography sx={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Painel Executivo</Typography>
                    <Typography sx={{ fontWeight: 700, color: '#1A1A1A', fontSize: 16 }}>Operações</Typography>
                  </Box>
                  <Button component={Link} to="/admin/executive-operations" size="small" sx={{ bgcolor: '#B8942E', color: '#fff', fontSize: 11, fontWeight: 600, px: 2, '&:hover': { bgcolor: '#9A7B24' } }}>
                    Abrir →
                  </Button>
                </Box>
                <Grid container spacing={1}>
                  {[
                    { symbol: '⌂', value: territoryData.homebound, label: 'Retorno', accent: '#16A34A' },
                    { symbol: '●', value: territoryData.local, label: 'Local', accent: '#1A1A1A' },
                    { symbol: '◎', value: territoryData.adjacent, label: 'Vizinho', accent: '#6B7280' },
                    { symbol: '○', value: territoryData.external, label: 'Externo', accent: '#9CA3AF' },
                    { symbol: '∑', value: territoryData.total, label: 'Total', accent: '#B8942E' },
                  ].map((t, i) => (
                    <Grid item xs key={i}>
                      <Box sx={{ textAlign: 'center', py: 1, px: 0.5, bgcolor: `${t.accent}08`, borderRadius: 1.5 }}>
                        <Typography sx={{ color: t.accent, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{t.value}</Typography>
                        <Typography sx={{ color: t.accent, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', mt: 0.3, opacity: 0.8 }}>{t.label}</Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
                {opsData && (
                  <Box sx={{ display: 'flex', gap: 2, mt: 1.5, pt: 1.5, borderTop: '1px solid #F3F4F6', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Corridas hoje', value: opsData.rides?.completed },
                      { label: 'Bruto', value: opsData.financials?.gross_total != null ? `R$\u00a0${Number(opsData.financials.gross_total).toFixed(0)}` : '—' },
                      { label: 'Créditos', value: opsData.financials?.credits_consumed },
                      { label: 'Espera', value: opsData.wait?.total_minutes != null ? `${opsData.wait.total_minutes}m` : '—' },
                    ].map(s => (
                      <Box key={s.label}>
                        <Typography sx={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{s.value ?? '—'}</Typography>
                        <Typography sx={{ color: '#9CA3AF', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.03em', mt: 0.2 }}>{s.label}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Avaliações */}
        <Grid item xs={12} md={5}>
          <RatingsOverviewCard compact linkTo="/admin/ratings" />
        </Grid>
      </Grid>

      {/* Atalhos de Gerenciamento */}
      <Box sx={{ mb: 4 }}>
        {(() => {
          const SECTION_COLORS = { 'Operação': '#D97706', 'Pessoas e Território': '#2563EB', 'Comercial': '#059669', 'Financeiro': '#7C3AED', 'Governança e Estratégia': '#DC2626' };
          const sections = [
            { section: 'Operação', items: [
              { Icon: DirectionsCar, title: 'Corridas', desc: 'Gestão operacional de corridas', to: '/admin/rides' },
              { Icon: CreditCard, title: 'Histórico de Recargas', desc: 'Purchases, webhooks e saldos', to: '/admin/credit-purchases' },
              { Icon: ChatBubble, title: 'Central WhatsApp', desc: 'Atendimento, contexto e operação', to: '/admin/whatsapp' },
              ...(isSuperAdmin ? [
                { Icon: MarkEmailRead, title: 'Central de E-mails Institucionais', desc: 'Receba, consulte, responda e envie mensagens pelos e-mails oficiais da KAVIAR.', to: '/admin/inbox', actionLabel: 'Abrir central de e-mails' },
                { Icon: LocationCity, title: 'Regulatório por Cidade', desc: 'Acompanhar cadastro, protocolo e autorizações municipais da KAVIAR.', to: '/admin/regulatorio', actionLabel: 'Abrir regulatório' },
              ] : []),
              ...(canAccessOperations ? [
                { Icon: BarChart, title: 'Cockpit Operacional', desc: 'Acompanhe corridas, motoristas, territórios e histórico do dia em tempo real.', to: '/admin/operations', actionLabel: 'Abrir cockpit' },
              ] : []),
              { Icon: Paid, title: 'Compensações', desc: 'Apoio ao motorista em cancelamentos', to: '/admin/compensations' },
              { Icon: Star, title: 'Avaliações', desc: 'Notas, comentários e atenção', to: '/admin/ratings' },
              ...(isSuperAdmin ? [
                { Icon: Explore, title: 'Simulador de Corrida', desc: 'Teste origem/destino, preço e ganho', to: '/admin/ride-simulator' },
                { Icon: Shield, title: 'Incidentes de Emergência', desc: 'Cofre de evidência e proteção', to: '/admin/emergency-events' },
              ] : []),
            ]},
            { section: 'Pessoas e Território', items: [
              { Icon: Group, title: 'Grupos KAVIAR', desc: 'Criar grupos, convites e acompanhar membros', to: '/admin/groups' },
              { Icon: DirectionsCar, title: 'Corridas Compartilhadas', desc: 'Visão operacional, reservas e ciclo de vida', to: '/admin/fixed-routes' },
              { Icon: DriveEta, title: 'Motoristas', desc: 'Gerenciar motoristas', to: '/admin/drivers' },
              { Icon: People, title: 'Passageiros', desc: 'Gerenciar passageiros', to: '/admin/passengers' },
              { Icon: Explore, title: 'Guias Turísticos', desc: 'Gerenciar guias', to: '/admin/guides' },
              { Icon: Apartment, title: 'Comunidades', desc: 'Gestão de comunidades e ativação', to: '/admin/communities' },
              { Icon: Map, title: 'Bairros', desc: 'Gestão de bairros administrativos', to: '/admin/neighborhoods' },
              ...(isSuperAdmin ? [
                { Icon: GridOn, title: 'Geofences', desc: 'Revisão e validação de geofences', to: '/admin/geofences' },
                { Icon: Public, title: 'Territórios', desc: 'Gestão de territórios operacionais', to: '/admin/territories' },
                { Icon: PersonAdd, title: 'Operadores Territoriais', desc: 'Gestão de operadores territoriais', to: '/admin/regional-admins' },
              ] : []),
              { Icon: Apartment, title: 'Associações / Operadores', desc: 'Associações e lideranças locais', to: '/admin/local-operators' },
            ]},
            { section: 'Comercial', items: [
              { Icon: Handshake, title: 'Interessados Consultor', desc: 'Leads, performance e equipe', to: '/admin/consultant-leads' },
              { Icon: Handshake, title: 'Parceiros Territoriais', desc: 'Comissão por corridas de motoristas vinculados', to: '/admin/territorial-partners' },
              { Icon: Handshake, title: 'KAVIAR Particular', desc: 'Solicitações de motorista reservado', to: '/admin/private-rides' },
              { Icon: SupportAgent, title: 'Apoio Local', desc: 'Motoristas parceiros de apoio local', to: '/admin/local-support' },
              { Icon: Storefront, title: 'Comércios — KAVIAR Local', desc: 'Cadastro de comércios que aparecem no app passageiro', to: '/admin/vitrine-local' },
              { Icon: Flight, title: 'Premium Tourism', desc: 'Pacotes e reservas turísticas', to: '/admin/premium-tourism/packages' },
              { Icon: Pets, title: 'KAVIAR Pet', desc: 'Central pet, homologações e operadores', to: '/admin/pet' },
              { Icon: Analytics, title: 'CRM KAVIAR', desc: 'Leads, prospecção e comércios locais', to: '/admin/crm' },
              { Icon: Description, title: 'Consulta Regulatória Municipal', desc: 'Documento institucional + envio WhatsApp via template Twilio', to: '/admin/regulatory-consultation' },
              { Icon: Shield, title: 'Seguro APP e Coberturas', desc: 'Readiness interno por modalidade, território e vigência', to: '/admin/insurance-coverages' },
              ...(isSuperAdmin ? [{ Icon: Storefront, title: 'Comércios — Admin', desc: 'Financeiro, portal e ativações avançadas', to: '/admin/commerce' }] : []),
              ...(isSuperAdmin ? [{ Icon: Public, title: 'Landing de Motoristas', desc: 'Gerenciar cidades e landing de captação', to: '/admin/driver-city-landings' }] : []),
            ]},
            { section: 'Financeiro', items: [
              ...(canAccessFinance ? [
                { Icon: SmartToy, title: 'Chat KAVIAR', desc: 'Assistente operacional — consulta corridas, documentos e finanças.', to: '/admin/chat-kaviar' },
                { Icon: Paid, title: 'Painel Financeiro Administrativo', desc: 'Contas, categorias e centros de custo em leitura', to: '/admin/financeiro' },
                { Icon: Description, title: 'Políticas financeiras', desc: 'Classificação, escopo, vigência e estado das regras de reconhecimento.', to: '/admin/financeiro/politicas' },
                { Icon: Assessment, title: 'Área do Contador', desc: 'Relatório de corridas, receita e exportação CSV — somente leitura.', to: '/admin/financeiro/contador' },
                { Icon: Paid, title: 'Lançamentos Manuais', desc: 'Despesas, receitas e obrigações cadastradas manualmente.', to: '/admin/financeiro/lancamentos' },
                { Icon: Paid, title: 'Contas a Pagar', desc: 'Gratificação anual e repasses de gestores.', to: '/admin/financeiro/contas-a-pagar' },
              ] : []),
              ...(isSuperAdmin ? [
                { Icon: Business, title: 'Portal do Contador', desc: 'Empresas, escritórios, contadores e vínculos.', to: '/admin/portal-contador' },
                { Icon: Paid, title: 'Preços e Taxas', desc: 'Ajuste preços, taxas e adicionais', to: '/admin/pricing' },
                { Icon: Paid, title: 'Tabela Territorial', desc: 'Pisos mínimos por rota e território', to: '/admin/territory-floors' },
                { Icon: Paid, title: 'Pacotes de Saldo', desc: 'Gerenciar pacotes de recarga do motorista', to: '/admin/credit-packages' },
                { Icon: Paid, title: 'Repasses Territoriais', desc: 'Operadores e repasses manuais', to: '/admin/territorial-payouts' },
              ] : []),
            ]},
            { section: 'Governança e Estratégia', items: [
              ...(isSuperAdmin ? [
                { Icon: Lock, title: 'Auditoria', desc: 'Logs e ações administrativas', to: '/admin/audit' },
                { Icon: Shield, title: 'Conformidade', desc: 'Documentos jurídicos e operacionais', to: '/admin/legal-compliance' },
                { Icon: Science, title: 'KAVIAR Lab', desc: 'Inteligência territorial · Score de Maturidade', to: '/admin/lab' },
                { Icon: Person, title: 'Preferência por Motorista Mulher', desc: 'Participantes, consentimentos e auditoria', to: '/admin/women-preference' },
                { Icon: CardGiftcard, title: 'Convites Investidor/Anjo', desc: 'Enviar convites read-only', to: '/admin/investor-invites' },
                { Icon: Analytics, title: 'Pacote Investidores', desc: 'Material para investidores e anjos', to: '/admin/investidores' },
                { Icon: Description, title: 'Plano Gestor', desc: 'Documentos comerciais do gestor fundador', to: '/admin/comercial-gestor' },
              ] : []),
            ]},
          ];
          const filtered = sections.map(s => ({ ...s, items: s.items.filter(c => c.title.toLowerCase().includes(searchModules.toLowerCase()) || c.desc.toLowerCase().includes(searchModules.toLowerCase())) })).filter(s => (filterSection === 'Todos' || s.section === filterSection) && s.items.length > 0);
          return (
            <>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
                <TextField size="small" placeholder="Buscar módulo..." value={searchModules} onChange={e => setSearchModules(e.target.value)} sx={{ minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                {['Todos', 'Operação', 'Pessoas e Território', 'Comercial', 'Financeiro', 'Governança e Estratégia'].map(f => {
                  const chipColor = SECTION_COLORS[f] || '#B8942E';
                  return <Chip key={f} label={f} size="small" onClick={() => setFilterSection(f)} sx={{ fontWeight: 600, bgcolor: filterSection === f ? chipColor : '#fff', color: filterSection === f ? '#fff' : chipColor, border: `1px solid ${chipColor}${filterSection === f ? '' : '40'}`, cursor: 'pointer', '&:hover': { bgcolor: filterSection === f ? chipColor : `${chipColor}10` } }} />;
                })}
              </Box>
              {filtered.map(({ section, items }) => {
                const sColor = SECTION_COLORS[section] || '#B8942E';
                return (
                  <Box key={section} sx={{ mb: 3 }}>
                    <Typography sx={{ fontWeight: 700, color: sColor, fontSize: 15, mb: 1.5 }}>{section}</Typography>
                    <Grid container spacing={1.5}>
                      {items.map(c => (
                        <Grid item xs={12} sm={6} md={4} key={c.to}>
                          <Card sx={{ bgcolor: '#FFFFFF', borderTop: `3px solid ${sColor}`, border: '1px solid #E8E5DE', borderRadius: 2, height: '100%', transition: 'all 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}>
                            <CardContent sx={{ pt: 2, pb: 1.5, px: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, height: '100%' }}>
                              <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: `${sColor}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <c.Icon sx={{ fontSize: 20, color: sColor }} />
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ color: '#1A1A1A', fontWeight: 600, fontSize: 13 }}>{c.title}</Typography>
                                <Typography sx={{ color: '#6B7280', fontSize: 11, lineHeight: 1.4 }}>{c.desc}</Typography>
                              </Box>
                              <Button component={Link} to={c.to} size="small" sx={{ color: sColor, fontWeight: 600, fontSize: 11, minWidth: 'auto', px: 1.5, '&:hover': { bgcolor: `${sColor}10` } }}>{c.actionLabel || '→'}</Button>
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                );
              })}
            </>
          );
        })()}
      </Box>

      {/* Build Stamp */}
      <Box sx={{ mt: 4, pt: 2, borderTop: '1px solid #E8E5DE', textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
          Build: {__BUILD_HASH__} - {new Date(__BUILD_TIME__).toLocaleString('pt-BR')}
        </Typography>
      </Box>
    </Container>
    </Box>
  );
}

function ConsultantLeadsHub() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" sx={{ color: '#C8A84E', fontWeight: 800, mb: 2, letterSpacing: 1 }}>
        🤝 Interessados Consultor
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, '& .MuiTab-root': { color: '#999', fontWeight: 700, fontSize: 14 }, '& .Mui-selected': { color: '#C8A84E' }, '& .MuiTabs-indicator': { backgroundColor: '#C8A84E' } }}>
        <Tab label="Leads" />
        <Tab label="Performance" />
        <Tab label="Equipe" />
      </Tabs>
      {tab === 0 && <ConsultantLeads />}
      {tab === 1 && <LeadPerformance />}
      {tab === 2 && <ReferralManagement />}
    </Box>
  );
}

function AdminMetricsWrapper() {
  return (
    <Container maxWidth="lg" sx={{ mt: 2 }}>
      <AdminHeader />
      <DomainHeader 
        domain="admin" 
        title="Métricas A/B"
        breadcrumbs={["Métricas A/B"]}
        backUrl="/admin"
      />
      <BonusMetrics />
    </Container>
  );
}

function AdminElderlyWrapper() {
  return (
    <Container maxWidth="lg" sx={{ mt: 2 }}>
      <AdminHeader />
      <DomainHeader 
        domain="admin" 
        title="Acompanhamento Ativo"
        breadcrumbs={["Acompanhamento Ativo"]}
        backUrl="/admin"
      />
      <ElderlyManagement />
    </Container>
  );
}

function AdminCreditPurchasesWrapper() {
  return (
    <Container maxWidth="lg" sx={{ mt: 2 }}>
      <AdminHeader />
      <DomainHeader 
        domain="admin" 
        title="Pagamentos Legados"
        breadcrumbs={["Pagamentos Legados"]}
        backUrl="/admin"
      />
      <Card sx={{ bgcolor: '#111', border: '1px solid #333' }}>
        <CardContent>
          <Typography variant="h6" sx={{ color: '#FFD700', mb: 1 }}>Histórico removido</Typography>
          <Typography sx={{ color: '#ddd' }}>Os pagamentos legados foram removidos do painel.</Typography>
        </CardContent>
      </Card>
    </Container>
  );
}

export default function AdminApp() {
  return (
    <AdminErrorBoundary>
      <Box sx={{ bgcolor: '#0A0A0F', minHeight: '100vh', color: '#FFD700' }}>
        <Routes>
          <Route path="/login" element={<AdminLogin />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/investor-invites" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <InvestorInvites />
              </Container>
            </ProtectedAdminRoute>
          } />
          <Route path="/visao" element={
            <ProtectedAdminRoute allowedRoles={['ANGEL_VIEWER', 'INVESTOR_VIEW', 'SUPER_ADMIN']}>
              <Box sx={{ bgcolor: '#fff', minHeight: '100vh' }}>
                <InvestorVision />
              </Box>
            </ProtectedAdminRoute>
          } />
          <Route path="/consultant-leads" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <ConsultantLeadsHub />
              </Container>
            </ProtectedAdminRoute>
          } />
          <Route path="/driver-city-landings" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <DriverCityLandingsPage />
              </Container>
            </ProtectedAdminRoute>
          } />
          <Route path="/local-operators" element={
            <ProtectedAdminRoute>
              <AdminHeader />
              <LocalOperators />
            </ProtectedAdminRoute>
          } />
          <Route path="/territorial-partners" element={
            <ProtectedAdminRoute>
              <AdminHeader />
              <TerritorialPartners />
            </ProtectedAdminRoute>
          } />
          <Route path="/private-rides" element={
            <ProtectedAdminRoute>
              <AdminHeader />
              <PrivateRides />
            </ProtectedAdminRoute>
          } />
          <Route path="/lead-performance" element={
            <ProtectedAdminRoute>
              <AdminHeader />
              <LeadPerformance />
            </ProtectedAdminRoute>
          } />
          <Route path="/staff" element={
            <ProtectedAdminRoute>
              <AdminHeader />
              <StaffManagement />
            </ProtectedAdminRoute>
          } />
          <Route path="/audit" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <AdminHeader />
              <AuditLogs />
            </ProtectedAdminRoute>
          } />
          <Route path="/email" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <Container maxWidth="md" sx={{ mt: 2, mb: 4 }}>
                <AdminHeader />
                <EmailTestingPage />
              </Container>
            </ProtectedAdminRoute>
          } />
          <Route path="/inbox" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <Container maxWidth="lg" sx={{ mt: 2, mb: 4 }}>
                <AdminHeader />
                <InstitutionalInboxPage />
              </Container>
            </ProtectedAdminRoute>
          } />
          <Route path="/referrals" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN']}>
              <AdminHeader />
              <ReferralManagement />
            </ProtectedAdminRoute>
          } />
          <Route path="/finance-payments" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'FINANCE']}>
              <FinancePayments />
            </ProtectedAdminRoute>
          } />
          <Route path="/financeiro" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'FINANCE']}>
              <FinanceiroPage />
            </ProtectedAdminRoute>
          } />
          <Route path="/financeiro/politicas" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'FINANCE']}>
              <FinanceRecognitionPoliciesPage />
            </ProtectedAdminRoute>
          } />
          <Route path="/financeiro/contador" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'FINANCE']}>
              <AccountantReportPage />
            </ProtectedAdminRoute>
          } />
          <Route path="/financeiro/lancamentos" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'FINANCE']}>
              <FinanceTransactionsPage />
            </ProtectedAdminRoute>
          } />
          <Route path="/financeiro/contas-a-pagar" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'FINANCE']}>
              <FinancePayablesPage />
            </ProtectedAdminRoute>
          } />
          <Route path="/chat-kaviar" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'EXECUTIVE_ADMIN', 'FINANCE']}>
              <KaviarAiPage />
            </ProtectedAdminRoute>
          } />
          <Route path="/portal-contador" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <AccountingPortalPage />
            </ProtectedAdminRoute>
          } />
          <Route path="/credit-purchases" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'FINANCE']}>
              <AdminCreditPurchasesWrapper />
            </ProtectedAdminRoute>
          } />
          <Route path="/whatsapp" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'OPERATOR', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']}>
              <WhatsAppCentral />
            </ProtectedAdminRoute>
          } />
          <Route path="/" element={
            <ProtectedAdminRoute>
              <FinanceHomeRedirect />
            </ProtectedAdminRoute>
          } />
          <Route path="/dashboard" element={<Navigate to="/admin" replace />} />
          <Route path="/communities" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <CommunitiesManagement />
              </Container>
            </ProtectedAdminRoute>
          } />
          
          <Route path="/neighborhoods-by-city" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <NeighborhoodsByCity />
              </Container>
            </ProtectedAdminRoute>
          } />
          
          <Route path="/neighborhoods" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <NeighborhoodsManagement />
              </Container>
            </ProtectedAdminRoute>
          } />
          
          <Route path="/geofences" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <GeofenceManagement />
              </Container>
            </ProtectedAdminRoute>
          } />
          
          <Route path="/drivers" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <DriversManagement />
              </Container>
            </ProtectedAdminRoute>
          } />
          
          <Route path="/drivers/:id" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <DriverDetail />
              </Container>
            </ProtectedAdminRoute>
          } />
          
          <Route path="/feature-flags" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'OPERATOR']}>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <FeatureFlags />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/pricing" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <PricingProfiles />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/territory-floors" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <TerritoryPriceFloors />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/credit-packages" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <CreditPackagesAdmin />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/women-preference" element={
            <ProtectedAdminRoute requireSuperAdmin>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <WomenPreferenceAudit />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/manager-territory-floors" element={
            <ProtectedAdminRoute allowedRoles={['TERRITORIAL_MANAGER', 'SUPER_ADMIN']}>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <ManagerPriceFloors />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/ride-simulator" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <RideSimulator />
              </Container>
            </ProtectedAdminRoute>
          } />

          {/* Beta Monitor — HIBERNADO
          <Route path="/beta-monitor" element={
            <ProtectedAdminRoute>
              <AdminHeader />
              <BetaMonitor />
            </ProtectedAdminRoute>
          } />
          */}
          <Route path="/operations" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'OPERATOR', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']}>
              <OperationsMonitor />
            </ProtectedAdminRoute>
          } />
          <Route path="/executive-operations" element={
            <ProtectedAdminRoute>
              <ExecutiveOperations />
            </ProtectedAdminRoute>
          } />
          <Route path="/emergency-events" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN']}>
              <EmergencyEvents />
            </ProtectedAdminRoute>
          } />

          <Route path="/match-monitor" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <MatchMonitor />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/lab" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'OPERATOR', 'TERRITORIAL_OPERATOR']}>
              <Container maxWidth="xl" sx={{ mt: 2 }}>
                <AdminHeader />
                <KaviarLab />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/passengers" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <PassengersManagement />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/groups" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']}>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <GroupsManagement />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/fixed-routes" element={
            <ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']}>
              <Container maxWidth="xl" sx={{ mt: 2 }}>
                <AdminHeader />
                <AdminFixedRoutes />
              </Container>
            </ProtectedAdminRoute>
          } />

          <Route path="/passengers/:id" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <PassengerDetail />
              </Container>
            </ProtectedAdminRoute>
          } />
          
          <Route path="/guides" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <GuidesManagement />
              </Container>
            </ProtectedAdminRoute>
          } />
          
          <Route path="/elderly" element={
            <ProtectedAdminRoute>
              <Container maxWidth="lg" sx={{ mt: 2 }}>
                <AdminHeader />
                <Typography variant="h4" sx={{ p: 3 }}>
                  Acompanhamento Ativo - Em desenvolvimento
                </Typography>
              </Container>
            </ProtectedAdminRoute>
          } />
          <Route path="/metrics" element={
            <ProtectedAdminRoute>
              <AdminMetricsWrapper />
            </ProtectedAdminRoute>
          } />
          
          {/* Rotas de Corridas */}
          <Route path="/rides" element={
            <ProtectedAdminRoute>
              <RideList />
            </ProtectedAdminRoute>
          } />
          <Route path="/rides/:id" element={
            <ProtectedAdminRoute>
              <RideDetail />
            </ProtectedAdminRoute>
          } />
          <Route path="/rides/audit" element={
            <ProtectedAdminRoute>
              <RideAudit />
            </ProtectedAdminRoute>
          } />
          
          {/* Rota de Aprovação de Motoristas */}
          <Route path="/drivers/approval" element={
            <ProtectedAdminRoute>
              <DriverApproval />
            </ProtectedAdminRoute>
          } />
          <Route path="/modality-approval" element={
            <ProtectedAdminRoute>
              <ModalityApproval />
            </ProtectedAdminRoute>
          } />
          
          {/* Rotas de Gestão de Motoristas */}
          <Route path="/motoristas" element={
            <ProtectedAdminRoute>
              <DriversList />
            </ProtectedAdminRoute>
          } />
          <Route path="/motoristas/:id" element={
            <ProtectedAdminRoute>
              <DriverDetail />
            </ProtectedAdminRoute>
          } />
          
          {/* Avaliações e Reputação */}
          <Route path="/ratings" element={<ProtectedAdminRoute><RatingsPage /></ProtectedAdminRoute>} />
          <Route path="/compensations" element={<ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'FINANCE']}><CompensationsPage /></ProtectedAdminRoute>} />
          <Route path="/local-support" element={<ProtectedAdminRoute><Container maxWidth="lg" sx={{ mt: 2 }}><AdminHeader /><LocalSupportDrivers /></Container></ProtectedAdminRoute>} />

          {/* Rotas Vitrine Local */}
          <Route path="/vitrine-local" element={<ProtectedAdminRoute><VitrineLocalList /></ProtectedAdminRoute>} />
          <Route path="/vitrine-local/new" element={<ProtectedAdminRoute><VitrineLocalForm /></ProtectedAdminRoute>} />
          <Route path="/vitrine-local/:id/edit" element={<ProtectedAdminRoute><VitrineLocalForm /></ProtectedAdminRoute>} />

          {/* Rotas Premium Tourism */}
          <Route path="/premium-tourism/packages" element={
            <ProtectedAdminRoute>
              <TourPackages />
            </ProtectedAdminRoute>
          } />
          <Route path="/premium-tourism/packages/new" element={
            <ProtectedAdminRoute>
              <TourPackageForm />
            </ProtectedAdminRoute>
          } />
          <Route path="/premium-tourism/packages/:id/edit" element={
            <ProtectedAdminRoute>
              <TourPackageForm />
            </ProtectedAdminRoute>
          } />
          <Route path="/premium-tourism/bookings" element={
            <ProtectedAdminRoute>
              <TourBookings />
            </ProtectedAdminRoute>
          } />
          <Route path="/premium-tourism/partners" element={
            <ProtectedAdminRoute>
              <TourPartners />
            </ProtectedAdminRoute>
          } />
          <Route path="/premium-tourism/reports" element={
            <ProtectedAdminRoute>
              <TourReports />
            </ProtectedAdminRoute>
          } />
          <Route path="/premium-tourism/settings" element={
            <ProtectedAdminRoute>
              <TourSettings />
            </ProtectedAdminRoute>
          } />
          <Route path="/elderly" element={
            <ProtectedAdminRoute>
              <AdminElderlyWrapper />
            </ProtectedAdminRoute>
          } />
          
          {/* Territórios e Operadores Territoriais */}
          <Route path="/territories" element={<ProtectedAdminRoute requireSuperAdmin><TerritoriesPage /></ProtectedAdminRoute>} />
          <Route path="/territories/:id" element={<ProtectedAdminRoute requireSuperAdmin><TerritoryDetailPage /></ProtectedAdminRoute>} />
          <Route path="/regional-admins" element={<ProtectedAdminRoute requireSuperAdmin><RegionalAdminsPage /></ProtectedAdminRoute>} />
          <Route path="/territorial-payouts" element={<ProtectedAdminRoute requireSuperAdmin><TerritorialPayoutsPage /></ProtectedAdminRoute>} />
          <Route path="/legal-compliance" element={<ProtectedAdminRoute requireSuperAdmin><LegalCompliancePage /></ProtectedAdminRoute>} />
          <Route path="/meu-contrato" element={<ProtectedAdminRoute allowedRoles={['ANGEL_VIEWER', 'TERRITORIAL_OPERATOR', 'TERRITORIAL_MANAGER', 'SUPER_ADMIN']}><MyContractPage /></ProtectedAdminRoute>} />
          <Route path="/manager-finance" element={<ProtectedAdminRoute allowedRoles={['TERRITORIAL_MANAGER', 'SUPER_ADMIN']}><ManagerFinance /></ProtectedAdminRoute>} />
          <Route path="/manager-team" element={<ProtectedAdminRoute allowedRoles={['TERRITORIAL_MANAGER', 'SUPER_ADMIN']}><ManagerTeamPage /></ProtectedAdminRoute>} />
          <Route path="/manager-reputation" element={<ProtectedAdminRoute allowedRoles={['TERRITORIAL_MANAGER', 'SUPER_ADMIN']}><ManagerReputation /></ProtectedAdminRoute>} />
          <Route path="/manager-referrals" element={<ProtectedAdminRoute allowedRoles={['TERRITORIAL_MANAGER', 'SUPER_ADMIN']}><ManagerReferrals /></ProtectedAdminRoute>} />
          <Route path="/comercial-gestor" element={<ProtectedAdminRoute allowedRoles={['TERRITORIAL_MANAGER', 'SUPER_ADMIN']}><ComercialGestorPage /></ProtectedAdminRoute>} />
          <Route path="/crm" element={<ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'TERRITORIAL_MANAGER']}><CrmPage /></ProtectedAdminRoute>} />
          <Route path="/regulatory-consultation" element={<ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'TERRITORIAL_MANAGER']}><RegulatoryConsultationPage /></ProtectedAdminRoute>} />
          <Route path="/regulatorio" element={<ProtectedAdminRoute requireSuperAdmin><RegulatoryCitiesPage /></ProtectedAdminRoute>} />
          <Route path="/insurance-coverages" element={<ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']}><InsuranceCoveragesPage /></ProtectedAdminRoute>} />
          <Route path="/commerce" element={<ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'TERRITORIAL_MANAGER']}><CommerceAccountsPage /></ProtectedAdminRoute>} />
          <Route path="/manager-emergency-alerts" element={<ProtectedAdminRoute allowedRoles={['TERRITORIAL_MANAGER', 'SUPER_ADMIN']}><ManagerEmergencyAlerts /></ProtectedAdminRoute>} />
          <Route path="/investidores" element={<ProtectedAdminRoute requireSuperAdmin><InvestorsPage /></ProtectedAdminRoute>} />
          <Route path="/manager-women" element={<ProtectedAdminRoute allowedRoles={['TERRITORIAL_MANAGER', 'SUPER_ADMIN']}><ManagerWomenCoverage /></ProtectedAdminRoute>} />

          {/* KAVIAR Pet */}
          <Route path="/pet" element={<ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'PET_OPERATOR', 'PET_SUPERVISOR', 'PET_ADMIN']}><PetCentral /></ProtectedAdminRoute>} />
          <Route path="/pet/operators" element={<ProtectedAdminRoute requireSuperAdmin><PetOperators /></ProtectedAdminRoute>} />
          <Route path="/pet/homologations" element={<ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'PET_OPERATOR', 'PET_SUPERVISOR', 'PET_ADMIN']}><PetHomologations /></ProtectedAdminRoute>} />
          <Route path="/pet/homologations/:id" element={<ProtectedAdminRoute allowedRoles={['SUPER_ADMIN', 'PET_OPERATOR', 'PET_SUPERVISOR', 'PET_ADMIN']}><PetHomologationDetail /></ProtectedAdminRoute>} />

          {/* Redirects para rotas antigas */}
          <Route path="/bairros" element={<Navigate to="/admin/neighborhoods" replace />} />
        </Routes>
      </Box>
    </AdminErrorBoundary>
  );
}
