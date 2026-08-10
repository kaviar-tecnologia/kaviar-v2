import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Box, Container, Typography, TextField, Button, RadioGroup, FormControlLabel, Radio,
  FormControl, FormLabel, Alert, CircularProgress, Chip
} from '@mui/material';
import { getCityBySlug } from '../config/driverCities';
import { API_BASE_URL } from '../config/api';

const GOLD = '#B8942E';
const DARK_BG = '#0d0d0d';
const CARD_BG = '#1a1a1a';
const BLUE_ACCENT = '#1565c0';
const WHATSAPP_NUMBER = '5521968648777';

export default function DriverCityLanding() {
  const { citySlug } = useParams();
  const [searchParams] = useSearchParams();
  const city = getCityBySlug(citySlug);

  const [form, setForm] = useState({ name: '', phone: '', email: '', modality: 'CAR', ear: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // SEO: set document title
  useEffect(() => {
    if (city) {
      document.title = `Motorista KAVIAR em ${city.name}/${city.state}`;
      const meta = document.querySelector('meta[name="description"]');
      const desc = `Seja um dos primeiros motoristas parceiros KAVIAR em ${city.name}/${city.state}. Pré-cadastre-se para a formação da primeira equipe.`;
      if (meta) {
        meta.setAttribute('content', desc);
      } else {
        const tag = document.createElement('meta');
        tag.name = 'description';
        tag.content = desc;
        document.head.appendChild(tag);
      }
    }
    return () => { document.title = 'KAVIAR'; };
  }, [city]);

  // City not found fallback
  if (!city) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h4" sx={{ color: GOLD, fontWeight: 900, letterSpacing: 4, mb: 2 }}>KAVIAR</Typography>
          <Typography sx={{ color: '#ccc', mb: 2 }}>Cidade não encontrada.</Typography>
          <Typography sx={{ color: '#888', fontSize: 14 }}>
            Verifique o link ou entre em contato pelo WhatsApp.
          </Typography>
          <Button
            variant="outlined"
            sx={{ mt: 3, borderColor: '#25D366', color: '#25D366', '&:hover': { bgcolor: 'rgba(37,211,102,0.08)' } }}
            onClick={() => window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Olá, tentei acessar uma página de motorista KAVIAR mas a cidade não foi encontrada.')}`, '_blank')}
          >
            Falar pelo WhatsApp
          </Button>
        </Container>
      </Box>
    );
  }

  const cityFull = `${city.name}/${city.state}`;
  const whatsappMsg = `Olá, tenho interesse em ser motorista parceiro KAVIAR em ${city.name}/${city.state}.`;
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMsg)}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    if (!form.phone.trim() || form.phone.replace(/\D/g, '').length < 10) { setError('WhatsApp válido é obrigatório'); return; }
    if (!form.ear) { setError('Informe se possui EAR'); return; }

    setLoading(true); setError('');
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        city_slug: citySlug,
        city_name: city.name,
        state: city.state,
        modality: form.modality,
        ear: form.ear,
        utm_source: searchParams.get('utm_source') || undefined,
        utm_medium: searchParams.get('utm_medium') || undefined,
        utm_campaign: searchParams.get('utm_campaign') || undefined,
      };

      const res = await fetch(`${API_BASE_URL}/api/public/city-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Erro ao enviar pré-cadastro');
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    }
    setLoading(false);
  };

  // Success screen
  if (success) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h4" sx={{ color: GOLD, fontWeight: 900, letterSpacing: 4, mb: 3 }}>KAVIAR</Typography>
          <Alert severity="success" sx={{ mb: 3, fontSize: 15 }}>
            Pré-cadastro recebido!
          </Alert>
          <Typography sx={{ color: '#ccc', mb: 1, fontSize: 15 }}>
            Você entrou na lista de interessados em dirigir com a KAVIAR em <strong>{city.name}</strong>.
          </Typography>
          <Typography sx={{ color: '#999', mb: 4, fontSize: 14 }}>
            Nossa equipe entrará em contato.
          </Typography>
          <Button
            variant="contained"
            sx={{ bgcolor: '#25D366', color: '#fff', fontWeight: 700, px: 4, py: 1.5, '&:hover': { bgcolor: '#1da851' } }}
            onClick={() => window.open(whatsappUrl, '_blank')}
          >
            Falar com a KAVIAR pelo WhatsApp
          </Button>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG }}>
      {/* Hero */}
      <Box sx={{ pt: { xs: 5, md: 8 }, pb: { xs: 4, md: 6 }, textAlign: 'center', px: 2 }}>
        <Typography sx={{ color: GOLD, fontWeight: 900, letterSpacing: 4, fontSize: { xs: '1.8rem', md: '2.4rem' }, mb: 1 }}>
          KAVIAR
        </Typography>
        <Chip
          label={`em ${city.name}`}
          sx={{ bgcolor: 'rgba(184,148,46,0.15)', color: GOLD, fontWeight: 600, fontSize: 14, mb: 2 }}
        />
        <Typography variant="h5" sx={{ color: '#fff', fontWeight: 800, mb: 1, fontSize: { xs: '1.3rem', md: '1.6rem' } }}>
          Motoristas Fundadores KAVIAR
        </Typography>
        <Typography sx={{ color: '#bbb', fontSize: { xs: 14, md: 16 }, maxWidth: 480, mx: 'auto', mb: 1 }}>
          Seja um dos primeiros motoristas parceiros KAVIAR em {city.name}.
        </Typography>
        <Typography sx={{ color: '#888', fontSize: 13, mb: 3 }}>
          Cidade em implantação — formação da primeira equipe.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, justifyContent: 'center', alignItems: 'center' }}>
          <Button
            variant="contained"
            sx={{ bgcolor: GOLD, color: '#000', fontWeight: 700, px: 4, py: 1.3, fontSize: 15, '&:hover': { bgcolor: '#9A7B24' } }}
            onClick={() => document.getElementById('form-section')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Quero ser motorista KAVIAR
          </Button>
          <Button
            variant="outlined"
            sx={{ borderColor: '#25D366', color: '#25D366', fontWeight: 600, px: 3, py: 1.2, '&:hover': { bgcolor: 'rgba(37,211,102,0.08)' } }}
            onClick={() => window.open(whatsappUrl, '_blank')}
          >
            Falar pelo WhatsApp
          </Button>
        </Box>
      </Box>

      {/* Benefícios */}
      <Container maxWidth="sm" sx={{ pb: 4 }}>
        <Box sx={{ bgcolor: CARD_BG, borderRadius: 3, p: 3, border: '1px solid rgba(184,148,46,0.2)', mb: 4 }}>
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 16, mb: 2 }}>
            Por que ser motorista fundador?
          </Typography>
          {[
            { icon: '⏰', text: 'Flexibilidade total de horários' },
            { icon: '📍', text: 'Suporte local dedicado' },
            { icon: '⭐', text: 'Prioridade na abertura da operação' },
            { icon: '📋', text: 'Acompanhamento no processo de cadastro' },
          ].map((b, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.2 }}>
              <Typography sx={{ fontSize: 18 }}>{b.icon}</Typography>
              <Typography sx={{ color: '#ccc', fontSize: 14 }}>{b.text}</Typography>
            </Box>
          ))}
        </Box>

        {/* Etapas */}
        <Box sx={{ bgcolor: CARD_BG, borderRadius: 3, p: 3, border: `1px solid ${BLUE_ACCENT}33`, mb: 4 }}>
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 16, mb: 2 }}>
            Como funciona
          </Typography>
          {[
            'Faça seu pré-cadastro',
            'Nossa equipe entra em contato',
            'Complete a documentação',
            'Acompanhe a ativação da cidade',
          ].map((step, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.3 }}>
              <Box sx={{ minWidth: 24, height: 24, borderRadius: '50%', bgcolor: BLUE_ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{i + 1}</Typography>
              </Box>
              <Typography sx={{ color: '#ccc', fontSize: 14, pt: 0.2 }}>{step}</Typography>
            </Box>
          ))}
        </Box>

        {/* Formulário */}
        <Box id="form-section" sx={{ bgcolor: CARD_BG, borderRadius: 3, p: 3, border: `1px solid ${GOLD}44` }}>
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 17, mb: 0.5 }}>
            Pré-cadastro de motorista
          </Typography>
          <Typography sx={{ color: '#888', fontSize: 12, mb: 2.5 }}>
            {city.name}/{city.state} — cidade em implantação
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TextField
              label="Nome completo *"
              size="small"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              InputProps={{ sx: { bgcolor: '#222', color: '#fff' } }}
              InputLabelProps={{ sx: { color: '#999' } }}
            />
            <TextField
              label="WhatsApp *"
              size="small"
              placeholder="(19) 99999-9999"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              InputProps={{ sx: { bgcolor: '#222', color: '#fff' } }}
              InputLabelProps={{ sx: { color: '#999' } }}
            />
            <TextField
              label="Email (opcional)"
              size="small"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              InputProps={{ sx: { bgcolor: '#222', color: '#fff' } }}
              InputLabelProps={{ sx: { color: '#999' } }}
            />

            <FormControl>
              <FormLabel sx={{ color: '#ccc', fontSize: 13, mb: 0.5 }}>Modalidade</FormLabel>
              <RadioGroup
                row
                value={form.modality}
                onChange={e => setForm(f => ({ ...f, modality: e.target.value }))}
              >
                <FormControlLabel value="CAR" control={<Radio size="small" sx={{ color: '#888', '&.Mui-checked': { color: GOLD } }} />} label={<Typography sx={{ color: '#ccc', fontSize: 14 }}>🚗 Carro</Typography>} />
                <FormControlLabel value="MOTO" control={<Radio size="small" sx={{ color: '#888', '&.Mui-checked': { color: GOLD } }} />} label={<Typography sx={{ color: '#ccc', fontSize: 14 }}>🏍️ Moto</Typography>} />
              </RadioGroup>
            </FormControl>

            <FormControl>
              <FormLabel sx={{ color: '#ccc', fontSize: 13, mb: 0.5 }}>Possui EAR (Exercício de Atividade Remunerada)?</FormLabel>
              <RadioGroup
                row
                value={form.ear}
                onChange={e => setForm(f => ({ ...f, ear: e.target.value }))}
              >
                <FormControlLabel value="YES" control={<Radio size="small" sx={{ color: '#888', '&.Mui-checked': { color: GOLD } }} />} label={<Typography sx={{ color: '#ccc', fontSize: 14 }}>Sim</Typography>} />
                <FormControlLabel value="NO" control={<Radio size="small" sx={{ color: '#888', '&.Mui-checked': { color: GOLD } }} />} label={<Typography sx={{ color: '#ccc', fontSize: 14 }}>Não</Typography>} />
              </RadioGroup>
            </FormControl>

            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ bgcolor: GOLD, color: '#000', fontWeight: 700, py: 1.3, fontSize: 15, '&:hover': { bgcolor: '#9A7B24' }, '&.Mui-disabled': { bgcolor: '#555' } }}
            >
              {loading ? <CircularProgress size={20} sx={{ color: '#000' }} /> : 'Enviar pré-cadastro'}
            </Button>
          </form>

          <Typography sx={{ color: '#555', fontSize: 10, mt: 2, textAlign: 'center' }}>
            Pré-cadastro sujeito à análise documental e exigências locais.
          </Typography>
        </Box>

        {/* Footer */}
        <Typography sx={{ color: '#444', fontSize: 10, textAlign: 'center', mt: 4, pb: 3 }}>
          KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA — CNPJ 67.783.601/0001-99
        </Typography>
      </Container>
    </Box>
  );
}
