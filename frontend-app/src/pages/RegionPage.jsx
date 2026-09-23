import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { API_BASE_URL } from '../config/api';

const gold = '#D4AF37';
const bg = '#070707';

const sx = {
  page: { minHeight: '100vh', bgcolor: bg, color: '#fff', position: 'relative', overflow: 'hidden' },
  glow: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% -10%, rgba(212,175,55,0.12), transparent 50%), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.03), transparent 30%)', pointerEvents: 'none' },
  card: {
    borderRadius: 4, border: '1px solid rgba(212,175,55,0.12)', bgcolor: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(12px)', p: { xs: 2.5, md: 3 }, display: 'flex', flexDirection: 'column',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { border: '1px solid rgba(212,175,55,0.3)', bgcolor: 'rgba(255,255,255,0.05)', transform: 'translateY(-3px)', boxShadow: '0 12px 40px rgba(0,0,0,0.4), 0 0 20px rgba(212,175,55,0.05)' },
  },
  goldBtn: {
    background: 'linear-gradient(180deg, #eece55 0%, #D4AF37 50%, #b8962e 100%)',
    color: '#000', fontWeight: 700, borderRadius: 2.5, textTransform: 'none', py: 1.2, fontSize: '0.82rem',
    boxShadow: '0 4px 16px rgba(212,175,55,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
    '&:hover': { background: 'linear-gradient(180deg, #f3d660 0%, #e1be52 50%, #c5a028 100%)', boxShadow: '0 6px 24px rgba(212,175,55,0.3)' },
    transition: 'all 0.2s',
  },
  outlineBtn: {
    border: '1px solid rgba(212,175,55,0.4)', color: gold, fontWeight: 600, borderRadius: 2.5,
    textTransform: 'none', py: 1.1, fontSize: '0.82rem',
    '&:hover': { bgcolor: 'rgba(212,175,55,0.1)', borderColor: gold },
    transition: 'all 0.2s',
  },
  subtleBtn: {
    border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)', fontWeight: 600,
    borderRadius: 2.5, textTransform: 'none', py: 1.1, fontSize: '0.82rem',
    '&:hover': { bgcolor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.25)' },
    transition: 'all 0.2s',
  },
};

const CARDS = [
  {
    icon: '🚘',
    title: 'KAVIAR Particular',
    desc: 'Reserve um motorista para consultas, compras, eventos, ida e volta ou espera no local.',
    btn: 'Solicitar motorista particular',
    href: 'https://kaviar.com.br/particular',
    variant: 'gold',
  },
  {
    icon: '💰',
    title: 'Seja Consultor KAVIAR',
    desc: 'Ganhe indicando motoristas, passageiros, parceiros e comércios da sua região.',
    btn: 'Quero ser consultor',
    href: 'https://kaviar.com.br/#consultor',
    variant: 'outline',
  },
  {
    icon: '🚗',
    title: 'Trabalhe como motorista',
    desc: 'Dirija na sua região com mais proximidade e autonomia.',
    btn: 'Baixar Motorista na Google Play',
    href: 'https://play.google.com/store/apps/details?id=com.kaviar.driver',
    variant: 'subtle',
  },
  {
    icon: '🗺️',
    title: 'Guia turístico local',
    desc: 'Conhece bem a região? Em breve, moradores poderão oferecer roteiros, passeios e experiências locais pelo KAVIAR.',
    btn: 'Tenho interesse',
    variant: 'subtle',
    badge: 'EM BREVE',
    dynamic: true,
  },
];

export default function RegionPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/public/region/${slug}`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: bg }}>
      <CircularProgress sx={{ color: gold }} />
    </Box>
  );

  const found = data?.found;

  const getHref = (card) => {
    if (card.dynamic) return `https://wa.me/5521968648777?text=${encodeURIComponent('Olá, tenho interesse em saber mais sobre Guia Turístico Local / Pacotes Turísticos KAVIAR na região ' + (data?.name || ''))}`;
    return card.href;
  };

  const getBtnSx = (variant) => {
    if (variant === 'gold') return sx.goldBtn;
    if (variant === 'outline') return sx.outlineBtn;
    return sx.subtleBtn;
  };

  return (
    <Box sx={sx.page}>
      <Box sx={sx.glow} />

      <Box sx={{ position: 'relative', zIndex: 10, maxWidth: 720, mx: 'auto', px: { xs: 2.5, md: 4 }, py: { xs: 5, md: 7 } }}>

        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography sx={{
            fontSize: 28, fontFamily: '"Cormorant Garamond", serif', fontWeight: 600,
            letterSpacing: '0.28em', lineHeight: 1, color: 'transparent',
            backgroundImage: 'linear-gradient(180deg, #fff3bf 0%, #f3d57a 18%, #d4af37 42%, #fff1a8 52%, #b88913 78%, #f0cf67 100%)',
            backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>KAVIAR</Typography>
          <Typography sx={{ mt: 0.8, fontSize: 10, letterSpacing: '0.25em', color: 'rgba(200,169,74,0.5)', textTransform: 'uppercase', fontWeight: 500 }}>
            Mobilidade local brasileira
          </Typography>
        </Box>

        {/* Partner logo */}
        {data?.partner?.logo_url && (
          <Box sx={{ textAlign: 'center', mb: 2.5 }}>
            <Box component="img" src={data.partner.logo_url} alt="" sx={{ width: 56, height: 56, borderRadius: 3, objectFit: 'contain', border: '1px solid rgba(255,255,255,0.08)' }} />
          </Box>
        )}

        {/* Region name */}
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 1, fontSize: { xs: '1.5rem', md: '1.8rem' }, letterSpacing: '-0.01em' }}>
          {data?.name || 'Região'}
        </Typography>

        {/* Status */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          {found && data.drivers_count > 0 && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.8, borderRadius: 5, border: '1px solid rgba(76,175,80,0.2)', bgcolor: 'rgba(76,175,80,0.08)', px: 2, py: 0.5, mb: 1.5 }}>
              <Typography sx={{ fontSize: 12, color: '#66BB6A', fontWeight: 500 }}>
                🚗 {data.drivers_count} motorista{data.drivers_count > 1 ? 's' : ''} ativo{data.drivers_count > 1 ? 's' : ''} na região
              </Typography>
            </Box>
          )}
          {found && data.partner && (
            <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, mb: 1 }}>Parceiro local: {data.partner.name}</Typography>
          )}
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.7, maxWidth: 440, mx: 'auto' }}>
            {found
              ? 'O KAVIAR opera na sua região com motoristas locais, parceiros territoriais e atendimento personalizado.'
              : 'O KAVIAR está chegando na sua região. Quer ajudar a construir a mobilidade local? Seja consultor ou indique motoristas.'}
          </Typography>
        </Box>

        {/* Divider */}
        <Box sx={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.25), transparent)', mb: 4 }} />

        {/* Section title */}
        <Typography sx={{ fontSize: 11, letterSpacing: '0.3em', color: 'rgba(212,175,55,0.6)', textTransform: 'uppercase', fontWeight: 500, textAlign: 'center', mb: 1 }}>
          Oportunidades
        </Typography>
        <Typography sx={{ fontWeight: 700, fontSize: { xs: 18, md: 20 }, textAlign: 'center', mb: 3.5, color: '#fff' }}>
          Oportunidades KAVIAR na região
        </Typography>

        {/* CTA Grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {CARDS.map((card) => (
            <Box key={card.title} sx={sx.card}>
              {/* Badge */}
              {card.badge && (
                <Box sx={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', borderRadius: 4, bgcolor: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)', px: 1.2, py: 0.3, mb: 1.5 }}>
                  <Typography sx={{ fontSize: 9, color: gold, fontWeight: 700, letterSpacing: '0.12em' }}>{card.badge}</Typography>
                </Box>
              )}
              {/* Icon */}
              <Typography sx={{ fontSize: 28, mb: 1.2, lineHeight: 1 }}>{card.icon}</Typography>
              {/* Title */}
              <Typography sx={{ fontWeight: 700, fontSize: 15, mb: 0.8, color: '#fff' }}>{card.title}</Typography>
              {/* Description */}
              <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5, lineHeight: 1.6, mb: 2, flex: 1 }}>
                {card.desc}
              </Typography>
              {/* Button */}
              <Button variant="contained" component="a" href={getHref(card)} target="_blank" fullWidth sx={getBtnSx(card.variant)}>
                {card.btn}
              </Button>
            </Box>
          ))}
        </Box>

        {/* Divider */}
        <Box sx={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)', my: 5 }} />

        {/* Vitrine Local */}
        <Box>
          <Typography sx={{ fontSize: 11, letterSpacing: '0.3em', color: 'rgba(212,175,55,0.6)', textTransform: 'uppercase', fontWeight: 500, textAlign: 'center', mb: 1 }}>
            Vitrine Local
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: 17, textAlign: 'center', mb: 3, color: '#fff' }}>
            Comércios e serviços da região
          </Typography>

          {(!data?.businesses || data.businesses.length === 0) ? (
            <Box sx={{ textAlign: 'center', py: 3, borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.02)' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Em breve: comércios e serviços parceiros da sua região.</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              {data.businesses.map(b => (
                <Box key={b.id} sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', bgcolor: 'rgba(255,255,255,0.02)', p: 2, display: 'flex', flexDirection: 'column', gap: 1, transition: 'all 0.2s', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {b.logo_url && <Box component="img" src={b.logo_url} alt="" sx={{ width: 36, height: 36, borderRadius: 2, objectFit: 'contain' }} />}
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 13.5, color: '#fff' }}>{b.name}</Typography>
                      {b.description && <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11.5 }}>{b.description}</Typography>}
                    </Box>
                  </Box>
                  {b.address && <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>📍 {b.address}</Typography>}
                  {b.whatsapp && (
                    <Button size="small" variant="outlined" fullWidth sx={{ borderColor: 'rgba(76,175,80,0.25)', color: '#66BB6A', fontSize: 11, borderRadius: 2, textTransform: 'none', mt: 0.5, '&:hover': { bgcolor: 'rgba(76,175,80,0.08)' } }} onClick={() => window.open(`https://wa.me/55${b.whatsapp.replace(/\D/g, '')}`, '_blank')}>
                      WhatsApp
                    </Button>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Footer */}
        <Box sx={{ mt: 6, textAlign: 'center' }}>
          <Box sx={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.12), transparent)', mb: 3 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, letterSpacing: '0.15em' }}>
            KAVIAR • Plataforma brasileira de mobilidade local
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
