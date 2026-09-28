import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, TextField, InputAdornment, Chip, Badge, CircularProgress, IconButton, Tooltip, Button, Dialog, DialogTitle, DialogContent, DialogActions, ToggleButton, ToggleButtonGroup, Alert, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { Search, FilterList, Refresh, Send, WhatsApp } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';
import { openWhatsAppInvite } from '../../utils/whatsappInvite';

const CONTACT_BADGES = {
  driver:     { emoji: '🚗', label: 'Motorista', color: '#2196F3' },
  passenger:  { emoji: '🧍', label: 'Passageiro', color: '#4CAF50' },
  pet:        { emoji: '🐾', label: 'Pet', color: '#D4AF37' },
  guide:      { emoji: '🏖️', label: 'Guia', color: '#FF9800' },
  consultant: { emoji: '💼', label: 'Consultor', color: '#9C27B0' },
  lead:       { emoji: '✨', label: 'Lead', color: '#FFD700' },
  manager:    { emoji: '📋', label: 'Candidato a Gestor', color: '#D4AF37' },
  support:    { emoji: '🛟', label: 'Suporte', color: '#607D8B' },
  unknown:    { emoji: '❓', label: 'Desconhecido', color: '#9E9E9E' },
};

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'new', label: 'Novas' },
  { value: 'in_progress', label: 'Em atendimento' },
  { value: 'awaiting_reply', label: 'Aguardando' },
  { value: 'resolved', label: 'Resolvidas' },
];

const TYPE_FILTERS = [
  { value: '', label: 'Todos os tipos' },
  ...Object.entries(CONTACT_BADGES).map(([k, v]) => ({ value: k, label: `${v.emoji} ${v.label}` })),
];

function timeAgo(d) { if (!d) return ''; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return 'agora'; if (m < 60) return `${m}min`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`; }
function fmtTime(d) { if (!d) return ''; const dt = new Date(d); return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function fmtDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); }
function fmtDateTime(d) { if (!d) return ''; return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function getDisplayName(c) { return c.contact_name || c.whatsapp_name || c.phone; }

// ─── Context Panel (Coluna 3) ───
function ContextPanel({ chatData, badge, token, onUpdate }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(chatData.internal_notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setNotes(chatData.internal_notes || ''); setEditingNotes(false); }, [chatData.id]);

  const patch = async (data) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/whatsapp/conversations/${chatData.id}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) onUpdate(result.data);
    } catch (e) { console.error('[WA] patch:', e); }
    finally { setSaving(false); }
  };

  const le = chatData.linkedEntity;
  const statusOptions = [
    { value: 'new', label: 'Nova', color: '#FFD700' },
    { value: 'in_progress', label: 'Em atendimento', color: '#2196F3' },
    { value: 'awaiting_reply', label: 'Aguardando', color: '#FF9800' },
    { value: 'resolved', label: 'Resolvida', color: '#4CAF50' },
    { value: 'spam', label: 'Spam', color: '#666' },
  ];

  const cardSx = { bgcolor: '#111a22', borderRadius: 2, p: 1.5, border: '1px solid #1a2332' };
  const labelSx = { fontSize: 10, color: '#5a7a8a', mb: 0.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 };

  return (
    <Box sx={{ width: 300, minWidth: 300, bgcolor: '#0d1117', borderRadius: 3, border: '1px solid #1a2332', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
      <Box sx={{ px: 2, py: 1.8, borderBottom: '1px solid #1a2332', background: 'linear-gradient(180deg, #111a22 0%, #0d1117 100%)' }}>
        <Typography sx={{ fontSize: 11, color: '#5a7a8a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Contexto KAVIAR</Typography>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: '#1a2332', borderRadius: 3 } }}>

        {/* Contato */}
        <Box sx={cardSx}>
          <Typography sx={labelSx}>Contato</Typography>
          <Typography sx={{ fontSize: 14, color: '#f0f4f8', fontWeight: 600 }}>{getDisplayName(chatData)}</Typography>
          {chatData.whatsapp_name && chatData.contact_name && chatData.whatsapp_name !== chatData.contact_name && (
            <Typography sx={{ fontSize: 11, color: '#7a8a9a', mt: 0.2 }}>WhatsApp: {chatData.whatsapp_name}</Typography>
          )}
          <Typography sx={{ fontSize: 12, color: '#8a9aaa', mt: 0.3 }}>{chatData.phone}</Typography>
        </Box>

        {/* Prioridade */}
        {chatData.priority === 'urgent' && (
          <Box sx={{ ...cardSx, bgcolor: 'rgba(211,47,47,0.06)', borderColor: 'rgba(211,47,47,0.15)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#D32F2F', boxShadow: '0 0 8px rgba(211,47,47,0.4)' }} />
              <Typography sx={{ fontSize: 12, color: '#e57373', fontWeight: 600 }}>Prioridade urgente</Typography>
            </Box>
            <Typography sx={{ fontSize: 10, color: '#7a5a5a', mt: 0.5, pl: 2.2 }}>Mensagem de emergência detectada</Typography>
          </Box>
        )}

        {/* Tipo de contato */}
        <Box sx={cardSx}>
          <Typography sx={labelSx}>Classificação</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {Object.entries(CONTACT_BADGES).map(([key, b]) => (
              <Chip key={key} label={`${b.emoji} ${b.label}`} size="small"
                onClick={() => patch({ contact_type: key })}
                sx={{
                  height: 24, fontSize: 10, fontWeight: chatData.contact_type === key ? 700 : 400, cursor: 'pointer',
                  bgcolor: chatData.contact_type === key ? b.color + '33' : 'transparent',
                  color: chatData.contact_type === key ? b.color : '#888',
                  border: `1px solid ${chatData.contact_type === key ? b.color + '66' : '#333'}`,
                  '&:hover': { bgcolor: b.color + '22' },
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Entidade vinculada */}
        {le && (
          <Box sx={cardSx}>
            <Typography sx={labelSx}>Entidade vinculada</Typography>
            <Typography sx={{ fontSize: 13, color: '#f0f4f8', fontWeight: 600 }}>{le.name}</Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              <Chip label={`Status: ${le.status}`} size="small" sx={{ height: 20, fontSize: 10, bgcolor: '#1a2332', color: '#8a9aaa' }} />
              {le.credits !== undefined && (
                <Chip label={`Saldo: ${le.credits}`} size="small" sx={{ height: 20, fontSize: 10, bgcolor: '#FFD70022', color: '#FFD700' }} />
              )}
            </Box>
            {le.email && <Typography sx={{ fontSize: 11, color: '#888', mt: 0.5 }}>{le.email}</Typography>}

            {/* Atalhos */}
            <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
              {chatData.linked_entity_type === 'driver' && (
                <Chip label="Abrir motorista →" size="small" component="a" href={`/admin/drivers/${le.id}`} clickable
                  sx={{ height: 24, fontSize: 10, bgcolor: '#2196F322', color: '#2196F3', border: '1px solid #2196F344', cursor: 'pointer' }} />
              )}
              {chatData.linked_entity_type === 'passenger' && (
                <Chip label="Abrir passageiro →" size="small" component="a" href={`/admin/passengers/${le.id}`} clickable
                  sx={{ height: 24, fontSize: 10, bgcolor: '#4CAF5022', color: '#4CAF50', border: '1px solid #4CAF5044', cursor: 'pointer' }} />
              )}
              {chatData.linked_entity_type === 'crm_lead' && le.lead_type === 'TERRITORIAL_MANAGER' && (
                <Chip label="Candidatura de Gestor vinculada ao CRM" size="small"
                  sx={{ height: 24, fontSize: 10, bgcolor: '#D4AF3722', color: '#D4AF37' }} />
              )}
              {chatData.linked_entity_type === 'pet_homologation' && (
                <Chip label="Abrir homologação Pet →" size="small" component="a" href={`/admin/pet/homologations/${le.id}`} clickable
                  sx={{ height: 24, fontSize: 10, bgcolor: '#D4AF3722', color: '#D4AF37', border: '1px solid #D4AF3744', cursor: 'pointer' }} />
              )}
            </Box>
          </Box>
        )}

        {!le && chatData.contact_type === 'unknown' && (
          <Box sx={{ ...cardSx, borderColor: '#FFD70033' }}>
            <Typography sx={{ fontSize: 11, color: '#FFD700', fontWeight: 600 }}>Contato não vinculado</Typography>
            <Typography sx={{ fontSize: 10, color: '#888', mt: 0.3 }}>Classifique acima ou vincule a uma entidade existente.</Typography>
          </Box>
        )}

        {/* Status */}
        <Box sx={cardSx}>
          <Typography sx={labelSx}>Status da conversa</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {statusOptions.map(s => (
              <Chip key={s.value} label={s.label} size="small"
                onClick={() => patch({ status: s.value })}
                sx={{
                  height: 24, fontSize: 10, fontWeight: chatData.status === s.value ? 700 : 400, cursor: 'pointer',
                  bgcolor: chatData.status === s.value ? s.color + '33' : 'transparent',
                  color: chatData.status === s.value ? s.color : '#888',
                  border: `1px solid ${chatData.status === s.value ? s.color + '66' : '#333'}`,
                  '&:hover': { bgcolor: s.color + '22' },
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Notas internas */}
        <Box sx={cardSx}>
          <Typography sx={labelSx}>Notas internas</Typography>
          {editingNotes ? (
            <Box>
              <TextField fullWidth multiline rows={3} size="small" value={notes} onChange={e => setNotes(e.target.value)}
                InputProps={{ sx: { bgcolor: '#111217', color: '#ddd', fontSize: 12, '& fieldset': { borderColor: '#1a2332' } } }} />
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                <Chip label={saving ? '...' : 'Salvar'} size="small" onClick={() => { patch({ internal_notes: notes }); setEditingNotes(false); }}
                  sx={{ height: 22, fontSize: 10, bgcolor: '#25D36633', color: '#25D366', cursor: 'pointer', '&:hover': { bgcolor: '#25D36644' } }} />
                <Chip label="Cancelar" size="small" onClick={() => { setNotes(chatData.internal_notes || ''); setEditingNotes(false); }}
                  sx={{ height: 22, fontSize: 10, bgcolor: '#333', color: '#888', cursor: 'pointer' }} />
              </Box>
            </Box>
          ) : (
            <Box onClick={() => setEditingNotes(true)} sx={{ cursor: 'pointer', minHeight: 30, '&:hover': { bgcolor: '#15151522' } }}>
              {chatData.internal_notes ? (
                <Typography sx={{ fontSize: 12, color: '#bbb', whiteSpace: 'pre-wrap' }}>{chatData.internal_notes}</Typography>
              ) : (
                <Typography sx={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>Clique para adicionar nota...</Typography>
              )}
            </Box>
          )}
        </Box>

        {/* Meta */}
        <Box sx={{ ...cardSx, bgcolor: 'transparent', border: 'none', px: 0 }}>
          <Typography sx={{ fontSize: 10, color: '#5a6a7a' }}>Criada: {chatData.created_at ? new Date(chatData.created_at).toLocaleString('pt-BR') : '—'}</Typography>
          <Typography sx={{ fontSize: 10, color: '#5a6a7a' }}>Mensagens: {chatData.message_count}</Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default function WhatsAppCentral() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteTargetName, setInviteTargetName] = useState('');
  const [inviteType, setInviteType] = useState('driver');
  const [officialSending, setOfficialSending] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState(null);
  const [inviteStats, setInviteStats] = useState({ today: 0, week: 0, month: 0, byType: {}, byStatus: {} });
  const [inviteLogs, setInviteLogs] = useState([]);
  const [inviteReportScope, setInviteReportScope] = useState(null);
  const [selectedInvitePeriod, setSelectedInvitePeriod] = useState('30d');
  const admin = JSON.parse(localStorage.getItem('kaviar_admin_data') || '{}');
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';
  const dailyInviteLimit = isSuperAdmin ? 200 : 30;
  const localInviteScopeLabel = isSuperAdmin ? 'Visão global' : 'Visão do seu território';
  const inviteReportTerritories = Array.isArray(inviteReportScope?.territoryIdsApplied) ? inviteReportScope.territoryIdsApplied : [];
  const inviteScopeLabel = inviteReportScope
    ? (inviteReportScope.global
      ? 'Visão global confirmada pelo backend'
      : 'Visão filtrada por território (' + (inviteReportTerritories.length || 0) + ')')
    : localInviteScopeLabel;
  const invitePeriodCards = [
    { period: 'today', label: 'Hoje', value: inviteStats.today },
    { period: '7d', label: 'Últimos 7 dias', value: inviteStats.week },
    { period: '30d', label: 'Últimos 30 dias', value: inviteStats.month },
  ];
  const selectedInvitePeriodLabel = invitePeriodCards.find(card => card.period === selectedInvitePeriod)?.label || 'Últimos 30 dias';

  // Chat state
  const [selectedId, setSelectedId] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('conversation');
    return requested && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requested) ? requested : null;
  });
  const [chatData, setChatData] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const token = localStorage.getItem('kaviar_admin_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ─── Conversations ───
  const loadConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('contact_type', typeFilter);
      params.set('limit', '50');
      const res = await fetch(`${API_BASE_URL}/api/admin/whatsapp/conversations?${params}`, { headers });
      const data = await res.json();
      if (data.success) { setConversations(data.data); setUnreadTotal(data.unreadTotal); }
    } catch (e) { console.error('[WA] load:', e); }
    finally { setLoading(false); }
  }, [search, statusFilter, typeFilter, token]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadInviteReport = useCallback(async () => {
    try {
      const [statsRes, logsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/whatsapp-invites/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/whatsapp-invites/logs?limit=50&period=${selectedInvitePeriod}`, { headers }),
      ]);
      const statsData = await statsRes.json();
      const logsData = await logsRes.json();
      if (statsData.success) {
        setInviteStats(statsData.data);
        setInviteReportScope(statsData.scope || null);
      }
      if (logsData.success) {
        setInviteLogs(logsData.data);
        if (!statsData.success) setInviteReportScope(logsData.scope || null);
      }
    } catch (e) {
      console.error('[WA_INVITES] report:', e);
    }
  }, [token, selectedInvitePeriod]);

  useEffect(() => { loadInviteReport(); }, [loadInviteReport]);
  useEffect(() => { const id = setInterval(() => { if (!isTyping) loadConversations(); }, 15000); return () => clearInterval(id); }, [loadConversations, isTyping]);

  // ─── Chat detail ───
  const openChat = useCallback(async (convId) => {
    setSelectedId(convId);
    // Só mostra loading na primeira abertura, não no refresh
    if (!chatData || chatData.id !== convId) setChatLoading(true);
    setSendError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/whatsapp/conversations/${convId}`, { headers });
      const data = await res.json();
      if (data.success) {
        setChatData(data.data);
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
      }
    } catch (e) { console.error('[WA] chat:', e); }
    finally { setChatLoading(false); }
  }, [token, chatData?.id]);

  useEffect(() => { if (selectedId) openChat(selectedId); }, [selectedId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatData?.messages]);

  // Refresh chat every 10s if open (pause while typing)
  useEffect(() => {
    if (!selectedId) return;
    const id = setInterval(() => { if (!isTyping) openChat(selectedId); }, 10000);
    return () => clearInterval(id);
  }, [selectedId, openChat, isTyping]);

  // ─── Send reply ───
  const handleSend = async () => {
    if (!replyText.trim() || !selectedId || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/whatsapp/conversations/${selectedId}/messages`, {
        method: 'POST', headers, body: JSON.stringify({ body: replyText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyText('');
        // Append message locally for instant feedback
        setChatData(prev => prev ? {
          ...prev,
          messages: [...prev.messages, data.data],
          last_message_at: new Date().toISOString(),
          last_message_preview: replyText.trim().substring(0, 200),
          message_count: prev.message_count + 1,
        } : prev);
        // Update list
        setConversations(prev => prev.map(c => c.id === selectedId ? {
          ...c, last_message_at: new Date().toISOString(),
          last_message_preview: replyText.trim().substring(0, 200),
          message_count: c.message_count + 1,
          status: c.status === 'new' ? 'in_progress' : c.status,
        } : c));
      } else {
        setSendError(data.error || 'Erro ao enviar');
      }
    } catch (e) { setSendError('Erro de conexão'); }
    finally { setSending(false); }
  };

  const handleOpenInvite = () => {
    openWhatsAppInvite(invitePhone, inviteType);
    setInviteOpen(false);
  };

  const handleOfficialInvite = async () => {
    if (!invitePhone.trim() || officialSending) return;
    setOfficialSending(true);
    setInviteFeedback(null);
    try {
      const map = { motorista: 'driver', passageiro: 'passenger', gestor: 'manager', guia: 'guide' };
      const sendType = (String(inviteType || '').trim().toLowerCase());
      const canonicalType = map[sendType] || (sendType || '');
      const res = await fetch(`${API_BASE_URL}/api/admin/whatsapp-invites/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: invitePhone, type: canonicalType, targetName: inviteTargetName || undefined, force: false }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === 'DUPLICATE_INVITE') {
        setInviteFeedback({ type: 'warning', message: `Este número já recebeu esse convite recentemente. Último envio: ${fmtDateTime(data.lastInvite?.createdAt)}.` });
        return;
      }
      if (!data.success) {
        if (data.code === 'DAILY_LIMIT_REACHED') {
          setInviteFeedback({ type: 'error', message: `${data.message || 'Limite diário de convites oficiais atingido.'} (${data.used || dailyInviteLimit}/${data.limit || dailyInviteLimit})` });
          return;
        }
        setInviteFeedback({ type: 'error', message: data.error || data.message || 'Erro ao enviar convite oficial.' });
        return;
      }
      setInviteFeedback({ type: 'success', message: 'Convite oficial enviado e registrado.' });
      setInvitePhone('');
      setInviteTargetName('');
      await loadInviteReport();
    } catch (e) {
      setInviteFeedback({ type: 'error', message: 'Erro de conexão ao enviar convite oficial.' });
    } finally {
      setOfficialSending(false);
    }
  };

  // ─── Date separator helper ───
  function shouldShowDate(messages, idx) {
    if (idx === 0) return true;
    const prev = new Date(messages[idx - 1].created_at).toDateString();
    const curr = new Date(messages[idx].created_at).toDateString();
    return prev !== curr;
  }

  // ─── Render ───
  const activeBadge = chatData ? (CONTACT_BADGES[chatData.contact_type] || CONTACT_BADGES.unknown) : null;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2, pt: 2 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ color: '#e0e6ed', fontWeight: 700, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="span" sx={{ color: '#25D366', fontSize: 22 }}>●</Box> Central de Atendimento WhatsApp
          </Typography>
          <Typography variant="body2" sx={{ color: '#BFC7D5', mt: 0.5 }}>
            Conversas, contexto e operação em um só lugar
          </Typography>
          <Typography variant="caption" sx={{ color: '#8a9aaa', display: 'block', mt: 0.6 }}>
            {inviteScopeLabel} · Seu limite diário: {dailyInviteLimit} convites oficiais.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<WhatsApp />}
          onClick={() => setInviteOpen(true)}
          sx={{ bgcolor: '#25D366', color: '#06130b', fontWeight: 800, textTransform: 'none', borderRadius: 2, px: 2, '&:hover': { bgcolor: '#1da851' } }}
        >
          Novo convite
        </Button>
      </Box>

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: '#0d1117', color: '#e0e6ed', borderRadius: 3, border: '1px solid #1a2332' } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Novo convite</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <TextField
            autoFocus
            label="Telefone/WhatsApp"
            placeholder="(21) 99999-9999"
            value={invitePhone}
            onChange={(e) => setInvitePhone(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ sx: { color: '#8a9aaa' } }}
            InputProps={{ sx: { bgcolor: '#111a22', color: '#E8E3D5', '& fieldset': { borderColor: '#1a2332' } } }}
          />
          <Typography sx={{ mt: -1, color: '#9fb0c3', fontSize: 12, lineHeight: 1.45 }}>
            O envio oficial via Twilio exige telefone. O envio manual apenas abre o WhatsApp.
          </Typography>
          <TextField
            label="Nome opcional"
            placeholder="Nome do contato"
            value={inviteTargetName}
            onChange={(e) => setInviteTargetName(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ sx: { color: '#8a9aaa' } }}
            InputProps={{ sx: { bgcolor: '#111a22', color: '#E8E3D5', '& fieldset': { borderColor: '#1a2332' } } }}
          />
          {!invitePhone.trim() && (
            <Alert severity="info" sx={{ bgcolor: '#102033', color: '#BFC7D5', border: '1px solid #1a3a55', '& .MuiAlert-icon': { color: '#6ab7ff' } }}>
              Sem telefone, o WhatsApp abre apenas com a mensagem pronta para escolher o destinatário.
            </Alert>
          )}
          <Box>
            <Typography sx={{ fontSize: 12, color: '#8a9aaa', fontWeight: 700, mb: 1 }}>Tipo de convite</Typography>
            <ToggleButtonGroup
              exclusive
              value={inviteType}
              onChange={(_, value) => value && setInviteType(value)}
              fullWidth
              size="small"
              sx={{ '& .MuiToggleButton-root': { color: '#BFC7D5', borderColor: '#1a2332', textTransform: 'none', fontWeight: 700 }, '& .Mui-selected': { bgcolor: '#25D36622 !important', color: '#25D366 !important' } }}
            >
              <ToggleButton value="driver">Motorista</ToggleButton>
              <ToggleButton value="passenger">Passageiro</ToggleButton>
              {isSuperAdmin && <ToggleButton value="manager">Gestor</ToggleButton>}
            </ToggleButtonGroup>
          </Box>
          {inviteFeedback && (
            <Alert severity={inviteFeedback.type} sx={{ bgcolor: inviteFeedback.type === 'success' ? '#10261a' : inviteFeedback.type === 'warning' ? '#2b210c' : '#2a1212', color: '#E8E3D5', border: '1px solid #1a2332', '& .MuiAlert-icon': { color: inviteFeedback.type === 'success' ? '#25D366' : inviteFeedback.type === 'warning' ? '#D4AF37' : '#f44336' } }}>
              {inviteFeedback.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1.2, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
          <Button
            variant="outlined"
            startIcon={<WhatsApp />}
            onClick={handleOpenInvite}
            fullWidth
            sx={{ minHeight: 46, borderColor: '#25D366', color: '#25D366', fontWeight: 900, textTransform: 'none', borderRadius: 2, justifyContent: 'center', '&:hover': { borderColor: '#45e07c', bgcolor: '#25D36618' } }}
          >
            Abrir WhatsApp manual
          </Button>
          <Button
            variant="contained"
            startIcon={officialSending ? <CircularProgress size={16} sx={{ color: '#06130b' }} /> : <Send />}
            disabled={!invitePhone.trim() || officialSending}
            onClick={handleOfficialInvite}
            fullWidth
            sx={{
              minHeight: 48,
              bgcolor: '#D4AF37',
              color: '#06130b',
              fontWeight: 900,
              textTransform: 'none',
              borderRadius: 2,
              boxShadow: '0 8px 18px rgba(212, 175, 55, 0.18)',
              '&:hover': { bgcolor: '#e0bf50', boxShadow: '0 10px 22px rgba(212, 175, 55, 0.24)' },
              '&.Mui-disabled': {
                bgcolor: '#3d3520',
                color: '#e7d28a',
                border: '1px solid #8f7730',
                opacity: 1,
                boxShadow: 'none',
              },
            }}
          >
            {invitePhone.trim() ? 'Enviar convite oficial via Twilio' : 'Digite o telefone para enviar oficial'}
          </Button>
          <Button onClick={() => setInviteOpen(false)} sx={{ alignSelf: 'center', color: '#8a9aaa', textTransform: 'none' }}>Cancelar</Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ mb: 2.5, bgcolor: '#0d1117', borderRadius: 3, border: '1px solid #1a2332', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #1a2332', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography sx={{ color: '#e0e6ed', fontWeight: 800, fontSize: 14 }}>Relatório de convites oficiais</Typography>
            <Typography sx={{ color: '#6a7a8a', fontSize: 11, mt: 0.3 }}>{inviteScopeLabel}</Typography>
          </Box>
          <Tooltip title="Atualizar relatório"><IconButton size="small" onClick={loadInviteReport}><Refresh sx={{ color: '#6a7a8a', fontSize: 16 }} /></IconButton></Tooltip>
        </Box>
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.2 }}>
          {invitePeriodCards.map(card => {
            const selected = selectedInvitePeriod === card.period;
            return (
              <Box
                key={card.period}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedInvitePeriod(card.period)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedInvitePeriod(card.period); }}
                sx={{ bgcolor: selected ? '#16251b' : '#111a22', border: selected ? '1px solid #25D366' : '1px solid #1a2332', borderRadius: 2, px: 2, py: 1.4, cursor: 'pointer', outline: 'none', boxShadow: selected ? '0 0 0 1px rgba(37, 211, 102, 0.25)' : 'none', transition: 'border-color 0.15s, background 0.15s', '&:hover': { borderColor: selected ? '#25D366' : '#2d3a48', bgcolor: selected ? '#16251b' : '#141f28' }, '&:focus-visible': { borderColor: '#25D366', boxShadow: '0 0 0 2px rgba(37, 211, 102, 0.25)' } }}
              >
                <Typography sx={{ color: selected ? '#25D366' : '#6a7a8a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{card.label}</Typography>
                <Typography sx={{ color: '#D4AF37', fontSize: 24, fontWeight: 900 }}>{card.value || 0}</Typography>
              </Box>
            );
          })}
        </Box>
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography sx={{ color: '#6a7a8a', fontSize: 11 }}>Exibindo últimos 50 registros: {selectedInvitePeriodLabel}</Typography>
        </Box>
        <Box sx={{ px: 2, pb: 2, overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 760, '& th': { color: '#6a7a8a', borderColor: '#1a2332', fontSize: 11 }, '& td': { color: '#BFC7D5', borderColor: '#1a2332', fontSize: 12 } }}>
            <TableHead>
              <TableRow><TableCell>Data/hora</TableCell><TableCell>Usuário</TableCell><TableCell>Número</TableCell><TableCell>Tipo</TableCell><TableCell>Status</TableCell><TableCell>Território</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {inviteLogs.length === 0 ? (
                <TableRow><TableCell colSpan={6} sx={{ color: '#5a6a7a' }}>Nenhum convite oficial registrado.</TableCell></TableRow>
              ) : inviteLogs.map(log => (
                <TableRow key={log.id}>
                  <TableCell>{fmtDateTime(log.createdAt)}</TableCell>
                  <TableCell>{log.adminName || log.adminEmail || '-'}</TableCell>
                  <TableCell>{log.targetPhoneNormalized}</TableCell>
                  <TableCell>{CONTACT_BADGES[log.inviteType]?.label || log.inviteType}</TableCell>
                  <TableCell><Chip label={log.twilioStatus || 'queued'} size="small" sx={{ height: 20, fontSize: 10, bgcolor: '#1a2332', color: log.twilioStatus === 'failed' || log.twilioStatus === 'undelivered' ? '#f44336' : '#25D366' }} /></TableCell>
                  <TableCell>{log.territoryId || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, height: 'calc(100vh - 460px)', minHeight: 520 }}>

        {/* ═══ COLUNA 1 — CONVERSAS ═══ */}
        <Box sx={{ width: 360, minWidth: 360, display: 'flex', flexDirection: 'column', bgcolor: '#0d1117', borderRadius: 3, border: '1px solid #1a2332', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
          <Box sx={{ p: 1.5, borderBottom: '1px solid #1a2332' }}>
            <TextField fullWidth size="small" placeholder="Buscar nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: '#666', fontSize: 18 }} /></InputAdornment>,
                sx: { bgcolor: '#111a22', borderRadius: 2, color: '#E8E3D5', fontSize: 13, '& fieldset': { borderColor: '#1a2332' } } }} />
          </Box>
          <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #1a2332', display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map(f => (
              <Chip key={f.value} label={f.label} size="small" variant={statusFilter === f.value ? 'filled' : 'outlined'}
                onClick={() => setStatusFilter(f.value)}
                sx={{ fontSize: 11, height: 24, bgcolor: statusFilter === f.value ? '#128C7E' : 'transparent', color: statusFilter === f.value ? '#fff' : '#aaa', borderColor: '#1a2332', '&:hover': { bgcolor: statusFilter === f.value ? '#128C7E' : '#222' } }} />
            ))}
          </Box>
          <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #1a2332', display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <FilterList sx={{ color: '#555', fontSize: 14, mr: 0.5 }} />
            {TYPE_FILTERS.map(f => (
              <Chip key={f.value} label={f.label} size="small" variant={typeFilter === f.value ? 'filled' : 'outlined'}
                onClick={() => setTypeFilter(f.value)}
                sx={{ fontSize: 11, height: 24, bgcolor: typeFilter === f.value ? '#128C7E' : 'transparent', color: typeFilter === f.value ? '#fff' : '#aaa', borderColor: '#1a2332', '&:hover': { bgcolor: typeFilter === f.value ? '#128C7E' : '#222' } }} />
            ))}
          </Box>
          <Box sx={{ px: 1.5, py: 0.8, borderBottom: '1px solid #1a2332', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: '#888' }}>
              {conversations.length} conversa{conversations.length !== 1 ? 's' : ''}
              {unreadTotal > 0 && <Chip label={`${unreadTotal} não lida${unreadTotal > 1 ? 's' : ''}`} size="small" sx={{ ml: 1, height: 20, fontSize: 10, bgcolor: '#25D366', color: '#fff', fontWeight: 600 }} />}
            </Typography>
            <Tooltip title="Atualizar"><IconButton size="small" onClick={() => { setLoading(true); loadConversations(); }}><Refresh sx={{ color: '#666', fontSize: 16 }} /></IconButton></Tooltip>
          </Box>

          {/* List */}
          <Box sx={{ flex: 1, overflowY: 'auto', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: '#333', borderRadius: 2 } }}>
            {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}><CircularProgress size={24} sx={{ color: '#25D366' }} /></Box>
            : conversations.length === 0 ? <Box sx={{ textAlign: 'center', pt: 6 }}><Typography sx={{ color: '#555', fontSize: 13 }}>Nenhuma conversa</Typography></Box>
            : conversations.map(conv => {
              const badge = CONTACT_BADGES[conv.contact_type] || CONTACT_BADGES.unknown;
              const isUrgent = conv.priority === 'urgent';
              const isSel = selectedId === conv.id;
              const hasUnread = conv.unread_count > 0;
              return (
                <Box key={conv.id} onClick={() => setSelectedId(conv.id)} sx={{
                  px: 1.5, py: 1.2, cursor: 'pointer', display: 'flex', gap: 1.2, alignItems: 'flex-start',
                  borderBottom: '1px solid #111a22',
                  borderLeft: isUrgent ? '3px solid #f44336' : isSel ? '3px solid #25D366' : '3px solid transparent',
                  bgcolor: isSel ? '#1a1a2e' : isUrgent ? 'rgba(244,67,54,0.06)' : 'transparent',
                  '&:hover': { bgcolor: isSel ? '#1a1a2e' : '#151515' }, transition: 'background 0.15s',
                }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: badge.color + '22', border: `1.5px solid ${badge.color}44`, flexShrink: 0, mt: 0.3, fontSize: 18 }}>
                    {isUrgent ? '🚨' : badge.emoji}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.2 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: hasUnread ? 700 : 500, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{getDisplayName(conv)}</Typography>
                      <Typography sx={{ fontSize: 10, color: '#666', flexShrink: 0, ml: 1 }}>{timeAgo(conv.last_message_at)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
                      <Chip label={badge.label} size="small" sx={{ height: 16, fontSize: 9, fontWeight: 600, bgcolor: badge.color + '22', color: badge.color, border: `1px solid ${badge.color}44` }} />
                      {isUrgent && <Chip label="URGENTE" size="small" sx={{ height: 16, fontSize: 9, fontWeight: 800, bgcolor: '#f4433622', color: '#f44336', border: '1px solid #f4433644' }} />}
                      {conv.status === 'resolved' && <Chip label="✓" size="small" sx={{ height: 16, fontSize: 9, bgcolor: '#4CAF5022', color: '#4CAF50' }} />}
                    </Box>
                    <Typography sx={{ fontSize: 11.5, color: hasUnread ? '#ccc' : '#666', fontWeight: hasUnread ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.last_message_preview || '...'}
                    </Typography>
                  </Box>
                  {hasUnread && <Badge badgeContent={conv.unread_count} sx={{ mt: 1.5, '& .MuiBadge-badge': { bgcolor: '#25D366', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 18, height: 18 } }}><Box /></Badge>}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* ═══ COLUNA 2 — CHAT ═══ */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: '#0d1117', borderRadius: 3, border: '1px solid #1a2332', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
          {!selectedId ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #0f1820 0%, #0a0e14 100%)' }}>
              <Box sx={{ textAlign: 'center', maxWidth: 360 }}>
                <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: '#25D36612', border: '1px solid #25D36622', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2.5 }}>
                  <Typography sx={{ fontSize: 24 }}>💬</Typography>
                </Box>
                <Typography sx={{ color: '#e0e6ed', fontSize: 15, fontWeight: 600, mb: 0.5 }}>Nenhuma conversa selecionada</Typography>
                <Typography sx={{ color: '#6a7a8a', fontSize: 12, lineHeight: 1.7, mb: 3 }}>Escolha uma conversa à esquerda para visualizar o histórico e responder.</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
                  {[
                    { n: String(conversations.length), l: 'Conversas', c: '#25D366' },
                    { n: String(unreadTotal), l: 'Não lidas', c: '#FF9800' },
                    { n: String(conversations.filter(c => c.priority === 'urgent').length), l: 'Urgentes', c: '#e57373' },
                  ].map(s => (
                    <Box key={s.l} sx={{ textAlign: 'center', bgcolor: '#111a22', borderRadius: 2, px: 2.5, py: 1.5, border: '1px solid #1a2332', minWidth: 80 }}>
                      <Typography sx={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.n}</Typography>
                      <Typography sx={{ fontSize: 9, color: '#5a7a8a', textTransform: 'uppercase', letterSpacing: 0.4, mt: 0.3 }}>{s.l}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          ) : chatLoading ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={28} sx={{ color: '#25D366' }} /></Box>
          ) : chatData ? (
            <>
              {/* Chat header */}
              <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #1a2332', background: 'linear-gradient(180deg, #111a22 0%, #0d1117 100%)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: (activeBadge?.color || '#666') + '18', border: `2px solid ${(activeBadge?.color || '#666')}55`, fontSize: 20 }}>
                    {chatData.priority === 'urgent' ? '🚨' : activeBadge?.emoji}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#f0f0f0', letterSpacing: 0.3 }}>{getDisplayName(chatData)}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.3 }}>
                      <Typography sx={{ fontSize: 12, color: '#6a7a8a' }}>{chatData.phone}</Typography>
                      <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: '#333' }} />
                      <Chip label={activeBadge?.label} size="small" sx={{ height: 18, fontSize: 10, bgcolor: (activeBadge?.color || '#666') + '18', color: activeBadge?.color }} />
                      {chatData.priority === 'urgent' && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}><Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#e57373', boxShadow: '0 0 6px rgba(229,115,115,0.5)' }} /><Typography sx={{ fontSize: 10, color: '#e57373', fontWeight: 600 }}>Urgente</Typography></Box>}
                    </Box>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ fontSize: 10, color: '#4a5a6a' }}>{chatData.message_count} mensagens</Typography>
                    <Typography sx={{ fontSize: 10, color: '#4a5a6a' }}>{timeAgo(chatData.last_message_at)}</Typography>
                  </Box>
                </Box>
              </Box>

              {/* Messages */}
              <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 0.5, background: 'radial-gradient(ellipse at center, #0f1820 0%, #0a0e14 100%)', '&::-webkit-scrollbar': { width: 5 }, '&::-webkit-scrollbar-thumb': { bgcolor: '#1a2332', borderRadius: 3 } }}>
                {(chatData.messages || []).map((msg, idx) => {
                  const isOut = msg.direction === 'outbound';
                  const showDate = shouldShowDate(chatData.messages, idx);
                  return (
                    <Box key={msg.id}>
                      {showDate && (
                        <Box sx={{ textAlign: 'center', my: 2 }}>
                          <Chip label={fmtDate(msg.created_at)} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 600, bgcolor: '#111a22', color: '#5a7a8a', border: '1px solid #1a2332', px: 1 }} />
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', mb: 0.8 }}>
                        <Box sx={{
                          maxWidth: '72%', px: 1.8, py: 1.2, borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          bgcolor: isOut ? '#0B3D2E' : '#141e2a',
                          border: isOut ? '1px solid #1a5c40' : '1px solid #1a2a3a',
                          boxShadow: isOut ? '0 2px 8px rgba(37,211,102,0.08)' : '0 2px 8px rgba(0,0,0,0.15)',
                        }}>
                          {isOut && msg.sent_by_admin_name && (
                            <Typography sx={{ fontSize: 10, color: '#25D366', fontWeight: 600, mb: 0.3 }}>
                              {msg.sent_by_admin_name}
                            </Typography>
                          )}
                          {msg.media_url && msg.media_type?.startsWith('image/') && (
                            <Box component="img" src={`${API_BASE_URL}/api/admin/whatsapp/messages/${msg.id}/media?token=${token}`} alt="Mídia" sx={{ maxWidth: '100%', maxHeight: 280, borderRadius: 1.5, mb: 0.5, cursor: 'pointer' }} onClick={() => window.open(`${API_BASE_URL}/api/admin/whatsapp/messages/${msg.id}/media?token=${token}`, '_blank')} />
                          )}
                          {msg.media_url && !msg.media_type?.startsWith('image/') && (
                            <Chip label={`📎 ${msg.media_type || 'Arquivo'}`} size="small" component="a" href={`${API_BASE_URL}/api/admin/whatsapp/messages/${msg.id}/media?token=${token}`} target="_blank" clickable sx={{ mb: 0.5, height: 22, fontSize: 10, bgcolor: '#1a2332', color: '#8a9aaa', cursor: 'pointer' }} />
                          )}
                          {msg.body && (
                          <Typography sx={{ fontSize: 13, color: '#ddd', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {msg.body}
                          </Typography>
                          )}
                          <Typography sx={{ fontSize: 9, color: '#555', textAlign: 'right', mt: 0.3 }}>
                            {fmtTime(msg.created_at)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
                <div ref={messagesEndRef} />
              </Box>

              {/* Reply input */}
              <Box sx={{ px: 2.5, py: 2, borderTop: '1px solid #1a2332', background: 'linear-gradient(0deg, #111a22 0%, #0d1117 100%)', display: 'flex', gap: 1.2, alignItems: 'flex-end' }}>
                <TextField
                  fullWidth multiline maxRows={4} size="small" placeholder="Escreva sua mensagem..."
                  value={replyText} onChange={e => { setReplyText(e.target.value); setSendError(''); }}
                  onFocus={() => setIsTyping(true)} onBlur={() => setIsTyping(false)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  InputProps={{ sx: { bgcolor: '#111a22', borderRadius: 3, color: '#e0e0e0', fontSize: 14, px: 0.5, '& fieldset': { borderColor: '#1a2332' }, '&:focus-within fieldset': { borderColor: '#25D366 !important' } } }}
                />
                <IconButton onClick={handleSend} disabled={!replyText.trim() || sending}
                  sx={{ bgcolor: replyText.trim() ? '#25D366' : '#1a2332', color: replyText.trim() ? '#fff' : '#4a5a6a', width: 44, height: 44, borderRadius: 3, transition: 'all 0.2s', '&:hover': { bgcolor: '#1da851', transform: 'scale(1.05)' }, '&.Mui-disabled': { bgcolor: '#111a22', color: '#333' } }}>
                  {sending ? <CircularProgress size={18} sx={{ color: '#000' }} /> : <Send sx={{ fontSize: 18 }} />}
                </IconButton>
              </Box>
              {sendError && <Typography sx={{ px: 2, pb: 1, fontSize: 11, color: '#f44336' }}>{sendError}</Typography>}
            </>
          ) : null}
        </Box>

        {/* ═══ COLUNA 3 — CONTEXTO ═══ */}
        {selectedId && chatData && (
          <ContextPanel
            chatData={chatData}
            badge={activeBadge}
            token={token}
            onUpdate={(updated) => {
              setChatData(prev => ({ ...prev, ...updated }));
              setConversations(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
            }}
          />
        )}
      </Box>
    </Box>
  );
}
