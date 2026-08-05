import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Chip, Button, IconButton, Skeleton, Alert, Snackbar, TextField, Divider, Tooltip } from '@mui/material';
import { ArrowBack, Send, ContentCopy, OpenInNew, CheckCircle, Link as LinkIcon, Email, Refresh } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

const STATUS_LABELS = { DRAFT: 'Rascunho', SENT_TO_COMPANY: 'Enviado', VIEWED: 'Visualizado', SCHEDULED: 'Programado', PAID: 'Pago', PROOF_UPLOADED: 'Comprovante Enviado', UNDER_VERIFICATION: 'Em Verificação', VERIFIED: 'Verificado', RECONCILED: 'Conciliado', REJECTED: 'Rejeitado', CANCELED: 'Cancelado' };
const STATUS_COLORS = { DRAFT: '#6B7280', SENT_TO_COMPANY: '#3B82F6', VIEWED: '#8B5CF6', SCHEDULED: '#6366F1', PAID: '#10B981', PROOF_UPLOADED: '#F59E0B', UNDER_VERIFICATION: '#F59E0B', VERIFIED: '#22C55E', RECONCILED: '#22C55E', REJECTED: '#EF4444', CANCELED: '#6B7280' };
const OWNER_LABELS = { ACCOUNTANT: 'Contador', COMPANY: 'Empresa' };
const AUDIT_LABELS = { BOLETO_ATTACHED: 'Boleto anexado', LINK_GENERATED: 'Link gerado', EMAIL_SENT: 'E-mail enviado', VIEWED_BY_COMPANY: 'Visualizado pela empresa', BOLETO_DOWNLOADED: 'Boleto baixado', PAYMENT_SCHEDULED: 'Pagamento programado', PAYMENT_INFORMED: 'Pagamento informado', PROOF_UPLOADED: 'Comprovante enviado', STATUS_TRANSITION: 'Status alterado' };

export default function AccountantObligationDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [ob, setOb] = useState(null);
  const [linkStatus, setLinkStatus] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [email, setEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');

  const fetchAll = () => {
    Promise.all([
      accountantApi.get(`/api/accountant/portal/obligations/${id}`),
      accountantApi.get(`/api/accountant/portal/obligations/${id}/link-status`).catch(() => ({ data: { data: null } })),
      accountantApi.get(`/api/accountant/portal/obligations/${id}/audit`).catch(() => ({ data: { data: [] } })),
    ]).then(([obRes, linkRes, auditRes]) => {
      setOb(obRes.data?.data);
      setLinkStatus(linkRes.data?.data);
      setAudit(auditRes.data?.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [id]);

  const handleGenerateLink = async () => {
    try {
      const res = await accountantApi.post(`/api/accountant/portal/obligations/${id}/generate-link`);
      const link = res.data?.data?.link;
      setGeneratedLink(link);
      setSnackbar({ open: true, message: 'Link gerado com sucesso.', severity: 'success' });
      fetchAll();
    } catch (err) { setSnackbar({ open: true, message: err.response?.data?.error || 'Erro', severity: 'error' }); }
  };

  const handleCopyLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      setSnackbar({ open: true, message: 'Link copiado!', severity: 'success' });
    }
  };

  const handleSendEmail = async () => {
    if (!email) { setSnackbar({ open: true, message: 'Informe o e-mail do destinatário', severity: 'error' }); return; }
    setSendingEmail(true);
    try {
      const res = await accountantApi.post(`/api/accountant/portal/obligations/${id}/send-email`, { recipient_email: email });
      setGeneratedLink(res.data?.data?.link || generatedLink);
      setSnackbar({ open: true, message: `E-mail enviado para ${email}`, severity: 'success' });
      fetchAll();
    } catch (err) { setSnackbar({ open: true, message: err.response?.data?.error || 'Erro no envio', severity: 'error' }); }
    finally { setSendingEmail(false); }
  };

  const handleTransition = async (status) => {
    try {
      await accountantApi.post(`/api/accountant/portal/obligations/${id}/transition`, { status });
      setSnackbar({ open: true, message: 'Status atualizado.', severity: 'success' });
      fetchAll();
    } catch (err) { setSnackbar({ open: true, message: err.response?.data?.error || 'Erro', severity: 'error' }); }
  };

  if (loading) return <AccountantPortalLayout><Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} /></AccountantPortalLayout>;
  if (!ob) return <AccountantPortalLayout><Alert severity="error">Obrigação não encontrada</Alert></AccountantPortalLayout>;

  const statusColor = STATUS_COLORS[ob.status] || '#6B7280';
  const canSend = ob.status === 'DRAFT' && ob.boleto_storage_key;
  const canVerify = ['PROOF_UPLOADED', 'UNDER_VERIFICATION'].includes(ob.status);
  const canReconcile = ob.status === 'VERIFIED';

  return (
    <AccountantPortalLayout>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ color: 'rgba(255,255,255,0.5)' }}><ArrowBack /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>{ob.description}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{ob.legal_entity?.razao_social}</Typography>
        </Box>
        <Chip label={STATUS_LABELS[ob.status]} sx={{ bgcolor: `${statusColor}20`, color: statusColor, fontWeight: 600 }} />
      </Box>

      {/* Info Card */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2 }}>
            <Box><Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Valor</Typography><Typography sx={{ color: '#D4AF37', fontSize: 22, fontWeight: 700 }}>{ob.amount_display}</Typography></Box>
            <Box><Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Vencimento</Typography><Typography sx={{ color: '#fff', fontSize: 16 }}>{ob.due_date ? new Date(ob.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</Typography></Box>
            <Box><Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Beneficiário</Typography><Typography sx={{ color: '#fff', fontSize: 14 }}>{ob.beneficiary || '—'}</Typography></Box>
            <Box><Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Próxima ação</Typography><Typography sx={{ color: '#fff', fontSize: 14 }}>{OWNER_LABELS[ob.action_owner] || ob.action_owner}</Typography></Box>
          </Box>
          {ob.boleto_filename && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1 }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>📎 Boleto: {ob.boleto_filename}</Typography>
            </Box>
          )}
          {ob.notes && <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, mt: 1.5 }}>Obs: {ob.notes}</Typography>}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Typography sx={{ color: '#D4AF37', fontWeight: 600, fontSize: 14, mb: 2 }}>Ações</Typography>

          {/* Generate/manage link */}
          {ob.status !== 'RECONCILED' && ob.status !== 'CANCELED' && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                <Button size="small" startIcon={<LinkIcon />} onClick={handleGenerateLink} sx={{ color: '#D4AF37', textTransform: 'none' }}>
                  {linkStatus?.has_active_link ? 'Gerar novo link' : 'Gerar link para empresa'}
                </Button>
                {linkStatus?.has_active_link && (
                  <Chip label={`Acessado ${linkStatus.accessed_count}x`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                )}
              </Box>

              {generatedLink && (
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1, p: 1.5, mb: 1.5 }}>
                  <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, mb: 0.5 }}>Link de pagamento:</Typography>
                  <Typography sx={{ color: '#D4AF37', fontSize: 12, wordBreak: 'break-all', fontFamily: 'monospace' }}>{generatedLink}</Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button size="small" startIcon={<ContentCopy />} onClick={handleCopyLink} sx={{ color: '#D4AF37', textTransform: 'none', fontSize: 11 }}>Copiar</Button>
                    <Button size="small" startIcon={<OpenInNew />} onClick={() => window.open(generatedLink, '_blank')} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none', fontSize: 11 }}>Abrir</Button>
                  </Box>
                  {linkStatus?.expires_at && <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, mt: 1 }}>Válido até: {new Date(linkStatus.expires_at).toLocaleDateString('pt-BR')}</Typography>}
                </Box>
              )}

              {/* Email */}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField size="small" placeholder="E-mail da empresa" value={email} onChange={e => setEmail(e.target.value)} sx={{ flex: 1, '& .MuiInputBase-root': { color: '#fff', fontSize: 13 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
                <Button size="small" startIcon={<Email />} onClick={handleSendEmail} disabled={sendingEmail || !email} sx={{ color: '#D4AF37', textTransform: 'none', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {sendingEmail ? 'Enviando...' : 'Enviar por e-mail'}
                </Button>
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, mt: 0.5 }}>Remetente: financeiro@kaviar.com.br</Typography>
            </Box>
          )}

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1.5 }} />

          {/* Status actions */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {canSend && <Button size="small" variant="contained" startIcon={<Send />} onClick={() => handleTransition('SENT_TO_COMPANY')} sx={{ bgcolor: '#3B82F6', textTransform: 'none', fontSize: 12 }}>Enviar para empresa</Button>}
            {canVerify && <Button size="small" variant="contained" startIcon={<CheckCircle />} onClick={() => handleTransition('VERIFIED')} sx={{ bgcolor: '#22C55E', textTransform: 'none', fontSize: 12 }}>Verificar comprovante</Button>}
            {canReconcile && <Button size="small" variant="contained" startIcon={<CheckCircle />} onClick={() => handleTransition('RECONCILED')} sx={{ bgcolor: '#22C55E', textTransform: 'none', fontSize: 12 }}>Conciliar</Button>}
          </Box>
        </CardContent>
      </Card>

      {/* Audit Timeline */}
      {audit.length > 0 && (
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <CardContent>
            <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 13, mb: 1.5 }}>Timeline ({audit.length})</Typography>
            {audit.map((a, i) => (
              <Box key={a.id || i} sx={{ display: 'flex', gap: 1.5, mb: 1, alignItems: 'flex-start' }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: a.actor_type === 'COMPANY' ? '#8B5CF6' : '#D4AF37', mt: 0.8 }} />
                <Box>
                  <Typography sx={{ color: '#fff', fontSize: 12 }}>{AUDIT_LABELS[a.action] || a.action}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
                    {a.actor_type === 'COMPANY' ? 'Empresa' : 'Contador'} • {new Date(a.created_at).toLocaleString('pt-BR')}
                  </Typography>
                </Box>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </AccountantPortalLayout>
  );
}
