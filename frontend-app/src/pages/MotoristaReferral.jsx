import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container, Typography, Box, Button, Chip, CircularProgress } from '@mui/material';
import { API_BASE_URL } from '../config/api';

export default function MotoristaReferral() {
  const [params] = useSearchParams();
  const ref = params.get('ref')?.toUpperCase() || '';
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(!!ref);

  useEffect(() => {
    if (!ref) return;
    fetch(`${API_BASE_URL}/api/public/referral-agent/${ref}`)
      .then(r => r.json())
      .then(d => { if (d.success) setAgent(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ref]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Container maxWidth="sm" sx={{ textAlign: 'center', py: 6 }}>
        <Typography variant="h4" sx={{ color: '#FFD700', fontWeight: 900, letterSpacing: 6, mb: 1 }}>KAVIAR</Typography>
        <Typography variant="body2" sx={{ color: '#999', letterSpacing: 2, textTransform: 'uppercase', mb: 4 }}>Mobilidade com identidade</Typography>

        {loading && <CircularProgress sx={{ color: '#FFD700', mb: 3 }} />}

        {agent && (
          <Box sx={{ bgcolor: '#2a2a2a', borderRadius: 3, p: 3, mb: 3, border: '1px solid #FFD700' }}>
            <Typography sx={{ color: '#ccc', mb: 1 }}>Você foi indicado por</Typography>
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>{agent.name}</Typography>
            <Chip label={`Código: ${ref}`} sx={{ mt: 1, bgcolor: '#FFD700', color: '#000', fontWeight: 700, fontFamily: 'monospace' }} />
          </Box>
        )}

        {ref && !loading && !agent && (
          <Box sx={{ bgcolor: '#2a2a2a', borderRadius: 3, p: 3, mb: 3 }}>
            <Typography sx={{ color: '#999' }}>Código de indicação: <b style={{ color: '#fff', fontFamily: 'monospace' }}>{ref}</b></Typography>
            <Typography variant="caption" sx={{ color: '#666' }}>Use este código ao se cadastrar no app</Typography>
          </Box>
        )}

        <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, mb: 2 }}>Seja motorista KAVIAR</Typography>
        <Typography sx={{ color: '#aaa', mb: 3, lineHeight: 1.6 }}>
          Baixe o app na Google Play, faça seu cadastro{ref ? ` e use o código ${ref}` : ''} para começar a dirigir na sua região.
        </Typography>

        <Button
          variant="contained"
          size="large"
          href="https://play.google.com/store/apps/details?id=com.kaviar.driver"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ bgcolor: '#FFD700', color: '#000', fontWeight: 800, px: 5, py: 1.5, borderRadius: 3, fontSize: 16 }}
        >
          Baixar Motorista na Google Play
        </Button>

        {ref && (
          <Typography variant="caption" sx={{ display: 'block', color: '#666', mt: 3 }}>
            Ao se cadastrar, informe o código <b style={{ color: '#FFD700' }}>{ref}</b> no campo "Código de indicação"
          </Typography>
        )}
      </Container>
    </Box>
  );
}
