import { Fragment, useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse
} from '@mui/material';
import { CheckCircle, Cancel, Block, Visibility, Restore, Replay, Archive, WhatsApp } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatDate } from '../../utils/formatDate';
import { openWhatsAppContact } from '../../utils/whatsappInvite';
const isSuperAdmin = () => {
  const data = localStorage.getItem('kaviar_admin_data');
  return data ? JSON.parse(data)?.role === 'SUPER_ADMIN' : false;
};

export default function DriversManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTab, setCurrentTab] = useState(searchParams.get('status') || 'approved');
  const [careFilter, setCareFilter] = useState(searchParams.get('care') || '');
  const [expandedDrivers, setExpandedDrivers] = useState({});
  const [neighborhoodMetrics, setNeighborhoodMetrics] = useState([]);
  const [showMetrics, setShowMetrics] = useState(false);
  const [actionDialog, setActionDialog] = useState({ 
    open: false, 
    driver: null, 
    action: null, 
    reason: '' 
  });

  useEffect(() => {
    const params = new URLSearchParams();
    if (currentTab) params.set('status', currentTab);
    if (careFilter) params.set('care', careFilter);
    setSearchParams(params, { replace: true });
    fetchDrivers(currentTab);
  }, [currentTab, careFilter, setSearchParams]);

  const fetchDrivers = async (status) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('kaviar_admin_token');
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (careFilter) params.set('care', careFilter);
      const queryString = params.toString();

      const response = await fetch(`${API_BASE_URL}/api/admin/drivers${queryString ? `?${queryString}` : ''}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        // ✅ Backend entrega pronto
        setDrivers(data.data);
      } else {
        setError(data.error || 'Erro ao carregar motoristas');
      }
    } catch (error) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const fetchNeighborhoodMetrics = async () => {
    try {
      const token = localStorage.getItem('kaviar_admin_token');
      const response = await fetch(`${API_BASE_URL}/api/admin/drivers/metrics/by-neighborhood`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setNeighborhoodMetrics(data.data);
        setShowMetrics(true);
      }
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    }
  };

  const handleStatusChange = async () => {
    try {
      const { driver, action, reason } = actionDialog;
      const token = localStorage.getItem('kaviar_admin_token');
      
      let endpoint = '';
      let body = {};

      // ✅ MODO KAVIAR: apenas muda status
      if (action === 'approved') {
        endpoint = `${API_BASE_URL}/api/admin/drivers/${driver.id}/approve`;
      } else if (action === 'rejected') {
        endpoint = `${API_BASE_URL}/api/admin/drivers/${driver.id}/reject`;
        body = { reason: reason || 'Rejeitado pelo administrador' };
      } else if (action === 'suspended') {
        endpoint = `${API_BASE_URL}/api/admin/drivers/${driver.id}/suspend`;
        body = { reason: reason || 'Suspenso pelo administrador' };
      } else if (action === 'reopen') {
        endpoint = `${API_BASE_URL}/api/admin/drivers/${driver.id}/reopen`;
      } else if (action === 'archive') {
        endpoint = `${API_BASE_URL}/api/admin/drivers/${driver.id}/archive`;
      } else {
        setError('Ação não suportada');
        return;
      }

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      if (data.success) {
        fetchDrivers(currentTab);
        setActionDialog({ open: false, driver: null, action: null, reason: '' });
      } else {
        setError(data.error || 'Erro ao alterar status do motorista');
      }
    } catch (error) {
      setError('Erro de conexão');
    }
  };

  const openActionDialog = (driver, action) => {
    setActionDialog({ open: true, driver, action, reason: '' });
  };

  const toggleDriverDetails = (driverId) => {
    setExpandedDrivers((prev) => ({
      ...prev,
      [driverId]: !prev[driverId]
    }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'success';
      case 'pending': return 'warning';
      case 'rejected': return 'error';
      case 'suspended': return 'error';
      default: return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'approved': return 'Aprovado';
      case 'pending': return 'Pendente';
      case 'rejected': return 'Rejeitado';
      case 'suspended': return 'Suspenso';
      default: return status;
    }
  };

  const getActionText = (action) => {
    switch (action) {
      case 'approved': return 'Aprovar';
      case 'rejected': return 'Rejeitar';
      case 'suspended': return 'Suspender';
      case 'reopen': return 'Reabrir Análise';
      case 'archive': return 'Arquivar';
      default: return action;
    }
  };

  const getCareBadge = (careSummary) => {
    if (!careSummary?.hasQualification && !careSummary?.hasVehicle) {
      return <Chip label="Sem CARE" size="small" variant="outlined" sx={{ borderColor: '#334155', color: '#94a3b8' }} />;
    }

    if (careSummary.allVerified) {
      return <Chip label="CARE verificado" size="small" color="success" />;
    }

    if (careSummary.qualificationStatus === 'VERIFIED' || careSummary.vehicleStatus === 'VERIFIED') {
      return <Chip label="CARE parcial" size="small" color="info" variant="outlined" />;
    }

    return <Chip label="CARE pendente" size="small" color="warning" variant="outlined" />;
  };

  const getMunicipalBadge = (municipalSummary) => {
    const status = municipalSummary?.status;
    if (!status) return null;

    if (status === 'APPROVED_BY_CITY_HALL') {
      return { label: 'Autorizado', color: 'success' };
    }

    if (status === 'WAITING_CITY_HALL_REVIEW' || status === 'SUBMITTED_TO_CITY_HALL') {
      return { label: 'Aguardando Prefeitura', color: 'warning' };
    }

    return { label: 'Regularização municipal pendente', color: 'default' };
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold', color: '#f0f4f8' }}>
        Gerenciamento de Motoristas
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', md: 'center' },
        gap: 2,
        mb: 3,
        bgcolor: '#0d1117',
        borderRadius: 2,
        border: '1px solid #1a2332',
        boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        px: 2,
        py: 1.5,
      }}>
        <Tabs
          value={currentTab}
          onChange={(e, newValue) => setCurrentTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            maxWidth: '100%',
            '& .MuiTabs-scroller': { overflowX: 'auto !important' },
            '& .MuiTab-root': {
              color: '#7a8a9a',
              fontWeight: 600,
              fontSize: 13,
              textTransform: 'none',
              minHeight: 44,
              minWidth: 'auto',
              px: { xs: 1, sm: 2 },
              flexShrink: 0,
            },
            '& .Mui-selected': { color: '#FFD700 !important' },
            '& .MuiTabs-indicator': { bgcolor: '#FFD700', height: 2 },
          }}
        >
          <Tab label="Aprovados" value="approved" />
          <Tab label="Pendentes" value="pending" />
          <Tab label="Rejeitados" value="rejected" />
          <Tab label="Todos" value="" />
        </Tabs>

        <Box sx={{
          display: 'flex',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 1,
          flexWrap: 'wrap',
          justifyContent: { xs: 'flex-start', md: 'flex-end' },
          width: { xs: '100%', md: 'auto' },
          flex: '0 0 auto',
        }}>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 260 }, maxWidth: { xs: '100%', sm: 340 } }}>
            <InputLabel sx={{ color: '#7a8a9a' }}>Capacidades CARE</InputLabel>
            <Select
              value={careFilter}
              label="Capacidades CARE"
              onChange={(e) => setCareFilter(e.target.value)}
              sx={{
                color: '#c0c8d0',
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#2a3a4a' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#FFD700' },
                '.MuiSvgIcon-root': { color: '#c0c8d0' },
              }}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="registered">Com cadastro CARE</MenuItem>
              <MenuItem value="qualification_pending">Qualificação pendente</MenuItem>
              <MenuItem value="qualification_verified">Qualificação verificada</MenuItem>
              <MenuItem value="vehicle_pending">Veículo pendente</MenuItem>
              <MenuItem value="vehicle_verified">Veículo verificado</MenuItem>
              <MenuItem value="all_verified">Qualificação + veículo verificados</MenuItem>
            </Select>
          </FormControl>

        <Button 
          variant="outlined" 
          onClick={fetchNeighborhoodMetrics}
          size="small"
          sx={{
            borderColor: '#2a3a4a', color: '#c0c8d0', fontWeight: 600, fontSize: 12,
            '&:hover': { borderColor: '#FFD700', color: '#FFD700', bgcolor: 'rgba(255,215,0,0.05)' },
          }}
        >
          {showMetrics ? 'Ocultar Métricas' : 'Ver Métricas por Bairro'}
        </Button>
        </Box>
      </Box>

      {showMetrics && neighborhoodMetrics.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Motoristas por Bairro</Typography>
          <Grid container spacing={2}>
            {neighborhoodMetrics.map(metric => (
              <Grid item xs={12} sm={6} md={4} key={metric.neighborhoodId}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {metric.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                      <Chip label={`Total: ${metric.total}`} size="small" />
                      <Chip label={`Aprovados: ${metric.approved}`} size="small" color="success" />
                      <Chip label={`Pendentes: ${metric.pending}`} size="small" color="warning" />
                      <Chip label={`Premium Turismo: ${metric.premiumTourismActive || 0}`} size="small" color="secondary" />
                      <Chip label={`Elegíveis (6m): ${metric.eligible6Months || 0}`} size="small" color="info" />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      <TableContainer
        component={Paper}
        sx={{
          overflowX: 'visible',
          bgcolor: '#0d1117',
          border: '1px solid #1a2332',
          borderRadius: 2,
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)'
        }}
      >
        <Table sx={{ width: '100%', tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '30%' }}>Motorista</TableCell>
              <TableCell sx={{ width: '22%' }}>Local / Status</TableCell>
              <TableCell sx={{ width: '18%' }}>CARE</TableCell>
              <TableCell sx={{ width: '12%' }}>Cadastro</TableCell>
              <TableCell sx={{ width: '18%' }} align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {drivers.map((driver) => {
              const expanded = Boolean(expandedDrivers[driver.id]);
              const municipalBadge = getMunicipalBadge(driver.municipalSummary);

              return (
                <Fragment key={driver.id}>
                  <TableRow hover sx={{ '& > *': { borderBottom: expanded ? 'none' : undefined } }}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, color: '#f0f4f8' }} noWrap title={driver.name}>
                        {driver.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#7a8a9a' }} noWrap title={driver.email}>
                        {driver.email || 'Sem email'}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#c0c8d0', mb: 0.75 }} noWrap>
                        {driver.neighborhoods?.name || 'Não definido'}
                      </Typography>
                      <Chip
                        label={getStatusText(driver.status)}
                        color={getStatusColor(driver.status)}
                        size="small"
                      />
                    </TableCell>

                    <TableCell>
                      {getCareBadge(driver.careSummary)}
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#c0c8d0' }} noWrap>
                        {formatDate(driver.createdAt)}
                      </Typography>
                    </TableCell>

                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Button
                          size="small"
                          variant={expanded ? 'contained' : 'outlined'}
                          onClick={() => toggleDriverDetails(driver.id)}
                          sx={{ textTransform: 'none', fontSize: 11, minWidth: 78 }}
                        >
                          {expanded ? 'Fechar' : 'Detalhes'}
                        </Button>

                        {isSuperAdmin() && driver.status === 'pending' && (
                          <>
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => openActionDialog(driver, 'approved')}
                              title="Aprovar"
                            >
                              <CheckCircle fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => openActionDialog(driver, 'rejected')}
                              title="Rejeitar"
                            >
                              <Cancel fontSize="small" />
                            </IconButton>
                          </>
                        )}

                        {isSuperAdmin() && driver.status === 'rejected' && (
                          <>
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                              startIcon={<Replay sx={{ fontSize: 16 }} />}
                              onClick={() => openActionDialog(driver, 'reopen')}
                              sx={{ textTransform: 'none', fontSize: 11 }}
                            >
                              Reabrir
                            </Button>
                            <IconButton
                              size="small"
                              onClick={() => openActionDialog(driver, 'archive')}
                              title="Arquivar"
                            >
                              <Archive fontSize="small" />
                            </IconButton>
                          </>
                        )}

                        {isSuperAdmin() && driver.status === 'suspended' && (
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => openActionDialog(driver, 'approved')}
                            title="Reativar"
                          >
                            <Restore fontSize="small" />
                          </IconButton>
                        )}

                        <IconButton
                          size="small"
                          color="info"
                          title="Ver página completa"
                          onClick={() => navigate(`/admin/drivers/${driver.id}`)}
                        >
                          <Visibility fontSize="small" />
                        </IconButton>

                        <IconButton
                          size="small"
                          title="Falar com motorista"
                          onClick={() => openWhatsAppContact(driver.phone)}
                          sx={{ color: '#25D366' }}
                        >
                          <WhatsApp fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell colSpan={5} sx={{ py: 0, bgcolor: '#090e17' }}>
                      <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box
                          sx={{
                            p: 2,
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
                            gap: 2,
                            borderTop: '1px solid #1a2332'
                          }}
                        >
                          <Box>
                            <Typography variant="caption" sx={{ color: '#7a8a9a' }}>Email</Typography>
                            <Typography variant="body2" sx={{ color: '#c0c8d0', wordBreak: 'break-word' }}>
                              {driver.email || 'Sem email'}
                            </Typography>
                          </Box>

                          <Box>
                            <Typography variant="caption" sx={{ color: '#7a8a9a' }}>Bairro / Território</Typography>
                            <Typography variant="body2" sx={{ color: '#c0c8d0' }}>
                              {driver.neighborhoods?.name || 'Não definido'}
                            </Typography>
                          </Box>

                          <Box>
                            <Typography variant="caption" sx={{ color: '#7a8a9a' }}>Regularização Municipal</Typography>
                            <Box sx={{ mt: 0.5 }}>
                              {municipalBadge ? (
                                <Chip label={municipalBadge.label} color={municipalBadge.color} size="small" variant="outlined" />
                              ) : (
                                <Typography variant="body2" sx={{ color: '#c0c8d0' }}>—</Typography>
                              )}
                            </Box>
                          </Box>

                          <Box>
                            <Typography variant="caption" sx={{ color: '#7a8a9a' }}>Premium Turismo</Typography>
                            <Box sx={{ mt: 0.5 }}>
                              {driver.premium_tourism_status === 'active' ? (
                                <Chip label="Ativo" color="success" size="small" />
                              ) : (
                                <Chip label="Inativo" color="default" size="small" />
                              )}
                            </Box>
                          </Box>

                          <Box>
                            <Typography variant="caption" sx={{ color: '#7a8a9a' }}>CARE</Typography>
                            <Box sx={{ mt: 0.5 }}>
                              {getCareBadge(driver.careSummary)}
                            </Box>
                          </Box>

                          <Box>
                            <Typography variant="caption" sx={{ color: '#7a8a9a' }}>Cadastro</Typography>
                            <Typography variant="body2" sx={{ color: '#c0c8d0' }}>
                              {formatDate(driver.createdAt)}
                            </Typography>
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {drivers.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">
            {careFilter ? 'Nenhum motorista encontrado para este filtro CARE.' : 'Nenhum motorista encontrado nesta categoria.'}
          </Typography>
        </Box>
      )}

      {/* Dialog de Ação */}
      <Dialog
        open={actionDialog.open}
        onClose={() => setActionDialog({ open: false, driver: null, action: null, reason: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {getActionText(actionDialog.action)} Motorista
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Tem certeza que deseja {String(getActionText(actionDialog.action) ?? '').toLowerCase()} o motorista{' '}
            <strong>{actionDialog.driver?.name}</strong>?
          </Typography>
          
          {actionDialog.action === 'rejected' && (
            <TextField
              fullWidth
              label="Motivo da rejeição"
              multiline
              rows={3}
              value={actionDialog.reason}
              onChange={(e) => setActionDialog(prev => ({ ...prev, reason: e.target.value }))}
              sx={{ mt: 2 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setActionDialog({ open: false, driver: null, action: null, reason: '' })}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleStatusChange}
            variant="contained"
            color={actionDialog.action === 'approved' || actionDialog.action === 'reopen' ? 'success' : 'error'}
          >
            {getActionText(actionDialog.action)}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
