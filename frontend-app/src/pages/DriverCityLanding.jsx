import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Box, Container, Typography, TextField, Button, RadioGroup,
  FormControlLabel, Radio, FormControl, FormLabel, Alert,
  CircularProgress
} from '@mui/material';
import { API_BASE_URL } from '../config/api';

const GOLD = '#B8942E';
const GOLD_LIGHT = '#D4AF37';
const DARK_BG = '#050508';
const CARD_BG = 'rgba(18,18,24,0.85)';
const CARD_BORDER = 'rgba(184,148,46,0.15)';
const ACCENT_BLUE = 'rgba(30,60,140,0.12)';
const WHATSAPP_FALLBACK = '5521968648777';

const STATUS_MESSAGES = {
  IMPLANTACAO: 'Cidade em implantação — formação da primeira equipe.',
  RECRUTAMENTO: 'Estamos formando nossa equipe local de motoristas.',
  OPERACAO: 'Cadastre seu interesse para dirigir com a KAVIAR nesta cidade.',
  PAUSADA: 'Em breve, mais informações sobre esta cidade.',
};

const STATUS_HEADLINES = {
  IMPLANTACAO: 'Motoristas Fundadores KAVIAR',
  RECRUTAMENTO: 'Motoristas Fundadores KAVIAR',
  OPERACAO: 'Seja motorista parceiro KAVIAR',
  PAUSADA: null, // will use city name dynamically
};

const STATUS_SUBHEADLINES = {
  IMPLANTACAO: (city) => `Faça parte da primeira equipe de motoristas parceiros KAVIAR em ${city}.`,
  RECRUTAMENTO: (city) => `Estamos formando a equipe de motoristas parceiros KAVIAR em ${city}.`,
  OPERACAO: (city) => `Cadastre seu interesse para dirigir com a KAVIAR em ${city}.`,
  PAUSADA: (city) => `Acompanhe as novidades da KAVIAR em ${city}.`,
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'rgba(255,255,255,0.03)',
    color: '#fff',
    borderRadius: 2,
    '& fieldset': { borderColor: 'rgba(184,148,46,0.2)' },
    '&:hover fieldset': { borderColor: 'rgba(184,148,46,0.4)' },
    '&.Mui-focused fieldset': { borderColor: GOLD },
  },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
  '& .MuiInputLabel-root.Mui-focused': { color: GOLD },
};

export default function DriverCityLanding() {
  const { citySlug } = useParams();
  const [searchParams] = useSearchParams();

  const [pageState, setPageState] = useState('LOADING');
  const [city, setCity] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', modality: 'CAR', ear: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const fetchCity = useCallback(async () => {
    setPageState('LOADING');
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/driver-city-landings/${encodeURIComponent(citySlug)}`);
      if (res.status === 404) { setPageState('CITY_NOT_FOUND'); return; }
      if (!res.ok) { setPageState('NETWORK_ERROR'); return; }
      const json = await res.json();
      if (json.success && json.data) { setCity(json.data); setPageState('SUCCESS'); }
      else setPageState('CITY_NOT_FOUND');
    } catch { setPageState('NETWORK_ERROR'); }
  }, [citySlug]);

  useEffect(() => { fetchCity(); }, [fetchCity]);

  useEffect(() => {
    if (city) {
      document.title = `Motorista KAVIAR em ${city.city}/${city.state}`;
      const meta = document.querySelector('meta[name="description"]');
      const descByStatus = {
        IMPLANTACAO: `Seja um dos primeiros motoristas parceiros KAVIAR em ${city.city}/${city.state}. Pré-cadastre-se para a formação da primeira equipe.`,
        RECRUTAMENTO: `Estamos formando a equipe de motoristas KAVIAR em ${city.city}/${city.state}. Pré-cadastre-se agora.`,
        OPERACAO: `Cadastre seu interesse para dirigir com a KAVIAR em ${city.city}/${city.state}.`,
        PAUSADA: `KAVIAR em ${city.city}/${city.state}. Acompanhe as novidades.`,
      };
      const desc = descByStatus[city.public_status] || descByStatus.IMPLANTACAO;
      if (meta) meta.setAttribute('content', desc);
      else { const tag = document.createElement('meta'); tag.name = 'description'; tag.content = desc; document.head.appendChild(tag); }
    }
    return () => { document.title = 'KAVIAR'; };
  }, [city]);

  const whatsappNumber = city?.whatsapp_number || WHATSAPP_FALLBACK;
  const whatsappMsg = city ? `Olá, tenho interesse em ser motorista parceiro KAVIAR em ${city.city}/${city.state}.` : '';
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMsg)}`;

  // --- LOADING ---
  if (pageState === 'LOADING') {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ color: GOLD, fontWeight: 900, letterSpacing: 6, fontSize: '2rem', mb: 3 }}>KAVIAR</Typography>
          <CircularProgress sx={{ color: GOLD }} size={32} />
        </Box>
      </Box>
    );
  }

  // --- NETWORK ERROR ---
  if (pageState === 'NETWORK_ERROR') {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: GOLD, fontWeight: 900, letterSpacing: 6, fontSize: '2rem', mb: 3 }}>KAVIAR</Typography>
          <Typography sx={{ color: '#ddd', fontSize: 17, mb: 1 }}>Não foi possível carregar esta página.</Typography>
          <Typography sx={{ color: '#888', fontSize: 14, mb: 4 }}>Verifique sua conexão e tente novamente.</Typography>
          <Button variant="outlined" sx={{ borderColor: GOLD, color: GOLD, fontWeight: 600, px: 4, borderRadius: 2 }} onClick={fetchCity}>
            Tentar novamente
          </Button>
        </Container>
      </Box>
    );
  }

  // --- CITY NOT FOUND ---
  if (pageState === 'CITY_NOT_FOUND') {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: GOLD, fontWeight: 900, letterSpacing: 6, fontSize: '2rem', mb: 3 }}>KAVIAR</Typography>
          <Typography sx={{ color: '#ddd', fontSize: 17, mb: 1 }}>Cidade não encontrada.</Typography>
          <Typography sx={{ color: '#888', fontSize: 14, mb: 4 }}>Verifique o link ou entre em contato pelo WhatsApp.</Typography>
          <Button
            variant="outlined"
            sx={{ borderColor: '#25D366', color: '#25D366', fontWeight: 600, px: 4, borderRadius: 2, '&:hover': { bgcolor: 'rgba(37,211,102,0.06)' } }}
            onClick={() => window.open(`https://wa.me/${WHATSAPP_FALLBACK}?text=${encodeURIComponent('Olá, tentei acessar uma página de motorista KAVIAR mas a cidade não foi encontrada.')}`, '_blank')}
          >
            Falar pelo WhatsApp
          </Button>
        </Container>
      </Box>
    );
  }

  // --- FORM SUBMIT ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    if (!form.phone.trim() || form.phone.replace(/\D/g, '').length < 10) { setError('WhatsApp válido é obrigatório'); return; }
    if (!form.ear) { setError('Informe se possui EAR'); return; }
    setSubmitting(true); setError('');
    try {
      const payload = {
        name: form.name.trim(), phone: form.phone.trim(),
        email: form.email.trim() || undefined, city_slug: citySlug,
        modality: form.modality, ear: form.ear,
        utm_source: searchParams.get('utm_source') || undefined,
        utm_medium: searchParams.get('utm_medium') || undefined,
        utm_campaign: searchParams.get('utm_campaign') || undefined,
      };
      const res = await fetch(`${API_BASE_URL}/api/public/city-lead`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) setSubmitted(true);
      else setError(data.error || 'Erro ao enviar pré-cadastro');
    } catch { setError('Erro de conexão. Tente novamente.'); }
    setSubmitting(false);
  };

  const statusMsg = STATUS_MESSAGES[city.public_status] || STATUS_MESSAGES.IMPLANTACAO;

  // --- SUBMITTED SUCCESS ---
  if (submitted) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: GOLD, fontWeight: 900, letterSpacing: 6, fontSize: '2rem', mb: 4 }}>KAVIAR</Typography>
          <Box sx={{ bgcolor: CARD_BG, borderRadius: 4, p: 4, border: `1px solid ${CARD_BORDER}`, backdropFilter: 'blur(12px)' }}>
            <Typography sx={{ color: '#4caf50', fontSize: 28, mb: 1 }}>✓</Typography>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 20, mb: 1 }}>Pré-cadastro recebido!</Typography>
            <Typography sx={{ color: '#bbb', fontSize: 15, mb: 1 }}>
              Você entrou na lista de interessados em dirigir com a KAVIAR em <strong style={{ color: GOLD }}>{city.city}</strong>.
            </Typography>
            <Typography sx={{ color: '#888', fontSize: 14, mb: 3 }}>Nossa equipe entrará em contato.</Typography>
            <Button
              variant="contained"
              fullWidth
              sx={{ bgcolor: '#25D366', color: '#fff', fontWeight: 700, py: 1.5, borderRadius: 2, fontSize: 15, '&:hover': { bgcolor: '#1da851' } }}
              onClick={() => window.open(whatsappUrl, '_blank')}
            >
              Falar com a KAVIAR pelo WhatsApp
            </Button>
          </Box>
        </Container>
      </Box>
    );
  }

  // --- MAIN LANDING ---
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG, overflow: 'hidden' }}>

      {/* === HERO === */}
      <Box sx={{
        position: 'relative',
        pt: { xs: 7, md: 10 }, pb: { xs: 6, md: 8 },
        textAlign: 'center', px: 2,
        background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(184,148,46,0.06) 0%, transparent 60%),
                     radial-gradient(ellipse 60% 40% at 20% 80%, ${ACCENT_BLUE} 0%, transparent 50%),
                     ${DARK_BG}`,
      }}>
        {/* Decorative lines */}
        <Box sx={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.04, pointerEvents: 'none',
          backgroundImage: `repeating-linear-gradient(90deg, ${GOLD} 0px, ${GOLD} 1px, transparent 1px, transparent 80px),
                            repeating-linear-gradient(0deg, ${GOLD} 0px, ${GOLD} 1px, transparent 1px, transparent 80px)`,
        }} />

        <Typography sx={{ color: GOLD, fontWeight: 900, letterSpacing: 8, fontSize: { xs: '2.2rem', md: '3rem' }, mb: 0.5, position: 'relative' }}>
          KAVIAR
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: { xs: 13, md: 15 }, letterSpacing: 2, textTransform: 'uppercase', mb: 3 }}>
          {city.city}/{city.state}
        </Typography>

        <Typography variant="h4" sx={{
          color: '#fff', fontWeight: 800, mb: 1.5,
          fontSize: { xs: '1.5rem', md: '2rem' },
          lineHeight: 1.2,
        }}>
          {STATUS_HEADLINES[city.public_status] || `KAVIAR em ${city.city}`}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: { xs: 15, md: 17 }, maxWidth: 520, mx: 'auto', mb: 1.5, lineHeight: 1.5 }}>
          {(STATUS_SUBHEADLINES[city.public_status] || STATUS_SUBHEADLINES.PAUSADA)(city.city)}
        </Typography>
        <Typography sx={{ color: 'rgba(184,148,46,0.7)', fontSize: 13, letterSpacing: 0.5, mb: 4 }}>
          {statusMsg}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, justifyContent: 'center', alignItems: 'center' }}>
          <Button
            variant="contained"
            sx={{
              bgcolor: GOLD, color: '#000', fontWeight: 700, px: 4, py: 1.5, fontSize: 15, borderRadius: 2,
              boxShadow: '0 4px 24px rgba(184,148,46,0.3)',
              '&:hover': { bgcolor: GOLD_LIGHT, boxShadow: '0 6px 32px rgba(184,148,46,0.4)' },
            }}
            onClick={() => document.getElementById('form-section')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Quero ser motorista KAVIAR
          </Button>
          <Button
            variant="outlined"
            sx={{
              borderColor: 'rgba(37,211,102,0.5)', color: '#25D366', fontWeight: 600, px: 3, py: 1.3, borderRadius: 2,
              '&:hover': { bgcolor: 'rgba(37,211,102,0.06)', borderColor: '#25D366' },
            }}
            onClick={() => window.open(whatsappUrl, '_blank')}
          >
            Falar pelo WhatsApp
          </Button>
        </Box>
      </Box>

      {/* === TRUST BAND === */}
      <Box sx={{
        py: { xs: 4, md: 5 }, px: 2,
        background: 'linear-gradient(180deg, rgba(184,148,46,0.04) 0%, transparent 100%)',
        borderTop: '1px solid rgba(184,148,46,0.08)',
        borderBottom: '1px solid rgba(184,148,46,0.08)',
      }}>
        <Container maxWidth="sm">
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: { xs: 12, md: 13 }, textAlign: 'center', letterSpacing: 1.5, textTransform: 'uppercase', mb: 3 }}>
            Mobilidade local · Tecnologia brasileira · Operação preparada cidade por cidade
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            {[
              { icon: '🛡️', label: 'Segurança' },
              { icon: '📍', label: 'Suporte local' },
              { icon: '✓', label: 'Conformidade' },
            ].map((item, i) => (
              <Box key={i} sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography sx={{ fontSize: 22, mb: 0.5 }}>{item.icon}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600 }}>{item.label}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* === POR QUE DIRIGIR COM A KAVIAR === */}
      <Box sx={{ py: { xs: 6, md: 8 }, px: 2 }}>
        <Container maxWidth="sm">
          <Typography sx={{ color: GOLD, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', mb: 1 }}>
            Vantagens
          </Typography>
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.7rem' }, textAlign: 'center', mb: 4 }}>
            Por que dirigir com a KAVIAR
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
            {[
              { icon: '⏰', title: 'Flexibilidade', desc: 'Defina seus horários e sua disponibilidade.' },
              { icon: '📍', title: 'Suporte local', desc: 'Equipe de apoio na sua cidade.' },
              { icon: '⭐', title: city.public_status === 'OPERACAO' ? 'Equipe local' : 'Prioridade', desc: city.public_status === 'OPERACAO' ? 'Faça parte da rede de motoristas parceiros KAVIAR na cidade.' : city.public_status === 'PAUSADA' ? 'Cadastre seu interesse para acompanhar novidades.' : 'Motoristas fundadores têm prioridade na formação da equipe local.' },
              { icon: '📋', title: 'Acompanhamento', desc: 'Suporte completo no processo de cadastro e documentação.' },
            ].map((b, i) => (
              <Box key={i} sx={{
                bgcolor: CARD_BG, borderRadius: 3, p: 2.5,
                border: `1px solid ${CARD_BORDER}`,
                backdropFilter: 'blur(8px)',
                transition: 'border-color 0.2s',
                '&:hover': { borderColor: 'rgba(184,148,46,0.35)' },
              }}>
                <Typography sx={{ fontSize: 24, mb: 1 }}>{b.icon}</Typography>
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 15, mb: 0.5 }}>{b.title}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.5 }}>{b.desc}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* === PROTEÇÃO KAVIAR === */}
      <Box sx={{
        py: { xs: 6, md: 8 }, px: 2,
        background: `linear-gradient(180deg, transparent 0%, rgba(30,60,140,0.04) 50%, transparent 100%)`,
      }}>
        <Container maxWidth="sm">
          <Typography sx={{ color: GOLD, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', mb: 1 }}>
            Segurança
          </Typography>
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.7rem' }, textAlign: 'center', mb: 3 }}>
            Proteção KAVIAR
          </Typography>

          <Box sx={{
            bgcolor: CARD_BG, borderRadius: 4, p: { xs: 3, md: 4 },
            border: `1px solid ${CARD_BORDER}`, backdropFilter: 'blur(8px)',
          }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 1.8, mb: 2.5 }}>
              A KAVIAR prepara cada nova cidade com foco em segurança, conformidade e proteção de motoristas e passageiros.
              Antes da ativação das viagens, são concluídas as exigências locais aplicáveis, incluindo documentação e coberturas de seguro previstas para a operação.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[
                'Estrutura de proteção para motorista e passageiros',
                'Conformidade com exigências locais',
                'Acompanhamento documental completo',
                'Recursos de segurança da plataforma',
                'Suporte KAVIAR dedicado',
              ].map((item, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ minWidth: 6, height: 6, borderRadius: '50%', bgcolor: GOLD, opacity: 0.7 }} />
                  <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>{item}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Container>
      </Box>

      {/* === COMO FUNCIONA — TIMELINE === */}
      <Box sx={{ py: { xs: 6, md: 8 }, px: 2 }}>
        <Container maxWidth="sm">
          <Typography sx={{ color: GOLD, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', mb: 1 }}>
            Processo
          </Typography>
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.7rem' }, textAlign: 'center', mb: 4 }}>
            Como funciona
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0, pl: { xs: 1, sm: 2 } }}>
            {[
              { step: '01', title: 'Pré-cadastro', desc: 'Preencha o formulário abaixo com seus dados.' },
              { step: '02', title: 'Contato da equipe', desc: 'Nossa equipe entra em contato para orientação.' },
              { step: '03', title: 'Documentação', desc: 'Complete a documentação exigida para sua cidade.' },
              { step: '04', title: city.public_status === 'OPERACAO' ? 'Integração à operação' : 'Preparação para ativação', desc: city.public_status === 'OPERACAO' ? 'Após a análise e aprovação, você recebe as orientações para começar na plataforma.' : city.public_status === 'PAUSADA' ? 'Acompanhe as novidades sobre a operação na sua cidade.' : 'Acompanhe a ativação da operação na sua cidade.' },
            ].map((s, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 2.5, position: 'relative', pb: i < 3 ? 3 : 0 }}>
                {/* Vertical line */}
                {i < 3 && (
                  <Box sx={{ position: 'absolute', left: 15, top: 36, bottom: 0, width: 1, bgcolor: 'rgba(184,148,46,0.15)' }} />
                )}
                {/* Step number */}
                <Box sx={{
                  minWidth: 32, height: 32, borderRadius: '50%',
                  border: `1.5px solid ${GOLD}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: 'rgba(184,148,46,0.06)', position: 'relative', zIndex: 1,
                }}>
                  <Typography sx={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>{s.step}</Typography>
                </Box>
                {/* Content */}
                <Box sx={{ pt: 0.3 }}>
                  <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 15, mb: 0.3 }}>{s.title}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.5 }}>{s.desc}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* === FORMULÁRIO === */}
      <Box id="form-section" sx={{
        py: { xs: 6, md: 8 }, px: 2,
        background: `radial-gradient(ellipse 70% 40% at 50% 100%, rgba(184,148,46,0.05) 0%, transparent 60%)`,
      }}>
        <Container maxWidth="sm">
          <Box sx={{
            bgcolor: CARD_BG, borderRadius: 4, p: { xs: 3, md: 4 },
            border: `1px solid rgba(184,148,46,0.2)`,
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 48px rgba(0,0,0,0.4)',
          }}>
            <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: { xs: '1.3rem', md: '1.5rem' }, mb: 0.5 }}>
              Pré-cadastro de motorista
            </Typography>
            <Typography sx={{ color: 'rgba(184,148,46,0.7)', fontSize: 13, mb: 3 }}>
              {city.city}/{city.state} — {statusMsg.toLowerCase()}
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <TextField label="Nome completo *" size="small" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} sx={inputSx} />
              <TextField label="WhatsApp *" size="small" placeholder="(19) 99999-9999" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} sx={inputSx} />
              <TextField label="Email (opcional)" size="small" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} sx={inputSx} />

              <FormControl>
                <FormLabel sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, mb: 0.5 }}>Modalidade</FormLabel>
                <RadioGroup row value={form.modality} onChange={e => setForm(f => ({ ...f, modality: e.target.value }))}>
                  <FormControlLabel value="CAR" control={<Radio size="small" sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: GOLD } }} />} label={<Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>🚗 Carro</Typography>} />
                  <FormControlLabel value="MOTO" control={<Radio size="small" sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: GOLD } }} />} label={<Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>🏍️ Moto</Typography>} />
                </RadioGroup>
              </FormControl>

              <FormControl>
                <FormLabel sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, mb: 0.5 }}>Possui EAR (Exercício de Atividade Remunerada)?</FormLabel>
                <RadioGroup row value={form.ear} onChange={e => setForm(f => ({ ...f, ear: e.target.value }))}>
                  <FormControlLabel value="YES" control={<Radio size="small" sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: GOLD } }} />} label={<Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Sim</Typography>} />
                  <FormControlLabel value="NO" control={<Radio size="small" sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: GOLD } }} />} label={<Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Não</Typography>} />
                </RadioGroup>
              </FormControl>

              <Button
                type="submit" variant="contained" disabled={submitting} fullWidth
                sx={{
                  bgcolor: GOLD, color: '#000', fontWeight: 700, py: 1.5, fontSize: 16, borderRadius: 2,
                  boxShadow: '0 4px 24px rgba(184,148,46,0.3)',
                  '&:hover': { bgcolor: GOLD_LIGHT, boxShadow: '0 6px 32px rgba(184,148,46,0.4)' },
                  '&.Mui-disabled': { bgcolor: 'rgba(184,148,46,0.3)', color: 'rgba(0,0,0,0.5)' },
                }}
              >
                {submitting ? <CircularProgress size={22} sx={{ color: '#000' }} /> : 'Enviar pré-cadastro'}
              </Button>
            </form>

            <Typography sx={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, mt: 2.5, textAlign: 'center', lineHeight: 1.6 }}>
              Pré-cadastro sujeito à análise documental e exigências locais.
            </Typography>
          </Box>
        </Container>
      </Box>

      {/* === FOOTER === */}
      <Box sx={{ py: 4, px: 2, borderTop: '1px solid rgba(184,148,46,0.06)' }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, textAlign: 'center', letterSpacing: 0.5 }}>
          KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA — CNPJ 67.783.601/0001-99
        </Typography>
      </Box>

    </Box>
  );
}
