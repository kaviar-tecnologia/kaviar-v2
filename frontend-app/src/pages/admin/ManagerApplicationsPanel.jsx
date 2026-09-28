import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Box, Button, Checkbox, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  TextField, Typography,
} from '@mui/material';
import { AssignmentTurnedIn, ContentCopy, Forum, Refresh } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';

const BG = '#0D1117';
const GOLD = '#D4AF37';
const TEXT = '#EAEFF5';
const MUTED = '#A7B3C2';

const OUTCOMES = [
  { value: 'ADVANCE', label: 'Avançar para a próxima etapa', status: 'Interessado' },
  { value: 'REQUEST_INFO', label: 'Solicitar informações adicionais', status: 'Em contato' },
  { value: 'KEEP_REVIEW', label: 'Manter em análise', status: 'Status atual' },
  { value: 'DO_NOT_PROCEED', label: 'Não prosseguir', status: 'Rejeitado' },
];

const STATUS_NAMES = {
  NEW: 'Entrada', CONTACTED: 'Em contato', INTERESTED: 'Interessado',
  WAITING_DOCUMENTS: 'Aguardando documentos', WAITING_CONTRACT: 'Aguardando contrato',
  WAITING_APPROVAL: 'Aguardando aprovação', ACTIVE: 'Ativo', REJECTED: 'Rejeitado',
  LOST: 'Perdido', PAUSED: 'Pausado',
};

function officialMessage(lead, outcome) {
  const name = String(lead?.name || 'candidato(a)').split(' ')[0];
  switch (outcome) {
    case 'ADVANCE':
      return `Olá, ${name}! Sua candidatura de Gestor Territorial avançou para a próxima etapa de análise. Nossa equipe informará as orientações. Equipe KAVIAR.`;
    case 'REQUEST_INFO':
      return `Olá, ${name}! Para continuar a análise da sua candidatura de Gestor Territorial, precisamos de informações adicionais. Você pode responder por esta conversa? Equipe KAVIAR.`;
    case 'KEEP_REVIEW':
      return `Olá, ${name}! Sua candidatura de Gestor Territorial segue em análise. Agradecemos por aguardar nosso contato. Equipe KAVIAR.`;
    case 'DO_NOT_PROCEED':
      return `Olá, ${name}! Obrigado pelo interesse na KAVIAR. Neste momento, não daremos continuidade à sua candidatura de Gestor Territorial. Equipe KAVIAR.`;
    default: return '';
  }
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

const boxSx = { p: 2, borderRadius: 2, bgcolor: '#131b25', border: '1px solid #273441' };

export default function ManagerApplicationsPanel({ open, onClose, onUpdated }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [outcome, setOutcome] = useState('');
  const [justification, setJustification] = useState('');
  const [communicationRequested, setCommunicationRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [historyId, setHistoryId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [communication, setCommunication] = useState(null);
  const [feedback, setFeedback] = useState('');

  const token = localStorage.getItem('kaviar_admin_token');
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
  }), [token]);

  const reload = useCallback(async (quiet = false) => {
    if (!open) return;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/crm/manager-applications`, { headers });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Erro ao carregar candidaturas');
      setItems(json.data || []);
      setTotal(json.total || 0);
      setTruncated(Boolean(json.truncated));
      setError('');
    } catch (err) {
      setError(err?.message || 'Erro de conexão com o CRM');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [headers, open]);

  useEffect(() => {
    if (!open) return undefined;
    reload();
    const id = setInterval(() => reload(true), 15000);
    return () => clearInterval(id);
  }, [open, reload]);

  const sorted = useMemo(() => {
    const selectedItems = items.filter(item => filter !== 'unread' || (item.conversation?.unreadCount || 0) > 0);
    return selectedItems.sort((a, b) =>
      Number((b.conversation?.unreadCount || 0) > 0) - Number((a.conversation?.unreadCount || 0) > 0) ||
      ({ URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 }[b.lead.priority] || 0) -
      ({ URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 }[a.lead.priority] || 0) ||
      new Date(b.lead.created_at) - new Date(a.lead.created_at)
    );
  }, [items, filter]);
  const unreadCards = items.filter(item => (item.conversation?.unreadCount || 0) > 0).length;

  const openDecision = (item) => {
    setSelected(item);
    setOutcome('');
    setJustification('');
    setCommunicationRequested(false);
    setDecisionError('');
  };

  const saveDecision = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setDecisionError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/crm/manager-applications/${selected.lead.id}/decisions`, {
        method: 'POST', headers,
        body: JSON.stringify({
          outcome, justification, expectedUpdatedAt: selected.lead.updated_at, communicationRequested,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Erro ao registrar decisão');
      setFeedback('Decisão registrada e preservada no histórico. Nenhuma mensagem foi enviada.');
      if (communicationRequested) {
        setCommunication({
          lead: selected.lead,
          conversation: selected.conversation,
          message: officialMessage(selected.lead, outcome),
          linkStatus: selected.linkStatus,
        });
      }
      setSelected(null);
      await reload();
      onUpdated?.();
    } catch (err) {
      setDecisionError(err?.message || 'Falha de conexão. Confira o histórico antes de tentar de novo.');
    } finally {
      setSubmitting(false);
    }
  };

  const viewHistory = async (item) => {
    setHistoryId(item.lead.id);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/crm/manager-applications/${item.lead.id}/decisions`, { headers });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Erro no histórico');
      setHistory(json.data || []);
    } catch (err) { setError(err?.message || 'Erro no histórico'); }
    finally { setHistoryLoading(false); }
  };

  const openOfficialConversation = (conversationId) => {
    // The Central owns delivery rules and performs its own explicit send action.
    window.location.href = `/admin/whatsapp?conversation=${encodeURIComponent(conversationId)}`;
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg"
      PaperProps={{ sx: { bgcolor: BG, color: TEXT, border: '1px solid #29333e', maxHeight: '94vh' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', color: GOLD }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><AssignmentTurnedIn /> Candidaturas de Gestores</Box>
        <Button size="small" variant="outlined" onClick={onClose}>Fechar</Button>
      </DialogTitle>
      <DialogContent dividers sx={{ borderColor: '#29333e' }}>
        <Typography sx={{ color: MUTED, fontSize: 12, mb: 2 }}>
          Respostas da Central WhatsApp vinculadas à candidatura original. A leitura deste painel não marca mensagens como lidas.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
          <Chip label={`Candidaturas: ${total}`} sx={{ color: TEXT, border: '1px solid #354455' }} />
          <Chip label={`Com mensagens não lidas: ${unreadCards}`} sx={{ color: unreadCards ? '#25D366' : MUTED, border: '1px solid #354455' }} />
          <Button size="small" onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')} variant="outlined">
            {filter === 'unread' ? 'Mostrar todas' : 'Somente não lidas'}
          </Button>
          <Button size="small" onClick={() => reload()} startIcon={<Refresh />} variant="outlined">Atualizar</Button>
        </Box>
        {truncated && <Alert severity="warning" sx={{ mb: 2 }}>Exibindo as 200 candidaturas mais recentes; use o CRM para consultar outras.</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {feedback && <Alert severity="success" onClose={() => setFeedback('')} sx={{ mb: 2 }}>{feedback}</Alert>}
        {loading ? <CircularProgress sx={{ color: GOLD }} /> : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            {sorted.map(item => {
              const lead = item.lead;
              const conv = item.conversation;
              const unread = conv?.unreadCount || 0;
              return <Box key={lead.id} sx={{ ...boxSx, borderColor: unread ? '#25D366' : '#273441' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                  <Typography sx={{ fontWeight: 700, color: TEXT }}>{lead.name}</Typography>
                  {unread > 0 && <Chip label={`${unread} nova(s)`} size="small" color="success" />}
                </Box>
                <Typography sx={{ fontSize: 12, color: MUTED, mt: 0.3 }}>
                  {lead.phone || 'Sem telefone'} · {STATUS_NAMES[lead.status] || lead.status} · {lead.priority === 'HIGH' ? 'Prioridade alta' : lead.priority === 'URGENT' ? 'Urgente' : 'Prioridade ' + lead.priority}
                </Typography>
                <Typography sx={{ color: MUTED, fontSize: 12, mt: 1, minHeight: 36 }}>
                  {conv?.lastMessagePreview || 'Aguardando resposta pelo WhatsApp oficial.'}
                </Typography>
                <Typography sx={{ color: MUTED, fontSize: 11, mb: 1 }}>Última mensagem: {dateTime(conv?.lastMessageAt)}</Typography>
                {item.linkStatus === 'review' && <Alert severity="warning" sx={{ mb: 1 }}>Vínculo do telefone precisa de conferência. Não vincular automaticamente a outro cadastro.</Alert>}
                {item.lastDecision && <Alert severity="info" sx={{ mb: 1, py: 0 }}>
                  Última decisão: {item.lastDecision.label} — {dateTime(item.lastDecision.createdAt)}
                </Alert>}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button size="small" variant="contained" disabled={lead.status === 'ACTIVE'} onClick={() => openDecision(item)} sx={{ bgcolor: GOLD, color: '#111' }}>
                    Registrar decisão
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => viewHistory(item)}>Histórico</Button>
                  <Button size="small" variant="outlined" startIcon={<Forum />}
                    disabled={!conv} onClick={() => openOfficialConversation(conv.id)}>
                    {item.linkStatus === 'review' ? 'Conferir conversa' : 'Abrir conversa oficial'}
                  </Button>
                </Box>
              </Box>;
            })}
            {!sorted.length && <Typography sx={{ color: MUTED }}>Nenhuma candidatura neste filtro.</Typography>}
          </Box>
        )}
      </DialogContent>

      <Dialog open={Boolean(selected)} onClose={() => !submitting && setSelected(null)} fullWidth maxWidth="sm"
        PaperProps={{ sx: { bgcolor: BG, color: TEXT, border: '1px solid #536577' } }}>
        <DialogTitle sx={{ color: TEXT, fontWeight: 700 }}>Registrar decisão — {selected?.lead.name}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Alert severity="info">A decisão registra a etapa de seleção. Não ativa Gestor, contrato, pagamentos nem território.</Alert>
          <Typography id="manager-decision-options-label" sx={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>
            Escolha uma decisão:
          </Typography>
          <Box role="group" aria-labelledby="manager-decision-options-label"
            sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
            {OUTCOMES.map(option => {
              const chosen = outcome === option.value;
              return <Button key={option.value} type="button" variant="outlined" fullWidth
                aria-pressed={chosen} disabled={submitting} onClick={() => setOutcome(option.value)}
                sx={{
                  minHeight: 56, px: 2, py: 1.25, justifyContent: 'space-between', gap: 1,
                  textTransform: 'none', fontSize: 14, fontWeight: 700, textAlign: 'left',
                  color: chosen ? '#111' : TEXT, bgcolor: chosen ? GOLD : '#182432',
                  border: `2px solid ${chosen ? GOLD : '#8195AB'}`,
                  '&:hover': {
                    bgcolor: chosen ? '#E6C453' : '#273A4E',
                    borderColor: chosen ? GOLD : TEXT,
                  },
                  '&.Mui-focusVisible': { outline: '3px solid #F5D76E', outlineOffset: 2 },
                  '&.Mui-disabled': { color: TEXT, bgcolor: '#283542', borderColor: '#8195AB' },
                }}>
                <Box component="span" sx={{ textAlign: 'left', flex: 1 }}>{option.label}</Box>
                <Box component="span" sx={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                  {option.status}
                </Box>
              </Button>;
            })}
          </Box>
          <TextField label="Justificativa obrigatória" multiline minRows={3} fullWidth value={justification}
            onChange={event => setJustification(event.target.value)} inputProps={{ maxLength: 2000 }}
            helperText={`${justification.trim().length}/2000 · mínimo 10 caracteres`}
            sx={{
              bgcolor: '#182432', borderRadius: 1,
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: '#8195AB', borderWidth: 2 },
                '&:hover fieldset': { borderColor: TEXT },
                '&.Mui-focused fieldset': { borderColor: GOLD },
              },
              '& .MuiInputLabel-root.Mui-focused': { color: GOLD },
              '& .MuiFormHelperText-root': { color: MUTED, fontSize: 12, fontWeight: 600, mx: 0, mt: 1 },
            }}
            InputLabelProps={{ sx: { color: TEXT } }} InputProps={{ sx: { color: TEXT } }} />
          <FormControlLabel
            control={<Checkbox checked={communicationRequested} onChange={event => setCommunicationRequested(event.target.checked)}
              sx={{ color: MUTED, '&.Mui-checked': { color: GOLD } }} />}
            label="Preparar comunicação opcional pelo WhatsApp oficial"
            sx={{ color: TEXT }}
          />
          {communicationRequested && outcome && <Alert severity="warning">
            A comunicação será apenas preparada. O envio depende de abrir a Central, revisar o texto e confirmar manualmente; mensagens livres exigem janela válida do WhatsApp.
          </Alert>}
          {decisionError && <Alert severity="error">{decisionError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" disabled={submitting} onClick={() => setSelected(null)}
            sx={{ color: TEXT, borderColor: '#8195AB', fontWeight: 700,
              '&.Mui-disabled': { color: MUTED, borderColor: '#536577' } }}>Cancelar</Button>
          <Button variant="contained" disabled={submitting || !outcome || justification.trim().length < 10}
            onClick={saveDecision} sx={{
              bgcolor: GOLD, color: '#111', fontWeight: 800, px: 2,
              '&:hover': { bgcolor: '#E6C453' },
              '&.Mui-disabled': { bgcolor: '#283542', color: '#CBD5E1', border: '1px solid #8195AB' },
            }}>
            {submitting ? 'Registrando...' : 'Confirmar decisão'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(historyId)} onClose={() => setHistoryId(null)} fullWidth maxWidth="sm"
        PaperProps={{ sx: { bgcolor: BG, color: TEXT } }}>
        <DialogTitle>Histórico de decisões</DialogTitle>
        <DialogContent>
          {historyLoading ? <CircularProgress /> : history.length === 0 ? <Typography sx={{ color: MUTED }}>Nenhuma decisão registrada.</Typography> :
            history.map(item => <Box key={item.id} sx={{ ...boxSx, mb: 1 }}>
              <Typography sx={{ fontWeight: 700, color: GOLD }}>{item.label}</Typography>
              <Typography sx={{ color: MUTED, fontSize: 12 }}>{dateTime(item.createdAt)} · {item.actorName}</Typography>
              <Typography sx={{ color: TEXT, whiteSpace: 'pre-wrap', mt: 1 }}>{item.justification}</Typography>
              <Typography sx={{ color: MUTED, fontSize: 11 }}>
                {STATUS_NAMES[item.oldStatus] || item.oldStatus} → {STATUS_NAMES[item.newStatus] || item.newStatus}
                {item.communicationRequested ? ' · Comunicação solicitada, envio manual não confirmado' : ''}
              </Typography>
            </Box>)}
        </DialogContent>
        <DialogActions><Button onClick={() => setHistoryId(null)}>Fechar</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(communication)} onClose={() => setCommunication(null)} fullWidth maxWidth="sm"
        PaperProps={{ sx: { bgcolor: BG, color: TEXT } }}>
        <DialogTitle>Comunicação opcional — revisão humana</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 1 }}>A decisão foi salva. Nenhuma mensagem foi enviada automaticamente.</Alert>
          <TextField multiline minRows={4} fullWidth value={communication?.message || ''} InputProps={{ readOnly: true, sx: { color: TEXT } }} />
          {!communication?.conversation && <Alert severity="warning" sx={{ mt: 1 }}>Ainda não há conversa oficial vinculada. Não use o convite genérico para comunicar uma decisão; aguarde resposta ou configure um template específico aprovado.</Alert>}
          {communication?.linkStatus === 'review' && <Alert severity="warning" sx={{ mt: 1 }}>Confirme a identidade do contato na Central antes de enviar.</Alert>}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button onClick={() => setCommunication(null)}>Fechar</Button>
          <Button startIcon={<ContentCopy />} onClick={() => navigator.clipboard.writeText(communication?.message || '').then(() => setFeedback('Texto copiado; ainda não enviado.')).catch(() => setFeedback('Não foi possível copiar automaticamente.'))}>Copiar texto</Button>
          <Button variant="contained" disabled={!communication?.conversation}
            onClick={() => openOfficialConversation(communication.conversation.id)} sx={{ bgcolor: '#25D366', color: '#111' }}>
            Abrir conversa oficial
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
