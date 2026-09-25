import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  BusinessCenterOutlined,
  CheckCircleOutline,
  LocationOnOutlined,
  PeopleAltOutlined,
  ShieldOutlined,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const gold = '#D4AF37';
const goldSoft = '#F5D980';
const pageBg = '#070B10';
const muted = 'rgba(255,255,255,0.68)';

const STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
  'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

export default function ManagerLeadPage() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', city: '', state: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const utm = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
    };
  }, []);

  const set = (key) => (event) => {
    const value = key === 'state' ? event.target.value.toUpperCase() : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const phoneDigits = form.phone.replace(/\D/g, '');
    if (form.name.trim().length < 2) return setError('Informe seu nome completo.');
    if (phoneDigits.length < 10) return setError('Informe um WhatsApp válido com DDD.');
    if (form.city.trim().length < 2) return setError('Informe sua cidade.');
    if (!/^[A-Z]{2}$/.test(form.state)) return setError('Selecione a UF.');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setError('Informe um e-mail válido.');
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/public/manager-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ...utm }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível enviar o cadastro.');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o cadastro.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: pageBg, color: '#fff', display: 'grid', placeItems: 'center', px: 2 }}>
        <Container maxWidth="sm">
          <Box sx={cardSx}>
            <CheckCircleOutline sx={{ color: gold, fontSize: 54, mb: 1.5 }} />
            <Typography sx={{ color: goldSoft, fontWeight: 800, fontSize: 25, mb: 1 }}>
              Cadastro recebido
            </Typography>
            <Typography sx={{ color: muted, lineHeight: 1.7, mb: 2.5 }}>
              Seu interesse em atuar como Gestor Territorial KAVIAR foi registrado. Nossa equipe analisará as informações e poderá entrar em contato pelo WhatsApp ou e-mail informado.
            </Typography>
            <Button href="/" sx={buttonGold}>Voltar para a KAVIAR</Button>
          </Box>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageBg, color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 15% 5%, rgba(212,175,55,0.18), transparent 34%), radial-gradient(circle at 90% 20%, rgba(37,99,235,0.14), transparent 30%)' }} />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, py: { xs: 3, md: 6 } }}>
        <Box component="a" href="/" sx={{ textDecoration: 'none' }}>
          <Typography sx={{ color: goldSoft, fontWeight: 800, letterSpacing: '0.14em', fontSize: 24, mb: { xs: 3, md: 5 } }}>
            KAVIAR
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' }, gap: { xs: 3, md: 5 }, alignItems: 'start' }}>
          <Box>
            <Typography sx={{ color: goldSoft, fontWeight: 700, letterSpacing: '0.1em', fontSize: 12, textTransform: 'uppercase', mb: 1 }}>
              Gestor Territorial
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: '2rem', md: '3.2rem' }, lineHeight: 1.05, mb: 1.5 }}>
              Ajude a desenvolver o KAVIAR na sua região.
            </Typography>
            <Typography sx={{ color: muted, fontSize: { xs: 15, md: 17 }, lineHeight: 1.75, mb: 3 }}>
              Cadastre seu interesse para participar do processo de seleção de gestores territoriais. A função envolve desenvolvimento local, relacionamento com motoristas, passageiros, comércios e apoio à implantação da operação.
            </Typography>

            <Stack spacing={1.4}>
              {[
                [LocationOnOutlined, 'Atuação territorial', 'Apoie a presença da KAVIAR na cidade ou região atribuída.'],
                [PeopleAltOutlined, 'Construção da rede local', 'Ajude na captação e relacionamento com motoristas, passageiros e parceiros.'],
                [BusinessCenterOutlined, 'Gestão com tecnologia', 'Após aprovação e formalização, utilize as ferramentas territoriais da KAVIAR.'],
                [ShieldOutlined, 'Processo formal', 'Cadastro de interesse, análise, documentação e formalização antes da atuação.'],
              ].map(([Icon, title, text]) => (
                <Box key={title} sx={{ display: 'grid', gridTemplateColumns: '42px 1fr', gap: 1.2, alignItems: 'start' }}>
                  <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.18)' }}>
                    <Icon sx={{ color: gold, fontSize: 21 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{title}</Typography>
                    <Typography sx={{ color: muted, fontSize: 13, lineHeight: 1.55 }}>{text}</Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>

          <Box sx={cardSx}>
            <Typography sx={{ fontWeight: 800, fontSize: 22, mb: 0.6 }}>Quero ser Gestor KAVIAR</Typography>
            <Typography sx={{ color: muted, fontSize: 13.5, lineHeight: 1.6, mb: 2.5 }}>
              Preencha os dados abaixo. Este é um cadastro de interesse para análise da KAVIAR.
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={1.8}>
                <TextField required label="Nome completo" value={form.name} onChange={set('name')} inputProps={{ maxLength: 120 }} sx={inputSx} />
                <TextField required label="WhatsApp" placeholder="(21) 99999-9999" value={form.phone} onChange={set('phone')} inputProps={{ maxLength: 24 }} sx={inputSx} />
                <TextField label="E-mail" type="email" value={form.email} onChange={set('email')} inputProps={{ maxLength: 254 }} sx={inputSx} />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 120px' }, gap: 1.5 }}>
                  <TextField required label="Cidade de interesse" value={form.city} onChange={set('city')} inputProps={{ maxLength: 120 }} sx={inputSx} />
                  <TextField required select label="UF" value={form.state} onChange={set('state')} sx={inputSx}>
                    {STATES.map((uf) => <MenuItem key={uf} value={uf}>{uf}</MenuItem>)}
                  </TextField>
                </Box>
                <TextField
                  label="Conte um pouco sobre seu interesse (opcional)"
                  value={form.message}
                  onChange={set('message')}
                  multiline
                  minRows={4}
                  inputProps={{ maxLength: 700 }}
                  sx={inputSx}
                />
                <Button type="submit" disabled={submitting} fullWidth sx={{ ...buttonGold, py: 1.35 }}>
                  {submitting ? <CircularProgress size={22} sx={{ color: '#070B10' }} /> : 'Enviar cadastro de interesse'}
                </Button>
              </Stack>
            </Box>

            <Typography sx={{ color: 'rgba(255,255,255,0.42)', fontSize: 11.5, lineHeight: 1.55, mt: 2 }}>
              O envio não garante seleção, exclusividade, atribuição de território, vínculo de emprego ou ativação financeira. A eventual atuação depende de análise, aprovação e formalização pela KAVIAR.
            </Typography>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

const cardSx = {
  borderRadius: 3,
  border: '1px solid rgba(212,175,55,0.20)',
  bgcolor: 'rgba(255,255,255,0.055)',
  backdropFilter: 'blur(12px)',
  p: { xs: 2.4, md: 3.5 },
  boxShadow: '0 22px 70px rgba(0,0,0,0.34)',
};

const inputSx = {
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.58)' },
  '& .MuiInputLabel-root.Mui-focused': { color: goldSoft },
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    bgcolor: 'rgba(255,255,255,0.035)',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.14)' },
    '&:hover fieldset': { borderColor: 'rgba(212,175,55,0.40)' },
    '&.Mui-focused fieldset': { borderColor: gold },
  },
  '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.65)' },
};

const buttonGold = {
  background: 'linear-gradient(180deg, #F8E6A0 0%, #D4AF37 45%, #A87917 100%)',
  color: '#070B10',
  borderRadius: 999,
  px: 2.3,
  py: 1.05,
  textTransform: 'none',
  fontWeight: 800,
  boxShadow: '0 14px 34px rgba(212,175,55,0.25)',
  '&:hover': {
    background: 'linear-gradient(180deg, #FAEBB6 0%, #DDB94A 45%, #B58318 100%)',
  },
};
