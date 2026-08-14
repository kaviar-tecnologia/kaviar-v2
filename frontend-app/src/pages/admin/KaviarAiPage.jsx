import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, Container, Typography, TextField, IconButton, Paper, Chip,
  CircularProgress, Alert, InputAdornment, Button, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from '@mui/material';
import { Send, SmartToy, Person, Lock } from '@mui/icons-material';
import { askKaviarAi, getToolFriendlyNames } from '../../services/adminAiService';
import api from '../../api';

const SUGGESTIONS = [
  'O que precisa da minha atenção hoje?',
  'Há emergências ou corridas pendentes?',
  'Como estão as corridas esta semana?',
  'Há motoristas aguardando aprovação?',
  'Quais obrigações financeiras exigem atenção?',
  'Quanto temos de bônus anual a pagar?',
];

const EXTRA_SUGGESTIONS = [
  'Quais e-mails novos chegaram?',
  'Há mensagens novas no WhatsApp?',
  'Quantos leads novos tivemos esta semana?',
  'Como está o financeiro deste mês?',
  'Quais territórios exigem atenção?',
  'Quero abrir uma nova cidade',
  'Qual é o CNPJ e o contato da KAVIAR?',
  'Quais módulos existem na plataforma?',
];

const MAX_CHARS = 1000;

export default function KaviarAiPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [managerDialog, setManagerDialog] = useState(null); // { territoryId, territoryName }
  const [managerForm, setManagerForm] = useState({ name: '', email: '' });
  const [managerResult, setManagerResult] = useState(null); // { name, email, tempPassword, territory, status }
  const [actionLoading, setActionLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const regulatoryAbortRef = useRef({ cancelled: false, timer: null });

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      regulatoryAbortRef.current.cancelled = true;
      if (regulatoryAbortRef.current.timer) clearTimeout(regulatoryAbortRef.current.timer);
    };
  }, []);

  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── Ações territoriais ──────────────────────────────────────────────────
  const handleCreateTerritory = async (city, uf) => {
    if (!isSuperAdmin) return;
    setActionLoading(true);
    try {
      const res = await api.post('/api/admin/ai/territory/create', { city, uf });
      if (res.data.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✓ Território "${res.data.data.name}" criado com status: planning.\nID: ${res.data.data.id}`,
          toolsUsed: ['territory_onboarding_status'],
        }]);
      }
    } catch (err) {
      const msg = err?.response?.data?.error || 'Erro ao criar território.';
      setMessages(prev => [...prev, { role: 'assistant', content: `✗ ${msg}` }]);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateManager = async () => {
    if (!isSuperAdmin || !managerDialog) return;
    const { name, email } = managerForm;
    if (!name.trim() || !email.trim()) return;
    setActionLoading(true);
    try {
      const res = await api.post('/api/admin/ai/territory/create-manager', {
        name: name.trim(),
        email: email.trim(),
        territory_id: managerDialog.territoryId,
      });
      if (res.data.success) {
        const d = res.data.data;
        const s = d.status;
        // Mostrar resultado com senha em dialog separado (não no chat)
        setManagerResult({ name: d.name, email: d.email, tempPassword: d.temp_password, territory: d.territory, status: s });
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✓ Gestor "${d.name}" cadastrado em ${d.territory}.\n\nConta: ${s.conta}\nTerritório: ${s.territorio}\nPerfil: ${s.perfil}\nContrato: ${s.contrato}\nDocumentos: ${s.documentos}`,
          toolsUsed: ['territory_onboarding_status'],
        }]);
      }
      setManagerDialog(null);
      setManagerForm({ name: '', email: '' });
    } catch (err) {
      const msg = err?.response?.data?.error || 'Erro ao cadastrar gestor.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegulatorySearch = async (city, uf) => {
    setActionLoading(true);
    const MAX_POLL_MS = 180000;
    const POLL_INTERVAL_MS = 2000;
    const abort = regulatoryAbortRef.current;
    abort.cancelled = false;
    abort.timer = null;
    try {
      // Start background search
      const startRes = await api.post('/api/admin/ai/territory/regulatory-search', { city, uf }, { timeout: 15000 });
      if (abort.cancelled) return;
      if (!startRes.data.success || !startRes.data.data?.responseId) {
        throw new Error(startRes.data.error || 'Falha ao iniciar pesquisa.');
      }
      const responseId = startRes.data.data.responseId;

      setMessages(prev => [...prev, { role: 'assistant', content: '⏳ Pesquisa regulatória em andamento...' }]);

      // Poll for completion
      const pollStart = Date.now();
      const result = await new Promise((resolve, reject) => {
        const poll = async () => {
          if (abort.cancelled) { reject(new Error('cancelled')); return; }
          if (Date.now() - pollStart > MAX_POLL_MS) { reject(new Error('timeout')); return; }
          try {
            const pollRes = await api.get(`/api/admin/ai/territory/regulatory-search/${responseId}`, { timeout: 10000 });
            if (abort.cancelled) { reject(new Error('cancelled')); return; }
            if (pollRes.data.success && pollRes.data.data?.status && ['queued', 'in_progress'].includes(pollRes.data.data.status)) {
              abort.timer = setTimeout(poll, POLL_INTERVAL_MS);
              return;
            }
            resolve(pollRes.data);
          } catch (pollErr) {
            if (abort.cancelled) { reject(new Error('cancelled')); return; }
            if (pollErr.response?.data) reject(pollErr);
            else abort.timer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        };
        poll();
      });

      if (abort.cancelled) return;
      // Remove "em andamento" message and show result
      setMessages(prev => prev.filter(m => m.content !== '⏳ Pesquisa regulatória em andamento...'));
      const d = result.data;
      const sources = d.officialSources.map(s => `  • ${s.title} (${s.orgao})\n    ${s.url}`).join('\n');
      const reqs = d.requirements.map(r => `• ${r}`).join('\n');
      const unconf = d.unconfirmedItems.length > 0 ? `\nItens sem confirmação:\n${d.unconfirmedItems.map(i => `• ${i}`).join('\n')}` : '';
      const steps = d.recommendedNextSteps.map(s => `• ${s}`).join('\n');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Pesquisa regulatória: ${city}/${uf}\n\n${d.summary}\n\nExigências:\n${reqs || '• Nenhuma encontrada'}\n\nFontes oficiais:\n${sources || '• Nenhuma fonte oficial encontrada'}${unconf}\n\nPróximos passos:\n${steps}\n\nConfiança: ${d.confidence}`,
        toolsUsed: ['territory_onboarding_status'],
      }]);
    } catch (err) {
      if (abort.cancelled) return;
      setMessages(prev => prev.filter(m => m.content !== '⏳ Pesquisa regulatória em andamento...'));
      let errorMsg = '✗ Não foi possível realizar a pesquisa regulatória.';
      if (err.message === 'timeout' || err.code === 'ECONNABORTED') {
        errorMsg = '✗ A pesquisa regulatória demorou mais que o esperado. Tente novamente.';
      } else if (err.message === 'cancelled') {
        return; // Unmounted, don't update state
      } else if (err.response?.data?.error) {
        errorMsg = `✗ ${err.response.data.error}`;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
    } finally {
      if (abort.timer) clearTimeout(abort.timer);
      if (!abort.cancelled) setActionLoading(false);
    }
  };

  const handleSend = async (questionOverride) => {
    const question = (questionOverride || input).trim();
    if (!question || loading) return;

    setError('');
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const result = await askKaviarAi(question);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.answer, toolsUsed: result.toolsUsed },
      ]);
    } catch (err) {
      const status = err?.response?.status || err?.status;
      let msg = 'Não foi possível consultar a KAVIAR IA agora. Tente novamente.';

      if (status === 400) {
        msg = err?.response?.data?.error || 'Pergunta inválida. Verifique o texto e tente novamente.';
      } else if (status === 401) {
        msg = 'Sessão expirada. Faça login novamente.';
      } else if (status === 403) {
        msg = 'Você não tem permissão para acessar a KAVIAR IA.';
      }

      setError(msg);
      // Restaura a pergunta no input para o usuário não perder
      setInput(question);
      // Remove a mensagem do usuário que falhou
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showWelcome = messages.length === 0;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0A0A0F', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ borderBottom: '1px solid rgba(184,148,46,0.15)', px: 3, py: 2 }}>
        <Container maxWidth="md" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SmartToy sx={{ color: '#B8942E', fontSize: 28 }} />
          <Box>
            <Typography variant="h6" sx={{ color: '#FFD700', fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>
              Chat KAVIAR
            </Typography>
            <Typography sx={{ color: '#6B7280', fontSize: 12 }}>
              Assistente operacional do KAVIAR
            </Typography>
          </Box>
          <Chip
            icon={<Lock sx={{ fontSize: 12, color: '#6B7280 !important' }} />}
            label="Leitura + ações confirmadas"
            size="small"
            sx={{ ml: 'auto', bgcolor: 'rgba(107,114,128,0.15)', color: '#6B7280', fontSize: 11, height: 24 }}
          />
        </Container>
      </Box>

      {/* Messages area */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 3 }}>
        <Container maxWidth="md">
          {showWelcome && (
            <Box sx={{ textAlign: 'center', mt: { xs: 4, md: 8 } }}>
              <SmartToy sx={{ color: '#B8942E', fontSize: 48, mb: 2, opacity: 0.7 }} />
              <Typography sx={{ color: '#9CA3AF', fontSize: 14, maxWidth: 480, mx: 'auto', mb: 4 }}>
                A KAVIAR IA consulta dados operacionais autorizados para ajudar você a identificar o que precisa de atenção.
              </Typography>

              {/* Sugestões */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
                {SUGGESTIONS.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    onClick={() => handleSend(s)}
                    sx={{
                      bgcolor: 'rgba(184,148,46,0.08)',
                      color: '#B8942E',
                      border: '1px solid rgba(184,148,46,0.2)',
                      fontSize: 13,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(184,148,46,0.15)', borderColor: '#B8942E' },
                    }}
                  />
                ))}
              </Box>

              {showExtra && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', mt: 1 }}>
                  {EXTRA_SUGGESTIONS.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      onClick={() => handleSend(s)}
                      sx={{
                        bgcolor: 'rgba(184,148,46,0.05)',
                        color: '#B8942E',
                        border: '1px solid rgba(184,148,46,0.15)',
                        fontSize: 12,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(184,148,46,0.12)', borderColor: '#B8942E' },
                      }}
                    />
                  ))}
                </Box>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                <Button
                  type="button"
                  size="small"
                  aria-expanded={showExtra}
                  onClick={() => setShowExtra(!showExtra)}
                  sx={{
                    color: 'rgba(184,148,46,0.6)',
                    fontSize: 12,
                    textTransform: 'none',
                    '&:hover': { color: '#B8942E', bgcolor: 'transparent' },
                  }}
                >
                  {showExtra ? 'Ocultar perguntas' : 'Mais perguntas'}
                </Button>
              </Box>
            </Box>
          )}

          {/* Chat messages */}
          {messages.map((msg, idx) => (
            <Box
              key={idx}
              sx={{
                display: 'flex',
                gap: 1.5,
                mb: 2.5,
                alignItems: 'flex-start',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              <Box
                sx={{
                  width: 32, height: 32, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: msg.role === 'user' ? 'rgba(184,148,46,0.15)' : 'rgba(107,114,128,0.15)',
                  flexShrink: 0,
                }}
              >
                {msg.role === 'user' ? (
                  <Person sx={{ fontSize: 18, color: '#B8942E' }} />
                ) : (
                  <SmartToy sx={{ fontSize: 18, color: '#6B7280' }} />
                )}
              </Box>

              <Paper
                elevation={0}
                sx={{
                  px: 2, py: 1.5, maxWidth: '80%',
                  bgcolor: msg.role === 'user' ? 'rgba(184,148,46,0.1)' : 'rgba(255,255,255,0.04)',
                  border: msg.role === 'user'
                    ? '1px solid rgba(184,148,46,0.2)'
                    : '1px solid rgba(107,114,128,0.15)',
                  borderRadius: 2,
                }}
              >
                <Typography
                  sx={{ color: '#E5E7EB', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
                >
                  {msg.content}
                </Typography>

                {/* Tools used */}
                {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                  <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid rgba(107,114,128,0.1)' }}>
                    <Typography sx={{ color: '#6B7280', fontSize: 11, mb: 0.5 }}>
                      Dados consultados
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {getToolFriendlyNames(msg.toolsUsed).map((name) => (
                        <Chip
                          key={name}
                          label={name}
                          size="small"
                          sx={{ bgcolor: 'rgba(107,114,128,0.1)', color: '#9CA3AF', fontSize: 11, height: 20 }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Ações territoriais (somente SUPER_ADMIN) */}
                {isSuperAdmin && msg.role === 'assistant' && msg.toolsUsed?.includes('territory_onboarding_status') && msg.content?.includes('não encontrado') && (
                  <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid rgba(184,148,46,0.15)', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button size="small" variant="outlined" disabled={actionLoading}
                      sx={{ color: '#B8942E', borderColor: '#B8942E', fontSize: 11, textTransform: 'none' }}
                      onClick={() => {
                        const match = msg.content.match(/Território\s+(.+?)\/([A-Z]{2})\s+não/);
                        if (match) handleCreateTerritory(match[1].trim(), match[2]);
                      }}>
                      Criar território
                    </Button>
                    <Button size="small" variant="outlined" disabled={actionLoading}
                      sx={{ color: '#6B7280', borderColor: '#6B7280', fontSize: 11, textTransform: 'none' }}
                      onClick={() => {
                        const match = msg.content.match(/Território\s+(.+?)\/([A-Z]{2})\s+não/);
                        if (match) handleRegulatorySearch(match[1].trim(), match[2]);
                      }}>
                      Pesquisar regulatório
                    </Button>
                  </Box>
                )}

                {/* Pesquisar regulatório para território EXISTENTE */}
                {isSuperAdmin && msg.role === 'assistant' && msg.toolsUsed?.includes('territory_onboarding_status') && msg.content?.includes('ID:') && (
                  <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button size="small" variant="outlined" disabled={actionLoading}
                      sx={{ color: '#6B7280', borderColor: '#6B7280', fontSize: 11, textTransform: 'none' }}
                      onClick={() => {
                        const match = msg.content.match(/Cidade:\s*([^/\n]+)\/([A-Z]{2})/);
                        if (match) handleRegulatorySearch(match[1].trim(), match[2]);
                      }}>
                      Pesquisar regulatório
                    </Button>
                  </Box>
                )}

                {isSuperAdmin && msg.role === 'assistant' && msg.toolsUsed?.includes('territory_onboarding_status') && msg.content?.includes('Nenhum') && msg.content?.includes('gestor') && (
                  <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                    <Button size="small" variant="outlined" disabled={actionLoading}
                      sx={{ color: '#B8942E', borderColor: '#B8942E', fontSize: 11, textTransform: 'none' }}
                      onClick={() => {
                        const idMatch = msg.content.match(/ID:\s*([^\n]+)/);
                        const cityMatch = msg.content.match(/Cidade:\s*([^\n]+)/);
                        if (idMatch) {
                          setManagerDialog({ territoryId: idMatch[1].trim(), territoryName: cityMatch?.[1]?.trim() || '' });
                        }
                      }}>
                      Cadastrar gestor
                    </Button>
                  </Box>
                )}
              </Paper>
            </Box>
          ))}

          {/* Loading indicator */}
          {loading && (
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, alignItems: 'center' }}>
              <Box
                sx={{
                  width: 32, height: 32, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: 'rgba(107,114,128,0.15)',
                }}
              >
                <SmartToy sx={{ fontSize: 18, color: '#6B7280' }} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} sx={{ color: '#B8942E' }} />
                <Typography sx={{ color: '#6B7280', fontSize: 13 }}>Consultando...</Typography>
              </Box>
            </Box>
          )}

          <div ref={messagesEndRef} />
        </Container>
      </Box>

      {/* Error */}
      {error && (
        <Container maxWidth="md" sx={{ pb: 1 }}>
          <Alert
            severity="error"
            onClose={() => setError('')}
            sx={{ bgcolor: 'rgba(220,38,38,0.08)', color: '#FCA5A5', border: '1px solid rgba(220,38,38,0.2)', '& .MuiAlert-icon': { color: '#FCA5A5' } }}
          >
            {error}
          </Alert>
        </Container>
      )}

      {/* Input area */}
      <Box sx={{ borderTop: '1px solid rgba(184,148,46,0.15)', px: 3, py: 2, bgcolor: 'rgba(0,0,0,0.3)' }}>
        <Container maxWidth="md">
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder="Pergunte à KAVIAR IA..."
            value={input}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHARS) {
                setInput(e.target.value);
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={loading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => handleSend()}
                    disabled={!input.trim() || loading}
                    sx={{ color: input.trim() ? '#B8942E' : '#4B5563' }}
                  >
                    <Send />
                  </IconButton>
                </InputAdornment>
              ),
              sx: {
                color: '#E5E7EB',
                bgcolor: 'rgba(255,255,255,0.03)',
                borderRadius: 2,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(184,148,46,0.2)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(184,148,46,0.4)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#B8942E' },
              },
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
            <Typography sx={{ color: input.length > MAX_CHARS * 0.9 ? '#FCA5A5' : '#4B5563', fontSize: 11 }}>
              {input.length}/{MAX_CHARS}
            </Typography>
          </Box>
        </Container>
      </Box>

      {/* Dialog cadastro de gestor */}
      <Dialog open={!!managerDialog} onClose={() => setManagerDialog(null)}
        PaperProps={{ sx: { bgcolor: '#1A1A1F', color: '#E5E7EB', minWidth: 360 } }}>
        <DialogTitle sx={{ color: '#FFD700', fontSize: 16 }}>Cadastrar Gestor Territorial</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#9CA3AF', fontSize: 12, mb: 2 }}>
            {managerDialog?.territoryName || 'Território'}
          </Typography>
          <TextField fullWidth label="Nome" value={managerForm.name}
            onChange={(e) => setManagerForm(f => ({ ...f, name: e.target.value }))}
            sx={{ mb: 2, '& .MuiInputLabel-root': { color: '#6B7280' }, '& .MuiOutlinedInput-root': { color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }}
          />
          <TextField fullWidth label="Email" type="email" value={managerForm.email}
            onChange={(e) => setManagerForm(f => ({ ...f, email: e.target.value }))}
            sx={{ '& .MuiInputLabel-root': { color: '#6B7280' }, '& .MuiOutlinedInput-root': { color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }}
          />
          <Typography sx={{ color: '#6B7280', fontSize: 11, mt: 1 }}>
            Senha temporária será gerada. O gestor deve alterar no primeiro acesso.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManagerDialog(null)} sx={{ color: '#6B7280' }}>Cancelar</Button>
          <Button onClick={handleCreateManager} disabled={actionLoading || !managerForm.name.trim() || !managerForm.email.trim()}
            sx={{ color: '#B8942E' }}>Cadastrar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog resultado com senha temporária */}
      <Dialog open={!!managerResult} onClose={() => setManagerResult(null)}
        PaperProps={{ sx: { bgcolor: '#1A1A1F', color: '#E5E7EB', minWidth: 360 } }}>
        <DialogTitle sx={{ color: '#FFD700', fontSize: 16 }}>Gestor Cadastrado</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#9CA3AF', fontSize: 12, mb: 1 }}>
            {managerResult?.name} — {managerResult?.territory}
          </Typography>
          <Typography sx={{ color: '#E5E7EB', fontSize: 13, mb: 0.5 }}>Email: {managerResult?.email}</Typography>
          <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(184,148,46,0.08)', border: '1px solid rgba(184,148,46,0.3)', borderRadius: 1 }}>
            <Typography sx={{ color: '#6B7280', fontSize: 11, mb: 0.5 }}>Senha temporária (copie agora):</Typography>
            <Typography sx={{ color: '#FFD700', fontSize: 14, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {managerResult?.tempPassword}
            </Typography>
          </Box>
          <Typography sx={{ color: '#6B7280', fontSize: 11, mt: 1 }}>
            O gestor deve alterar a senha no primeiro acesso.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { navigator.clipboard?.writeText(managerResult?.tempPassword || ''); }}
            sx={{ color: '#B8942E', fontSize: 12 }}>Copiar senha</Button>
          <Button onClick={() => setManagerResult(null)} sx={{ color: '#6B7280' }}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
