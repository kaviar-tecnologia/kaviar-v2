import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
  TextField,
  Typography,
} from '@mui/material';
import api from '../../api';

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const HISTORY_PAGE_SIZE = 10;
const ALLOWED_ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_ATTACHMENT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

const OFFICIAL_SENDER_OPTIONS = [
  { label: 'KAVIAR <contato@kaviar.com.br>', value: 'KAVIAR <contato@kaviar.com.br>' },
  { label: 'KAVIAR Suporte <suporte@kaviar.com.br>', value: 'KAVIAR Suporte <suporte@kaviar.com.br>' },
  { label: 'KAVIAR Financeiro <financeiro@kaviar.com.br>', value: 'KAVIAR Financeiro <financeiro@kaviar.com.br>' },
];

function buildFriendlyError(error) {
  const status = error?.response?.status;
  const apiMessage = error?.response?.data?.error;

  if (status === 401) {
    return 'Sessao expirada. Faca login novamente para continuar.';
  }

  if (status === 403) {
    return 'Voce nao tem permissao para acessar esta funcionalidade.';
  }

  if (status === 400) {
    return apiMessage || 'Os dados enviados sao invalidos. Revise remetente, destinatario e template.';
  }

  if (status === 502) {
    return apiMessage || 'O backend nao conseguiu enviar o email no provider configurado.';
  }

  return apiMessage || 'Nao foi possivel enviar o email agora. Tente novamente.';
}

/**
 * Extrai enderecos de email de uma string multi-endereço.
 * Aceita separação por vírgula, ponto e vírgula ou quebra de linha.
 */
function parseEmailList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[,;\n]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida uma lista de emails. Retorna a primeira mensagem de erro ou null.
 */
function validateEmailList(emails, fieldLabel) {
  for (const email of emails) {
    if (!EMAIL_REGEX.test(email)) {
      return `${fieldLabel}: endereco "${email}" e invalido.`;
    }
    if (/[\r\n]/.test(email)) {
      return `${fieldLabel}: endereco contem caracteres invalidos.`;
    }
  }
  return null;
}

/**
 * Verifica duplicatas cruzadas entre listas.
 */
function findCrossListDuplicates(to, cc, bcc) {
  const seen = new Map();
  for (const email of to) seen.set(email, 'Para');
  for (const email of cc) {
    const existing = seen.get(email);
    if (existing) return `Endereco "${email}" repetido entre ${existing} e CC.`;
    seen.set(email, 'CC');
  }
  for (const email of bcc) {
    const existing = seen.get(email);
    if (existing) return `Endereco "${email}" repetido entre ${existing} e CCO.`;
    seen.set(email, 'CCO');
  }
  return null;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isAllowedAttachment(file) {
  const mime = (file.type || '').toLowerCase();
  const lowerName = (file.name || '').toLowerCase();
  const ext = lowerName.includes('.') ? lowerName.slice(lowerName.lastIndexOf('.')) : '';
  const mimeAllowed = ALLOWED_ATTACHMENT_MIME_TYPES.includes(mime);
  const extAllowed = ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext);
  return mimeAllowed && extAllowed;
}

export default function EmailTestingPage() {
  const [officialFrom, setOfficialFrom] = useState(OFFICIAL_SENDER_OPTIONS[0].value);
  const [officialTo, setOfficialTo] = useState('');
  const [officialCc, setOfficialCc] = useState('');
  const [officialBcc, setOfficialBcc] = useState('');
  const [officialSubject, setOfficialSubject] = useState('');
  const [officialMessage, setOfficialMessage] = useState('');
  const [officialAttachments, setOfficialAttachments] = useState([]);

  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [historyFilters, setHistoryFilters] = useState({
    to: '',
    status: 'ALL',
    dateFrom: '',
    dateTo: '',
  });
  const officialAttachmentsInputRef = useRef(null);

  const buildHistoryParams = (targetPage) => {
    const params = {
      page: targetPage,
      limit: HISTORY_PAGE_SIZE,
    };

    if (historyFilters.to.trim()) {
      params.to = historyFilters.to.trim();
    }

    if (historyFilters.status !== 'ALL') {
      params.status = historyFilters.status;
    }

    if (historyFilters.dateFrom) {
      params.date_from = historyFilters.dateFrom;
    }

    if (historyFilters.dateTo) {
      params.date_to = historyFilters.dateTo;
    }

    return params;
  };

  const loadOfficialHistory = async ({ page = 1, append = false } = {}) => {
    setHistoryLoading(true);
    setHistoryError('');

    try {
      const response = await api.get('/api/admin/email/logs', {
        params: buildHistoryParams(page),
      });

      const incoming = Array.isArray(response.data?.data) ? response.data.data : [];
      const apiPage = Number(response.data?.pagination?.page || page);
      const totalPages = Number(response.data?.pagination?.totalPages || 0);

      setHistoryItems((prev) => (append ? [...prev, ...incoming] : incoming));
      setHistoryPage(apiPage);

      if (totalPages > 0) {
        setHistoryHasMore(apiPage < totalPages);
      } else {
        setHistoryHasMore(incoming.length >= HISTORY_PAGE_SIZE);
      }

      if (!append) {
        setExpandedHistoryId(null);
      }
    } catch (error) {
      setHistoryError(buildFriendlyError(error));
      if (!append) {
        setHistoryItems([]);
      }
      setHistoryHasMore(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadOfficialHistory();
  }, []);

  const handleHistoryFilterChange = (field, value) => {
    setHistoryFilters((prev) => ({ ...prev, [field]: value }));
  };

  const applyHistoryFilters = () => {
    loadOfficialHistory({ page: 1, append: false });
  };

  const clearHistoryFilters = () => {
    setHistoryFilters({
      to: '',
      status: 'ALL',
      dateFrom: '',
      dateTo: '',
    });
    setTimeout(() => {
      loadOfficialHistory({ page: 1, append: false });
    }, 0);
  };

  const loadMoreHistory = () => {
    if (historyLoading || !historyHasMore) return;
    loadOfficialHistory({ page: historyPage + 1, append: true });
  };

  const handleOfficialSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setResult(null);

    if (!officialTo.trim() || !officialSubject.trim() || !officialMessage.trim()) {
      setErrorMessage('Preencha destinatario, assunto e mensagem para envio real.');
      return;
    }

    const toList = parseEmailList(officialTo);
    const ccList = parseEmailList(officialCc);
    const bccList = parseEmailList(officialBcc);

    if (toList.length === 0) {
      setErrorMessage('Informe ao menos um destinatario valido.');
      return;
    }

    const toErr = validateEmailList(toList, 'Para');
    if (toErr) { setErrorMessage(toErr); return; }

    const ccErr = validateEmailList(ccList, 'CC');
    if (ccErr) { setErrorMessage(ccErr); return; }

    const bccErr = validateEmailList(bccList, 'CCO');
    if (bccErr) { setErrorMessage(bccErr); return; }

    const dupErr = findCrossListDuplicates(toList, ccList, bccList);
    if (dupErr) { setErrorMessage(dupErr); return; }

    if (officialAttachments.length > MAX_ATTACHMENTS) {
      setErrorMessage('Voce pode enviar no maximo 3 anexos por email.');
      return;
    }

    for (const file of officialAttachments) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setErrorMessage(`O arquivo ${file.name} excede 5 MB.`);
        return;
      }
      if (!isAllowedAttachment(file)) {
        setErrorMessage(`Tipo nao permitido para ${file.name}. Use apenas PDF, JPG, JPEG ou PNG.`);
        return;
      }
    }

    setConfirmOpen(true);
  };

  const confirmOfficialSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setErrorMessage('');
    setResult(null);

    try {
      const toList = parseEmailList(officialTo);
      const ccList = parseEmailList(officialCc);
      const bccList = parseEmailList(officialBcc);
      const hasAttachments = officialAttachments.length > 0;
      let response;

      if (hasAttachments) {
        const formData = new FormData();
        toList.forEach((email) => formData.append('to', email));
        ccList.forEach((email) => formData.append('cc', email));
        bccList.forEach((email) => formData.append('bcc', email));
        formData.append('from', officialFrom);
        formData.append('subject', officialSubject.trim());
        formData.append('message', officialMessage.trim());
        officialAttachments.forEach((file) => {
          formData.append('attachments', file);
        });

        response = await api.post('/api/admin/email/send', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        const payload = {
          to: toList,
          from: officialFrom,
          subject: officialSubject.trim(),
          message: officialMessage.trim(),
        };
        if (ccList.length) payload.cc = ccList;
        if (bccList.length) payload.bcc = bccList;
        response = await api.post('/api/admin/email/send', payload);
      }

      setResult(response.data?.data || null);

      // Evita reenvio acidental: limpa formulario real apos sucesso.
      setOfficialTo('');
      setOfficialCc('');
      setOfficialBcc('');
      setOfficialSubject('');
      setOfficialMessage('');
      setOfficialAttachments([]);
      if (officialAttachmentsInputRef.current) {
        officialAttachmentsInputRef.current.value = '';
      }
      setConfirmOpen(false);
    } catch (error) {
      setErrorMessage(buildFriendlyError(error));
      setResult(error?.response?.data?.data ? { ...error.response.data.data, failed: true } : null);
    } finally {
      setSending(false);
    }
  };

  const handleAttachmentChange = (event) => {
    const incomingFiles = Array.from(event.target.files || []);
    if (!incomingFiles.length) return;

    const next = [...officialAttachments, ...incomingFiles];
    if (next.length > MAX_ATTACHMENTS) {
      setErrorMessage('Voce pode enviar no maximo 3 anexos por email.');
      event.target.value = '';
      return;
    }

    for (const file of incomingFiles) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setErrorMessage(`O arquivo ${file.name} excede 5 MB.`);
        event.target.value = '';
        return;
      }
      if (!isAllowedAttachment(file)) {
        setErrorMessage(`Tipo nao permitido para ${file.name}. Use apenas PDF, JPG, JPEG ou PNG.`);
        event.target.value = '';
        return;
      }
    }

    setOfficialAttachments(next);
    setErrorMessage('');
    event.target.value = '';
  };

  const removeAttachment = (indexToRemove) => {
    setOfficialAttachments((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleNewSend = () => {
    setResult(null);
    setErrorMessage('');
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
  };

  const renderStatus = (status) => {
    const isSent = status === 'SENT';

    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.8 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '999px',
            backgroundColor: isSent ? '#16A34A' : '#DC2626',
          }}
        />
        <Typography variant="body2" sx={{ fontWeight: 700, color: isSent ? '#166534' : '#991B1B' }}>
          {isSent ? 'Enviado' : 'Erro'}
        </Typography>
      </Box>
    );
  };

  const renderAttachmentSummary = (count) => {
    if (!count) return 'Anexos: sem anexos';
    return `Anexos: ${count}`;
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={3} maxWidth={860}>
        <Box
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
          <Typography
            variant="h4"
            component="h1"
            className="admin-page-title"
            sx={{ fontWeight: 800, color: '#F8FAFC !important', mb: 1 }}
            style={{ color: '#F8FAFC' }}
          >
            <span style={{ color: 'inherit' }}>E-mails KAVIAR</span>
          </Typography>
          <Typography className="admin-page-subtitle" sx={{ color: '#CBD5E1 !important', maxWidth: 720 }} style={{ color: '#CBD5E1' }}>
            Envio real de comunicacoes oficiais para destinatarios externos.
          </Typography>
        </Box>

        <Card sx={{ borderRadius: 3, border: '1px solid #E8E5DE', boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }}>
          <CardContent>
            <Box component="form" onSubmit={handleOfficialSubmit}>
              <Stack spacing={2.5}>
                <Alert severity="warning">
                  Este envio sera entregue a destinatario externo em nome da KAVIAR.
                </Alert>

                <Alert severity="info">
                  Os anexos serao enviados ao destinatario externo em nome da KAVIAR.
                </Alert>

                <FormControl fullWidth>
                  <InputLabel id="official-from-label">Remetente oficial</InputLabel>
                  <Select
                    labelId="official-from-label"
                    label="Remetente oficial"
                    value={officialFrom}
                    onChange={(event) => setOfficialFrom(event.target.value)}
                  >
                    {OFFICIAL_SENDER_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  label="Destinatario externo"
                  placeholder="contato@prefeitura.gov.br, outro@orgao.gov.br"
                  value={officialTo}
                  onChange={(event) => setOfficialTo(event.target.value)}
                  required
                  helperText="Separe varios enderecos por virgula, ponto e virgula ou quebra de linha."
                  multiline
                  minRows={1}
                  maxRows={3}
                />

                <TextField
                  fullWidth
                  label="CC — Copia"
                  placeholder="copia@exemplo.com, outro@exemplo.com"
                  value={officialCc}
                  onChange={(event) => setOfficialCc(event.target.value)}
                  helperText="Os destinatarios poderao ver os enderecos adicionados neste campo."
                  multiline
                  minRows={1}
                  maxRows={3}
                />

                <TextField
                  fullWidth
                  label="CCO — Copia oculta"
                  placeholder="oculto@exemplo.com"
                  value={officialBcc}
                  onChange={(event) => setOfficialBcc(event.target.value)}
                  helperText="Os enderecos adicionados neste campo ficarao ocultos para os demais destinatarios."
                  multiline
                  minRows={1}
                  maxRows={3}
                />

                <TextField
                  fullWidth
                  label="Assunto"
                  value={officialSubject}
                  onChange={(event) => setOfficialSubject(event.target.value)}
                  required
                />

                <TextField
                  fullWidth
                  multiline
                  minRows={6}
                  label="Mensagem"
                  value={officialMessage}
                  onChange={(event) => setOfficialMessage(event.target.value)}
                  required
                />

                <Stack spacing={1.2}>
                  <Typography sx={{ fontWeight: 700, color: '#1A1A1A' }}>Anexos</Typography>
                  <Typography variant="body2" sx={{ color: '#6B7280' }}>
                    Permitido: PDF, JPG, JPEG, PNG. Maximo de 3 arquivos, ate 5 MB cada.
                  </Typography>

                  <Box>
                    <input
                      id="official-attachments-input"
                      ref={officialAttachmentsInputRef}
                      type="file"
                      multiple
                      accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                      onChange={handleAttachmentChange}
                      style={{ display: 'none' }}
                    />
                    <Button
                      type="button"
                      variant="outlined"
                      onClick={() => officialAttachmentsInputRef.current?.click()}
                      disabled={sending || officialAttachments.length >= MAX_ATTACHMENTS}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Selecionar anexos
                    </Button>
                  </Box>

                  {officialAttachments.length > 0 && (
                    <Stack spacing={1}>
                      {officialAttachments.map((file, index) => (
                        <Box
                          key={`${file.name}-${file.size}-${index}`}
                          sx={{
                            p: 1.2,
                            borderRadius: 1.5,
                            border: '1px solid #E5E7EB',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{file.name}</Typography>
                            <Typography variant="caption" sx={{ color: '#6B7280' }}>
                              {(file.type || 'tipo nao informado')} • {formatFileSize(file.size)}
                            </Typography>
                          </Box>
                          <Button
                            type="button"
                            size="small"
                            color="error"
                            variant="text"
                            onClick={() => removeAttachment(index)}
                            sx={{ textTransform: 'none' }}
                          >
                            Remover
                          </Button>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Stack>

                <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="warning"
                    disabled={sending || !officialTo.trim() || !officialSubject.trim() || !officialMessage.trim()}
                    sx={{ minWidth: 180, textTransform: 'none', fontWeight: 700 }}
                  >
                    {sending ? <CircularProgress size={22} color="inherit" /> : 'Enviar email real'}
                  </Button>
                </Box>
              </Stack>
            </Box>
          </CardContent>
        </Card>

        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

        {result && (
          <Card sx={{ borderRadius: 3, border: '1px solid #E8E5DE', boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Resultado do envio
                </Typography>
                <Button type="button" variant="text" size="small" onClick={handleNewSend} sx={{ textTransform: 'none' }}>
                  Novo envio
                </Button>
              </Box>

              <Stack spacing={1}>
                <Typography><strong>Status:</strong> {result.failed ? 'falha' : 'sucesso'}</Typography>
                <Typography><strong>Provider usado:</strong> {result.provider || 'nao informado'}</Typography>
                <Typography><strong>Provider padrao:</strong> {result.providerDefault || 'nao informado'}</Typography>
                <Typography><strong>From usado:</strong> {result.from || officialFrom}</Typography>
                <Typography><strong>Destinatario:</strong> {result.to || officialTo.trim()}</Typography>
                {result.template && <Typography><strong>Template:</strong> {result.template}</Typography>}
                {result.subject && <Typography><strong>Assunto:</strong> {result.subject}</Typography>}
                {Array.isArray(result.attachments) && result.attachments.length > 0 && (
                  <Box>
                    <Typography><strong>Anexos enviados:</strong></Typography>
                    {result.attachments.map((attachment, index) => (
                      <Typography key={`${attachment.filename || 'anexo'}-${index}`} variant="body2" sx={{ color: '#4B5563' }}>
                        {attachment.filename || 'arquivo'} • {attachment.contentType || '-'} • {formatFileSize(attachment.size || 0)}
                      </Typography>
                    ))}
                  </Box>
                )}
                {result.messageId && <Typography><strong>Message ID:</strong> {result.messageId}</Typography>}
              </Stack>
            </CardContent>
          </Card>
        )}

        <Card sx={{ borderRadius: 3, border: '1px solid #E8E5DE', boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Histórico de envios oficiais
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280' }}>
                  Últimos envios realizados pela tela de e-mail oficial.
                </Typography>
              </Box>
              <Button
                type="button"
                variant="outlined"
                onClick={() => loadOfficialHistory({ page: 1, append: false })}
                disabled={historyLoading}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                {historyLoading ? <CircularProgress size={18} color="inherit" /> : 'Atualizar histórico'}
              </Button>
            </Box>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                border: '1px solid #E5E7EB',
                backgroundColor: '#FAFAF9',
                mb: 2,
              }}
            >
              <Stack spacing={1.2}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr 1fr auto' },
                    gap: 1,
                  }}
                >
                  <TextField
                    size="small"
                    label="Destinatário"
                    value={historyFilters.to}
                    onChange={(event) => handleHistoryFilterChange('to', event.target.value)}
                    placeholder="email@destino.com"
                  />

                  <FormControl size="small">
                    <InputLabel id="history-status-label">Status</InputLabel>
                    <Select
                      labelId="history-status-label"
                      label="Status"
                      value={historyFilters.status}
                      onChange={(event) => handleHistoryFilterChange('status', event.target.value)}
                    >
                      <MenuItem value="ALL">Todos</MenuItem>
                      <MenuItem value="SENT">Enviado</MenuItem>
                      <MenuItem value="ERROR">Erro</MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    size="small"
                    type="date"
                    label="Data inicial"
                    InputLabelProps={{ shrink: true }}
                    value={historyFilters.dateFrom}
                    onChange={(event) => handleHistoryFilterChange('dateFrom', event.target.value)}
                  />

                  <TextField
                    size="small"
                    type="date"
                    label="Data final"
                    InputLabelProps={{ shrink: true }}
                    value={historyFilters.dateTo}
                    onChange={(event) => handleHistoryFilterChange('dateTo', event.target.value)}
                  />

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button type="button" variant="contained" size="small" onClick={applyHistoryFilters} sx={{ textTransform: 'none' }}>
                      Filtrar
                    </Button>
                    <Button type="button" variant="text" size="small" onClick={clearHistoryFilters} sx={{ textTransform: 'none' }}>
                      Limpar
                    </Button>
                  </Box>
                </Box>
              </Stack>
            </Box>

            {historyError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {historyError}
              </Alert>
            )}

            {!historyLoading && !historyItems.length && !historyError && (
              <Alert severity="info">Nenhum envio oficial registrado ainda.</Alert>
            )}

            {!!historyItems.length && (
              <Box sx={{ border: '1px solid #E5E7EB', borderRadius: 1.5, overflow: 'hidden' }}>
                <Box
                  sx={{
                    display: { xs: 'none', md: 'grid' },
                    gridTemplateColumns: '1.4fr 1.2fr 1.8fr 0.9fr 0.9fr 1.2fr auto',
                    gap: 1,
                    px: 1.5,
                    py: 1,
                    backgroundColor: '#F9FAFB',
                    borderBottom: '1px solid #E5E7EB',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280' }}>Data/hora</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280' }}>Destinatário</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280' }}>Assunto</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280' }}>Anexos</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280' }}>Status</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280' }}>Usuário admin</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280' }}>Ações</Typography>
                </Box>

                {historyItems.map((item) => {
                  const isExpanded = expandedHistoryId === item.id;

                  return (
                    <Box key={item.id} sx={{ borderBottom: '1px solid #E5E7EB' }}>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', md: '1.4fr 1.2fr 1.8fr 0.9fr 0.9fr 1.2fr auto' },
                          gap: 1,
                          px: 1.5,
                          py: 1.2,
                          alignItems: 'center',
                          backgroundColor: '#FFFFFF',
                        }}
                      >
                        <Typography variant="body2">{formatDateTime(item.created_at)}</Typography>
                        <Typography variant="body2" noWrap>{item.to_email || '-'}</Typography>
                        <Typography variant="body2" noWrap title={item.subject || '-'}>{item.subject || '-'}</Typography>
                        <Typography variant="body2">{item.attachment_count ? item.attachment_count : 'sem anexos'}</Typography>
                        <Box>{renderStatus(item.status)}</Box>
                        <Typography variant="body2" noWrap>{item.admin_email || '-'}</Typography>
                        <Box>
                          <Button
                            type="button"
                            size="small"
                            variant="text"
                            sx={{ textTransform: 'none' }}
                            onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                          >
                            {isExpanded ? 'Ocultar' : 'Detalhes'}
                          </Button>
                        </Box>
                      </Box>

                      {isExpanded && (
                        <Box sx={{ px: 1.5, py: 1.2, backgroundColor: '#FAFAFA' }}>
                          <Stack spacing={0.6}>
                            <Typography variant="body2">
                              <strong>Remetente completo:</strong> {item.from_name ? `${item.from_name} <${item.from_email}>` : item.from_email || '-'}
                            </Typography>
                            <Typography variant="body2"><strong>Destinatário:</strong> {item.to_email || '-'}</Typography>
                            <Typography variant="body2"><strong>CC:</strong> {item.cc_email || 'Nao informado'}</Typography>
                            <Typography variant="body2"><strong>CCO:</strong> {item.bcc_email || 'Nao informado'}</Typography>
                            <Typography variant="body2"><strong>Assunto completo:</strong> {item.subject || '-'}</Typography>
                            <Typography variant="body2"><strong>Provider:</strong> {item.provider || '-'}</Typography>
                            <Typography variant="body2"><strong>Message ID:</strong> {item.provider_message_id || '-'}</Typography>
                            <Typography variant="body2"><strong>{renderAttachmentSummary(item.attachment_count || 0)}</strong></Typography>

                            {Array.isArray(item.attachments_metadata) && item.attachments_metadata.length > 0 && (
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>Metadados dos anexos:</Typography>
                                {item.attachments_metadata.map((attachment, index) => (
                                  <Typography key={`${attachment.filename || 'anexo'}-${index}`} variant="caption" sx={{ display: 'block', color: '#4B5563' }}>
                                    {attachment.filename || 'arquivo'} • {attachment.contentType || '-'} • {formatFileSize(attachment.size || 0)}
                                  </Typography>
                                ))}
                              </Box>
                            )}

                            {item.error_message && (
                              <Typography variant="body2" sx={{ color: '#B91C1C' }}>
                                <strong>Mensagem de erro:</strong> {item.error_message}
                              </Typography>
                            )}
                          </Stack>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}

            {historyHasMore && (
              <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center' }}>
                <Button
                  type="button"
                  variant="outlined"
                  onClick={loadMoreHistory}
                  disabled={historyLoading}
                  sx={{ textTransform: 'none', fontWeight: 700 }}
                >
                  {historyLoading ? <CircularProgress size={18} color="inherit" /> : 'Carregar mais'}
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      </Stack>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirmar envio real</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <Typography><strong>Remetente:</strong> {officialFrom}</Typography>
            <Typography><strong>Destinatario:</strong> {officialTo.trim()}</Typography>
            <Typography><strong>CC:</strong> {officialCc.trim() || 'Nao informado'}</Typography>
            <Typography><strong>CCO:</strong> {officialBcc.trim() || 'Nao informado'}</Typography>
            <Typography><strong>Assunto:</strong> {officialSubject.trim()}</Typography>
            <Box>
              <Typography><strong>Anexos:</strong> {officialAttachments.length ? `${officialAttachments.length} arquivo(s)` : 'sem anexos'}</Typography>
              {officialAttachments.map((file, index) => (
                <Typography key={`${file.name}-${index}`} variant="body2" sx={{ color: '#4B5563' }}>
                  {file.name} • {(file.type || 'tipo nao informado')} • {formatFileSize(file.size)}
                </Typography>
              ))}
            </Box>
            <Alert severity="warning" sx={{ mt: 1 }}>
              Este envio sera entregue a destinatario externo em nome da KAVIAR.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} color="inherit">Cancelar</Button>
          <Button onClick={confirmOfficialSend} variant="contained" color="warning">Confirmar envio</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}