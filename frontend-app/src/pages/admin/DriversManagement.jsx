import { useState, useEffect } from 'react';
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
  MenuItem
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
  const [searchParams] = useSearchParams();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTab, setCurrentTab] = useState(searchParams.get('status') || 'approved');
  const [careFilter, setCareFilter] = useState(searchParams.get('care') || '');
  const [neighborhoodMetrics, setNeighborhoodMetrics] = useState([]);
  const [showMetrics, setShowMetrics] = useState(false);
  const [actionDialog, setActionDialog] = useState({ 
    open: false, 
    driver: null, 
    action: null, 
    reason: '' 
  });

  useEffect(() => {
    fetchDrivers(currentTab);
  }, [currentTab, careFilter]);

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
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3,
        bgcolor: '#0d1117', borderRadius: 2, border: '1px solid #1a2332',
        boxShadow: '0 2px 12px rgba(0,0,0,0.2)', px: 2, py: 1,
      }}>
        <Tabs
          value={currentTab}
          onChange={(e, newValue) => setCurrentTab(newValue)}
          sx={{
            '& .MuiTab-root': { color: '#7a8a9a', fontWeight: 600, fontSize: 13, textTransform: 'none', minHeight: 44 },
            '& .Mui-selected': { color: '#FFD700 !important' },
            '& .MuiTabs-indicator': { bgcolor: '#FFD700', height: 2 },
          }}
        >
          <Tab label="Aprovados" value="approved" />
          <Tab label="Pendentes" value="pending" />
          <Tab label="Rejeitados" value="rejected" />
          <Tab label="Todos" value="" />
        </Tabs>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <FormControl size="small" sx={{ minWidth: 240 }}>
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

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Bairro</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Regularização Municipal</TableCell>
              <TableCell>Premium Turismo</TableCell>
              <TableCell>Cadastro</TableCell>
              <TableCell>CARE</TableCell>
              <TableCell>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {drivers.map((driver) => (
              <TableRow key={driver.id}>
                <TableCell>{driver.name}</TableCell>
                <TableCell>{driver.email}</TableCell>
                <TableCell>{driver.neighborhoods?.name || 'Não definido'}</TableCell>
                <TableCell>
                  <Chip
                    label={getStatusText(driver.status)}
                    color={getStatusColor(driver.status)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {(() => {
                    const badge = getMunicipalBadge(driver.municipalSummary);
                    if (!badge) return '—';
                    return <Chip label={badge.label} color={badge.color} size="small" variant="outlined" />;
                  })()}
                </TableCell>
                <TableCell>
                  {driver.premium_tourism_status === 'active' ? (
                    <Chip label="Ativo" color="success" size="small" />
                  ) : (
                    <Chip label="Inativo" color="default" size="small" />
                  )}
                </TableCell>
                <TableCell>
                  {formatDate(driver.createdAt)}
                </TableCell>
                <TableCell>
                  {getCareBadge(driver.careSummary)}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {isSuperAdmin() && driver.status === 'pending' && (
                      <>
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => openActionDialog(driver, 'approved')}
                          title="Aprovar"
                        >
                          <CheckCircle />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => openActionDialog(driver, 'rejected')}
                          title="Rejeitar"
                        >
                          <Cancel />
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
                      <>
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => openActionDialog(driver, 'approved')}
                          title="Reativar"
                        >
                          <Restore />
                        </IconButton>
                      </>
                    )}
                    <IconButton
                      size="small"
                      color="info"
                      title="Ver detalhes"
                      onClick={() => navigate(`/admin/drivers/${driver.id}`)}
                    >
                      <Visibility />
                    </IconButton>
                    <Button size="small" variant="outlined" startIcon={<WhatsApp fontSize="small" />} onClick={() => openWhatsAppContact(driver.phone)} sx={{ borderColor: '#25D36666', color: '#25D366', textTransform: 'none', fontSize: 11, whiteSpace: 'nowrap' }}>
                      Falar com motorista
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {drivers.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">
            Nenhum motorista encontrado nesta categoria.
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
