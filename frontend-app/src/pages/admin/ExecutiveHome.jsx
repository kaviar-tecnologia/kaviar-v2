import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Typography,
} from '@mui/material';
import {
  AutoAwesome,
  ChatBubble,
  Refresh,
} from '@mui/icons-material';
import { askKaviarAi } from '../../services/adminAiService';

export default function ExecutiveHome() {
  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;

  const firstName = admin?.name?.split(' ')?.[0] || 'Fernanda';

  const [briefing, setBriefing] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBriefing = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await askKaviarAi(
        'O que precisa da minha atenção hoje? Faça um resumo executivo curto, priorizado e sem linguagem técnica.'
      );
      setBriefing(result.answer || '');
    } catch {
      setError(
        'Não foi possível carregar o resumo agora. Você ainda pode conversar normalmente com o Chat KAVIAR.'
      );
    } finally {
      setLoading(false);
    }
  };

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
            alignItems: 'center',
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

            <Typography sx={{ color: '#6B7280', mt: 0.5 }}>
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
                Prioridades de hoje
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

            {!loading && briefing && (
              <Typography
                component="div"
                sx={{
                  whiteSpace: 'pre-line',
                  lineHeight: 1.75,
                  color: '#374151',
                }}
              >
                {briefing}
              </Typography>
            )}

            {!loading && (
              <Button
                startIcon={<Refresh />}
                onClick={loadBriefing}
                sx={{ mt: 2, color: '#7A651F' }}
              >
                Atualizar resumo
              </Button>
            )}
          </CardContent>
        </Card>

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
          Conversar com o Chat KAVIAR
        </Button>

        <Typography
          align="center"
          sx={{ color: '#9CA3AF', fontSize: 12, mt: 2 }}
        >
          O Chat KAVIAR consulta os dados da empresa e ajuda você a decidir o próximo passo.
        </Typography>
      </Container>
    </Box>
  );
}
