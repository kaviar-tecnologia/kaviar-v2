import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Grid,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Cancel, ArrowBack } from '@mui/icons-material';
import { Pets } from '@mui/icons-material';
import api from '../../api/index';
import { VirtualFenceCenterCard } from '../../components/admin/VirtualFenceCenterCard';
import { SecondaryBaseCard } from '../../components/admin/SecondaryBaseCard';
import { DriverPremiumEligibilityCard } from '../../components/admin/DriverPremiumEligibilityCard';
import { DriverCreditsCard } from '../../components/admin/DriverCreditsCard';
import { DriverReputationCard } from '../../components/admin/DriverReputationCard';
import { DriverFinancialCard } from '../../components/admin/DriverFinancialCard';
import { DriverEditCard } from '../../components/admin/DriverEditCard';
import { DriverMunicipalRegularizationCard } from '../../components/admin/DriverMunicipalRegularizationCard';
import { formatDate } from '../../utils/formatDate';


const isSuperAdmin = () => {
  const data = localStorage.getItem('kaviar_admin_data');
  return data ? JSON.parse(data)?.role === 'SUPER_ADMIN' : false;
};

// Resolve document URL (handles absolute vs relative paths)
const resolveDocUrl = (url) => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url; // Already absolute
  if (url.startsWith('/uploads/')) return `${API_BASE_URL}${url}`; // Relative path
  if (url.startsWith('certidoes/')) return `${API_BASE_URL}/uploads/${url}`; // S3 key
  return url;
};

// Component for document image with fallback
const DocumentImage = ({ url, alt }) => {
  const [error, setError] = useState(false);
  
  if (error || !url) {
    return (
      <Box sx={{ p: 2, bgcolor: 'warning.light', borderRadius: 1, textAlign: 'center' }}>
        <Typography variant="body2" color="warning.dark">
          ⚠️ Documento não disponível
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Enviado antes da migração S3. Solicite novo upload.
        </Typography>
      </Box>
    );
  }
  
  return (
    <img 
      src={resolveDocUrl(url)} 
      alt={alt}
      onError={() => setError(true)}
      style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px' }}
    />
  );
};

export default function AdminDriverDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [docVerifyConfirm, setDocVerifyConfirm] = useState(null);
  const [docRejectTarget, setDocRejectTarget] = useState(null);
  const [docRejectReason, setDocRejectReason] = useState('');

  useEffect(() => {
    loadDriver();
    loadDocuments();
  }, [id]);

  const loadDriver = async () => {
    try {
      const response = await api.get(`/api/admin/drivers/${id}`);
      if (response.data.success) {
        const driverData = response.data.data;
        console.log('[Admin] Driver loaded:', {
          id: driverData.id,
          vehicle_color: driverData.vehicle_color,
          vehicle_plate: driverData.vehicle_plate,
          vehicle_model: driverData.vehicle_model
        });
        setDriver(driverData);
      } else {
        setError(response.data.error || 'Motorista não encontrado');
      }
    } catch (error) {
      console.error('Erro ao carregar motorista:', error);
      setError(error.response?.data?.error || 'Motorista não encontrado');
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      // Buscar documentos de driver_documents (validação)
      const response = await api.get(`/api/admin/drivers/${id}/documents`);
      if (response.data.success) {
        setDocuments(response.data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
      // Não bloqueia a tela se documentos falharem
    }
  };

  const handleApprove = async () => {
    try {
      setError('');
      const response = await api.put(`/api/admin/drivers/${id}/approve`);
      if (response.data.success) {
        setSuccess('Motorista aprovado com sucesso!');
        setTimeout(() => navigate('/admin/motoristas'), 2000);
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Erro ao aprovar motorista');
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('Motivo da rejeição é obrigatório');
      return;
    }

    try {
      setError('');
      const response = await api.put(`/api/admin/drivers/${id}/reject`, {
        reason: rejectReason
      });
      if (response.data.success) {
        setSuccess('Motorista rejeitado');
        setTimeout(() => navigate('/admin/motoristas'), 2000);
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Erro ao rejeitar motorista');
    }
  };

  const handleDocVerify = async () => {
    if (!docVerifyConfirm) return;
    try {
      setError('');
      const response = await api.put(`/api/admin/drivers/${id}/documents/${docVerifyConfirm.id}/verify`);
      if (response.data.success) {
        setSuccess(`Documento ${docVerifyConfirm.type} aprovado com sucesso`);
        setDocVerifyConfirm(null);
        loadDocuments();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao aprovar documento');
      setDocVerifyConfirm(null);
    }
  };

  const handleDocReject = async () => {
    if (!docRejectTarget) return;
    if (docRejectReason.trim().length < 10) {
      setError('Motivo deve ter pelo menos 10 caracteres');
      return;
    }
    try {
      setError('');
      const response = await api.put(`/api/admin/drivers/${id}/documents/${docRejectTarget.id}/reject`, {
        reason: docRejectReason
      });
      if (response.data.success) {
        setSuccess(`Documento ${docRejectTarget.type} rejeitado`);
        setDocRejectTarget(null);
        setDocRejectReason('');
        loadDocuments();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao rejeitar documento');
      setDocRejectTarget(null);
      setDocRejectReason('');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!driver) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error">Motorista não encontrado</Alert>
      </Container>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'approved': return 'success';
      case 'rejected': return 'error';
      default: return 'default';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'Pendente';
      case 'approved': return 'Aprovado';
      case 'rejected': return 'Rejeitado';
      default: return status;
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate('/admin/motoristas')}
        sx={{ mb: 2 }}
      >
        Voltar
      </Button>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Paper sx={{ p: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5">
            Detalhes do Motorista
          </Typography>
          <Chip 
            label={getStatusLabel(driver.status)} 
            color={getStatusColor(driver.status)}
          />
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" color="text.secondary">Nome</Typography>
            <Typography variant="body1">{driver.name}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" color="text.secondary">Email</Typography>
            <Typography variant="body1">{driver.email}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" color="text.secondary">Telefone</Typography>
            <Typography variant="body1">{driver.phone || 'Não informado'}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" color="text.secondary">Status</Typography>
            <Typography variant="body1">{getStatusLabel(driver.status)}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" color="text.secondary">Chave PIX</Typography>
            <Typography variant="body1">{driver.pix_key || 'Não informado'}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" color="text.secondary">Tipo de Chave</Typography>
            <Typography variant="body1">{driver.pix_key_type || 'Não informado'}</Typography>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Fotos</Typography>
            {(() => {
              const profilePhoto = documents.find(d => d.type === 'PROFILE_PHOTO');
              const vehiclePhoto = documents.find(d => d.type === 'VEHICLE_PHOTO');
              const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
              const isExpired = (doc) => doc?.verified_at && new Date(doc.verified_at) < sixMonthsAgo;
              const statusColor = (s) => s === 'VERIFIED' ? 'success' : s === 'SUBMITTED' ? 'warning' : s === 'rejected' ? 'error' : 'default';
              const statusLabel = (s) => s === 'VERIFIED' ? 'Aprovada' : s === 'SUBMITTED' ? 'Pendente' : s === 'rejected' ? 'Rejeitada' : s || '—';
              const openPhoto = async (doc) => {
                const key = (doc.file_url || doc.document_url || '').replace(/^\//, '');
                if (!key) return;
                try {
                  const { data } = await api.get(`/api/admin/presign?key=${encodeURIComponent(key)}`);
                  if (data.success && data.url) window.open(data.url, '_blank', 'noopener,noreferrer');
                } catch { alert('Erro ao abrir foto'); }
              };
              const handleUpload = async (type) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/jpeg,image/png,image/webp';
                input.onchange = async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) { alert('Arquivo muito grande (máx 5MB)'); return; }
                  const fd = new FormData();
                  fd.append('photo', file);
                  fd.append('type', type);
                  try {
                    await api.post(`/api/admin/drivers/${id}/photo-upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    loadDocuments();
                    if (type === 'PROFILE_PHOTO') loadDriver();
                    alert('Foto atualizada com sucesso!');
                  } catch (err) { alert(err.response?.data?.error || 'Erro ao enviar foto'); }
                };
                input.click();
              };
              const PhotoCard = ({ label, doc, docType }) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                  {doc && (doc.file_url || doc.document_url) ? (
                    <Box component="img" src="" alt={label} sx={{ width: 56, height: 56, borderRadius: 1, objectFit: 'cover', bgcolor: 'grey.300', cursor: 'pointer' }}
                      ref={el => { if (el && !el.dataset.loaded) { el.dataset.loaded = '1'; const key = (doc.file_url || doc.document_url).replace(/^\//, ''); api.get(`/api/admin/presign?key=${encodeURIComponent(key)}`).then(r => { if (r.data?.url) el.src = r.data.url; }).catch(() => {}); }}}
                      onClick={() => openPhoto(doc)}
                    />
                  ) : (
                    <Box sx={{ width: 56, height: 56, borderRadius: 1, bgcolor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    </Box>
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
                    {doc ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        <Chip label={statusLabel(doc.status)} size="small" color={statusColor(doc.status)} />
                        {isExpired(doc) && <Chip label="⚠️ Renovação necessária" size="small" color="warning" variant="outlined" />}
                        {doc.verified_at && <Typography variant="caption" color="text.secondary">Aprovada em {formatDate(doc.verified_at)}</Typography>}
                        {!doc.verified_at && doc.submitted_at && <Typography variant="caption" color="text.secondary">Enviada em {formatDate(doc.submitted_at)}</Typography>}
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.disabled">Não enviada</Typography>
                    )}
                  </Box>
                  {doc && (doc.file_url || doc.document_url) && (
                    <Button size="small" variant="outlined" onClick={() => openPhoto(doc)}>Ver foto</Button>
                  )}
                  {isSuperAdmin() && (
                    <Button size="small" variant="contained" color="primary" onClick={() => handleUpload(docType)}>
                      {doc ? 'Trocar' : 'Adicionar'}
                    </Button>
                  )}
                </Box>
              );
              return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <PhotoCard label="Foto do motorista" doc={profilePhoto} docType="PROFILE_PHOTO" />
                  <PhotoCard label="Foto do veículo" doc={vehiclePhoto} docType="VEHICLE_PHOTO" />
                </Box>
              );
            })()}
          </Grid>

          <Grid item xs={12}>
            <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Documentos</Typography>
            {documents.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {documents.map((doc) => (
                  <Box key={doc.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1, bgcolor: 'grey.50', borderRadius: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ minWidth: 150, fontWeight: 600 }}>
                      {doc.type}
                    </Typography>
                    <Chip 
                      label={doc.status} 
                      size="small" 
                      color={doc.status === 'VERIFIED' ? 'success' : doc.status === 'SUBMITTED' ? 'warning' : doc.status === 'rejected' ? 'error' : 'default'}
                    />
                    {(doc.file_url || doc.document_url) && (
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={async () => {
                          const key = (doc.file_url || doc.document_url).replace(/^\//, '');
                          try {
                            const { data } = await api.get(`/api/admin/presign?key=${encodeURIComponent(key)}`);
                            if (data.success && data.url) {
                              window.open(data.url, '_blank', 'noopener,noreferrer');
                            }
                          } catch (err) {
                            console.error('Failed to get presigned URL:', err);
                            alert('Erro ao abrir documento');
                          }
                        }}
                      >
                        Ver Documento
                      </Button>
                    )}
                    {isSuperAdmin() && doc.status === 'SUBMITTED' && (
                      <>
                        <Button
                          variant="contained"
                          size="small"
                          color="success"
                          onClick={() => setDocVerifyConfirm(doc)}
                        >
                          Aprovar
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          onClick={() => setDocRejectTarget(doc)}
                        >
                          Rejeitar
                        </Button>
                      </>
                    )}
                    {doc.status === 'rejected' && doc.reject_reason && (
                      <Typography variant="caption" color="error" sx={{ width: '100%', mt: 0.5 }}>
                        Motivo: {doc.reject_reason}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Nenhum documento enviado
              </Typography>
            )}
          </Grid>

          <Grid item xs={12}>
            <DriverMunicipalRegularizationCard driverId={id} documents={documents} />
          </Grid>

          {/* Legacy certidão: only show if no BACKGROUND_CHECK in new document system */}
          {!documents.some(d => d.type === 'BACKGROUND_CHECK') && (
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary">Certidão "Nada Consta"</Typography>
              {driver.certidao_nada_consta_url ? (
                <Box sx={{ mt: 1 }}>
                  <DocumentImage url={driver.certidao_nada_consta_url} alt="Certidão Nada Consta" />
                </Box>
              ) : (
                <Box sx={{ p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
                  <Typography variant="body2" color="warning.dark">
                    ⚠️ Certidão Nada Consta não enviada
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    O motorista precisa enviar a certidão de antecedentes criminais pelo app.
                  </Typography>
                </Box>
              )}
            </Grid>
          )}

          {driver.rejected_reason && (
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="error">Motivo da Rejeição</Typography>
              <Typography variant="body1">{driver.rejected_reason}</Typography>
            </Grid>
          )}

          <Grid item xs={12}>
            <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Veículo</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2" color="text.secondary">Placa</Typography>
                <Typography variant="body1">{driver.vehicle_plate || 'Não informado'}</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2" color="text.secondary">Modelo</Typography>
                <Typography variant="body1">{driver.vehicle_model || 'Não informado'}</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2" color="text.secondary">Cor</Typography>
                <Typography variant="body1">{driver.vehicle_color || 'Não informado'}</Typography>
              </Grid>
            </Grid>
          </Grid>



          <Grid item xs={12}>
            <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Kaviar Premium Turismo</Typography>
            <Box sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Status:</Typography>
                  <Chip 
                    label={driver.premium_tourism_status === 'active' ? 'Ativo' : 'Inativo'} 
                    color={driver.premium_tourism_status === 'active' ? 'success' : 'default'}
                    size="small"
                    sx={{ mt: 0.5 }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Promovido em:</Typography>
                  <Typography variant="body2">
                    {driver.premium_tourism_promoted_at 
                      ? formatDate(driver.premium_tourism_promoted_at)
                      : '—'}
                  </Typography>
                </Grid>
                {driver.approved_at && driver.premium_tourism_status !== 'active' && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">Elegível em:</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {(() => {
                        const approvedDate = new Date(driver.approved_at);
                        const eligibleDate = new Date(approvedDate);
                        eligibleDate.setMonth(eligibleDate.getMonth() + 6);
                        return eligibleDate.toLocaleDateString('pt-BR');
                      })()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      (6 meses após aprovação)
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </Box>
          </Grid>
        </Grid>

        {isSuperAdmin() && driver.status === 'pending' && (
          <Box display="flex" gap={2} mt={4}>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircle />}
              onClick={handleApprove}
              fullWidth
            >
              Aprovar Motorista
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={<Cancel />}
              onClick={() => setRejectDialogOpen(true)}
              fullWidth
            >
              Rejeitar Motorista
            </Button>
          </Box>
        )}

        {isSuperAdmin() && (
          <Box mt={2}>
            <Button
              variant="outlined"
              startIcon={<Pets />}
              onClick={async () => {
                try {
                  setError('');
                  const token = localStorage.getItem('kaviar_admin_token');
                  const res = await fetch(`${API_BASE_URL}/api/admin/pet/homologations`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ driver_id: driver.id }),
                  });
                  const json = await res.json();
                  if (json.success) {
                    const hId = json.duplicate ? json.id : json.data.id;
                    navigate(`/admin/pet/homologations/${hId}`);
                  } else {
                    setError(json.error);
                  }
                } catch { setError('Erro ao criar homologação Pet'); }
              }}
              sx={{ borderColor: '#b8960c', color: '#b8960c', textTransform: 'none', '&:hover': { borderColor: '#d4af37', bgcolor: 'rgba(184,150,12,0.08)' } }}
            >
              Iniciar homologação Pet
            </Button>
            {driver.status !== 'approved' && (
              <Typography variant="caption" sx={{ ml: 1, color: '#ff9800' }}>⚠️ Motorista ainda não aprovado</Typography>
            )}
          </Box>
        )}
      </Paper>

      {/* Driver Edit Card */}
      <Box sx={{ mt: 3 }}>
        <DriverEditCard driverId={id} driver={driver} onUpdated={loadDriver} />
      </Box>

      {/* Driver Financial Summary */}
      <Box sx={{ mt: 3 }}>
        <DriverFinancialCard driverId={id} />
      </Box>

      {/* Driver Credits Card */}
      <Box sx={{ mt: 3 }}>
        <DriverCreditsCard driverId={id} />
      </Box>

      {/* Driver Reputation Card */}
      <Box sx={{ mt: 3 }}>
        <DriverReputationCard driverId={id} />
      </Box>

      {/* Premium Eligibility Card */}
      <Box sx={{ mt: 3 }}>
        <DriverPremiumEligibilityCard driverId={id} />
      </Box>

      {/* Virtual Fence Center Card */}
      <Box sx={{ mt: 3 }}>
        <VirtualFenceCenterCard driverId={id} />
      </Box>

      {/* Secondary Base Card */}
      <Box sx={{ mt: 3 }}>
        <SecondaryBaseCard driverId={id} />
      </Box>

      {/* Dialog de rejeição do motorista */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)}>
        <DialogTitle>Rejeitar Motorista</DialogTitle>
        <DialogContent>
          <TextField
            label="Motivo da Rejeição"
            multiline
            rows={4}
            fullWidth
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            required
            sx={{ mt: 2 }}
            helperText="Obrigatório"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleReject} 
            color="error" 
            variant="contained"
            disabled={!rejectReason.trim()}
          >
            Confirmar Rejeição
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de confirmação de aprovação de documento */}
      <Dialog open={!!docVerifyConfirm} onClose={() => setDocVerifyConfirm(null)}>
        <DialogTitle>Aprovar Documento</DialogTitle>
        <DialogContent>
          <Typography>
            Confirma a aprovação do documento <strong>{docVerifyConfirm?.type}</strong>?
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Esta ação será registrada no audit log.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDocVerifyConfirm(null)}>Cancelar</Button>
          <Button onClick={handleDocVerify} color="success" variant="contained">
            Confirmar Aprovação
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de rejeição de documento */}
      <Dialog open={!!docRejectTarget} onClose={() => { setDocRejectTarget(null); setDocRejectReason(''); }}>
        <DialogTitle>Rejeitar Documento</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Rejeitar documento <strong>{docRejectTarget?.type}</strong>?
          </Typography>
          <TextField
            label="Motivo da Rejeição"
            multiline
            rows={3}
            fullWidth
            value={docRejectReason}
            onChange={(e) => setDocRejectReason(e.target.value)}
            required
            helperText="Mínimo 10 caracteres"
            error={docRejectReason.length > 0 && docRejectReason.length < 10}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDocRejectTarget(null); setDocRejectReason(''); }}>Cancelar</Button>
          <Button
            onClick={handleDocReject}
            color="error"
            variant="contained"
            disabled={docRejectReason.trim().length < 10}
          >
            Confirmar Rejeição
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
