import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Box, Container, Typography, TextField, Button, RadioGroup,
  FormControlLabel, Radio, FormControl, FormLabel, Alert,
  CircularProgress, Stack, Accordion, AccordionSummary, AccordionDetails,
  useMediaQuery
} from '@mui/material';
import {
  Shield, SupportAgent, Schedule, Description, PersonAdd,
  CheckCircle, ContactPhone, FolderOpen, RocketLaunch,
  DirectionsCar, TwoWheeler, Security, Verified, WhatsApp,
  ExpandMore, LocationOn, Speed, Groups
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ─── Design Tokens (matching KaviarLanding official) ───
const gold = '#D4AF37';
const goldSoft = '#F5D980';
const textPrimary = '#FFFFFF';
const textSecondary = 'rgba(255,255,255,0.74)';
const cardBg = 'rgba(255,255,255,0.04)';
const cardBorder = 'rgba(255,255,255,0.10)';
const pageBg = '#04070C';
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
  PAUSADA: null,
};
const STATUS_SUBHEADLINES = {
  IMPLANTACAO: (city) => `Faça parte da primeira equipe de motoristas parceiros KAVIAR em ${city}.`,
  RECRUTAMENTO: (city) => `Estamos formando a equipe de motoristas parceiros KAVIAR em ${city}.`,
  OPERACAO: (city) => `Cadastre seu interesse para dirigir com a KAVIAR em ${city}.`,
  PAUSADA: (city) => `Acompanhe as novidades da KAVIAR em ${city}.`,
};
const STATUS_BADGES = {
  IMPLANTACAO: 'IMPLANTAÇÃO',
  RECRUTAMENTO: 'RECRUTAMENTO ABERTO',
  OPERACAO: 'OPERAÇÃO',
  PAUSADA: 'PAUSADA',
};

// ─── Reusable Button Styles (from official landing) ───
const buttonGold = {
  background: 'linear-gradient(180deg, #E8D48A 0%, #C9A227 50%, #9A7B1A 100%)',
  color: '#070B10', borderRadius: 999, px: 2.8, py: 1.2,
  textTransform: 'none', fontWeight: 700, fontSize: 15,
  border: '1px solid rgba(201,162,39,0.4)',
  boxShadow: '0 8px 24px rgba(162,123,26,0.2)',
  transition: 'all 0.2s ease',
  '&:hover': { background: 'linear-gradient(180deg, #F0DFA0 0%, #D4AF37 50%, #A87917 100%)', transform: 'translateY(-1px)', boxShadow: '0 10px 28px rgba(162,123,26,0.28)' },
};
const buttonOutline = {
  border: '1px solid rgba(245,217,128,0.5)', color: goldSoft,
  borderRadius: 999, px: 2.2, py: 1.05, textTransform: 'none', fontWeight: 700,
  background: 'rgba(212,175,55,0.06)', fontSize: 15,
  transition: 'all 0.2s ease',
  '&:hover': { background: 'rgba(212,175,55,0.12)', transform: 'translateY(-1px)' },
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'rgba(255,255,255,0.03)', color: '#fff', borderRadius: 2,
    '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
    '&:hover fieldset': { borderColor: 'rgba(212,175,55,0.35)' },
    '&.Mui-focused fieldset': { borderColor: gold },
  },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.45)' },
  '& .MuiInputLabel-root.Mui-focused': { color: gold },
};

const glassCard = {
  borderRadius: 3, border: `1px solid ${cardBorder}`, p: 2.5,
  background: cardBg, backdropFilter: 'blur(6px)',
  transition: 'all 0.25s ease',
  '@media (hover: hover)': { '&:hover': { borderColor: 'rgba(212,175,55,0.25)', transform: 'translateY(-2px)', boxShadow: '0 12px 32px rgba(0,0,0,0.3)' } },
};

export default function DriverCityLanding() {
  const { citySlug } = useParams();
  const [searchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width:899px)');
  const formRef = useRef(null);
  const heroRef = useRef(null);
  const [formVisible, setFormVisible] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);

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
    const observers = [];
    if (formRef.current) {
      const fo = new IntersectionObserver(([e]) => setFormVisible(e.isIntersecting), { threshold: 0.15 });
      fo.observe(formRef.current); observers.push(fo);
    }
    if (heroRef.current) {
      const ho = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0.3 });
      ho.observe(heroRef.current); observers.push(ho);
    }
    return () => observers.forEach(o => o.disconnect());
  }, [pageState]);

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
  const showWhatsApp = !!whatsappNumber;

  // ─── LOADING ───
  if (pageState === 'LOADING') return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ textAlign: 'center' }}>
        <Box component="img" src="/kaviar-logo-oficial.png" alt="KAVIAR" sx={{ height: 48, mb: 3, opacity: 0.9 }} />
        <CircularProgress sx={{ color: gold }} size={28} thickness={2} />
      </Box>
    </Box>
  );

  // ─── NETWORK ERROR ───
  if (pageState === 'NETWORK_ERROR') return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Box sx={{ textAlign: 'center', maxWidth: 400 }}>
        <Box component="img" src="/kaviar-logo-oficial.png" alt="KAVIAR" sx={{ height: 44, mb: 3, opacity: 0.9 }} />
        <Typography sx={{ color: '#fff', fontSize: 18, fontWeight: 600, mb: 1 }}>Não foi possível carregar esta página.</Typography>
        <Typography sx={{ color: textSecondary, fontSize: 14, mb: 3 }}>Verifique sua conexão e tente novamente.</Typography>
        <Button sx={buttonOutline} onClick={fetchCity}>Tentar novamente</Button>
      </Box>
    </Box>
  );

  // ─── CITY NOT FOUND ───
  if (pageState === 'CITY_NOT_FOUND') return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Box sx={{ textAlign: 'center', maxWidth: 400 }}>
        <Box component="img" src="/kaviar-logo-oficial.png" alt="KAVIAR" sx={{ height: 44, mb: 3, opacity: 0.9 }} />
        <Typography sx={{ color: '#fff', fontSize: 18, fontWeight: 600, mb: 1 }}>Cidade não encontrada.</Typography>
        <Typography sx={{ color: textSecondary, fontSize: 14, mb: 3 }}>Verifique o link ou entre em contato pelo WhatsApp.</Typography>
        <Button startIcon={<WhatsApp />} sx={{ ...buttonOutline, borderColor: 'rgba(37,211,102,0.5)', color: '#25D366', background: 'rgba(37,211,102,0.06)' }}
          onClick={() => window.open(`https://wa.me/${WHATSAPP_FALLBACK}?text=${encodeURIComponent('Olá, tentei acessar uma página de motorista KAVIAR mas a cidade não foi encontrada.')}`, '_blank')}>
          Falar pelo WhatsApp
        </Button>
      </Box>
    </Box>
  );

  // ─── FORM SUBMIT ───
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

  // ─── SUBMITTED SUCCESS ───
  if (submitted) return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Container maxWidth="sm" sx={{ textAlign: 'center', py: 8 }}>
        <Box component="img" src="/kaviar-logo-oficial.png" alt="KAVIAR" sx={{ height: 48, mb: 4, opacity: 0.9 }} />
        <Box sx={{ ...glassCard, p: { xs: 3, md: 4 }, borderColor: 'rgba(212,175,55,0.2)' }}>
          <CheckCircle sx={{ color: '#4caf50', fontSize: 44, mb: 1.5 }} />
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 22, mb: 1 }}>Pré-cadastro recebido!</Typography>
          <Typography sx={{ color: textSecondary, fontSize: 15, mb: 3 }}>
            Você entrou na lista de interessados em dirigir com a KAVIAR em <strong style={{ color: goldSoft }}>{city.city}</strong>.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: { xs: 2, sm: 3 }, mb: 3 }}>
            {['Cadastro recebido', 'Análise', 'Contato KAVIAR'].map((step, i) => (
              <Box key={i} sx={{ textAlign: 'center' }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', mx: 'auto', mb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: i === 0 ? 'rgba(76,175,80,0.12)' : 'rgba(255,255,255,0.04)', border: `1.5px solid ${i === 0 ? '#4caf50' : 'rgba(255,255,255,0.1)'}` }}>
                  <Typography sx={{ fontSize: 11, color: i === 0 ? '#4caf50' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{i + 1}</Typography>
                </Box>
                <Typography sx={{ fontSize: 10, color: i === 0 ? '#4caf50' : 'rgba(255,255,255,0.35)', fontWeight: 600, maxWidth: 70 }}>{step}</Typography>
              </Box>
            ))}
          </Box>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, mb: 3 }}>Nossa equipe entrará em contato.</Typography>
          {showWhatsApp && (
            <Button fullWidth startIcon={<WhatsApp />}
              sx={{ bgcolor: '#25D366', color: '#fff', fontWeight: 700, py: 1.4, borderRadius: 2, fontSize: 15, textTransform: 'none', '&:hover': { bgcolor: '#1da851' } }}
              onClick={() => window.open(whatsappUrl, '_blank')}>
              Falar com a KAVIAR pelo WhatsApp
            </Button>
          )}
        </Box>
      </Container>
    </Box>
  );

  // ═══════════════════════════════════════════════════
  // ─── MAIN LANDING ───
  // ═══════════════════════════════════════════════════
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageBg, color: textPrimary, position: 'relative', overflow: 'hidden', pb: isMobile ? 9 : 0 }}>
      {/* Background ambient */}
      <Box sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(circle at 10% 0%, rgba(212,175,55,0.14), transparent 28%), radial-gradient(circle at 84% 10%, rgba(37,99,235,0.12), transparent 30%)' }} />
      <Box sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.08, backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />

      {/* ─── HEADER ─── */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 40, borderBottom: '1px solid rgba(255,255,255,0.06)', bgcolor: 'rgba(4,7,12,0.88)', backdropFilter: 'blur(16px)' }}>
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 2, border: `1px solid rgba(212,175,55,0.3)`, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(10,24,46,0.8))' }}>
              <Typography sx={{ color: goldSoft, fontWeight: 700, fontSize: 18 }}>K</Typography>
            </Box>
            <Typography sx={{ color: goldSoft, fontWeight: 700, letterSpacing: '0.14em', fontSize: 20 }}>KAVIAR</Typography>
          </Box>
          {!isMobile && (
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Typography component="a" href="#beneficios" sx={{ color: textSecondary, textDecoration: 'none', fontSize: 13, '&:hover': { color: '#fff' } }}>Vantagens</Typography>
              <Typography component="a" href="#como-funciona" sx={{ color: textSecondary, textDecoration: 'none', fontSize: 13, '&:hover': { color: '#fff' } }}>Como funciona</Typography>
              <Typography component="a" href="#faq" sx={{ color: textSecondary, textDecoration: 'none', fontSize: 13, '&:hover': { color: '#fff' } }}>FAQ</Typography>
            </Stack>
          )}
          <Button sx={{ ...buttonGold, px: 2, py: 0.8, fontSize: 13 }} onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            Quero dirigir
          </Button>
        </Container>
      </Box>

      {/* ─── HERO ─── */}
      <Box ref={heroRef} sx={{ position: 'relative', zIndex: 1 }}>
        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.1fr' }, gap: { xs: 3, md: 4 }, alignItems: 'center' }}>
            {/* Left text */}
            <Box>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.8, mb: 2, px: 1.5, py: 0.5, borderRadius: 99, border: '1px solid rgba(212,175,55,0.3)', bgcolor: 'rgba(212,175,55,0.06)' }}>
                <LocationOn sx={{ color: gold, fontSize: 14 }} />
                <Typography sx={{ color: goldSoft, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{STATUS_BADGES[city.public_status] || 'KAVIAR'} — {city.city}/{city.state}</Typography>
              </Box>

              <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: { xs: '2rem', md: '2.8rem' }, lineHeight: 1.08, mb: 1.5 }}>
                {STATUS_HEADLINES[city.public_status] || `KAVIAR em ${city.city}`}
              </Typography>
              <Typography sx={{ color: textSecondary, fontSize: { xs: 16, md: 18 }, lineHeight: 1.6, mb: 1, maxWidth: 540 }}>
                {(STATUS_SUBHEADLINES[city.public_status] || STATUS_SUBHEADLINES.PAUSADA)(city.city)}
              </Typography>
              <Typography sx={{ color: 'rgba(212,175,55,0.7)', fontSize: 14, mb: 3 }}>{statusMsg}</Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
                <Button sx={buttonGold} onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}>Quero ser motorista KAVIAR</Button>
                {showWhatsApp && (
                  <Button startIcon={<WhatsApp sx={{ fontSize: 18 }} />}
                    sx={{ ...buttonOutline, borderColor: 'rgba(37,211,102,0.4)', color: '#25D366', background: 'rgba(37,211,102,0.05)', '&:hover': { background: 'rgba(37,211,102,0.1)' } }}
                    onClick={() => window.open(whatsappUrl, '_blank')}>
                    Falar pelo WhatsApp
                  </Button>
                )}
              </Stack>
            </Box>

            {/* Right: hero visual */}
            <Box sx={{ position: 'relative', minHeight: { xs: 280, md: 420 }, borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', backgroundImage: 'url(/turismo-replit/generated_images/professional_chauffeur_service.png)', backgroundSize: 'cover', backgroundPosition: 'center 30%' }}>
              <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(4,7,12,0.75) 5%, rgba(4,7,12,0.35) 45%, rgba(4,7,12,0.7) 100%), radial-gradient(circle at 20% 30%, rgba(212,175,55,0.12), transparent 50%)' }} />
              {/* Floating cards */}
              <Box sx={{ position: 'absolute', top: 16, left: 16, borderRadius: 2, border: '1px solid rgba(255,255,255,0.12)', bgcolor: 'rgba(212,175,55,0.1)', backdropFilter: 'blur(8px)', px: 1.2, py: 0.8 }}>
                <Typography sx={{ color: goldSoft, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>MOTORISTA PARCEIRO</Typography>
              </Box>
              <Box sx={{ position: 'absolute', bottom: 16, left: 16, borderRadius: 2, border: '1px solid rgba(255,255,255,0.12)', bgcolor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)', px: 1.2, py: 0.8, display: 'flex', alignItems: 'center', gap: 0.8 }}>
                <DirectionsCar sx={{ color: goldSoft, fontSize: 16 }} />
                <Typography sx={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>Carro</Typography>
                <TwoWheeler sx={{ color: goldSoft, fontSize: 16, ml: 1 }} />
                <Typography sx={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>Moto</Typography>
              </Box>
              <Box sx={{ position: 'absolute', top: 16, right: 16, borderRadius: 2, border: '1px solid rgba(255,255,255,0.12)', bgcolor: 'rgba(37,99,235,0.12)', backdropFilter: 'blur(8px)', px: 1.2, py: 0.8 }}>
                <Typography sx={{ color: '#8CB8FF', fontSize: 10, fontWeight: 700 }}>{city.city}/{city.state}</Typography>
              </Box>
              {/* Decorative circles */}
              <Box sx={{ position: 'absolute', right: -20, bottom: '30%', width: 120, height: 120, borderRadius: '50%', border: '1px solid rgba(212,175,55,0.15)' }} />
              <Box sx={{ position: 'absolute', left: -15, top: '40%', width: 80, height: 80, borderRadius: '50%', border: '1px solid rgba(37,99,235,0.15)' }} />
            </Box>
          </Box>
        </Container>
      </Box>

      {/* ─── BENEFITS ─── */}
      <Box id="beneficios" sx={{ position: 'relative', zIndex: 1, py: { xs: 6, md: 7 } }}>
        <Container maxWidth="lg">
          <Typography sx={{ color: goldSoft, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', mb: 1 }}>Vantagens</Typography>
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 5 }}>Por que dirigir com a KAVIAR</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
            {[
              { Icon: Schedule, title: 'Flexibilidade', desc: 'Defina seus horários e sua disponibilidade.' },
              { Icon: SupportAgent, title: 'Suporte local', desc: 'Equipe de apoio dedicada na sua cidade.' },
              { Icon: PersonAdd, title: city.public_status === 'OPERACAO' ? 'Equipe local' : 'Prioridade', desc: city.public_status === 'OPERACAO' ? 'Faça parte da rede de motoristas parceiros KAVIAR na cidade.' : city.public_status === 'PAUSADA' ? 'Cadastre seu interesse para acompanhar novidades.' : 'Motoristas fundadores têm prioridade na formação da equipe local.' },
              { Icon: Description, title: 'Acompanhamento', desc: 'Suporte completo no processo de cadastro e documentação.' },
            ].map(({ Icon, title, desc }, i) => (
              <Box key={i} sx={glassCard}>
                <Box sx={{ width: 40, height: 40, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(212,175,55,0.08)', mb: 1.5 }}>
                  <Icon sx={{ color: gold, fontSize: 22 }} />
                </Box>
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 15, mb: 0.5 }}>{title}</Typography>
                <Typography sx={{ color: textSecondary, fontSize: 13, lineHeight: 1.55 }}>{desc}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ─── MODALITIES ─── */}
      <Box sx={{ position: 'relative', zIndex: 1, py: { xs: 5, md: 7 } }}>
        <Container maxWidth="md">
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.3rem', md: '1.7rem' }, textAlign: 'center', mb: 4 }}>Modalidades disponíveis</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
            {[
              { Icon: DirectionsCar, title: 'KAVIAR Carro', desc: 'Transporte de passageiros em veículo de 4 rodas. Conforto e segurança para corridas locais.' },
              { Icon: TwoWheeler, title: 'KAVIAR Moto', desc: 'Deslocamentos rápidos e ágeis pela cidade. Mobilidade urbana com praticidade.' },
            ].map(({ Icon, title, desc }, i) => (
              <Box key={i} sx={{ ...glassCard, p: 3, borderColor: i === 0 ? 'rgba(212,175,55,0.18)' : 'rgba(37,99,235,0.18)' }}>
                <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: i === 0 ? 'rgba(212,175,55,0.1)' : 'rgba(37,99,235,0.1)', mb: 2 }}>
                  <Icon sx={{ color: i === 0 ? gold : '#8CB8FF', fontSize: 26 }} />
                </Box>
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 17, mb: 0.5 }}>{title}</Typography>
                <Typography sx={{ color: textSecondary, fontSize: 14, lineHeight: 1.6 }}>{desc}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ─── HOW IT WORKS ─── */}
      <Box id="como-funciona" sx={{ position: 'relative', zIndex: 1, py: { xs: 6, md: 7 } }}>
        <Container maxWidth="md">
          <Typography sx={{ color: goldSoft, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', mb: 1 }}>Processo</Typography>
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 5 }}>Como funciona</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2.5 }}>
            {[
              { Icon: PersonAdd, title: 'Pré-cadastro', desc: 'Preencha o formulário com seus dados básicos.' },
              { Icon: ContactPhone, title: 'Contato da equipe', desc: 'Nossa equipe entra em contato para orientação.' },
              { Icon: FolderOpen, title: 'Documentação', desc: 'Complete a documentação exigida para sua cidade.' },
              { Icon: RocketLaunch, title: city.public_status === 'OPERACAO' ? 'Integração à operação' : 'Preparação para ativação', desc: city.public_status === 'OPERACAO' ? 'Após a análise e aprovação, você recebe as orientações para começar na plataforma.' : city.public_status === 'PAUSADA' ? 'Acompanhe as novidades sobre a operação na sua cidade.' : 'Acompanhe a ativação da operação na sua cidade.' },
            ].map(({ Icon, title, desc }, i) => (
              <Box key={i} sx={{ textAlign: 'center' }}>
                <Box sx={{ width: 48, height: 48, borderRadius: '50%', mx: 'auto', mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid rgba(212,175,55,0.25)`, bgcolor: 'rgba(212,175,55,0.04)' }}>
                  <Icon sx={{ color: gold, fontSize: 22 }} />
                </Box>
                <Typography sx={{ color: goldSoft, fontSize: 11, fontWeight: 700, mb: 0.5 }}>ETAPA {i + 1}</Typography>
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 14, mb: 0.5 }}>{title}</Typography>
                <Typography sx={{ color: textSecondary, fontSize: 12.5, lineHeight: 1.5 }}>{desc}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ─── PROTECTION ─── */}
      <Box sx={{ position: 'relative', zIndex: 1, py: { xs: 6, md: 7 } }}>
        <Container maxWidth="md">
          <Box sx={{ ...glassCard, p: { xs: 3, md: 4.5 }, borderColor: 'rgba(212,175,55,0.15)', background: 'linear-gradient(165deg, rgba(20,16,8,0.7), rgba(8,10,14,0.85))' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <Security sx={{ color: gold, fontSize: 24 }} />
              </Box>
              <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 18, md: 20 } }}>Proteção KAVIAR</Typography>
            </Box>
            <Typography sx={{ color: textSecondary, fontSize: 14.5, lineHeight: 1.8, mb: 2.5 }}>
              A KAVIAR prepara cada nova cidade com foco em segurança, conformidade e proteção de motoristas e passageiros.
              Antes da ativação das viagens, são concluídas as exigências locais aplicáveis, incluindo documentação e coberturas de seguro previstas para a operação.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.2 }}>
              {[
                { Icon: Shield, text: 'Estrutura de proteção para motorista e passageiros' },
                { Icon: Verified, text: 'Conformidade com exigências locais' },
                { Icon: Description, text: 'Acompanhamento documental completo' },
                { Icon: Security, text: 'Recursos de segurança da plataforma' },
                { Icon: SupportAgent, text: 'Suporte KAVIAR dedicado' },
              ].map(({ Icon, text }, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                  <Icon sx={{ color: gold, fontSize: 16, opacity: 0.7 }} />
                  <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 13.5 }}>{text}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Container>
      </Box>

      {/* ─── LOCAL PRESENCE ─── */}
      <Box sx={{ position: 'relative', zIndex: 1, py: { xs: 5, md: 7 } }}>
        <Container maxWidth="md">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            {[
              { Icon: LocationOn, title: 'Presença local', desc: 'Operação preparada cidade por cidade, com suporte territorial.' },
              { Icon: Speed, title: 'Tecnologia brasileira', desc: 'Plataforma desenvolvida no Brasil, para a realidade brasileira.' },
              { Icon: Groups, title: 'Comunidade', desc: 'Motoristas, passageiros e comércios conectados ao bairro.' },
            ].map(({ Icon, title, desc }, i) => (
              <Box key={i} sx={{ textAlign: 'center', p: 2 }}>
                <Icon sx={{ color: gold, fontSize: 28, mb: 1, opacity: 0.8 }} />
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 14, mb: 0.5 }}>{title}</Typography>
                <Typography sx={{ color: textSecondary, fontSize: 12.5, lineHeight: 1.5 }}>{desc}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ─── FAQ ─── */}
      <Box id="faq" sx={{ position: 'relative', zIndex: 1, py: { xs: 6, md: 7 } }}>
        <Container maxWidth="md">
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.4rem', md: '1.8rem' }, textAlign: 'center', mb: 4 }}>Perguntas frequentes</Typography>
          {[
            { q: 'Preciso pagar para me cadastrar?', a: 'Não. O pré-cadastro é gratuito.' },
            { q: 'Preciso ter EAR para dirigir com a KAVIAR?', a: 'A EAR (Exercício de Atividade Remunerada) é uma exigência legal para transporte remunerado. Se você ainda não possui, nossa equipe pode orientar sobre o processo.' },
            { q: 'A KAVIAR já está operando na minha cidade?', a: statusMsg },
            { q: 'Como funciona o processo de aprovação?', a: 'Após o pré-cadastro, nossa equipe analisa sua documentação conforme as exigências locais. O prazo depende da cidade e da completude dos documentos.' },
            { q: 'Posso dirigir com carro e moto?', a: 'Sim, desde que atenda aos requisitos de cada modalidade. Você pode indicar sua preferência no pré-cadastro.' },
          ].map(({ q, a }, i) => (
            <Accordion key={i} disableGutters elevation={0}
              sx={{ bgcolor: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.06)', '&:before': { display: 'none' }, '& .MuiAccordionSummary-root': { px: 0 } }}>
              <AccordionSummary expandIcon={<ExpandMore sx={{ color: 'rgba(255,255,255,0.4)' }} />}>
                <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: 14.5 }}>{q}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pb: 2 }}>
                <Typography sx={{ color: textSecondary, fontSize: 13.5, lineHeight: 1.6 }}>{a}</Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Container>
      </Box>

      {/* ─── FORM ─── */}
      <Box ref={formRef} id="form-section" sx={{ position: 'relative', zIndex: 1, py: { xs: 6, md: 7 } }}>
        <Container maxWidth="sm">
          <Box sx={{ ...glassCard, p: { xs: 3, md: 4 }, borderColor: 'rgba(212,175,55,0.18)', boxShadow: '0 16px 56px rgba(0,0,0,0.4)' }}>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.3rem', md: '1.5rem' }, mb: 0.5 }}>Pré-cadastro de motorista</Typography>
            <Typography sx={{ color: 'rgba(212,175,55,0.6)', fontSize: 13, mb: 3 }}>{city.city}/{city.state} — {statusMsg.toLowerCase()}</Typography>

            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', mb: 1.5 }}>Seus dados</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
                <TextField label="Nome completo *" size="small" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} sx={inputSx} />
                <TextField label="WhatsApp *" size="small" placeholder="(19) 99999-9999" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} sx={inputSx} />
                <TextField label="Email (opcional)" size="small" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} sx={inputSx} />
              </Box>

              <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', mb: 1.5 }}>Como pretende dirigir</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 3 }}>
                {[
                  { value: 'CAR', Icon: DirectionsCar, label: 'Carro' },
                  { value: 'MOTO', Icon: TwoWheeler, label: 'Moto' },
                ].map(({ value, Icon, label }) => (
                  <Box key={value} onClick={() => setForm(f => ({ ...f, modality: value }))}
                    sx={{ cursor: 'pointer', borderRadius: 2.5, p: 2, textAlign: 'center', border: `1.5px solid ${form.modality === value ? gold : 'rgba(255,255,255,0.08)'}`, bgcolor: form.modality === value ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)', transition: 'all 0.2s ease', '&:hover': { borderColor: form.modality === value ? gold : 'rgba(212,175,55,0.2)' } }}>
                    <Icon sx={{ color: form.modality === value ? gold : 'rgba(255,255,255,0.35)', fontSize: 30, mb: 0.5 }} />
                    <Typography sx={{ color: form.modality === value ? goldSoft : 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600 }}>{label}</Typography>
                  </Box>
                ))}
              </Box>
              <FormControl sx={{ display: 'none' }}>
                <RadioGroup value={form.modality} onChange={e => setForm(f => ({ ...f, modality: e.target.value }))}>
                  <FormControlLabel value="CAR" control={<Radio />} label="Carro" />
                  <FormControlLabel value="MOTO" control={<Radio />} label="Moto" />
                </RadioGroup>
              </FormControl>

              <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', mb: 1.5 }}>Documentação</Typography>
              <FormControl sx={{ mb: 3 }}>
                <FormLabel sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, mb: 1 }}>Possui EAR (Exercício de Atividade Remunerada)?</FormLabel>
                <RadioGroup row value={form.ear} onChange={e => setForm(f => ({ ...f, ear: e.target.value }))}>
                  <FormControlLabel value="YES" control={<Radio size="small" sx={{ color: 'rgba(255,255,255,0.2)', '&.Mui-checked': { color: gold } }} />} label={<Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>Sim</Typography>} />
                  <FormControlLabel value="NO" control={<Radio size="small" sx={{ color: 'rgba(255,255,255,0.2)', '&.Mui-checked': { color: gold } }} />} label={<Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>Não</Typography>} />
                </RadioGroup>
              </FormControl>

              <Button type="submit" variant="contained" disabled={submitting} fullWidth
                sx={{ ...buttonGold, py: 1.5, fontSize: 15, borderRadius: 2 }}>
                {submitting ? <CircularProgress size={22} sx={{ color: '#070B10' }} /> : (city.public_status === 'OPERACAO' ? 'Cadastrar interesse' : 'Entrar para a equipe KAVIAR')}
              </Button>
            </form>
            <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, mt: 2.5, textAlign: 'center' }}>
              Pré-cadastro sujeito à análise documental e exigências locais.
            </Typography>
          </Box>
        </Container>
      </Box>

      {/* ─── FOOTER ─── */}
      <Box sx={{ position: 'relative', zIndex: 1, py: 5, px: 2, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'center', md: 'flex-start' }, justifyContent: 'space-between', gap: 3, textAlign: { xs: 'center', md: 'left' } }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: { xs: 'center', md: 'flex-start' }, mb: 1 }}>
                <Typography sx={{ color: goldSoft, fontWeight: 700, letterSpacing: '0.12em', fontSize: 18 }}>KAVIAR</Typography>
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>Mobilidade local brasileira, feita para sua cidade.</Typography>
            </Box>
            <Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 10.5, lineHeight: 1.6 }}>
                KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA<br />CNPJ 67.783.601/0001-99
              </Typography>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* ─── MOBILE CTA BAR ─── */}
      {isMobile && !formVisible && !heroVisible && !submitted && (
        <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1200, bgcolor: 'rgba(4,7,12,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(212,175,55,0.1)', px: 2, py: 1.5, '@media (prefers-reduced-motion: reduce)': { backdropFilter: 'none' } }}>
          <Button fullWidth sx={{ ...buttonGold, py: 1.2, fontSize: 14 }} onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            Quero ser motorista KAVIAR
          </Button>
        </Box>
      )}

    </Box>
  );
}
