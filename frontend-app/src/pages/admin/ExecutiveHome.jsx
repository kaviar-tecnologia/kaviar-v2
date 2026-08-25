import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Grid,
  Typography,
} from '@mui/material';
import {
  AccountBalanceWallet,
  AutoAwesome,
  ChatBubble,
  DirectionsCar,
  Email,
  Public,
  Refresh,
} from '@mui/icons-material';
import { askKaviarAi } from '../../services/adminAiService';

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
          color: '#8A6D18',
          textDecoration: 'underline',
          fontWeight: 700,
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

const QUICK_QUESTIONS = [
  {
    label: 'E-mails importantes',
    question: 'Tem e-mail importante?',
    Icon: Email,
  },
  {
    label: 'Situação financeira',
    question: 'Quais obrigações financeiras exigem atenção?',
    Icon: AccountBalanceWallet,
  },
  {
    label: 'Motoristas pendentes',
    question: 'Há motoristas aguardando aprovação?',
    Icon: DirectionsCar,
  },
  {
    label: 'Territórios',
    question: 'Quais territórios exigem atenção?',
    Icon: Public,
  },
];

export default function ExecutiveHome() {
  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;

  const firstName = admin?.name?.split(' ')?.[0] || 'Executiva';

  const [answer, setAnswer] = useState('');
  const [answerTitle, setAnswerTitle] = useState('Prioridades de hoje');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const askExecutiveQuestion = async (question, title) => {
    setLoading(true);
    setError('');
    setAnswerTitle(title);

    try {
      const result = await askKaviarAi(question);
      setAnswer(result.answer || '');
    } catch {
      setError(
        'Não foi possível carregar esta informação agora. Você ainda pode conversar normalmente com o Chat KAVIAR.'
      );
      setAnswer('');
    } finally {
      setLoading(false);
    }
  };

  const loadBriefing = () =>
    askExecutiveQuestion(
      'O que precisa da minha atenção hoje? Faça um resumo executivo curto, priorizado e sem linguagem técnica.',
      'Prioridades de hoje'
    );

  useEffect(() => {
    loadBriefing();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('kaviar_admin_token');
    localStorage.removeItem('kaviar_admin_data');
    window.location.href = '/admin/login';
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F7F6F2', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="md">
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 2,
            mb: 3,
          }}
        >
          <Box>
            <Typography
              sx={{
                color: '#B8942E',
                fontWeight: 800,
                letterSpacing: 1,
                fontSize: 14,
              }}
            >
              KAVIAR
            </Typography>

            <Typography
              variant="h4"
              sx={{ fontWeight: 800, color: '#1A1A1A', mt: 0.5 }}
            >
              Olá, {firstName}
            </Typography>

            <Chip
              label="Sócia Executiva"
              size="small"
              sx={{
                mt: 1,
                bgcolor: 'rgba(184,148,46,0.10)',
                color: '#8A6D18',
                fontWeight: 700,
              }}
            />

            <Typography sx={{ color: '#6B7280', mt: 1 }}>
              Aqui está o que merece sua atenção na empresa.
            </Typography>
          </Box>

          <Button
            size="small"
            onClick={handleLogout}
            sx={{ color: '#6B7280' }}
          >
            Sair
          </Button>
        </Box>

        <Card
          sx={{
            borderRadius: 3,
            border: '1px solid #E8E5DE',
            boxShadow: '0 6px 24px rgba(0,0,0,0.05)',
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 2,
              }}
            >
              <AutoAwesome sx={{ color: '#B8942E' }} />

              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {answerTitle}
              </Typography>
            </Box>

            {loading && (
              <Box
                sx={{
                  py: 5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                }}
              >
                <CircularProgress size={24} />
                <Typography color="text.secondary">
                  Consultando a KAVIAR...
                </Typography>
              </Box>
            )}

            {!loading && error && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {!loading && answer && (
              <Typography
                component="div"
                sx={{
                  whiteSpace: 'pre-line',
                  lineHeight: 1.75,
                  color: '#374151',
                }}
              >
                {renderSafeInternalLinks(answer)}
              </Typography>
            )}

            {!loading && (
              <Button
                startIcon={<Refresh />}
                onClick={loadBriefing}
                sx={{ mt: 2, color: '#7A651F' }}
              >
                Voltar às prioridades de hoje
              </Button>
            )}
          </CardContent>
        </Card>

        <Typography
          sx={{
            mt: 3,
            mb: 1.5,
            fontWeight: 800,
            color: '#1A1A1A',
          }}
        >
          Consultas rápidas
        </Typography>

        <Grid container spacing={1.5}>
          {QUICK_QUESTIONS.map(({ label, question, Icon }) => (
            <Grid item xs={12} sm={6} key={label}>
              <Button
                variant="outlined"
                fullWidth
                disabled={loading}
                startIcon={<Icon />}
                onClick={() => askExecutiveQuestion(question, label)}
                sx={{
                  minHeight: 54,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  borderRadius: 2.5,
                  borderColor: '#DDD6C5',
                  color: '#4B5563',
                  bgcolor: '#FFFFFF',
                  fontWeight: 700,
                  '&:hover': {
                    borderColor: '#B8942E',
                    bgcolor: '#FFFDF7',
                  },
                }}
              >
                {label}
              </Button>
            </Grid>
          ))}
        </Grid>

        <Button
          component={Link}
          to="/admin/chat-kaviar"
          variant="contained"
          size="large"
          startIcon={<ChatBubble />}
          fullWidth
          sx={{
            mt: 3,
            py: 1.7,
            borderRadius: 3,
            bgcolor: '#B8942E',
            fontWeight: 800,
            fontSize: 16,
            '&:hover': {
              bgcolor: '#9D7E25',
            },
          }}
        >
          Perguntar outra coisa ao Chat KAVIAR
        </Button>

        <Typography
          align="center"
          sx={{ color: '#9CA3AF', fontSize: 12, mt: 2 }}
        >
          As consultas desta tela são somente leitura. Alterações no sistema exigem permissão e confirmação apropriadas.
        </Typography>
      </Container>
    </Box>
  );
}
