import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, Container, Typography, TextField, IconButton, Paper, Chip,
  CircularProgress, Alert, InputAdornment,
} from '@mui/material';
import { Send, SmartToy, Person, Lock } from '@mui/icons-material';
import { askKaviarAi, getToolFriendlyNames } from '../../services/adminAiService';

const SUGGESTIONS = [
  'O que precisa da minha atenção hoje?',
  'Como estão as corridas de hoje?',
  'Há documentos de motoristas pendentes?',
  'Quais obrigações financeiras exigem atenção?',
];

const MAX_CHARS = 1000;

export default function KaviarAiPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
            label="Somente leitura"
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
    </Box>
  );
}
