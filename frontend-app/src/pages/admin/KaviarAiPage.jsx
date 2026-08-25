import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, Container, Typography, TextField, IconButton, Paper, Chip,
  CircularProgress, Alert, InputAdornment, Button, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from '@mui/material';
import { Send, SmartToy, Person, Lock, Code, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { askKaviarAi, getToolFriendlyNames, listDevJobs, getDevJob, confirmDevJob } from '../../services/adminAiService';
import api from '../../api';

const SUGGESTIONS = [
  'O que precisa da minha atenção hoje?',
  'Há emergências ou corridas pendentes?',
  'Como estão as corridas esta semana?',
  'Há motoristas aguardando aprovação?',
  'Quais obrigações financeiras exigem atenção?',
  'Quantos e-mails novos chegaram?',
  'Tem e-mail importante?',
  'Há mensagens novas no WhatsApp?',
  'Quantos leads novos tivemos esta semana?',
  'Quais territórios exigem atenção?',
];

const EXTRA_SUGGESTIONS = [
  'Quanto temos de bônus anual a pagar?',
  'Como está o financeiro deste mês?',
  'Quero abrir uma nova cidade',
  'Qual é o CNPJ e o contato da KAVIAR?',
  'Quais módulos existem na plataforma?',
];

const MAX_CHARS = 1000;

// ── Dev-jobs helpers ─────────────────────────────────────────────────────────
function formatDevJobStatus(status) {
  const map = {
    AWAITING_SCOPE: 'Analisando escopo',
    AWAITING_CONFIRMATION: 'Aguardando confirmação',
    QUEUED: 'Na fila',
    RUNNING: 'Executando',
    SUCCEEDED: 'Concluído',
    FAILED: 'Falhou',
  };
  return map[status] || status;
}

function getDevJobStatusColor(status) {
  const colors = {
    AWAITING_SCOPE: { bg: 'rgba(184,148,46,0.1)', text: '#B8942E', border: 'rgba(184,148,46,0.3)' },
    AWAITING_CONFIRMATION: { bg: 'rgba(251,191,36,0.1)', text: '#FBBF24', border: 'rgba(251,191,36,0.3)' },
    QUEUED: { bg: 'rgba(107,114,128,0.1)', text: '#9CA3AF', border: 'rgba(107,114,128,0.3)' },
    RUNNING: { bg: 'rgba(96,165,250,0.1)', text: '#60A5FA', border: 'rgba(96,165,250,0.3)' },
    SUCCEEDED: { bg: 'rgba(52,211,153,0.1)', text: '#34D399', border: 'rgba(52,211,153,0.3)' },
    FAILED: { bg: 'rgba(252,165,165,0.1)', text: '#FCA5A5', border: 'rgba(252,165,165,0.3)' },
  };
  return colors[status] || colors.QUEUED;
}

function renderSafeInternalLinks(content) {
  if (typeof content !== 'string') return content;

  const regex = /\[Abrir e-mail\]\((\/admin\/inbox\?message=[^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const href = match[1];

    parts.push(
      <a
        key={`${href}-${match.index}`}
        href={href}
        style={{
          color: '#60A5FA',
          textDecoration: 'underline',
          fontWeight: 600,
        }}
      >
        Abrir e-mail
      </a>
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

function getCoverageGovernanceAction(message) {
  if (!message?.toolsUsed?.includes('territory_manager_coverage')) {
    return null;
  }

  const content = message.content || '';

  const locationMatch = content.match(
    /Cobertura de Gestores —\s*(.+?)\/([A-Z]{2})\b/
  );

  const statusMatch = content.match(
    /Cobertura territorial:\s*(NOT_LOADED|AWAITING_REVIEW|COMPLETE)\b/
  );

  const neighborhoodsMatch = content.match(
    /Bairros oficiais ativos:\s*(\d+)/
  );

  if (!locationMatch || !statusMatch) return null;

  const city = locationMatch[1].trim();
  const uf = locationMatch[2];
  const expectedStatus = statusMatch[1];
  const officialNeighborhoods = Number(
    neighborhoodsMatch?.[1] || 0
  );

  if (expectedStatus === 'NOT_LOADED') {
    return {
      city,
      uf,
      expectedStatus,
      targetStatus: 'AWAITING_REVIEW',
      confirmation: 'ENVIAR_COBERTURA_REVISAO',
      buttonLabel: 'Enviar para revisão',
      title: 'Enviar cobertura para revisão',
      requiresReason: false,
      officialNeighborhoods,
      description:
        'Os dados cadastrados passarão para revisão humana antes da homologação.',
    };
  }

  if (expectedStatus === 'AWAITING_REVIEW') {
    return {
      city,
      uf,
      expectedStatus,
      targetStatus: 'COMPLETE',
      confirmation: 'HOMOLOGAR_COBERTURA',
      buttonLabel: 'Homologar cobertura',
      title: 'Homologar cobertura territorial',
      requiresReason: false,
      officialNeighborhoods,
      description:
        'Confirme somente após revisar a completude dos bairros oficiais cadastrados.',
    };
  }

  return {
    city,
    uf,
    expectedStatus,
    targetStatus: 'AWAITING_REVIEW',
    confirmation: 'REABRIR_COBERTURA',
    buttonLabel: 'Reabrir revisão',
    title: 'Reabrir cobertura territorial',
    requiresReason: true,
    officialNeighborhoods,
    description:
      'A cobertura deixará de ser homologada e voltará a ser provisória até nova revisão.',
  };
}

export default function KaviarAiPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const processingTimerRef = useRef(null);
  const [showExtra, setShowExtra] = useState(false);
  const [managerDialog, setManagerDialog] = useState(null); // { territoryId, territoryName }
  const [managerForm, setManagerForm] = useState({ name: '', email: '' });
  const [managerResult, setManagerResult] = useState(null); // { name, email, tempPassword, territory, status }
  const [landingDialog, setLandingDialog] = useState(null); // { city, uf }
  const [territoryDialog, setTerritoryDialog] = useState(null); // { city, uf }
  const [coverageDialog, setCoverageDialog] = useState(null);
  const [coverageNotes, setCoverageNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [devJobs, setDevJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [devJobsLoading, setDevJobsLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const messagesEndRef = useRef(null);
  const regulatoryAbortRef = useRef({ cancelled: false, timer: null });
  const devJobsPollRef = useRef(null);

  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';
  const canCreatePlanningTerritory =
    isSuperAdmin || admin?.role === 'EXECUTIVE_ADMIN';

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      regulatoryAbortRef.current.cancelled = true;
      if (regulatoryAbortRef.current.timer) clearTimeout(regulatoryAbortRef.current.timer);
      if (devJobsPollRef.current) clearInterval(devJobsPollRef.current);
    };
  }, []);

  // Dev-jobs polling
  const fetchDevJobs = useCallback(async () => {
    try {
      const jobs = await listDevJobs();
      setDevJobs(jobs);
    } catch {
      // Silently ignore — panel just won't update
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchDevJobs();
    devJobsPollRef.current = setInterval(fetchDevJobs, 15000);
    return () => {
      if (devJobsPollRef.current) clearInterval(devJobsPollRef.current);
    };
  }, [fetchDevJobs, isSuperAdmin]);

  // Poll selected job detail
  const pollSelectedJob = useCallback(async (jobId) => {
    try {
      const job = await getDevJob(jobId);
      setSelectedJob(job);
      // Stop polling if terminal
      if (['SUCCEEDED', 'FAILED'].includes(job.status)) return;
    } catch {
      // ignore
    }
  }, []);

  // Auto-poll selected job when it's in a non-terminal state
  useEffect(() => {
    if (!selectedJob) return;
    if (['SUCCEEDED', 'FAILED'].includes(selectedJob.status)) return;
    const interval = setInterval(() => pollSelectedJob(selectedJob.id), 5000);
    return () => clearInterval(interval);
  }, [selectedJob?.id, selectedJob?.status, pollSelectedJob]);

  // Poll developmentProposal jobs in chat messages to detect state transitions
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (!isSuperAdmin) return;

    const NON_TERMINAL = ['AWAITING_SCOPE', 'AWAITING_CONFIRMATION', 'QUEUED', 'RUNNING'];

    const pollProposals = async () => {
      const currentMessages = messagesRef.current;
      const activeProposals = currentMessages
        .filter((m) => m.developmentProposal && NON_TERMINAL.includes(m.developmentProposal.status))
        .map((m) => m.developmentProposal);

      for (const proposal of activeProposals) {
        try {
          const job = await getDevJob(proposal.jobId);
          if (job.status !== proposal.status) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.developmentProposal?.jobId === proposal.jobId
                  ? {
                      ...msg,
                      developmentProposal: {
                        ...msg.developmentProposal,
                        status: job.status,
                        allowedPaths: job.allowedPaths,
                      },
                    }
                  : msg
              )
            );
          }
        } catch {
          // ignore individual poll errors
        }
      }
    };

    const interval = setInterval(pollProposals, 8000);
    return () => clearInterval(interval);
  }, [isSuperAdmin]);

  const handleSelectJob = async (jobId) => {
    setDevJobsLoading(true);
    try {
      const job = await getDevJob(jobId);
      setSelectedJob(job);
    } catch {
      setError('Erro ao carregar detalhes do job.');
    } finally {
      setDevJobsLoading(false);
    }
  };

  const handleConfirmJob = async () => {
    if (!confirmDialog) return;
    setActionLoading(true);
    try {
      await confirmDevJob(confirmDialog.id);
      setConfirmDialog(null);
      // Refresh
      await fetchDevJobs();
      if (selectedJob?.id === confirmDialog.id) {
        await pollSelectedJob(confirmDialog.id);
      }
    } catch (err) {
      setError(err?.message || 'Erro ao confirmar job.');
    } finally {
      setActionLoading(false);
    }
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── Ações territoriais ──────────────────────────────────────────────────
  const handleCreateTerritory = async () => {
    if (!canCreatePlanningTerritory || !territoryDialog) return;

    const { city, uf } = territoryDialog;
    setActionLoading(true);
    setError('');

    try {
      const res = await api.post('/api/admin/ai/territory/create', {
        city,
        uf,
        confirmation: 'CRIAR_TERRITORIO',
      });

      if (res.data.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✓ Território "${res.data.data.name}" criado com status: planning.\nID: ${res.data.data.id}`,
          toolsUsed: ['territory_onboarding_status'],
        }]);

        setTerritoryDialog(null);
      }
    } catch (err) {
      const msg = err?.response?.data?.error || 'Erro ao criar território.';
      setMessages(prev => [...prev, { role: 'assistant', content: `✗ ${msg}` }]);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDevelopmentJob = async (jobId) => {
    if (!isSuperAdmin || !jobId) return;

    setActionLoading(true);
    setError('');

    try {
      const confirmed = await confirmDevJob(jobId);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.developmentProposal?.jobId === jobId
            ? {
                ...msg,
                developmentProposal: {
                  ...msg.developmentProposal,
                  status: confirmed.status,
                  confirmedAt: confirmed.confirmedAt,
                },
              }
            : msg
        )
      );
      // Also refresh the jobs panel
      await fetchDevJobs();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Erro ao confirmar job de desenvolvimento.';
      setError(msg);
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

  const handleEnableLanding = async () => {
    if (!isSuperAdmin || !landingDialog) return;

    setActionLoading(true);
    setError('');

    try {
      const res = await api.post('/api/admin/ai/territory/landing/enable', {
        city: landingDialog.city,
        uf: landingDialog.uf,
        confirmation: 'LIBERAR_LANDING',
      });

      if (res.data.success) {
        const d = res.data.data;

        setMessages(prev => [...prev, {
          role: 'assistant',
          content:
            `✓ Landing de motoristas liberada para ${d.city}/${d.state}.\n` +
            `Status público: ${d.public_status}\n` +
            `URL: ${d.url}`,
          toolsUsed: ['driver_city_landings'],
        }]);
      }

      setLandingDialog(null);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        'Erro ao liberar landing de motoristas.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCoverageStatusChange = async () => {
    if (!isSuperAdmin || !coverageDialog) return;

    const notes = coverageNotes.trim();

    if (coverageDialog.requiresReason && !notes) {
      setError('Informe o motivo para reabrir a cobertura.');
      return;
    }

    setActionLoading(true);
    setError('');

    try {
      const res = await api.post(
        '/api/admin/ai/territory/coverage/status',
        {
          city: coverageDialog.city,
          uf: coverageDialog.uf,
          expected_status: coverageDialog.expectedStatus,
          target_status: coverageDialog.targetStatus,
          confirmation: coverageDialog.confirmation,
          notes,
        }
      );

      if (res.data.success) {
        const d = res.data.data;

        setMessages(prev => [...prev, {
          role: 'assistant',
          content:
            `✓ Cobertura territorial de ${d.city}/${d.uf} atualizada.\n` +
            `${d.previous_status} → ${d.coverage_status}\n` +
            `Bairros oficiais considerados: ${d.official_neighborhoods}`,
        }]);

        setCoverageDialog(null);
        setCoverageNotes('');

        // Atualiza a visão do Chat com o estado recém-gravado.
        try {
          const refreshed = await askKaviarAi(
            `Como está a cobertura de gestores em ${d.city}/${d.uf}?`
          );

          setMessages(prev => [...prev, {
            role: 'assistant',
            content: refreshed.answer,
            toolsUsed: refreshed.toolsUsed,
          }]);
        } catch {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content:
              '⚠️ A alteração foi concluída, mas não foi possível atualizar ' +
              'a consulta automaticamente. Consulte a cobertura novamente.',
          }]);
        }
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        'Erro ao atualizar governança da cobertura territorial.';

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

  const PROCESSING_CYCLE_MESSAGES = [
    'Consultando dados disponíveis...',
    'Analisando informações...',
    'Preparando resposta...',
  ];

  const getInitialProcessingStatus = (q) => {
    const lower = q.toLowerCase();
    if (lower.includes('cnpj') || lower.includes('razão social') || lower.includes('razao social') || lower.includes('dados da empresa') || lower.includes('capital social')) {
      return 'Consultando dados institucionais da KAVIAR...';
    }
    if (lower.includes('regulat') || lower.includes('prefeitura') || lower.includes('cidade') || lower.includes('município') || lower.includes('municipio')) {
      return 'Verificando informações regulatórias...';
    }
    if (lower.includes('ofício') || lower.includes('oficio') || lower.includes('e-mail') || lower.includes('email') || lower.includes('comunicado') || lower.includes('rascunho') || lower.includes('redija') || lower.includes('escreva') || lower.includes('prepare')) {
      return 'Preparando rascunho...';
    }
    if (lower.includes('código') || lower.includes('codigo') || lower.includes('correção') || lower.includes('correcao') || lower.includes('bug') || lower.includes('feature') || lower.includes('endpoint') || lower.includes('refator')) {
      return 'Analisando solicitação de desenvolvimento...';
    }
    return 'Entendendo sua solicitação...';
  };

  const startProcessingCycle = (question) => {
    setProcessingStatus(getInitialProcessingStatus(question));
    let cycleIndex = 0;
    processingTimerRef.current = setInterval(() => {
      setProcessingStatus(PROCESSING_CYCLE_MESSAGES[cycleIndex % PROCESSING_CYCLE_MESSAGES.length]);
      cycleIndex++;
    }, 4000);
  };

  const stopProcessingCycle = () => {
    if (processingTimerRef.current) {
      clearInterval(processingTimerRef.current);
      processingTimerRef.current = null;
    }
    setProcessingStatus('');
  };

  const handleSend = async (questionOverride) => {
    const question = (questionOverride || input).trim();
    if (!question || loading) return;

    // Extract recent history (max 6 messages, text only) BEFORE adding new user message
    const MAX_HISTORY = 6;
    const MAX_HISTORY_CHARS = 4000;
    const recentHistory = [];
    let totalChars = 0;
    const slice = messages.slice(-MAX_HISTORY);
    for (const msg of slice) {
      if ((msg.role === 'user' || msg.role === 'assistant') && msg.content) {
        const content = msg.content.length <= 1000
          ? msg.content
          : msg.role === 'assistant'
            ? msg.content.slice(-1000)
            : msg.content.slice(0, 1000);
        if (totalChars + content.length > MAX_HISTORY_CHARS) break;
        recentHistory.push({ role: msg.role, content });
        totalChars += content.length;
      }
    }

    setError('');
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setLoading(true);
    startProcessingCycle(question);

    try {
      const result = await askKaviarAi(question, recentHistory);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.answer,
          toolsUsed: result.toolsUsed,
          developmentProposal: result.developmentProposal,
        },
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
      stopProcessingCycle();
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

      {/* Development Jobs Panel */}
      {isSuperAdmin && devJobs.length > 0 && (
        <Box sx={{ borderBottom: '1px solid rgba(107,114,128,0.15)', px: 3, py: 1.5 }}>
          <Container maxWidth="md">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Code sx={{ fontSize: 16, color: '#6B7280' }} />
              <Typography sx={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>
                Development Jobs
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {devJobs.map((job) => (
                <Chip
                  key={job.id}
                  label={`${job.title || job.id.slice(0, 8)} — ${formatDevJobStatus(job.status)}`}
                  size="small"
                  onClick={() => handleSelectJob(job.id)}
                  sx={{
                    bgcolor: getDevJobStatusColor(job.status).bg,
                    color: getDevJobStatusColor(job.status).text,
                    border: `1px solid ${getDevJobStatusColor(job.status).border}`,
                    fontSize: 11,
                    cursor: 'pointer',
                    '&:hover': { opacity: 0.8 },
                  }}
                />
              ))}
            </Box>
          </Container>
        </Box>
      )}

      {/* Selected Job Detail */}
      {selectedJob && (
        <Box sx={{ borderBottom: '1px solid rgba(107,114,128,0.15)', px: 3, py: 2 }}>
          <Container maxWidth="md">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600, mb: 0.5 }}>
                  {selectedJob.title || 'Development Job'}
                </Typography>
                <Typography sx={{ color: '#9CA3AF', fontSize: 12, mb: 1 }}>
                  Status: {formatDevJobStatus(selectedJob.status)}
                  {selectedJob.branch_name && ` · Branch: ${selectedJob.branch_name}`}
                </Typography>
                {selectedJob.status === 'AWAITING_SCOPE' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={12} sx={{ color: '#B8942E' }} />
                    <Typography sx={{ color: '#B8942E', fontSize: 12 }}>
                      Analisando escopo...
                    </Typography>
                  </Box>
                )}
                {selectedJob.status === 'AWAITING_CONFIRMATION' && (
                  <Box sx={{ mt: 1 }}>
                    {selectedJob.scope_summary && (
                      <>
                        <Typography sx={{ color: '#9CA3AF', fontSize: 11, mb: 0.5 }}>Escopo:</Typography>
                        <Typography sx={{ color: '#E5E7EB', fontSize: 12, whiteSpace: 'pre-wrap', mb: 1 }}>
                          {selectedJob.scope_summary}
                        </Typography>
                      </>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={actionLoading}
                      onClick={() => setConfirmDialog(selectedJob)}
                      sx={{ color: '#B8942E', borderColor: '#B8942E', fontSize: 11, textTransform: 'none' }}
                    >
                      Confirmar execução
                    </Button>
                  </Box>
                )}
                {selectedJob.status === 'QUEUED' && (
                  <Typography sx={{ color: '#6B7280', fontSize: 12 }}>
                    Aguardando runner...
                  </Typography>
                )}
                {selectedJob.status === 'RUNNING' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={12} sx={{ color: '#60A5FA' }} />
                    <Typography sx={{ color: '#60A5FA', fontSize: 12 }}>
                      Executando...
                    </Typography>
                  </Box>
                )}
                {selectedJob.status === 'SUCCEEDED' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CheckCircle sx={{ fontSize: 14, color: '#34D399' }} />
                    <Typography sx={{ color: '#34D399', fontSize: 12 }}>
                      Concluído
                      {selectedJob.pr_url && (
                        <> · <a href={selectedJob.pr_url} target="_blank" rel="noopener noreferrer" style={{ color: '#60A5FA' }}>Ver PR</a></>
                      )}
                    </Typography>
                  </Box>
                )}
                {selectedJob.status === 'FAILED' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ErrorIcon sx={{ fontSize: 14, color: '#FCA5A5' }} />
                    <Typography sx={{ color: '#FCA5A5', fontSize: 12 }}>
                      Falhou{selectedJob.error_message && `: ${selectedJob.error_message}`}
                    </Typography>
                  </Box>
                )}
              </Box>
              <Button
                size="small"
                onClick={() => setSelectedJob(null)}
                sx={{ color: '#6B7280', fontSize: 11, textTransform: 'none', minWidth: 'auto' }}
              >
                ✕
              </Button>
            </Box>
          </Container>
        </Box>
      )}

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
                  {msg.role === 'assistant'
                    ? renderSafeInternalLinks(msg.content)
                    : msg.content}
                </Typography>

                {/* Development Agent approval */}
                {isSuperAdmin && msg.developmentProposal && (
                  <Box
                    sx={{
                      mt: 1.5,
                      pt: 1.5,
                      borderTop: '1px solid rgba(184,148,46,0.2)',
                    }}
                  >
                    <Typography sx={{ color: '#B8942E', fontSize: 12, fontWeight: 600 }}>
                      Proposta de desenvolvimento
                    </Typography>

                    <Typography sx={{ color: '#D1D5DB', fontSize: 12, mt: 0.5 }}>
                      {msg.developmentProposal.category}
                    </Typography>

                    <Typography sx={{ color: '#9CA3AF', fontSize: 12, mt: 0.5 }}>
                      {msg.developmentProposal.summary}
                    </Typography>

                    <Typography sx={{ color: '#6B7280', fontSize: 11, mt: 0.5 }}>
                      Status: {formatDevJobStatus(msg.developmentProposal.status)}
                    </Typography>

                    {msg.developmentProposal.status === 'AWAITING_SCOPE' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <CircularProgress size={12} sx={{ color: '#B8942E' }} />
                        <Typography sx={{ color: '#B8942E', fontSize: 11 }}>
                          Analisando escopo...
                        </Typography>
                      </Box>
                    )}

                    {msg.developmentProposal.status === 'AWAITING_CONFIRMATION' && (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={actionLoading}
                        sx={{
                          mt: 1,
                          color: '#B8942E',
                          borderColor: '#B8942E',
                          fontSize: 11,
                          textTransform: 'none',
                        }}
                        onClick={() =>
                          handleConfirmDevelopmentJob(msg.developmentProposal.jobId)
                        }
                      >
                        Confirmar execução
                      </Button>
                    )}

                    {msg.developmentProposal.status === 'QUEUED' && (
                      <Typography sx={{ color: '#6B7280', fontSize: 11, mt: 1 }}>
                        Aguardando runner...
                      </Typography>
                    )}

                    {msg.developmentProposal.status === 'RUNNING' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <CircularProgress size={12} sx={{ color: '#60A5FA' }} />
                        <Typography sx={{ color: '#60A5FA', fontSize: 11 }}>
                          Executando...
                        </Typography>
                      </Box>
                    )}

                    {msg.developmentProposal.status === 'SUCCEEDED' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <CheckCircle sx={{ fontSize: 14, color: '#34D399' }} />
                        <Typography sx={{ color: '#34D399', fontSize: 11 }}>
                          Concluído
                        </Typography>
                      </Box>
                    )}

                    {msg.developmentProposal.status === 'FAILED' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <ErrorIcon sx={{ fontSize: 14, color: '#FCA5A5' }} />
                        <Typography sx={{ color: '#FCA5A5', fontSize: 11 }}>
                          Falhou
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}

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

                {/* Governança da cobertura territorial — somente resposta mais recente */}
                {isSuperAdmin &&
                  idx === messages.length - 1 &&
                  msg.role === 'assistant' &&
                  msg.toolsUsed?.includes('territory_manager_coverage') &&
                  (() => {
                    const action = getCoverageGovernanceAction(msg);

                    if (!action) return null;

                    const blockedByMissingNeighborhoods =
                      action.expectedStatus !== 'COMPLETE' &&
                      action.officialNeighborhoods === 0;

                    return (
                      <Box
                        sx={{
                          mt: 1.5,
                          pt: 1,
                          borderTop: '1px solid rgba(184,148,46,0.15)',
                        }}
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={
                            actionLoading ||
                            blockedByMissingNeighborhoods
                          }
                          sx={{
                            color: '#B8942E',
                            borderColor: '#B8942E',
                            fontSize: 11,
                            textTransform: 'none',
                          }}
                          onClick={() => {
                            setCoverageNotes('');
                            setCoverageDialog(action);
                          }}
                        >
                          {action.buttonLabel}
                        </Button>

                        {blockedByMissingNeighborhoods && (
                          <Typography
                            sx={{
                              color: '#FCA5A5',
                              fontSize: 11,
                              mt: 0.75,
                            }}
                          >
                            Cadastre bairros oficiais antes de revisar ou homologar.
                          </Typography>
                        )}
                      </Box>
                    );
                  })()}

                {/* Criação segura de território planning */}
                {canCreatePlanningTerritory && msg.role === 'assistant' && msg.toolsUsed?.includes('territory_onboarding_status') && msg.content?.includes('não encontrado') && (
                  <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid rgba(184,148,46,0.15)', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button size="small" variant="outlined" disabled={actionLoading}
                      sx={{ color: '#B8942E', borderColor: '#B8942E', fontSize: 11, textTransform: 'none' }}
                      onClick={() => {
                        const match = msg.content.match(/Território\s+(.+?)\/([A-Z]{2})\s+não/);
                        if (match) {
                          setTerritoryDialog({
                            city: match[1].trim(),
                            uf: match[2],
                          });
                        }
                      }}>
                      Criar território
                    </Button>
                    {isSuperAdmin && (
                      <Button size="small" variant="outlined" disabled={actionLoading}
                        sx={{ color: '#6B7280', borderColor: '#6B7280', fontSize: 11, textTransform: 'none' }}
                        onClick={() => {
                          const match = msg.content.match(/Território\s+(.+?)\/([A-Z]{2})\s+não/);
                          if (match) handleRegulatorySearch(match[1].trim(), match[2]);
                        }}>
                        Pesquisar regulatório
                      </Button>
                    )}
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

                {/* Liberar landing com confirmação explícita */}
                {isSuperAdmin &&
                  msg.role === 'assistant' &&
                  msg.toolsUsed?.includes('territory_onboarding_status') &&
                  msg.toolsUsed?.includes('driver_city_landings') &&
                  msg.content?.includes('ID:') &&
                  (
                    msg.content?.includes('Nenhuma landing page de motoristas correspondente foi encontrada.') ||
                    msg.content?.includes('Landing: desativada')
                  ) && (
                  <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={actionLoading}
                      sx={{
                        color: '#B8942E',
                        borderColor: '#B8942E',
                        fontSize: 11,
                        textTransform: 'none',
                      }}
                      onClick={() => {
                        const match = msg.content.match(/Cidade:\s*([^/\n]+)\/([A-Z]{2})/);
                        if (match) {
                          setLandingDialog({
                            city: match[1].trim(),
                            uf: match[2],
                          });
                        }
                      }}
                    >
                      Liberar landing
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
                <Typography sx={{ color: '#6B7280', fontSize: 13 }}>{processingStatus || 'Consultando...'}</Typography>
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

      {/* Dialog confirmação de criação do território */}
      <Dialog
        open={!!territoryDialog}
        onClose={() => setTerritoryDialog(null)}
        PaperProps={{
          sx: {
            bgcolor: '#1A1A1F',
            color: '#E5E7EB',
            minWidth: 360,
          },
        }}
      >
        <DialogTitle sx={{ color: '#FFD700', fontSize: 16 }}>
          Confirmar criação do território
        </DialogTitle>

        <DialogContent>
          <Typography sx={{ color: '#E5E7EB', fontSize: 13, mb: 1.5 }}>
            {territoryDialog
              ? `${territoryDialog.city}/${territoryDialog.uf}`
              : ''}
          </Typography>

          <Typography sx={{ color: '#9CA3AF', fontSize: 12 }}>
            Esta ação criará um registro real de território no KAVIAR.
          </Typography>

          <Typography sx={{ color: '#6B7280', fontSize: 11, mt: 1.5 }}>
            O território será criado em planning e permanecerá inativo.
            Isso não libera corridas nem ativa a operação.
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setTerritoryDialog(null)}
            sx={{ color: '#6B7280' }}
          >
            Cancelar
          </Button>

          <Button
            onClick={handleCreateTerritory}
            disabled={actionLoading}
            sx={{ color: '#B8942E' }}
          >
            Criar território
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog confirmação de liberação da landing */}
      <Dialog
        open={!!landingDialog}
        onClose={() => setLandingDialog(null)}
        PaperProps={{
          sx: {
            bgcolor: '#1A1A1F',
            color: '#E5E7EB',
            minWidth: 360,
          },
        }}
      >
        <DialogTitle sx={{ color: '#FFD700', fontSize: 16 }}>
          Liberar Landing de Motoristas
        </DialogTitle>

        <DialogContent>
          <Typography sx={{ color: '#E5E7EB', fontSize: 13, mb: 1.5 }}>
            {landingDialog
              ? `${landingDialog.city}/${landingDialog.uf}`
              : ''}
          </Typography>

          <Typography sx={{ color: '#9CA3AF', fontSize: 12 }}>
            Esta ação tornará pública a página de captação de motoristas
            desta cidade.
          </Typography>

          <Typography sx={{ color: '#6B7280', fontSize: 11, mt: 1.5 }}>
            Isso não ativa o território e não libera a operação de corridas.
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setLandingDialog(null)}
            sx={{ color: '#6B7280' }}
          >
            Cancelar
          </Button>

          <Button
            onClick={handleEnableLanding}
            disabled={actionLoading}
            sx={{ color: '#B8942E' }}
          >
            Liberar landing
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog governança da cobertura territorial */}
      <Dialog
        open={!!coverageDialog}
        onClose={() => {
          if (!actionLoading) {
            setCoverageDialog(null);
            setCoverageNotes('');
          }
        }}
        PaperProps={{
          sx: {
            bgcolor: '#1A1A1F',
            color: '#E5E7EB',
            minWidth: 380,
          },
        }}
      >
        <DialogTitle sx={{ color: '#FFD700', fontSize: 16 }}>
          {coverageDialog?.title || 'Cobertura territorial'}
        </DialogTitle>

        <DialogContent>
          <Typography
            sx={{
              color: '#E5E7EB',
              fontSize: 13,
              mb: 1,
            }}
          >
            {coverageDialog
              ? `${coverageDialog.city}/${coverageDialog.uf}`
              : ''}
          </Typography>

          <Typography
            sx={{
              color: '#9CA3AF',
              fontSize: 12,
              mb: 1,
            }}
          >
            {coverageDialog?.expectedStatus}
            {' → '}
            {coverageDialog?.targetStatus}
          </Typography>

          <Typography
            sx={{
              color: '#9CA3AF',
              fontSize: 12,
              mb: 2,
            }}
          >
            {coverageDialog?.description}
          </Typography>

          <TextField
            fullWidth
            multiline
            minRows={2}
            label={
              coverageDialog?.requiresReason
                ? 'Motivo da reabertura'
                : 'Observação da revisão (opcional)'
            }
            value={coverageNotes}
            required={!!coverageDialog?.requiresReason}
            onChange={(e) => setCoverageNotes(e.target.value)}
            inputProps={{ maxLength: 1000 }}
            sx={{
              '& .MuiInputLabel-root': { color: '#6B7280' },
              '& .MuiOutlinedInput-root': {
                color: '#E5E7EB',
                '& fieldset': {
                  borderColor: 'rgba(184,148,46,0.3)',
                },
              },
            }}
          />

          <Typography
            sx={{
              color: '#6B7280',
              fontSize: 11,
              mt: 1.5,
            }}
          >
            COMPLETE homologa somente a base territorial.
            Não aprova quantidade de gestores nem contratação.
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => {
              setCoverageDialog(null);
              setCoverageNotes('');
            }}
            disabled={actionLoading}
            sx={{ color: '#6B7280' }}
          >
            Cancelar
          </Button>

          <Button
            onClick={handleCoverageStatusChange}
            disabled={
              actionLoading ||
              (
                coverageDialog?.requiresReason &&
                !coverageNotes.trim()
              )
            }
            sx={{ color: '#B8942E' }}
          >
            {coverageDialog?.buttonLabel || 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>

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

      {/* Dialog confirmação de execução do Development Job */}
      <Dialog
        open={!!confirmDialog}
        onClose={() => !actionLoading && setConfirmDialog(null)}
        PaperProps={{ sx: { bgcolor: '#1A1A1F', color: '#E5E7EB', minWidth: 360 } }}
      >
        <DialogTitle sx={{ color: '#FFD700', fontSize: 16 }}>
          Confirmar execução
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#E5E7EB', fontSize: 13, mb: 1 }}>
            {confirmDialog?.title || 'Development Job'}
          </Typography>
          {confirmDialog?.scope_summary && (
            <Typography sx={{ color: '#9CA3AF', fontSize: 12, mb: 1.5, whiteSpace: 'pre-wrap' }}>
              {confirmDialog.scope_summary}
            </Typography>
          )}
          <Typography sx={{ color: '#6B7280', fontSize: 11 }}>
            Após confirmação, o job entrará na fila e será executado pelo runner da EC2.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(null)} disabled={actionLoading} sx={{ color: '#6B7280' }}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmJob} disabled={actionLoading} sx={{ color: '#B8942E' }}>
            Confirmar execução
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
