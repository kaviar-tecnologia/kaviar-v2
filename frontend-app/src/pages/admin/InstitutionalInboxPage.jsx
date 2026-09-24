import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArchiveOutlined,
  AttachFileOutlined,
  DeleteForeverOutlined,
  DeleteOutline,
  InboxOutlined,
  MailOutline,
  MarkEmailReadOutlined,
  RestoreOutlined,
} from '@mui/icons-material';
import api from '../../api';

const PAGE_SIZE = 15;
const MAILBOX_VIEWS = [
  { value: 'ALL', label: 'Recebidos', Icon: InboxOutlined },
  { value: 'NEW', label: 'Não lidos', Icon: MailOutline },
  { value: 'READ', label: 'Lidos', Icon: MarkEmailReadOutlined },
  { value: 'ARCHIVED', label: 'Arquivados', Icon: ArchiveOutlined },
  { value: 'TRASHED', label: 'Lixeira', Icon: DeleteOutline },
];
const STATUS_LABELS = {
  NEW: 'Novo',
  READ: 'Lido',
  ARCHIVED: 'Arquivado',
  TRASHED: 'Na lixeira',
};
const MAX_REPLY_ATTACHMENTS = 3;
const MAX_REPLY_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const REPLY_ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png';
const SENT_STATUS_OPTIONS = ['ALL', 'SENT', 'ERROR'];
const DEFAULT_SENT_FILTERS = {
  to: '',
  status: 'ALL',
  dateFrom: '',
  dateTo: '',
};

function buildFriendlyError(error, fallback) {
  const status = error?.response?.status;
  const apiMessage = error?.response?.data?.error;

  if (status === 401) return 'Sessao expirada. Faca login novamente.';
  if (status === 403) return 'Voce nao tem permissao para acessar a caixa institucional.';
  if (status === 404) return apiMessage || 'Registro nao encontrado.';
  if (status === 503) return apiMessage || 'Inbox temporariamente indisponivel (migration pendente).';

  return apiMessage || fallback;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

function formatListDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Hoje, ${time}`;
  if (isYesterday) return `Ontem, ${time}`;
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${time}`;
}

function formatSender(item) {
  return item?.from_name?.trim() || item?.from_email || 'Remetente desconhecido';
}

function formatSubject(subject) {
  if (typeof subject !== 'string') return '(sem assunto)';
  const trimmed = subject.trim();
  return trimmed || '(sem assunto)';
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusChip({ status }) {
  const map = {
    NEW: { label: 'Novo', color: '#1D4ED8', bg: '#DBEAFE' },
    READ: { label: 'Lido', color: '#166534', bg: '#DCFCE7' },
    ARCHIVED: { label: 'Arquivado', color: '#6B7280', bg: '#F3F4F6' },
    TRASHED: { label: 'Na lixeira', color: '#991B1B', bg: '#FEE2E2' },
  };
  const cfg = map[status] || { label: status || 'N/A', color: '#374151', bg: '#E5E7EB' };

  return (
    <Chip
      size="small"
      label={cfg.label}
      sx={{
        fontWeight: 700,
        color: cfg.color,
        backgroundColor: cfg.bg,
        borderRadius: '8px',
      }}
    />
  );
}

function SentStatusChip({ status }) {
  const isSent = status === 'SENT';
  const label = isSent ? 'Enviado' : status === 'ERROR' ? 'Erro' : (status || 'N/A');

  return (
    <Chip
      size="small"
      label={label}
      sx={{
        fontWeight: 700,
        color: isSent ? '#166534' : '#991B1B',
        backgroundColor: isSent ? '#DCFCE7' : '#FEE2E2',
        borderRadius: '8px',
      }}
    />
  );
}

function formatAttachmentCount(count) {
  const safeCount = Number(count || 0);
  if (safeCount <= 0) return 'Sem anexos';
  if (safeCount === 1) return '1 anexo';
  return `${safeCount} anexos`;
}

function BodyBlock({ label, value }) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#374151', mb: 0.5 }}>{label}</Typography>
      <Box
        sx={{
          p: 1.2,
          borderRadius: 1.5,
          border: '1px solid #E5E7EB',
          backgroundColor: '#FAFAFA',
          maxHeight: 260,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          color: '#111827',
        }}
      >
        {value || '-'}
      </Box>
    </Box>
  );
}

function RiskBadge({ risk }) {
  if (!risk || risk.level !== 'HIGH') return null;

  return (
    <Chip
      size="small"
      label="MENSAGEM SUSPEITA"
      sx={{
        fontWeight: 800,
        color: '#991B1B',
        backgroundColor: '#FEE2E2',
        border: '1px solid #FCA5A5',
        borderRadius: '8px',
      }}
    />
  );
}

function formatRiskReason(reason) {
  const map = {
    MENTIONS_ATTACHMENT_WITHOUT_ATTACHMENT: 'Menciona anexo, mas nenhum anexo foi recebido.',
    EXTERNAL_LINK_PRESENT: 'Contem link externo no corpo da mensagem.',
    REPLY_TO_DIFFERS_FROM_FROM: 'Reply-To difere do remetente.',
  };
  return map[reason] || reason;
}

function RiskSummary({ risk }) {
  if (!risk || risk.level !== 'HIGH' || !Array.isArray(risk.reasons) || risk.reasons.length === 0) return null;

  return (
    <Box sx={{ mt: 1 }}>
      <Stack spacing={0.4}>
        {risk.reasons.map((reason) => (
          <Typography key={reason} sx={{ color: '#991B1B', fontSize: 12, fontWeight: 600 }}>
            • {formatRiskReason(reason)}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

function buildSentListParams(filters, page) {
  const params = {
    page,
    limit: PAGE_SIZE,
  };

  if (filters.to.trim()) params.to = filters.to.trim();
  if (filters.status !== 'ALL') params.status = filters.status;
  if (filters.dateFrom) params.date_from = filters.dateFrom;
  if (filters.dateTo) params.date_to = filters.dateTo;

  return params;
}

function parseEmailList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[,;\n]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmailList(emails, fieldLabel) {
  for (const email of emails) {
    if (!EMAIL_REGEX.test(email)) {
      return `${fieldLabel}: endereco "${email}" e invalido.`;
    }
  }
  return null;
}

export default function InstitutionalInboxPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('RECEBIDOS');

  const [filters, setFilters] = useState({
    status: 'ALL',
    to: '',
    from: '',
    q: '',
    dateFrom: '',
    dateTo: '',
  });

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [warningMessage, setWarningMessage] = useState('');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const [statusSaving, setStatusSaving] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyCc, setReplyCc] = useState('');
  const [replyBcc, setReplyBcc] = useState('');
  const [replyAttachments, setReplyAttachments] = useState([]);
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [replySuccess, setReplySuccess] = useState('');
  const [attachmentDownloadId, setAttachmentDownloadId] = useState(null);
  const [trashBusyId, setTrashBusyId] = useState(null);
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);
  const [emptyTrashConfirmation, setEmptyTrashConfirmation] = useState('');
  const [emptyTrashLoading, setEmptyTrashLoading] = useState(false);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState(null);
  const [permanentDeleteLoading, setPermanentDeleteLoading] = useState(false);

  const [sentFilters, setSentFilters] = useState(DEFAULT_SENT_FILTERS);
  const [sentItems, setSentItems] = useState([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentError, setSentError] = useState('');
  const [sentPage, setSentPage] = useState(1);
  const [sentHasMore, setSentHasMore] = useState(false);
  const [sentDetailsOpen, setSentDetailsOpen] = useState(false);
  const [selectedSentEmail, setSelectedSentEmail] = useState(null);

  const listParams = useMemo(() => {
    const params = {
      page,
      limit: PAGE_SIZE,
    };

    if (filters.status !== 'ALL') params.status = filters.status;
    if (filters.to.trim()) params.to = filters.to.trim();
    if (filters.from.trim()) params.from = filters.from.trim();
    if (filters.q.trim()) params.q = filters.q.trim();
    if (filters.dateFrom) params.date_from = filters.dateFrom;
    if (filters.dateTo) params.date_to = filters.dateTo;

    return params;
  }, [filters, page]);

  const resetReplyState = () => {
    setReplyMessage('');
    setReplyCc('');
    setReplyBcc('');
    setReplyAttachments([]);
    setReplySending(false);
    setReplyError('');
    setReplySuccess('');
  };

  const handleDownloadAttachment = async (attachmentId) => {
    setAttachmentDownloadId(attachmentId);
    setDetailsError('');

    if (!selectedEmail?.id) {
      setAttachmentDownloadId(null);
      return;
    }

    try {
      const response = await api.get(`/api/admin/inbound-emails/${selectedEmail.id}/attachments/${attachmentId}/download`);
      const url = response?.data?.data?.url;
      if (!url) throw new Error('URL temporaria indisponivel.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setDetailsError(buildFriendlyError(error, 'Nao foi possivel gerar o download do anexo.'));
    } finally {
      setAttachmentDownloadId(null);
    }
  };

  const loadList = async (targetPage = 1, append = false) => {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await api.get('/api/admin/inbound-emails', {
        params: {
          ...listParams,
          page: targetPage,
        },
      });

      const incoming = Array.isArray(response.data?.data) ? response.data.data : [];
      const totalPages = Number(response.data?.pagination?.totalPages || 0);
      const currentPage = Number(response.data?.pagination?.page || targetPage);

      setItems((prev) => (append ? [...prev, ...incoming] : incoming));
      setPage(currentPage);
      setHasMore(totalPages > 0 ? currentPage < totalPages : incoming.length >= PAGE_SIZE);
      setWarningMessage(response.data?.warning || '');
    } catch (error) {
      setErrorMessage(buildFriendlyError(error, 'Nao foi possivel carregar os emails recebidos.'));
      if (!append) setItems([]);
      setHasMore(false);
      setWarningMessage('');
    } finally {
      setLoading(false);
    }
  };

  const loadSentList = async (targetPage = 1, append = false, filtersOverride = sentFilters) => {
    setSentLoading(true);
    setSentError('');

    try {
      const response = await api.get('/api/admin/email/logs', {
        params: buildSentListParams(filtersOverride, targetPage),
      });

      const incoming = Array.isArray(response.data?.data) ? response.data.data : [];
      const totalPages = Number(response.data?.pagination?.totalPages || 0);
      const currentPage = Number(response.data?.pagination?.page || targetPage);

      setSentItems((prev) => (append ? [...prev, ...incoming] : incoming));
      setSentPage(currentPage);
      setSentHasMore(totalPages > 0 ? currentPage < totalPages : incoming.length >= PAGE_SIZE);
    } catch (error) {
      setSentError(buildFriendlyError(error, 'Nao foi possivel carregar os emails enviados.'));
      if (!append) setSentItems([]);
      setSentHasMore(false);
    } finally {
      setSentLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'RECEBIDOS') {
      loadList(1, false);
    }
  }, [filters, activeTab]);

  useEffect(() => {
    if (activeTab === 'ENVIADOS') {
      loadSentList(1, false, sentFilters);
    }
  }, [activeTab]);

  const openDetails = async (id) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsError('');
    setSelectedEmail(null);
    resetReplyState();

    try {
      const response = await api.get(`/api/admin/inbound-emails/${id}`);
      const loaded = response.data?.data || null;
      setSelectedEmail(loaded);

      if (loaded?.status === 'NEW') {
        try {
          const readResponse = await api.patch(`/api/admin/inbound-emails/${id}`, { status: 'READ' });
          const markedRead = readResponse.data?.data || { ...loaded, status: 'READ' };
          setSelectedEmail(markedRead);
          setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'READ' } : item)));
        } catch {
          // A leitura do conteúdo não deve falhar só porque a marcação automática não persistiu.
        }
      }
    } catch (error) {
      setDetailsError(buildFriendlyError(error, 'Nao foi possivel carregar os detalhes do email.'));
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    const messageId = searchParams.get('message');
    if (!messageId) return;

    setActiveTab('RECEBIDOS');
    openDetails(messageId);
  }, [searchParams]);

  const closeDetails = () => {
    setDetailsOpen(false);
    setSelectedEmail(null);
    setDetailsError('');
    resetReplyState();
    setAttachmentDownloadId(null);

    if (searchParams.get('message')) {
      const next = new URLSearchParams(searchParams);
      next.delete('message');
      setSearchParams(next, { replace: true });
    }
  };

  const applyStatus = async (status) => {
    if (!selectedEmail?.id) return;

    setStatusSaving(true);
    setDetailsError('');

    try {
      const response = await api.patch(`/api/admin/inbound-emails/${selectedEmail.id}`, { status });
      const updated = response.data?.data;
      if (updated) {
        setSelectedEmail(updated);
        setItems((prev) => {
          if (filters.status !== 'ALL' && filters.status !== updated.status) {
            return prev.filter((item) => item.id !== updated.id);
          }
          return prev.map((item) => (item.id === updated.id ? { ...item, status: updated.status, updated_at: updated.updated_at } : item));
        });
      }
    } catch (error) {
      setDetailsError(buildFriendlyError(error, 'Nao foi possivel atualizar o status.'));
    } finally {
      setStatusSaving(false);
    }
  };

  const clearFilters = () => {
    setFilters((prev) => ({
      status: prev.status,
      to: '',
      from: '',
      q: '',
      dateFrom: '',
      dateTo: '',
    }));
  };

  const selectMailbox = (status) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, status }));
  };

  const moveToTrash = async (id) => {
    setTrashBusyId(id);
    setErrorMessage('');
    try {
      await api.post(`/api/admin/inbound-emails/${id}/trash`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (selectedEmail?.id === id) closeDetails();
    } catch (error) {
      setErrorMessage(buildFriendlyError(error, 'Nao foi possivel mover o email para a lixeira.'));
    } finally {
      setTrashBusyId(null);
    }
  };

  const restoreFromTrash = async (id) => {
    setTrashBusyId(id);
    setErrorMessage('');
    try {
      await api.post(`/api/admin/inbound-emails/${id}/restore`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (selectedEmail?.id === id) closeDetails();
    } catch (error) {
      setErrorMessage(buildFriendlyError(error, 'Nao foi possivel restaurar o email.'));
    } finally {
      setTrashBusyId(null);
    }
  };

  const permanentlyDelete = async () => {
    if (!permanentDeleteTarget?.id) return;
    setPermanentDeleteLoading(true);
    setErrorMessage('');
    try {
      await api.delete(`/api/admin/inbound-emails/${permanentDeleteTarget.id}`);
      setItems((prev) => prev.filter((item) => item.id !== permanentDeleteTarget.id));
      if (selectedEmail?.id === permanentDeleteTarget.id) closeDetails();
      setPermanentDeleteTarget(null);
    } catch (error) {
      setErrorMessage(buildFriendlyError(error, 'Nao foi possivel excluir definitivamente o email.'));
    } finally {
      setPermanentDeleteLoading(false);
    }
  };

  const emptyTrash = async () => {
    if (emptyTrashConfirmation.trim().toUpperCase() !== 'ESVAZIAR') return;
    setEmptyTrashLoading(true);
    setErrorMessage('');
    try {
      await api.delete('/api/admin/inbound-emails/trash', { data: { confirmation: 'EMPTY_TRASH' } });
      setItems([]);
      setHasMore(false);
      setEmptyTrashOpen(false);
      setEmptyTrashConfirmation('');
    } catch (error) {
      setErrorMessage(buildFriendlyError(error, 'Nao foi possivel esvaziar a lixeira.'));
    } finally {
      setEmptyTrashLoading(false);
    }
  };

  const clearSentFilters = () => {
    const clearedFilters = { ...DEFAULT_SENT_FILTERS };
    setSentFilters(clearedFilters);
    setSentPage(1);
    loadSentList(1, false, clearedFilters);
  };

  const handleReplyFiles = (event) => {
    const nextFiles = Array.from(event.target.files || []);
    event.target.value = '';
    setReplyError('');
    setReplySuccess('');

    if (!nextFiles.length) return;

    const combined = [...replyAttachments, ...nextFiles];
    if (combined.length > MAX_REPLY_ATTACHMENTS) {
      setReplyError('Voce pode enviar no maximo 3 anexos por reply.');
      return;
    }

    const oversized = combined.find((file) => file.size > MAX_REPLY_ATTACHMENT_SIZE_BYTES);
    if (oversized) {
      setReplyError(`O arquivo ${oversized.name} excede o limite de 5 MB.`);
      return;
    }

    setReplyAttachments(combined);
  };

  const removeReplyAttachment = (indexToRemove) => {
    setReplyAttachments((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const submitReply = async () => {
    if (!selectedEmail?.id) return;

    const trimmedMessage = replyMessage.trim();
    if (trimmedMessage.length < 3) {
      setReplyError('Escreva uma mensagem com pelo menos 3 caracteres.');
      return;
    }

    const ccList = parseEmailList(replyCc);
    const bccList = parseEmailList(replyBcc);

    const ccErr = validateEmailList(ccList, 'CC');
    if (ccErr) { setReplyError(ccErr); return; }

    const bccErr = validateEmailList(bccList, 'CCO');
    if (bccErr) { setReplyError(bccErr); return; }

    setReplySending(true);
    setReplyError('');
    setReplySuccess('');

    try {
      const formData = new FormData();
      formData.append('message', trimmedMessage);
      ccList.forEach((email) => formData.append('cc', email));
      bccList.forEach((email) => formData.append('bcc', email));
      replyAttachments.forEach((file) => {
        formData.append('attachments', file);
      });

      const response = await api.post(`/api/admin/inbound-emails/${selectedEmail.id}/reply`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setReplySuccess(response.data?.message || 'Resposta enviada com sucesso.');
      setReplyMessage('');
      setReplyCc('');
      setReplyBcc('');
      setReplyAttachments([]);
    } catch (error) {
      setReplyError(buildFriendlyError(error, 'Nao foi possivel enviar a resposta.'));
    } finally {
      setReplySending(false);
    }
  };

  const replyPreview = selectedEmail?.reply_preview || null;
  const replyBlocked = selectedEmail?.status === 'TRASHED' || (replyPreview && !replyPreview.allowed);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2.5} maxWidth={1100}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.2}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          sx={{
            '& .admin-page-title': {
              color: '#F8FAFC !important',
              fontWeight: 800,
            },
            '& .admin-page-title:hover': {
              color: '#F8FAFC !important',
            },
            '& .admin-page-title *': {
              color: 'inherit !important',
            },
            '& .admin-page-subtitle': {
              color: '#CBD5E1 !important',
            },
            '& .admin-page-subtitle:hover': {
              color: '#CBD5E1 !important',
            },
          }}
        >
          <Box>
            <Typography
              variant="h4"
              component="h1"
              className="admin-page-title"
              sx={{ fontWeight: 800, color: '#F8FAFC !important', mb: 0.5 }}
              style={{ color: '#F8FAFC' }}
            >
              <span style={{ color: 'inherit' }}>Central de E-mails Institucionais</span>
            </Typography>
            <Typography className="admin-page-subtitle" sx={{ color: '#CBD5E1 !important' }} style={{ color: '#CBD5E1' }}>
              Receba, consulte, responda e envie mensagens pelos e-mails oficiais da KAVIAR.
            </Typography>
          </Box>
          <Button variant="contained" onClick={() => navigate('/admin/email')}>
            Novo e-mail
          </Button>
        </Stack>

        <Card sx={{ borderRadius: 3, border: '1px solid #E8E5DE', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <CardContent sx={{ pb: '12px !important' }}>
            <Tabs
              value={activeTab}
              onChange={(_, value) => setActiveTab(value)}
              sx={{
                minHeight: 40,
                '& .MuiTab-root': { minHeight: 40, fontWeight: 800 },
              }}
            >
              <Tab value="RECEBIDOS" label="RECEBIDOS" />
              <Tab value="ENVIADOS" label="ENVIADOS" />
            </Tabs>
          </CardContent>
        </Card>

        {activeTab === 'RECEBIDOS' ? (
          <>
            <Card sx={{ borderRadius: 3, border: '1px solid #E8E5DE', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
              <CardContent sx={{ py: '12px !important' }}>
                <Stack direction="row" spacing={0.8} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  {MAILBOX_VIEWS.map(({ value, label, Icon }) => {
                    const selected = filters.status === value;
                    return (
                      <Button
                        key={value}
                        size="small"
                        variant={selected ? 'contained' : 'text'}
                        startIcon={<Icon fontSize="small" />}
                        onClick={() => selectMailbox(value)}
                        sx={{
                          borderRadius: 999,
                          textTransform: 'none',
                          fontWeight: 800,
                          px: 1.4,
                          color: selected ? '#FFFFFF' : '#475569',
                        }}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 3, border: '1px solid #E8E5DE', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
              <CardContent>
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.2} alignItems={{ xs: 'stretch', lg: 'center' }}>
                  <TextField
                    size="small"
                    label="Buscar"
                    placeholder="Assunto, nome ou email do remetente"
                    value={filters.q}
                    onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
                    sx={{ flex: 1, minWidth: { lg: 280 } }}
                  />
                  <TextField
                    size="small"
                    label="De"
                    placeholder="remetente@email.com"
                    value={filters.from}
                    onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
                    sx={{ minWidth: { lg: 190 } }}
                  />
                  <TextField
                    size="small"
                    label="Para"
                    placeholder="contato@kaviar.com.br"
                    value={filters.to}
                    onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
                    sx={{ minWidth: { lg: 190 } }}
                  />
                  <TextField
                    size="small"
                    label="Data inicial"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 145 }}
                  />
                  <TextField
                    size="small"
                    label="Data final"
                    type="date"
                    value={filters.dateTo}
                    onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ minWidth: 145 }}
                  />
                  <Button variant="outlined" onClick={clearFilters}>Limpar</Button>
                </Stack>
              </CardContent>
            </Card>

            {filters.status === 'TRASHED' ? (
              <Alert
                severity="warning"
                action={
                  <Button
                    color="error"
                    size="small"
                    onClick={() => setEmptyTrashOpen(true)}
                    disabled={loading || items.length === 0}
                  >
                    Esvaziar lixeira
                  </Button>
                }
              >
                Mensagens na lixeira podem ser restauradas. A exclusão definitiva também remove os anexos armazenados.
              </Alert>
            ) : null}

            {warningMessage && <Alert severity="warning">{warningMessage}</Alert>}
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

            <Card sx={{ borderRadius: 3, border: '1px solid #E8E5DE', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
              <CardContent sx={{ p: '0 !important' }}>
                {loading && items.length === 0 ? (
                  <Box sx={{ py: 5, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
                ) : null}

                {!loading && items.length === 0 ? (
                  <Box sx={{ p: 2 }}><Alert severity="info">Nenhum email encontrado nesta pasta.</Alert></Box>
                ) : null}

                {items.map((item, index) => {
                  const isUnread = item.status === 'NEW';
                  const isTrash = item.status === 'TRASHED';
                  return (
                    <Box
                      key={item.id}
                      sx={{
                        px: { xs: 1.5, md: 2 },
                        py: 1.35,
                        borderBottom: index === items.length - 1 ? 'none' : '1px solid #E5E7EB',
                        borderLeft: isUnread ? '4px solid #2563EB' : '4px solid transparent',
                        backgroundColor: isUnread ? '#F8FBFF' : '#FFFFFF',
                        transition: 'background-color 120ms ease',
                        '&:hover': { backgroundColor: '#F8FAFC' },
                      }}
                    >
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} alignItems={{ xs: 'stretch', md: 'center' }}>
                        <Box
                          role="button"
                          tabIndex={0}
                          onClick={() => openDetails(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') openDetails(item.id);
                          }}
                          sx={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
                        >
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.8} alignItems={{ xs: 'flex-start', sm: 'baseline' }}>
                            <Typography
                              sx={{
                                fontWeight: isUnread ? 800 : 650,
                                color: '#0F172A',
                                minWidth: { sm: 170 },
                                maxWidth: { sm: 220 },
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {formatSender(item)}
                            </Typography>
                            <Typography
                              sx={{
                                fontWeight: isUnread ? 800 : 650,
                                color: '#111827',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                maxWidth: '100%',
                              }}
                            >
                              {formatSubject(item.subject)}
                            </Typography>
                          </Stack>
                          <Typography
                            sx={{
                              color: '#64748B',
                              fontSize: 13,
                              mt: 0.25,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.preview || item.from_email}
                          </Typography>
                        </Box>

                        <Stack direction="row" spacing={0.7} alignItems="center" sx={{ flexWrap: 'wrap', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                          <RiskBadge risk={item.security_risk} />
                          {isUnread || isTrash || item.status === 'ARCHIVED' ? <StatusChip status={item.status} /> : null}
                          {Number(item.attachment_count || 0) > 0 ? (
                            <Chip
                              size="small"
                              icon={<AttachFileOutlined fontSize="small" />}
                              label={formatAttachmentCount(item.attachment_count)}
                              variant="outlined"
                            />
                          ) : null}
                          <Typography sx={{ color: '#64748B', fontSize: 12, minWidth: 86, textAlign: { md: 'right' } }}>
                            {formatListDate(item.received_at)}
                          </Typography>
                          {isTrash ? (
                            <>
                              <Button
                                size="small"
                                startIcon={<RestoreOutlined />}
                                onClick={() => restoreFromTrash(item.id)}
                                disabled={trashBusyId === item.id}
                              >
                                Restaurar
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                startIcon={<DeleteForeverOutlined />}
                                onClick={() => setPermanentDeleteTarget(item)}
                                disabled={trashBusyId === item.id}
                              >
                                Excluir
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="small"
                              color="inherit"
                              startIcon={<DeleteOutline />}
                              onClick={() => moveToTrash(item.id)}
                              disabled={trashBusyId === item.id}
                            >
                              Lixeira
                            </Button>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  );
                })}

                <Box sx={{ display: 'flex', justifyContent: 'center', p: 1.5, borderTop: items.length ? '1px solid #E5E7EB' : 'none' }}>
                  <Button
                    variant="text"
                    onClick={() => loadList(page + 1, true)}
                    disabled={loading || !hasMore}
                  >
                    {loading && items.length > 0 ? 'Carregando...' : hasMore ? 'Carregar mais' : 'Fim da lista'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card sx={{ borderRadius: 3, border: '1px solid #E8E5DE', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
              <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} alignItems={{ xs: 'stretch', md: 'center' }}>
                  <TextField
                    size="small"
                    label="Destinatario"
                    placeholder="orgao@prefeitura.rio"
                    value={sentFilters.to}
                    onChange={(event) => setSentFilters((prev) => ({ ...prev, to: event.target.value }))}
                  />

                  <FormControl size="small" sx={{ minWidth: 160 }}>
                    <InputLabel id="sent-status-label">Status</InputLabel>
                    <Select
                      labelId="sent-status-label"
                      label="Status"
                      value={sentFilters.status}
                      onChange={(event) => setSentFilters((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      {SENT_STATUS_OPTIONS.map((option) => (
                        <MenuItem key={option} value={option}>{option}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    size="small"
                    label="Data inicial"
                    type="date"
                    value={sentFilters.dateFrom}
                    onChange={(event) => setSentFilters((prev) => ({ ...prev, dateFrom: event.target.value }))}
                    InputLabelProps={{ shrink: true }}
                  />

                  <TextField
                    size="small"
                    label="Data final"
                    type="date"
                    value={sentFilters.dateTo}
                    onChange={(event) => setSentFilters((prev) => ({ ...prev, dateTo: event.target.value }))}
                    InputLabelProps={{ shrink: true }}
                  />

                  <Button variant="contained" onClick={() => loadSentList(1, false, sentFilters)} disabled={sentLoading}>
                    Atualizar
                  </Button>
                  <Button variant="outlined" onClick={clearSentFilters} disabled={sentLoading}>
                    Limpar
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {sentError && <Alert severity="error">{sentError}</Alert>}

            <Card sx={{ borderRadius: 3, border: '1px solid #E8E5DE', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
              <CardContent>
                <Stack spacing={1.2}>
                  {sentLoading && sentItems.length === 0 ? (
                    <Box sx={{ py: 5, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
                  ) : null}

                  {!sentLoading && sentItems.length === 0 ? (
                    <Alert severity="info">Nenhum email enviado encontrado com os filtros atuais.</Alert>
                  ) : null}

                  {sentItems.map((item) => (
                    <Box
                      key={item.id}
                      sx={{
                        border: '1px solid #E5E7EB',
                        borderRadius: 2,
                        p: 1.4,
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontWeight: 700, color: '#111827' }}>{formatSubject(item.subject)}</Typography>
                          <Typography sx={{ color: '#6B7280', fontSize: 13 }}>
                            De: {item.from_name ? `${item.from_name} <${item.from_email}>` : (item.from_email || '-')}
                          </Typography>
                          <Typography sx={{ color: '#6B7280', fontSize: 13 }}>
                            Para: {item.to_email || '-'}
                          </Typography>
                          <Typography sx={{ color: '#6B7280', fontSize: 12 }}>
                            Enviado em: {formatDateTime(item.created_at)}
                          </Typography>
                        </Box>

                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                          <SentStatusChip status={item.status} />
                          <Chip size="small" label={formatAttachmentCount(item.attachment_count)} />
                          <Chip size="small" label={item.admin_email || '-'} />
                          <Button variant="outlined" size="small" onClick={() => { setSelectedSentEmail(item); setSentDetailsOpen(true); }}>
                            Ver detalhes
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ))}

                  <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
                    <Button
                      variant="contained"
                      onClick={() => loadSentList(sentPage + 1, true, sentFilters)}
                      disabled={sentLoading || !sentHasMore}
                    >
                      {sentLoading && sentItems.length > 0 ? 'Carregando...' : sentHasMore ? 'Carregar mais' : 'Fim da lista'}
                    </Button>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </>
        )}
      </Stack>

      <Dialog open={detailsOpen} onClose={closeDetails} fullWidth maxWidth="md">
        <DialogTitle>Detalhes do email recebido</DialogTitle>
        <DialogContent dividers>
          {detailsLoading ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
          ) : null}

          {detailsError && <Alert severity="error" sx={{ mb: 1 }}>{detailsError}</Alert>}

          {selectedEmail && !detailsLoading ? (
            <Stack spacing={1}>
              {selectedEmail?.security_risk?.level === 'HIGH' ? (
                <Alert severity="error" sx={{ mb: 1 }}>
                  <Typography sx={{ fontWeight: 800, mb: 0.5 }}>
                    ATENCAO — MENSAGEM SUSPEITA
                  </Typography>
                  <Typography sx={{ mb: 0.5 }}>
                    Nao clique, copie ou abra links desta mensagem sem validacao do remetente.
                  </Typography>
                  {Array.isArray(selectedEmail?.security_risk?.reasons) && selectedEmail.security_risk.reasons.length > 0 ? (
                    <Stack spacing={0.3}>
                      {selectedEmail.security_risk.reasons.map((reason) => (
                        <Typography key={reason} sx={{ fontSize: 13 }}>
                          • {formatRiskReason(reason)}
                        </Typography>
                      ))}
                    </Stack>
                  ) : null}
                </Alert>
              ) : null}
              <Typography><strong>Remetente:</strong> {selectedEmail.from_name ? `${selectedEmail.from_name} <${selectedEmail.from_email}>` : selectedEmail.from_email}</Typography>
              <Typography><strong>Destinatario:</strong> {selectedEmail.to_email}</Typography>
              <Typography><strong>Assunto:</strong> {formatSubject(selectedEmail.subject)}</Typography>
              <Typography><strong>Recebido em:</strong> {formatDateTime(selectedEmail.received_at)}</Typography>
              <Typography><strong>Status:</strong> {STATUS_LABELS[selectedEmail.status] || selectedEmail.status}</Typography>
              <Typography><strong>Message ID:</strong> {selectedEmail.message_id || '-'}</Typography>
              <Typography><strong>In-Reply-To:</strong> {selectedEmail.in_reply_to || '-'}</Typography>
              <Typography><strong>References:</strong> {selectedEmail.references_header || '-'}</Typography>
              <Typography><strong>Provedor:</strong> {selectedEmail.provider || '-'}</Typography>

              <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, border: '1px solid #E5E7EB', backgroundColor: '#FCFCFD' }}>
                <Typography sx={{ fontWeight: 800, color: '#111827', mb: 1 }}>Responder por email</Typography>

                {replyPreview ? (
                  <Stack spacing={1.2}>
                    <TextField label="Para" size="small" value={replyPreview.to || ''} InputProps={{ readOnly: true }} />
                    <TextField label="De" size="small" value={replyPreview.from || '-'} InputProps={{ readOnly: true }} />
                    <TextField label="Assunto" size="small" value={replyPreview.subject || ''} InputProps={{ readOnly: true }} />

                    <TextField
                      label="CC — Copia (opcional)"
                      size="small"
                      placeholder="copia@exemplo.com, outro@exemplo.com"
                      value={replyCc}
                      onChange={(event) => setReplyCc(event.target.value)}
                      disabled={replySending || replyBlocked}
                      helperText="Os destinatarios poderao ver os enderecos adicionados neste campo."
                    />

                    <TextField
                      label="CCO — Copia oculta (opcional)"
                      size="small"
                      placeholder="oculto@exemplo.com"
                      value={replyBcc}
                      onChange={(event) => setReplyBcc(event.target.value)}
                      disabled={replySending || replyBlocked}
                      helperText="Os enderecos adicionados neste campo ficarao ocultos para os demais destinatarios."
                    />

                    {replyBlocked ? (
                      <Alert severity="warning">
                        {selectedEmail?.status === 'TRASHED'
                          ? 'Restaure este email antes de responder.'
                          : (replyPreview.blocked_reason || 'Este email nao pode ser respondido a partir da inbox institucional.')}
                      </Alert>
                    ) : null}

                    {replyError ? <Alert severity="error">{replyError}</Alert> : null}
                    {replySuccess ? <Alert severity="success">{replySuccess}</Alert> : null}

                    <TextField
                      label="Mensagem"
                      multiline
                      minRows={6}
                      placeholder="Escreva a resposta que sera enviada na mesma thread do email original."
                      value={replyMessage}
                      onChange={(event) => setReplyMessage(event.target.value)}
                      disabled={replySending || replyBlocked}
                    />

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
                      <Button component="label" variant="outlined" disabled={replySending || replyBlocked}>
                        Adicionar anexos
                        <input hidden multiple type="file" accept={REPLY_ATTACHMENT_ACCEPT} onChange={handleReplyFiles} />
                      </Button>
                      <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
                        Ate 3 arquivos, maximo de 5 MB cada. Formatos aceitos: PDF, JPG e PNG.
                      </Typography>
                    </Stack>

                    {replyAttachments.length > 0 ? (
                      <Stack spacing={0.8}>
                        {replyAttachments.map((file, index) => (
                          <Stack
                            key={`${file.name}-${index}`}
                            direction="row"
                            spacing={1}
                            justifyContent="space-between"
                            alignItems="center"
                            sx={{ p: 1, border: '1px solid #E5E7EB', borderRadius: 1.5, backgroundColor: '#FFFFFF' }}
                          >
                            <Typography sx={{ fontSize: 13, color: '#111827' }}>
                              {file.name} ({formatFileSize(file.size)})
                            </Typography>
                            <Button size="small" color="inherit" onClick={() => removeReplyAttachment(index)} disabled={replySending}>
                              Remover
                            </Button>
                          </Stack>
                        ))}
                      </Stack>
                    ) : null}

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button variant="contained" onClick={submitReply} disabled={replySending || replyBlocked}>
                        {replySending ? 'Enviando...' : 'Enviar resposta'}
                      </Button>
                    </Box>
                  </Stack>
                ) : (
                  <Alert severity="info">Carregue os detalhes completos para visualizar a configuracao de reply.</Alert>
                )}
              </Box>

              <BodyBlock label="Corpo (texto)" value={selectedEmail.text_body} />
              <BodyBlock label="Corpo normalizado" value={selectedEmail.normalized_body} />
              <BodyBlock label="Corpo HTML (exibido como texto por seguranca)" value={selectedEmail.html_body} />

              <Box sx={{ mt: 1.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#374151', mb: 0.8 }}>
                  Anexos recebidos
                </Typography>
                {Array.isArray(selectedEmail.attachments) && selectedEmail.attachments.length > 0 ? (
                  <Stack spacing={0.8}>
                    {selectedEmail.attachments.map((attachment) => (
                      <Box
                        key={attachment.id}
                        sx={{
                          p: 1,
                          borderRadius: 1.5,
                          border: '1px solid #E5E7EB',
                          backgroundColor: '#FAFAFA',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                            {attachment.filename}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
                            {attachment.contentType || '-'} · {formatFileSize(attachment.sizeBytes)}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleDownloadAttachment(attachment.id)}
                          disabled={attachmentDownloadId === attachment.id}
                        >
                          {attachmentDownloadId === attachment.id ? 'Abrindo...' : 'Baixar'}
                        </Button>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Alert severity="info">Sem anexos disponiveis para download.</Alert>
                )}
              </Box>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 2, gap: 1, flexWrap: 'wrap' }}>
          {selectedEmail?.status === 'TRASHED' ? (
            <Stack direction="row" spacing={1}>
              <Button
                startIcon={<RestoreOutlined />}
                onClick={() => restoreFromTrash(selectedEmail.id)}
                disabled={trashBusyId === selectedEmail.id}
              >
                Restaurar
              </Button>
              <Button
                color="error"
                startIcon={<DeleteForeverOutlined />}
                onClick={() => setPermanentDeleteTarget(selectedEmail)}
              >
                Excluir definitivamente
              </Button>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Button onClick={() => applyStatus('NEW')} disabled={statusSaving || !selectedEmail}>Marcar como não lido</Button>
              <Button onClick={() => applyStatus('READ')} disabled={statusSaving || !selectedEmail}>Marcar como lido</Button>
              <Button onClick={() => applyStatus('ARCHIVED')} disabled={statusSaving || !selectedEmail}>Arquivar</Button>
              <Button
                color="error"
                startIcon={<DeleteOutline />}
                onClick={() => moveToTrash(selectedEmail.id)}
                disabled={trashBusyId === selectedEmail?.id}
              >
                Mover para lixeira
              </Button>
            </Stack>
          )}
          <Button onClick={closeDetails}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={emptyTrashOpen} onClose={() => { if (!emptyTrashLoading) { setEmptyTrashOpen(false); setEmptyTrashConfirmation(''); } }} fullWidth maxWidth="xs">
        <DialogTitle>Esvaziar lixeira</DialogTitle>
        <DialogContent dividers>
          <Alert severity="error" sx={{ mb: 2 }}>
            Esta ação é permanente. Os emails e anexos armazenados serão excluídos definitivamente.
          </Alert>
          <Typography sx={{ mb: 1 }}>Digite <strong>ESVAZIAR</strong> para confirmar.</Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={emptyTrashConfirmation}
            onChange={(event) => setEmptyTrashConfirmation(event.target.value)}
            disabled={emptyTrashLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEmptyTrashOpen(false); setEmptyTrashConfirmation(''); }} disabled={emptyTrashLoading}>Cancelar</Button>
          <Button
            color="error"
            variant="contained"
            onClick={emptyTrash}
            disabled={emptyTrashLoading || emptyTrashConfirmation.trim().toUpperCase() !== 'ESVAZIAR'}
          >
            {emptyTrashLoading ? 'Esvaziando...' : 'Excluir tudo definitivamente'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(permanentDeleteTarget)} onClose={() => { if (!permanentDeleteLoading) setPermanentDeleteTarget(null); }} fullWidth maxWidth="xs">
        <DialogTitle>Excluir email definitivamente?</DialogTitle>
        <DialogContent dividers>
          <Alert severity="error">
            Esta ação não pode ser desfeita. O email e seus anexos serão removidos do armazenamento.
          </Alert>
          {permanentDeleteTarget ? (
            <Typography sx={{ mt: 2, fontWeight: 700 }}>{formatSubject(permanentDeleteTarget.subject)}</Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPermanentDeleteTarget(null)} disabled={permanentDeleteLoading}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={permanentlyDelete} disabled={permanentDeleteLoading}>
            {permanentDeleteLoading ? 'Excluindo...' : 'Excluir definitivamente'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sentDetailsOpen} onClose={() => { setSentDetailsOpen(false); setSelectedSentEmail(null); }} fullWidth maxWidth="md">
        <DialogTitle>Detalhes do email enviado</DialogTitle>
        <DialogContent dividers>
          {selectedSentEmail ? (
            <Stack spacing={1.2}>
              <Typography><strong>Remetente completo:</strong> {selectedSentEmail.from_name ? `${selectedSentEmail.from_name} <${selectedSentEmail.from_email}>` : (selectedSentEmail.from_email || '-')}</Typography>
              <Typography><strong>Destinatario:</strong> {selectedSentEmail.to_email || '-'}</Typography>
              <Typography><strong>CC:</strong> {selectedSentEmail.cc_email || 'Nao informado'}</Typography>
              <Typography><strong>CCO:</strong> {selectedSentEmail.bcc_email || 'Nao informado'}</Typography>
              <Typography><strong>Assunto completo:</strong> {selectedSentEmail.subject || '-'}</Typography>
              <Typography><strong>Data/hora:</strong> {formatDateTime(selectedSentEmail.created_at)}</Typography>
              <Typography><strong>Status:</strong> {selectedSentEmail.status || '-'}</Typography>
              <Typography><strong>Usuario admin:</strong> {selectedSentEmail.admin_email || '-'}</Typography>
              <Typography><strong>Provider:</strong> {selectedSentEmail.provider || '-'}</Typography>
              <Typography><strong>Provider message id:</strong> {selectedSentEmail.provider_message_id || '-'}</Typography>
              <Typography><strong>Quantidade de anexos:</strong> {Number(selectedSentEmail.attachment_count || 0)}</Typography>

              <BodyBlock
                label="attachments_metadata"
                value={selectedSentEmail.attachments_metadata ? JSON.stringify(selectedSentEmail.attachments_metadata, null, 2) : '-'}
              />

              {selectedSentEmail.error_message ? (
                <Alert severity="error">
                  <strong>error_message:</strong> {selectedSentEmail.error_message}
                </Alert>
              ) : null}
            </Stack>
          ) : (
            <Alert severity="info">Selecione um email para ver os detalhes.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setSentDetailsOpen(false); setSelectedSentEmail(null); }}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
