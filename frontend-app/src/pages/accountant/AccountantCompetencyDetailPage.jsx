import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Chip, Button, IconButton, Skeleton, Alert, Snackbar, TextField, Divider } from '@mui/material';
import { ArrowBack, CheckCircle, Refresh, ArrowForward } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

// Centralized status translations
const COMP_STATUS_LABELS = { OPEN: 'Aberta', WAITING_DOCUMENTS: 'Aguardando Documentos', UNDER_REVIEW: 'Em Análise', PENDING_CORRECTION: 'Correção Pendente', COMPLETED: 'Concluída', REOPENED: 'Reaberta', CANCELED: 'Cancelada' };
const COMP_STATUS_COLORS = { OPEN: '#3B82F6', WAITING_DOCUMENTS: '#F59E0B', UNDER_REVIEW: '#8B5CF6', PENDING_CORRECTION: '#EF4444', COMPLETED: '#22C55E', REOPENED: '#F59E0B', CANCELED: '#6B7280' };

const OB_STATUS_LABELS = { DRAFT: 'Rascunho', SENT_TO_COMPANY: 'Enviada à empresa', VIEWED: 'Visualizada', SCHEDULED: 'Programada', PAID: 'Pagamento informado', PROOF_UPLOADED: 'Comprovante enviado', UNDER_VERIFICATION: 'Em verificação', VERIFIED: 'Verificada', RECONCILED: 'Conciliada', REJECTED: 'Rejeitada', CANCELED: 'Cancelada' };
const OB_STATUS_COLORS = { DRAFT: '#6B7280', SENT_TO_COMPANY: '#3B82F6', VIEWED: '#8B5CF6', SCHEDULED: '#6366F1', PAID: '#10B981', PROOF_UPLOADED: '#F59E0B', UNDER_VERIFICATION: '#F59E0B', VERIFIED: '#22C55E', RECONCILED: '#22C55E', REJECTED: '#EF4444', CANCELED: '#6B7280' };

export default function AccountantCompetencyDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [comp, setComp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [reopenReason, setReopenReason] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);

  const fetchData = () => {
    accountantApi.get(`/api/accountant/portal/competencies/${id}`)
      .then(r => setComp(r.data?.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchData(); }, [id]);

  const handleTransition = async (status, extra = {}) => {
    try {
      await accountantApi.post(`/api/accountant/portal/competencies/${id}/transition`, { status, ...extra });
      setSnackbar({ open: true, message: 'Status atualizado.', severity: 'success' });
      fetchData();
    } catch (err) { setSnackbar({ open: true, message: err.response?.data?.error || 'Erro', severity: 'error' }); }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) { setSnackbar({ open: true, message: 'Informe o motivo', severity: 'error' }); return; }
    await handleTransition('REOPENED', { reopen_reason: reopenReason });
    setReopenOpen(false); setReopenReason('');
  };

  if (loading) return <AccountantPortalLayout><Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} /></AccountantPortalLayout>;
  if (!comp) return <AccountantPortalLayout><Alert severity="error">Competência não encontrada</Alert></AccountantPortalLayout>;

  const statusColor = COMP_STATUS_COLORS[comp.status] || '#6B7280';
  const isOpen = !['COMPLETED', 'CANCELED'].includes(comp.status);

  return (
    <AccountantPortalLayout>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/contador/competencias')} sx={{ color: 'rgba(255,255,255,0.5)' }}><ArrowBack /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>{comp.period_label}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{comp.legal_entity?.razao_social}</Typography>
        </Box>
        <Chip label={COMP_STATUS_LABELS[comp.status]} sx={{ bgcolor: `${statusColor}20`, color: statusColor, fontWeight: 600 }} />
      </Box>

      {/* Info */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
            <Box><Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Prazo</Typography><Typography sx={{ color: '#fff', fontSize: 14 }}>{comp.expected_deadline ? new Date(comp.expected_deadline + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não definido'}</Typography></Box>
            <Box><Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Responsável</Typography><Typography sx={{ color: '#fff', fontSize: 14 }}>{comp.responsible?.nome_completo || '—'}</Typography></Box>
            <Box><Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Próxima ação</Typography><Typography sx={{ color: '#fff', fontSize: 14 }}>{comp.action_owner === 'COMPANY' ? 'Empresa' : 'Contador'}</Typography></Box>
            <Box><Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Documentos</Typography><Typography sx={{ color: '#fff', fontSize: 14 }}>{comp.documents_count || 0}</Typography></Box>
          </Box>
          {comp.notes && <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, mt: 2 }}>Obs: {comp.notes}</Typography>}
          {comp.reopen_reason && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1, borderLeft: '3px solid rgba(245,158,11,0.4)' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, mb: 0.3 }}>Histórico de reabertura</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Motivo: {comp.reopen_reason}</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Typography sx={{ color: '#D4AF37', fontWeight: 600, fontSize: 14, mb: 2 }}>Ações</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {['OPEN', 'REOPENED'].includes(comp.status) && <Button size="small" onClick={() => handleTransition('WAITING_DOCUMENTS')} sx={{ color: '#F59E0B', textTransform: 'none', fontSize: 12, border: '1px solid #F59E0B30' }}>Aguardar Documentos</Button>}
            {['OPEN', 'WAITING_DOCUMENTS', 'REOPENED'].includes(comp.status) && <Button size="small" onClick={() => handleTransition('UNDER_REVIEW')} sx={{ color: '#8B5CF6', textTransform: 'none', fontSize: 12, border: '1px solid #8B5CF630' }}>Iniciar Análise</Button>}
            {comp.status === 'UNDER_REVIEW' && <Button size="small" onClick={() => handleTransition('PENDING_CORRECTION')} sx={{ color: '#EF4444', textTransform: 'none', fontSize: 12, border: '1px solid #EF444430' }}>Pedir Correção</Button>}
            {comp.status === 'UNDER_REVIEW' && <Button size="small" variant="contained" startIcon={<CheckCircle />} onClick={() => handleTransition('COMPLETED')} sx={{ bgcolor: '#22C55E', textTransform: 'none', fontSize: 12 }}>Concluir</Button>}
            {comp.status === 'PENDING_CORRECTION' && <Button size="small" onClick={() => handleTransition('UNDER_REVIEW')} sx={{ color: '#8B5CF6', textTransform: 'none', fontSize: 12, border: '1px solid #8B5CF630' }}>Retomar Análise</Button>}
            {comp.status === 'COMPLETED' && <Button size="small" startIcon={<Refresh />} onClick={() => setReopenOpen(true)} sx={{ color: '#F59E0B', textTransform: 'none', fontSize: 12, border: '1px solid #F59E0B30' }}>Reabrir</Button>}
          </Box>
        </CardContent>
      </Card>

      {/* Documents Section */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 14 }}>Documentos vinculados</Typography>
              {comp.documents?.length > 0 && <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{comp.documents.length} documento{comp.documents.length > 1 ? 's' : ''}</Typography>}
            </Box>
            {isOpen && <LinkDocButton competencyId={id} entityId={comp.legal_entity_id} onSuccess={() => { fetchData(); setSnackbar({ open: true, message: 'Documento vinculado.', severity: 'success' }); }} />}
          </Box>
          {comp.documents?.length > 0 ? comp.documents.map(d => (
            <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.04)', '&:last-child': { borderBottom: 0 } }}>
              <Typography sx={{ color: '#fff', fontSize: 13, flex: 1 }}>{d.name || 'Documento'}</Typography>
              {d.category && <Chip label={d.category} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 10, height: 20 }} />}
            </Box>
          )) : (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Nenhum documento vinculado</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Obligations Section */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 14 }}>Obrigações vinculadas</Typography>
              {comp.obligations?.length > 0 && <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{comp.obligations.length} obrigação{comp.obligations.length > 1 ? 'ões' : ''}</Typography>}
            </Box>
            {isOpen && <LinkObButton competencyId={id} entityId={comp.legal_entity_id} onSuccess={() => { fetchData(); setSnackbar({ open: true, message: 'Obrigação vinculada.', severity: 'success' }); }} />}
          </Box>
          {comp.obligations?.length > 0 ? comp.obligations.map(o => {
            const obColor = OB_STATUS_COLORS[o.status] || '#6B7280';
            return (
              <Box key={o.id} onClick={() => navigate(`/contador/obrigacoes/${o.id}`)}
                sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, px: 1, borderRadius: 1, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', '&:last-child': { borderBottom: 0 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 500 }} noWrap>{o.description}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                    {o.amount_display} • Vencimento: {o.due_date ? new Date(o.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  </Typography>
                </Box>
                <Chip label={OB_STATUS_LABELS[o.status] || o.status} size="small" sx={{ bgcolor: `${obColor}15`, color: obColor, fontSize: 10, height: 22, flexShrink: 0 }} />
                <ArrowForward sx={{ color: 'rgba(255,255,255,0.15)', fontSize: 16, flexShrink: 0 }} />
              </Box>
            );
          }) : (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Nenhuma obrigação vinculada</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Reopen dialog */}
      {reopenOpen && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <Card sx={{ bgcolor: '#1E2433', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, maxWidth: 400, width: '100%', p: 3 }}>
            <Typography sx={{ color: '#fff', fontSize: 16, fontWeight: 600, mb: 2 }}>Reabrir competência</Typography>
            <TextField label="Motivo da reabertura *" value={reopenReason} onChange={e => setReopenReason(e.target.value)} multiline rows={3} fullWidth sx={{ mb: 2, '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button onClick={() => setReopenOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancelar</Button>
              <Button variant="contained" onClick={handleReopen} disabled={!reopenReason.trim()} sx={{ bgcolor: '#F59E0B', textTransform: 'none' }}>Reabrir</Button>
            </Box>
          </Card>
        </Box>
      )}

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </AccountantPortalLayout>
  );
}

function LinkDocButton({ competencyId, entityId, onSuccess }) {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState([]);

  const handleOpen = () => {
    setOpen(true);
    accountantApi.get(`/api/accountant/portal/documents?legal_entity_id=${entityId}&limit=50`)
      .then(r => setDocs(r.data?.data || [])).catch(() => {});
  };

  const handleLink = async (docId) => {
    try {
      await accountantApi.post(`/api/accountant/portal/competencies/${competencyId}/link-document`, { document_id: docId });
      setOpen(false);
      onSuccess();
    } catch (err) { alert(err.response?.data?.error || 'Erro ao vincular'); }
  };

  return (
    <>
      <Button size="small" onClick={handleOpen} sx={{ color: '#D4AF37', textTransform: 'none', fontSize: 12 }}>+ Vincular</Button>
      {open && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <Card sx={{ bgcolor: '#1E2433', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, maxWidth: 500, width: '100%', p: 3, maxHeight: '70vh', overflow: 'auto' }}>
            <Typography sx={{ color: '#fff', fontSize: 16, fontWeight: 600, mb: 2 }}>Vincular documento</Typography>
            {docs.length === 0 ? <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Nenhum documento disponível</Typography> :
              docs.map(d => (
                <Box key={d.id} onClick={() => handleLink(d.id)} sx={{ p: 1.5, borderRadius: 1, cursor: 'pointer', mb: 0.5, '&:hover': { bgcolor: 'rgba(212,175,55,0.1)' } }}>
                  <Typography sx={{ color: '#fff', fontSize: 13 }}>{d.document_type?.name || 'Documento'}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : ''}</Typography>
                </Box>
              ))
            }
            <Button onClick={() => setOpen(false)} sx={{ mt: 2, color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancelar</Button>
          </Card>
        </Box>
      )}
    </>
  );
}

function LinkObButton({ competencyId, entityId, onSuccess }) {
  const [open, setOpen] = useState(false);
  const [obs, setObs] = useState([]);

  const handleOpen = () => {
    setOpen(true);
    accountantApi.get(`/api/accountant/portal/obligations?legal_entity_id=${entityId}`)
      .then(r => setObs(r.data?.data || [])).catch(() => {});
  };

  const handleLink = async (obId) => {
    try {
      await accountantApi.post(`/api/accountant/portal/competencies/${competencyId}/link-obligation`, { obligation_id: obId });
      setOpen(false);
      onSuccess();
    } catch (err) { alert(err.response?.data?.error || 'Erro ao vincular'); }
  };

  return (
    <>
      <Button size="small" onClick={handleOpen} sx={{ color: '#D4AF37', textTransform: 'none', fontSize: 12 }}>+ Vincular</Button>
      {open && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <Card sx={{ bgcolor: '#1E2433', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, maxWidth: 500, width: '100%', p: 3, maxHeight: '70vh', overflow: 'auto' }}>
            <Typography sx={{ color: '#fff', fontSize: 16, fontWeight: 600, mb: 2 }}>Vincular obrigação</Typography>
            {obs.length === 0 ? <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Nenhuma obrigação disponível</Typography> :
              obs.map(o => (
                <Box key={o.id} onClick={() => handleLink(o.id)} sx={{ p: 1.5, borderRadius: 1, cursor: 'pointer', mb: 0.5, '&:hover': { bgcolor: 'rgba(212,175,55,0.1)' } }}>
                  <Typography sx={{ color: '#fff', fontSize: 13 }}>{o.description}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{o.amount_display} • Venc: {o.due_date ? new Date(o.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</Typography>
                </Box>
              ))
            }
            <Button onClick={() => setOpen(false)} sx={{ mt: 2, color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancelar</Button>
          </Card>
        </Box>
      )}
    </>
  );
}
