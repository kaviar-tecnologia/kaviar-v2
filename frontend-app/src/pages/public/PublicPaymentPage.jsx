import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Button, Chip, Alert, LinearProgress, TextField, Divider } from '@mui/material';
import { Receipt, CloudDownload, CheckCircle, Upload, Schedule, Warning } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

const STATUS_LABELS = { VIEWED: 'Aguardando pagamento', SCHEDULED: 'Pagamento programado', PAID: 'Pago — envie o comprovante', PROOF_UPLOADED: 'Comprovante enviado', UNDER_VERIFICATION: 'Em verificação', VERIFIED: 'Verificado', RECONCILED: 'Conciliado', REJECTED: 'Comprovante rejeitado — reenvie' };

export default function PublicPaymentPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [paidDate, setPaidDate] = useState('');

  const api = axios.create({ baseURL: API_BASE_URL, timeout: 30000 });

  const fetchData = () => {
    setLoading(true);
    api.get(`/api/public/obligations/${token}`)
      .then(r => { setData(r.data?.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'Link inválido ou expirado'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [token]);

  const handleDownloadBoleto = async () => {
    try {
      const res = await api.get(`/api/public/obligations/${token}/boleto`);
      const url = res.data?.data?.download_url;
      if (url) window.open(url, '_blank', 'noopener');
    } catch { alert('Erro ao baixar boleto'); }
  };

  const handleMarkScheduled = async () => {
    setActionLoading(true);
    try {
      await api.post(`/api/public/obligations/${token}/mark-scheduled`);
      setSuccessMsg('Pagamento marcado como programado.');
      fetchData();
    } catch (err) { setError(err.response?.data?.error || 'Erro'); }
    finally { setActionLoading(false); }
  };

  const handleMarkPaid = async () => {
    setActionLoading(true);
    try {
      await api.post(`/api/public/obligations/${token}/mark-paid`, { paid_date: paidDate || undefined });
      setSuccessMsg('Pagamento registrado. Envie o comprovante abaixo.');
      fetchData();
    } catch (err) { setError(err.response?.data?.error || 'Erro'); }
    finally { setActionLoading(false); }
  };

  const handleUploadProof = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionLoading(true); setSuccessMsg('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/api/public/obligations/${token}/upload-proof`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
      setSuccessMsg('Comprovante enviado com sucesso. O contador será notificado.');
      fetchData();
    } catch (err) { setError(err.response?.data?.error || 'Erro no envio'); }
    finally { setActionLoading(false); }
  };

  if (loading) return <PageWrapper><LinearProgress sx={{ '& .MuiLinearProgress-bar': { bgcolor: '#D4AF37' } }} /></PageWrapper>;
  if (error && !data) return <PageWrapper><Alert severity="error">{error}</Alert></PageWrapper>;

  const ob = data;
  const canSchedule = ob.status === 'VIEWED';
  const canMarkPaid = ['VIEWED', 'SCHEDULED'].includes(ob.status);
  const canUploadProof = ['PAID', 'REJECTED'].includes(ob.status);
  const isComplete = ['VERIFIED', 'RECONCILED'].includes(ob.status);

  return (
    <PageWrapper>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography sx={{ color: '#D4AF37', fontWeight: 700, fontSize: 20, letterSpacing: '0.1em', mb: 0.5 }}>KAVIAR</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Pagamento • {ob.legal_entity?.razao_social}</Typography>
      </Box>

      {/* Obligation Card */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Typography sx={{ color: '#fff', fontSize: 18, fontWeight: 600, mb: 1 }}>{ob.description}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <Box><Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Valor</Typography><Typography sx={{ color: '#D4AF37', fontSize: 22, fontWeight: 700 }}>{ob.amount_display}</Typography></Box>
            <Box><Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Vencimento</Typography><Typography sx={{ color: '#fff', fontSize: 16 }}>{ob.due_date ? new Date(ob.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</Typography></Box>
          </Box>
          {ob.beneficiary && <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Beneficiário: {ob.beneficiary}</Typography>}
          {ob.reference_number && <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Ref: {ob.reference_number}</Typography>}
          {ob.barcode && <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace', mt: 1 }}>{ob.barcode}</Typography>}
          {ob.pix_key && <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, mt: 0.5 }}>Pix: {ob.pix_key}</Typography>}

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 2 }} />
          <Chip label={STATUS_LABELS[ob.status] || ob.status} sx={{ bgcolor: isComplete ? '#22C55E20' : ob.status === 'REJECTED' ? '#EF444420' : '#D4AF3720', color: isComplete ? '#22C55E' : ob.status === 'REJECTED' ? '#EF4444' : '#D4AF37' }} />
          {ob.rejection_reason && <Alert severity="warning" sx={{ mt: 2, bgcolor: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>{ob.rejection_reason}</Alert>}
        </CardContent>
      </Card>

      {/* Actions */}
      {ob.has_boleto && (
        <Button fullWidth variant="outlined" startIcon={<CloudDownload />} onClick={handleDownloadBoleto}
          sx={{ mb: 2, borderColor: '#D4AF37', color: '#D4AF37', textTransform: 'none', py: 1.5, fontSize: 14, '&:hover': { borderColor: '#B8960C' } }}>
          Baixar Boleto / Guia
        </Button>
      )}

      {canSchedule && (
        <Button fullWidth variant="outlined" startIcon={<Schedule />} onClick={handleMarkScheduled} disabled={actionLoading}
          sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', textTransform: 'none', py: 1.5 }}>
          Programei o pagamento
        </Button>
      )}

      {canMarkPaid && (
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, mb: 2 }}>
          <CardContent>
            <Typography sx={{ color: '#fff', fontSize: 14, fontWeight: 500, mb: 1.5 }}>Informar pagamento</Typography>
            <TextField label="Data do pagamento" type="date" size="small" value={paidDate} onChange={e => setPaidDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth
              sx={{ mb: 1.5, '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <Button fullWidth variant="contained" startIcon={<CheckCircle />} onClick={handleMarkPaid} disabled={actionLoading}
              sx={{ bgcolor: '#22C55E', color: '#fff', textTransform: 'none', py: 1.2, fontWeight: 600, '&:hover': { bgcolor: '#16A34A' } }}>
              Já paguei
            </Button>
          </CardContent>
        </Card>
      )}

      {canUploadProof && (
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, mb: 2 }}>
          <CardContent>
            <Typography sx={{ color: '#fff', fontSize: 14, fontWeight: 500, mb: 1 }}>Enviar comprovante</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, mb: 1.5 }}>PDF, JPEG ou PNG • Máx 20MB</Typography>
            <Button fullWidth variant="outlined" component="label" startIcon={<Upload />} disabled={actionLoading}
              sx={{ borderColor: '#D4AF37', color: '#D4AF37', textTransform: 'none', py: 1.2 }}>
              Selecionar e enviar comprovante
              <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={handleUploadProof} />
            </Button>
          </CardContent>
        </Card>
      )}

      {isComplete && (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <CheckCircle sx={{ fontSize: 48, color: '#22C55E', mb: 1 }} />
          <Typography sx={{ color: '#22C55E', fontSize: 16, fontWeight: 600 }}>Pagamento verificado!</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, mt: 0.5 }}>Este pagamento foi confirmado e conciliado pelo contador.</Typography>
        </Box>
      )}

      {successMsg && <Alert severity="success" sx={{ mt: 2 }}>{successMsg}</Alert>}
      {error && data && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </PageWrapper>
  );
}

function PageWrapper({ children }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0F1419', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', p: 2, pt: 4 }}>
      <Box sx={{ maxWidth: 480, width: '100%' }}>{children}</Box>
    </Box>
  );
}
