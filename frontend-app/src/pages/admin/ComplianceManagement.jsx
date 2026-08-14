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
  Card,
  CardContent,
  Grid,
  IconButton
} from '@mui/material';
import { CheckCircle, Cancel, Visibility, History } from '@mui/icons-material';


const isSuperAdmin = () => {
  const data = localStorage.getItem('kaviar_admin_data');
  return data ? JSON.parse(data)?.role === 'SUPER_ADMIN' : false;
};

export default function ComplianceManagement() {
  const [metrics, setMetrics] = useState({ pending: 0, expiring: 0, blocked: 0 });
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionDialog, setActionDialog] = useState({ open: false, action: null, document: null, reason: '' });
  const [historyDialog, setHistoryDialog] = useState({ open: false, driverId: null, driverName: '', documents: [] });

  useEffect(() => {
    loadMetrics();
    loadPendingDocuments();
  }, []);

  const loadMetrics = async () => {
    try {
      const token = localStorage.getItem('kaviar_admin_token');
      const response = await fetch(`${API_BASE_URL}/api/admin/compliance/metrics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMetrics(data.data);
      }
    } catch (err) {
      console.error('Error loading metrics:', err);
    }
  };

  const loadPendingDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('kaviar_admin_token');
      const response = await fetch(`${API_BASE_URL}/api/admin/compliance/documents/pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Erro ao carregar documentos');
      
      const data = await response.json();
      setDocuments(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDriverHistory = async (driverId, driverName) => {
    try {
      const token = localStorage.getItem('kaviar_admin_token');
      const response = await fetch(`${API_BASE_URL}/api/admin/compliance/drivers/${driverId}/documents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Erro ao carregar histórico');
      
      const data = await response.json();
      setHistoryDialog({ open: true, driverId, driverName, documents: data.data || [] });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAction = (action, document) => {
    setActionDialog({ open: true, action, document, reason: '' });
  };

  const confirmAction = async () => {
    const { action, document, reason } = actionDialog;
    
    if (action === 'reject' && (!reason || reason.length < 10)) {
      setError('Motivo da rejeição deve ter pelo menos 10 caracteres');
      return;
    }

    try {
      const token = localStorage.getItem('kaviar_admin_token');
      const endpoint = action === 'approve'
        ? `/api/admin/compliance/documents/${document.id}/approve`
        : `/api/admin/compliance/documents/${document.id}/reject`;
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: action === 'reject' ? JSON.stringify({ reason }) : action === 'approve' ? JSON.stringify({ emission_date: actionDialog.emissionDate || undefined }) : undefined
      });
      
      if (!response.ok) throw new Error(`Erro ao ${action === 'approve' ? 'aprovar' : 'rejeitar'} documento`);
      
      setSuccess(`Documento ${action === 'approve' ? 'aprovado' : 'rejeitado'} com sucesso`);
      setActionDialog({ open: false, action: null, document: null, reason: '' });
      loadPendingDocuments();
      loadMetrics();
    } catch (err) {
      setError(err.message);
    }
  };

  const formatDate = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'success';
      case 'rejected': return 'error';
      case 'pending': return 'warning';
      default: return 'default';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'approved': return 'Aprovado';
      case 'rejected': return 'Rejeitado';
      case 'pending': return 'Pendente';
      default: return status;
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Gestão de Compliance
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Métricas */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Pendentes
              </Typography>
              <Typography variant="h3">
                {metrics.pending}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Vencendo (7 dias)
              </Typography>
              <Typography variant="h3">
                {metrics.expiring}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Bloqueados
              </Typography>
              <Typography variant="h3" color="error">
                {metrics.blocked}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Lista de Documentos Pendentes */}
      <Paper>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Documentos Pendentes de Aprovação
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography>Carregando...</Typography>
          </Box>
        ) : documents.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="textSecondary">
              Nenhum documento pendente
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Motorista</TableCell>
                  <TableCell>Enviado em</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Arquivo</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {doc.drivers?.name || 'N/A'}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => loadDriverHistory(doc.driver_id, doc.drivers?.name)}
                          title="Ver histórico"
                        >
                          <History fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                    <TableCell>{formatDate(doc.created_at)}</TableCell>
                    <TableCell>Antecedentes Criminais</TableCell>
                    <TableCell>
                      {doc.file_url ? (
                        <Button
                          size="small"
                          startIcon={<Visibility />}
                          href={doc.file_url}
                          target="_blank"
                        >
                          Ver PDF
                        </Button>
                      ) : (
                        <Typography variant="body2" color="textSecondary">
                          Sem arquivo
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {isSuperAdmin() && (
                        <>
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<CheckCircle />}
                            onClick={() => handleAction('approve', doc)}
                            sx={{ mr: 1 }}
                          >
                            Aprovar
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<Cancel />}
                            onClick={() => handleAction('reject', doc)}
                          >
                            Rejeitar
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Dialog de Aprovação/Rejeição */}
      <Dialog open={actionDialog.open} onClose={() => setActionDialog({ ...actionDialog, open: false })}>
        <DialogTitle>
          {actionDialog.action === 'approve' ? 'Aprovar Documento' : 'Rejeitar Documento'}
        </DialogTitle>
        <DialogContent>
          {actionDialog.action === 'approve' ? (
            <>
              <Typography>
                Confirma a aprovação do documento de <strong>{actionDialog.document?.drivers?.name}</strong>?
              </Typography>
              <TextField
                fullWidth
                type="date"
                label="Data de emissão da certidão"
                value={actionDialog.emissionDate || ''}
                onChange={(e) => setActionDialog({ ...actionDialog, emissionDate: e.target.value })}
                helperText="Obrigatória. Validade: 6 meses a partir da emissão."
                InputLabelProps={{ shrink: true }}
                sx={{ mt: 2 }}
              />
            </>
          ) : (
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Motivo da Rejeição"
              value={actionDialog.reason}
              onChange={(e) => setActionDialog({ ...actionDialog, reason: e.target.value })}
              helperText="Mínimo 10 caracteres"
              sx={{ mt: 2 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog({ ...actionDialog, open: false })}>
            Cancelar
          </Button>
          <Button
            onClick={confirmAction}
            variant="contained"
            color={actionDialog.action === 'approve' ? 'success' : 'error'}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de Histórico */}
      <Dialog
        open={historyDialog.open}
        onClose={() => setHistoryDialog({ ...historyDialog, open: false })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Histórico de Compliance - {historyDialog.driverName}
        </DialogTitle>
        <DialogContent>
          {historyDialog.documents.length === 0 ? (
            <Typography color="textSecondary">Nenhum documento encontrado</Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Data</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Válido até</TableCell>
                    <TableCell>Decisão por</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyDialog.documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>{formatDate(doc.created_at)}</TableCell>
                      <TableCell>
                        <Chip
                          label={getStatusLabel(doc.status)}
                          color={getStatusColor(doc.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {doc.valid_until ? new Date(doc.valid_until).toLocaleDateString('pt-BR') : '-'}
                      </TableCell>
                      <TableCell>
                        {doc.approved_by || doc.rejected_by || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialog({ ...historyDialog, open: false })}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
