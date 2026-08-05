import React, { useState } from 'react';
import { Box, Button, Card, CardContent, Container, Menu, MenuItem, Stack, Typography } from '@mui/material';
import {
  AdminPanelSettingsOutlined,
  BusinessCenterOutlined,
  DirectionsCarFilledOutlined,
  FavoriteBorderOutlined,
  PetsOutlined,
  SecurityOutlined,
  ShieldOutlined,
  StorefrontOutlined,
  SupportAgentOutlined,
  TwoWheelerOutlined,
  Woman2Outlined,
} from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';

const gold = '#D4AF37';
const goldSoft = '#F5D980';
const textPrimary = '#FFFFFF';
const textSecondary = 'rgba(255,255,255,0.74)';
const blueSoft = '#8CB8FF';
const cardBg = 'rgba(255,255,255,0.05)';
const cardBorder = 'rgba(255,255,255,0.11)';
const rioHeroImage = '/turismo-replit/generated_images/sugarloaf_mountain_golden_hour.png';
const rioCityImage = '/turismo-replit/generated_images/christ_the_redeemer_majestic.png';
const petImage = '/assets/kaviar-pet-real.png';

const passengerApk = 'https://downloads.kaviar.com.br/kaviar-passageiro-v1.13.8-ota.apk';
const driverApk = 'https://downloads.kaviar.com.br/kaviar-motorista-v1.12.1-ota.apk';

const navItems = [
  { label: 'Para você', href: '#solucoes' },
  { label: 'Para motoristas', href: '#motorista' },
  { label: 'KAVIAR Moto', href: '#moto' },
  { label: 'KAVIAR Pet', href: '#pet' },
  { label: 'Para gestores', href: '#gestores' },
  { label: 'Painéis KAVIAR', href: '#paineis' },
  { label: 'Segurança', href: '#seguranca' },
];

const serviceCards = [
  {
    title: 'KAVIAR Carro',
    text: 'Corridas locais com motoristas da região.',
    icon: <DirectionsCarFilledOutlined sx={{ fontSize: 24 }} />,
  },
  {
    title: 'KAVIAR Moto',
    text: 'Peça uma moto para deslocamentos rápidos e mobilidade local com mais agilidade.',
    icon: <TwoWheelerOutlined sx={{ fontSize: 24 }} />,
  },
  {
    title: 'KAVIAR Pet',
    text: 'Transporte pensado para você e seu pet, com mais cuidado, praticidade e segurança.',
    icon: <PetsOutlined sx={{ fontSize: 24 }} />,
  },
  {
    title: 'KAVIAR Mulheres',
    text: 'Mais escolha e segurança para passageiras.',
    icon: <Woman2Outlined sx={{ fontSize: 24 }} />,
    accent: true,
  },
  {
    title: 'Gestores Locais',
    text: 'Oportunidade para operar e desenvolver sua região.',
    icon: <BusinessCenterOutlined sx={{ fontSize: 24 }} />,
  },
  {
    title: 'CRM Comercial Local',
    text: 'Ferramenta para comércios da cidade administrarem sua presença no KAVIAR.',
    icon: <StorefrontOutlined sx={{ fontSize: 24 }} />,
  },
  {
    title: 'Painel do Gestor',
    text: 'Ferramenta para acompanhar cadastros, motoristas, operações e crescimento local.',
    icon: <AdminPanelSettingsOutlined sx={{ fontSize: 24 }} />,
  },
];

const safetyCards = [
  {
    title: 'Motoristas verificados',
    text: 'Validação de documentos e checagens constantes.',
    icon: <ShieldOutlined sx={{ fontSize: 22 }} />,
  },
  {
    title: 'Mensagens internas',
    text: 'Converse sem expor seu número de telefone.',
    icon: <SupportAgentOutlined sx={{ fontSize: 22 }} />,
  },
  {
    title: 'Acompanhamento operacional',
    text: 'Sua corrida acompanhada em tempo real.',
    icon: <SecurityOutlined sx={{ fontSize: 22 }} />,
  },
  {
    title: 'Suporte local',
    text: 'Atendimento feito por pessoas da sua região.',
    icon: <FavoriteBorderOutlined sx={{ fontSize: 22 }} />,
  },
];

const driverBenefits = ['Ganhos competitivos', 'Flexibilidade de horários', 'Suporte e capacitação', 'Pagamento rápido e seguro'];

const managerCards = [
  {
    title: 'Motoristas',
    text: 'Acompanhe cadastros, documentos e status dos parceiros.',
  },
  {
    title: 'Passageiros',
    text: 'Organize o crescimento da base local.',
  },
  {
    title: 'KAVIAR Moto',
    text: 'Acompanhe pedidos de moto e expansão da modalidade.',
  },
  {
    title: 'KAVIAR Pet',
    text: 'Acompanhe a presença da modalidade pet e oportunidades para tutores e parceiros locais.',
  },
  {
    title: 'Comércio local',
    text: 'Inclua pizzarias, mercados, pet shops, restaurantes e lojas no ecossistema KAVIAR.',
  },
  {
    title: 'Segurança',
    text: 'Registre eventos, auditoria e suporte operacional.',
  },
];

const panelCards = [
  {
    title: 'Painel do Gestor',
    text: 'Para gestores territoriais acompanharem motoristas, passageiros, corridas, pedidos de moto, KAVIAR Pet, cadastros e eventos importantes da região.',
    button: 'Acessar Painel do Gestor',
    href: '/admin/login',
    kind: 'gold',
  },
  {
    title: 'CRM Comercial Local',
    text: 'Para pizzarias, mercados, pet shops, farmácias, restaurantes, lojas e negócios da cidade administrarem sua presença comercial no KAVIAR.',
    button: 'Acessar CRM Comercial',
    href: '/comercio/login',
    kind: 'blue',
  },
  {
    title: 'Super Admin KAVIAR',
    text: 'Acesso interno da equipe KAVIAR para administração geral da plataforma, auditoria e controle operacional.',
    button: 'Acesso interno',
    href: '/admin/login',
    kind: 'discreet',
  },
];

export default function KaviarLanding() {
  React.useEffect(() => {
  const [loginAnchor, setLoginAnchor] = useState(null);
    if (window.location.hash) {
      setTimeout(() => {
        const element = document.querySelector(window.location.hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 140);
    }
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#04070C', color: textPrimary, position: 'relative', overflow: 'hidden' }}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 10% 0%, rgba(212,175,55,0.20), transparent 28%), radial-gradient(circle at 84% 10%, rgba(37,99,235,0.22), transparent 30%), linear-gradient(168deg, #03060B 0%, #07101C 54%, #04070C 100%)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          opacity: 0.16,
        }}
      />

      <Box
        id="top"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          bgcolor: 'rgba(4,7,12,0.84)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <Container maxWidth="xl" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.6, gap: 1.2 }}>
          <Box component="a" href="#top" sx={{ display: 'flex', alignItems: 'center', gap: 1.05, textDecoration: 'none' }}>
            <Box
              sx={{
                width: 41,
                height: 41,
                borderRadius: 2.4,
                border: `1px solid ${gold}40`,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(10,24,46,0.82))',
                boxShadow: '0 10px 24px rgba(212,175,55,0.12)',
              }}
            >
              <Typography sx={{ color: goldSoft, fontWeight: 700, fontSize: 20 }}>K</Typography>
            </Box>
            <Typography sx={{ color: goldSoft, fontWeight: 700, letterSpacing: '0.16em', fontSize: 24 }}>KAVIAR</Typography>
          </Box>

          <Stack direction="row" spacing={2.1} sx={{ display: { xs: 'none', xl: 'flex' } }}>
            {navItems.map((item) => (
              <Box
                key={item.label}
                component="a"
                href={item.href}
                sx={{ color: 'rgba(255,255,255,0.82)', textDecoration: 'none', fontSize: 13.5, '&:hover': { color: '#fff' } }}
              >
                {item.label}
              </Box>
            ))}
          </Stack>

          <Stack direction="row" spacing={0.8}>
            <Button onClick={(e) => setLoginAnchor(e.currentTarget)} sx={buttonOutlineCompact}>
              Entrar
            </Button>
            <Menu
              anchorEl={loginAnchor}
              open={Boolean(loginAnchor)}
              onClose={() => setLoginAnchor(null)}
              PaperProps={{ sx: { bgcolor: '#1A1A2E', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 2, mt: 1, minWidth: 220 } }}
            >
              <MenuItem component="a" href="/commerce" onClick={() => setLoginAnchor(null)} sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(212,175,55,0.1)' } }}>
                <StorefrontOutlined sx={{ mr: 1.5, color: gold, fontSize: 20 }} /> Comércio
              </MenuItem>
              <MenuItem component="a" href="/contador/login" onClick={() => setLoginAnchor(null)} sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(212,175,55,0.1)' } }}>
                <BusinessCenterOutlined sx={{ mr: 1.5, color: gold, fontSize: 20 }} /> Portal do Contador
              </MenuItem>
              <MenuItem component="a" href="/admin/login" onClick={() => setLoginAnchor(null)} sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(212,175,55,0.1)' } }}>
                <AdminPanelSettingsOutlined sx={{ mr: 1.5, color: gold, fontSize: 20 }} /> Administração
              </MenuItem>
            </Menu>
            <Button href={passengerApk} target="_blank" rel="noopener noreferrer" sx={buttonGoldCompact}>
              Baixar o app
            </Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.98fr 1.02fr' }, gap: { xs: 2.8, lg: 4.8 }, alignItems: 'center', py: { xs: 4.5, md: 6.8 } }}>
          <Box>
            <Typography sx={{ color: goldSoft, fontWeight: 700, letterSpacing: '0.14em', fontSize: { xs: 44, md: 70 }, lineHeight: 0.95, mb: 1.0 }}>
              KAVIAR
            </Typography>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.9rem', md: '2.92rem' }, lineHeight: 1.04, maxWidth: 700, mb: 1.25 }}>
              Mobilidade local brasileira, feita para sua cidade.
            </Typography>
            <Typography sx={{ color: textSecondary, fontSize: { xs: 15, md: 17 }, lineHeight: 1.68, maxWidth: 760, mb: 1.9 }}>
              Corridas, KAVIAR Moto, KAVIAR Pet, motoristas mulheres, gestores territoriais e comércios parceiros em uma única plataforma.
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.0} sx={{ mb: 1.0 }}>
              <Button href={passengerApk} target="_blank" rel="noopener noreferrer" sx={buttonGold}>
                Baixar app do passageiro
              </Button>
              <Button href={driverApk} target="_blank" rel="noopener noreferrer" sx={buttonBlue}>
                Baixar app do motorista
              </Button>
              <Button href="#gestores" sx={buttonOutline}>
                Quero ser gestor KAVIAR
              </Button>
            </Stack>
            <Typography sx={{ color: 'rgba(255,255,255,0.62)', fontSize: 12.8 }}>Sem Play Store. Baixe direto do nosso site.</Typography>
          </Box>

          <Box
            sx={{
              position: 'relative',
              minHeight: { xs: 440, md: 560 },
              borderRadius: 4.4,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: '0 34px 98px rgba(0,0,0,0.42)',
              backgroundImage: `url(${rioHeroImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(118deg, rgba(5,9,15,0.90) 8%, rgba(5,9,15,0.65) 52%, rgba(5,9,15,0.86) 100%), radial-gradient(circle at 18% 14%, rgba(212,175,55,0.22), transparent 30%), radial-gradient(circle at 84% 12%, rgba(37,99,235,0.22), transparent 30%)' }} />

            <Box sx={{ position: 'absolute', left: 18, bottom: 18, width: { xs: 150, md: 170 }, borderRadius: 2, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(37,99,235,0.18)', backdropFilter: 'blur(8px)', p: 1.0 }}>
              <Typography sx={{ color: blueSoft, fontSize: 11, fontWeight: 700 }}>Pedir Moto</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.78)', fontSize: 11 }}>Deslocamento rápido na sua região</Typography>
            </Box>

            <Box sx={{ position: 'absolute', left: { xs: 18, md: 200 }, bottom: 18, width: { xs: 150, md: 170 }, borderRadius: 2, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(212,175,55,0.15)', backdropFilter: 'blur(8px)', p: 1.0 }}>
              <Typography sx={{ color: goldSoft, fontSize: 11, fontWeight: 700 }}>KAVIAR Pet</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.78)', fontSize: 11 }}>Seu pet também vai com você</Typography>
            </Box>

            <Box sx={{ position: 'absolute', left: 18, top: 18, maxWidth: 260, borderRadius: 2, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', p: 1.0 }}>
              <Typography sx={{ color: goldSoft, fontSize: 10.8, fontWeight: 700, mb: 0.2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Clássicos do Rio</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.78)', fontSize: 10.5 }}>Pão de Açúcar • Cristo Redentor • Maracanã</Typography>
            </Box>

            <Box sx={{ position: 'absolute', right: 18, top: 18, width: 152, borderRadius: 2, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', p: 1.0 }}>
              <Typography sx={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>Gestores Locais</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontSize: 10.5 }}>Operação territorial</Typography>
            </Box>

            <Box
              sx={{
                position: 'absolute',
                right: { xs: '50%', md: '8%' },
                top: { xs: '14%', md: '8%' },
                transform: { xs: 'translateX(50%)', md: 'none' },
                width: { xs: 248, md: 286 },
                height: { xs: 462, md: 520 },
                borderRadius: '38px',
                border: '2px solid rgba(255,255,255,0.26)',
                background: 'linear-gradient(180deg, rgba(16,21,31,0.98), rgba(7,10,14,0.98))',
                boxShadow: '0 30px 80px rgba(0,0,0,0.52), 0 0 0 1px rgba(255,255,255,0.06) inset',
                p: 1.5,
                zIndex: 2,
              }}
            >
              <Box sx={{ position: 'absolute', left: '50%', top: 8, width: 84, height: 6, transform: 'translateX(-50%)', borderRadius: 99, bgcolor: 'rgba(255,255,255,0.30)' }} />
              <Box sx={{ height: '100%', borderRadius: '28px', background: 'linear-gradient(180deg, #0A0F18 0%, #06090E 100%)', border: '1px solid rgba(255,255,255,0.11)', p: 1.35 }}>
                <Typography sx={{ color: goldSoft, fontWeight: 700, fontSize: 25, letterSpacing: '0.08em', mb: 0.8 }}>KAVIAR</Typography>
                <Typography sx={{ color: '#fff', fontWeight: 700, mb: 0.95, fontSize: 14.2 }}>Escolha sua mobilidade</Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.58, mb: 0.9 }}>
                  {['Carro', 'Moto', 'Pet', 'Mulheres'].map((label, index) => (
                    <Box
                      key={label}
                      sx={{
                        borderRadius: 1.6,
                        border: '1px solid rgba(255,255,255,0.12)',
                        py: 0.52,
                        px: 0.32,
                        bgcolor: index === 3 ? 'rgba(244,114,182,0.18)' : index === 1 ? 'rgba(37,99,235,0.20)' : 'rgba(255,255,255,0.07)',
                      }}
                    >
                      <Typography sx={{ color: '#fff', fontSize: 10, textAlign: 'center', lineHeight: 1.2 }}>{label}</Typography>
                    </Box>
                  ))}
                </Box>

                <Box sx={{ borderRadius: 2, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(37,99,235,0.14)', p: 0.82, mb: 0.7 }}>
                  <Typography sx={{ color: blueSoft, fontSize: 11, fontWeight: 700 }}>Pedir Moto</Typography>
                </Box>

                <Box sx={{ borderRadius: 2, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(212,175,55,0.12)', p: 0.82, mb: 0.7 }}>
                  <Typography sx={{ color: goldSoft, fontSize: 11, fontWeight: 700 }}>KAVIAR Pet</Typography>
                </Box>

                <Box sx={{ borderRadius: 2, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', p: 0.82, mb: 0.7 }}>
                  <Typography sx={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>Gestores Locais</Typography>
                </Box>

                <Box sx={{ borderRadius: 2, border: `1px solid ${gold}45`, background: 'rgba(212,175,55,0.10)', p: 0.82 }}>
                  <Typography sx={{ color: goldSoft, fontSize: 11, fontWeight: 700 }}>Segurança KAVIAR</Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ position: 'absolute', right: -28, top: '58%', width: 180, height: 180, borderRadius: '50%', border: '1px solid rgba(245,217,128,0.28)', zIndex: 1 }} />
            <Box sx={{ position: 'absolute', left: -30, top: '24%', width: 140, height: 140, borderRadius: '50%', border: '1px solid rgba(37,99,235,0.26)' }} />
          </Box>
        </Box>

        <SectionSpacing id="solucoes">
          <Typography sx={sectionTitle}>Soluções completas para o seu dia a dia</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(7,1fr)' }, gap: 0.95 }}>
            {serviceCards.map((card) => (
              <Card key={card.title} sx={glassCard(card.accent)}>
                <CardContent sx={{ p: 1.35, color: '#fff' }}>
                  <Box sx={{ width: 34, height: 34, borderRadius: 1.6, display: 'grid', placeItems: 'center', bgcolor: card.accent ? 'rgba(244,114,182,0.16)' : 'rgba(37,99,235,0.16)', color: card.accent ? '#f9a8d4' : blueSoft, mb: 0.85 }}>
                    {card.icon}
                  </Box>
                  <Typography sx={{ color: '#fff', fontWeight: 700, mb: 0.4, fontSize: 14 }}>{card.title}</Typography>
                  <Typography sx={{ color: textSecondary, fontSize: 12.4, lineHeight: 1.46 }}>{card.text}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </SectionSpacing>

        <SectionSpacing id="moto">
          <Card sx={{ borderRadius: 4, border: `1px solid ${cardBorder}`, background: 'linear-gradient(155deg, rgba(8,12,19,0.98), rgba(7,12,22,0.98))', boxShadow: '0 24px 70px rgba(0,0,0,0.30)' }}>
            <CardContent sx={{ p: { xs: 2.0, md: 2.8 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.97fr 1.03fr' }, gap: 1.8, alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ color: blueSoft, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, mb: 0.65 }}>KAVIAR Moto</Typography>
                  <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.02rem' }, mb: 0.7 }}>Mais agilidade para sua cidade.</Typography>
                  <Typography sx={{ color: textSecondary, lineHeight: 1.68, maxWidth: 620, mb: 1.25 }}>
                    Peça uma moto para deslocamentos rápidos e tenha uma alternativa mais ágil para a mobilidade local.
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.0}>
                    <Button href={passengerApk} target="_blank" rel="noopener noreferrer" sx={buttonBlue}>
                      Pedir uma moto
                    </Button>
                    <Button href={driverApk} target="_blank" rel="noopener noreferrer" sx={buttonGold}>
                      Sou motorista e quero rodar de moto
                    </Button>
                  </Stack>
                </Box>

                <Box sx={{ position: 'relative', minHeight: { xs: 260, md: 286 }, borderRadius: 3.3, border: `1px solid ${cardBorder}`, backgroundImage: `url(${rioCityImage})`, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden' }}>
                  <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(4,9,18,0.90) 10%, rgba(4,9,18,0.76) 55%, rgba(4,9,18,0.88) 100%), radial-gradient(circle at 82% 74%, rgba(212,175,55,0.20), transparent 25%)' }} />

                  <Box sx={{ position: 'absolute', left: 22, top: 20, width: 84, height: 84, borderRadius: '50%', border: '1px solid rgba(37,99,235,0.48)', bgcolor: 'rgba(37,99,235,0.16)', display: 'grid', placeItems: 'center', boxShadow: '0 0 30px rgba(37,99,235,0.28)' }}>
                    <TwoWheelerOutlined sx={{ color: blueSoft, fontSize: 52 }} />
                  </Box>

                  <Box sx={{ position: 'absolute', left: 16, right: 18, top: 132, height: 2, background: 'linear-gradient(90deg, transparent, rgba(37,99,235,0.9), rgba(212,175,55,0.86), transparent)', boxShadow: '0 0 18px rgba(37,99,235,0.34)' }} />
                  <Box sx={{ position: 'absolute', left: 34, right: 26, top: 162, height: 2, background: 'linear-gradient(90deg, transparent, rgba(37,99,235,0.5), rgba(212,175,55,0.52), transparent)' }} />

                  <Box sx={{ position: 'absolute', right: 22, top: 22, width: { xs: 152, md: 188 }, height: { xs: 126, md: 146 }, borderRadius: 4, border: '1px solid rgba(255,255,255,0.14)', background: 'linear-gradient(180deg, rgba(14,19,28,0.96), rgba(6,9,13,0.98))', boxShadow: '0 18px 40px rgba(0,0,0,0.30)', p: 1.0 }}>
                    <Box sx={{ height: '100%', borderRadius: 3, border: '1px solid rgba(255,255,255,0.10)', background: 'linear-gradient(180deg, #0B111C 0%, #06090E 100%)', p: 1.0, display: 'grid', alignContent: 'center', gap: 0.7 }}>
                      <Typography sx={{ color: blueSoft, fontWeight: 700, fontSize: 12.2 }}>Pedir uma moto</Typography>
                      <Box sx={{ height: 40, borderRadius: 2, background: 'linear-gradient(135deg, rgba(37,99,235,0.26), rgba(212,175,55,0.14))', border: '1px solid rgba(255,255,255,0.08)' }} />
                    </Box>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </SectionSpacing>

        <SectionSpacing id="pet">
          <Card sx={{ borderRadius: 4, border: `1px solid rgba(212,175,55,0.26)`, background: 'linear-gradient(155deg, rgba(14,13,10,0.98), rgba(6,9,14,0.98))', boxShadow: '0 24px 70px rgba(0,0,0,0.30)' }}>
            <CardContent sx={{ p: { xs: 2.0, md: 2.8 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 0.95fr' }, gap: 1.8, alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ color: goldSoft, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, mb: 0.65 }}>KAVIAR Pet</Typography>
                  <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.02rem' }, mb: 0.7 }}>Mobilidade também para quem faz parte da família.</Typography>
                  <Typography sx={{ color: textSecondary, lineHeight: 1.68, maxWidth: 680, mb: 1.2 }}>
                    Com o KAVIAR Pet, tutores podem solicitar transporte com mais praticidade para levar seus pets a consultas, banho e tosa, passeios, hotéis pet e outros compromissos do dia a dia.
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.0}>
                    <Button href="#pet" sx={buttonOutline}>
                      Conhecer KAVIAR Pet
                    </Button>
                    <Button href={passengerApk} target="_blank" rel="noopener noreferrer" sx={buttonGold}>
                      Baixar app do passageiro
                    </Button>
                  </Stack>
                </Box>

                <Box sx={{ position: 'relative', minHeight: 236, borderRadius: 3.3, border: `1px solid ${cardBorder}`, backgroundImage: `url(${petImage})`, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden' }}>
                  <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(11,13,18,0.86) 8%, rgba(11,13,18,0.56) 52%, rgba(11,13,18,0.88) 100%), radial-gradient(circle at 20% 18%, rgba(212,175,55,0.26), transparent 34%)' }} />

                  <Box sx={{ position: 'absolute', left: 22, top: 22, borderRadius: 999, border: `1px solid ${gold}65`, bgcolor: 'rgba(212,175,55,0.14)', px: 1.1, py: 0.5, boxShadow: '0 0 24px rgba(212,175,55,0.22)' }}>
                    <Typography sx={{ color: goldSoft, fontSize: 11, fontWeight: 700 }}>Seu pet também vai com você.</Typography>
                  </Box>

                  <Box sx={{ position: 'absolute', right: 24, top: 26, width: 180, height: 190, borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)', background: 'linear-gradient(180deg, rgba(14,19,28,0.96), rgba(6,9,13,0.98))', boxShadow: '0 18px 40px rgba(0,0,0,0.30)', p: 1.15 }}>
                    <Box sx={{ height: '100%', borderRadius: 3, border: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(180deg, #0B111C 0%, #06090E 100%)', p: 1.05 }}>
                      <Typography sx={{ color: goldSoft, fontWeight: 700, fontSize: 11.5, mb: 0.6 }}>KAVIAR Pet</Typography>
                      <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 16, mb: 0.55 }}>Seu pet também vai com você.</Typography>
                      <Box sx={{ borderRadius: 1.8, border: '1px solid rgba(255,255,255,0.10)', bgcolor: 'rgba(255,255,255,0.05)', p: 0.8, mb: 0.8 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.66)', fontSize: 11 }}>Conforto e confiança para os tutores</Typography>
                      </Box>
                      <Box sx={{ height: 58, borderRadius: 2, background: 'linear-gradient(135deg, rgba(212,175,55,0.24), rgba(37,99,235,0.12))', border: '1px solid rgba(255,255,255,0.08)', mb: 0.75 }} />
                      <Typography sx={{ color: 'rgba(255,255,255,0.76)', fontSize: 11 }}>Mais cuidado na mobilidade do dia a dia</Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </SectionSpacing>

        <SectionSpacing id="seguranca">
          <Card sx={{ borderRadius: 4, border: `1px solid ${cardBorder}`, background: 'linear-gradient(155deg, rgba(10,15,24,0.98), rgba(8,13,20,0.96))', boxShadow: '0 22px 68px rgba(0,0,0,0.28)' }}>
            <CardContent sx={{ p: { xs: 2.0, md: 2.6 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.94fr 1.06fr' }, gap: 1.5, alignItems: 'stretch' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.95, mb: 0.95 }}>
                    <Box sx={{ width: 42, height: 42, borderRadius: 2.1, display: 'grid', placeItems: 'center', bgcolor: 'rgba(212,175,55,0.16)', border: `1px solid ${gold}55`, boxShadow: '0 10px 22px rgba(212,175,55,0.14)' }}>
                      <ShieldOutlined sx={{ color: goldSoft, fontSize: 25 }} />
                    </Box>
                    <Typography sx={{ color: goldSoft, fontSize: 10.8, letterSpacing: '0.22em', textTransform: 'uppercase' }}>Segurança KAVIAR</Typography>
                  </Box>
                  <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.38rem', md: '1.86rem' }, mb: 0.8 }}>Segurança que você sente</Typography>
                  <Typography sx={{ color: textSecondary, lineHeight: 1.68, mb: 1.05 }}>
                    Validamos motoristas, acompanhamos corridas e oferecemos suporte local. Tudo para você viajar com mais tranquilidade.
                  </Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)' }, gap: 0.85 }}>
                  {safetyCards.map((card) => (
                    <Box key={card.title} sx={{ borderRadius: 2.1, border: `1px solid ${cardBorder}`, bgcolor: 'rgba(255,255,255,0.04)', p: 1.0 }}>
                      <Box sx={{ width: 32, height: 32, borderRadius: 1.4, display: 'grid', placeItems: 'center', bgcolor: 'rgba(37,99,235,0.18)', color: blueSoft, mb: 0.7 }}>
                        {card.icon}
                      </Box>
                      <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 13.4, mb: 0.3 }}>{card.title}</Typography>
                      <Typography sx={{ color: textSecondary, fontSize: 12.2, lineHeight: 1.43 }}>{card.text}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </SectionSpacing>

        <SectionSpacing id="motorista">
          <Card sx={{ borderRadius: 4, border: `1px solid rgba(212,175,55,0.26)`, background: 'linear-gradient(155deg, rgba(16,14,9,0.98), rgba(7,10,14,0.98))', boxShadow: '0 22px 64px rgba(0,0,0,0.28)' }}>
            <CardContent sx={{ p: { xs: 2.0, md: 2.8 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 0.94fr' }, gap: 1.55, alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.4rem', md: '1.88rem' }, mb: 0.8 }}>Seja um motorista parceiro</Typography>
                  <Typography sx={{ color: textSecondary, lineHeight: 1.68, mb: 1.05 }}>
                    Mais ganhos, mais liberdade e o suporte de uma plataforma que valoriza você.
                  </Typography>
                  <Stack component="ul" spacing={0.62} sx={{ listStyle: 'none', pl: 0, m: 0, mb: 1.2 }}>
                    {driverBenefits.map((benefit) => (
                      <Box key={benefit} component="li" sx={{ display: 'flex', alignItems: 'center', gap: 0.85 }}>
                        <Box sx={{ width: 6.5, height: 6.5, borderRadius: '50%', bgcolor: gold }} />
                        <Typography sx={{ color: textSecondary, fontSize: 14 }}>{benefit}</Typography>
                      </Box>
                    ))}
                  </Stack>
                  <Button href={driverApk} target="_blank" rel="noopener noreferrer" sx={buttonGold}>
                    Baixar app do motorista
                  </Button>
                </Box>

                <Box sx={{ borderRadius: 3, border: `1px solid ${cardBorder}`, bgcolor: 'rgba(255,255,255,0.03)', p: 1.25 }}>
                  <Box sx={{ borderRadius: 2.2, border: `1px solid rgba(212,175,55,0.26)`, background: 'linear-gradient(160deg, rgba(10,16,24,0.98), rgba(5,8,12,0.98))', p: 1.15 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.85 }}>
                      <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 13.6 }}>Corrida aceita</Typography>
                      <Typography sx={{ color: goldSoft, fontWeight: 700, fontSize: 12.8 }}>Em deslocamento</Typography>
                    </Box>
                    <Box sx={{ height: 94, borderRadius: 2, border: `1px solid ${cardBorder}`, background: 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(212,175,55,0.12))', mb: 0.8, position: 'relative' }}>
                      <Box sx={{ position: 'absolute', left: 12, top: 12, width: 54, height: 15, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.14)' }} />
                      <Box sx={{ position: 'absolute', right: 14, top: 14, width: 74, height: 15, borderRadius: 999, bgcolor: 'rgba(212,175,55,0.48)' }} />
                      <Box sx={{ position: 'absolute', left: 14, bottom: 16, width: 112, height: 2, bgcolor: `${gold}88`, boxShadow: `0 0 14px ${gold}` }} />
                    </Box>
                    <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontSize: 12.1, mb: 0.2 }}>Status: Em deslocamento para embarque</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.62)', fontSize: 11.8 }}>Tela pensada para apoiar a rotina do motorista parceiro.</Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </SectionSpacing>

        <SectionSpacing id="gestores">
          <Card sx={{ borderRadius: 4, border: `1px solid rgba(212,175,55,0.34)`, background: 'linear-gradient(150deg, rgba(8,12,20,0.98), rgba(5,8,12,0.98))', boxShadow: '0 30px 88px rgba(0,0,0,0.32)' }}>
            <CardContent sx={{ p: { xs: 2.0, md: 3.0 } }}>
              <Box sx={{ textAlign: 'center', mb: 1.6 }}>
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.8rem', md: '2.55rem' }, lineHeight: 1.04, mb: 0.55 }}>
                  Sua cidade também pode ter KAVIAR
                </Typography>
                <Typography sx={{ color: goldSoft, fontSize: { xs: 14.5, md: 17 }, fontWeight: 600, mb: 0.65 }}>Leve uma operação local de mobilidade para sua região.</Typography>
                <Typography sx={{ color: textSecondary, lineHeight: 1.7, maxWidth: 880, mx: 'auto' }}>
                  O KAVIAR permite que gestores territoriais organizem motoristas, passageiros, KAVIAR Moto, KAVIAR Pet e comércios parceiros da cidade com mais controle, tecnologia e presença regional.
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.94fr 1.06fr' }, gap: 1.6, alignItems: 'stretch' }}>
                <Box sx={{ borderRadius: 3, border: `1px solid ${cardBorder}`, background: 'rgba(255,255,255,0.03)', p: 1.25 }}>
                  <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 16.8, mb: 0.55 }}>Oportunidade comercial territorial</Typography>
                  <Typography sx={{ color: textSecondary, lineHeight: 1.65, fontSize: 14, mb: 1.0 }}>
                    Gestores locais podem estruturar uma operação forte para passageiros, motoristas e comércios parceiros, com suporte de uma plataforma feita para o contexto regional.
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.95}>
                    <Button href="#paineis" sx={buttonGold}>
                      Quero ser gestor KAVIAR
                    </Button>
                    <Button href="#paineis" sx={buttonBlue}>
                      Conhecer os Painéis KAVIAR
                    </Button>
                  </Stack>
                </Box>

                <Box sx={{ borderRadius: 3, border: `1px solid ${cardBorder}`, background: 'linear-gradient(160deg, rgba(11,16,24,0.98), rgba(6,9,14,0.98))', p: 1.25, position: 'relative', overflow: 'hidden' }}>
                  <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 20%, rgba(212,175,55,0.18), transparent 30%), radial-gradient(circle at 80% 74%, rgba(37,99,235,0.16), transparent 24%)' }} />
                  <Box sx={{ position: 'relative', height: 172, borderRadius: 2.4, border: `1px solid ${cardBorder}`, backgroundImage: `url(${rioCityImage})`, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden', mb: 1.0 }}>
                    <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(116deg, rgba(8,12,20,0.84) 12%, rgba(8,12,20,0.56) 58%, rgba(8,12,20,0.86) 100%)' }} />
                    {[
                      ['20%', '32%'],
                      ['31%', '23%'],
                      ['44%', '46%'],
                      ['56%', '36%'],
                      ['65%', '54%'],
                      ['73%', '42%'],
                    ].map((dot) => (
                      <Box
                        key={dot.join('-')}
                        sx={{
                          position: 'absolute',
                          left: dot[0],
                          top: dot[1],
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: goldSoft,
                          boxShadow: `0 0 14px ${goldSoft}`,
                        }}
                      />
                    ))}
                    <Box sx={{ position: 'absolute', left: '22%', top: '32%', width: '52%', height: 1.6, bgcolor: `${gold}92`, boxShadow: `0 0 12px ${gold}` }} />
                  </Box>

                  <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)' }, gap: 0.8 }}>
                    {managerCards.map((card) => (
                      <Box key={card.title} sx={{ borderRadius: 2, border: `1px solid ${cardBorder}`, bgcolor: 'rgba(255,255,255,0.04)', p: 0.85 }}>
                        <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 13.1, mb: 0.25 }}>{card.title}</Typography>
                        <Typography sx={{ color: textSecondary, fontSize: 11.9, lineHeight: 1.4 }}>{card.text}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </SectionSpacing>

        <SectionSpacing id="paineis">
          <Card sx={{ borderRadius: 4, border: `1px solid ${cardBorder}`, background: 'linear-gradient(150deg, rgba(8,13,22,0.98), rgba(5,8,12,0.98))', boxShadow: '0 24px 76px rgba(0,0,0,0.28)' }}>
            <CardContent sx={{ p: { xs: 2.0, md: 2.8 } }}>
              <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.42rem', md: '1.92rem' }, mb: 0.55 }}>Painéis KAVIAR</Typography>
              <Typography sx={{ color: goldSoft, fontWeight: 600, fontSize: { xs: 14.2, md: 16 }, mb: 0.65 }}>Cada parceiro com o acesso certo para operar melhor.</Typography>
              <Typography sx={{ color: textSecondary, lineHeight: 1.68, maxWidth: 860, mb: 1.2 }}>
                O KAVIAR conecta passageiros, motoristas, gestores territoriais e comércios locais em uma plataforma única, com painéis específicos para cada operação.
              </Typography>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' }, gap: 0.95 }}>
                {panelCards.map((card) => (
                  <Box key={card.title} sx={panelCardStyle(card.kind)}>
                    <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 15.2, mb: 0.45 }}>{card.title}</Typography>
                    <Typography sx={{ color: textSecondary, fontSize: 12.7, lineHeight: 1.5, mb: 1.0 }}>{card.text}</Typography>
                    <Button href={card.href} sx={panelButtonStyle(card.kind)}>
                      {card.button}
                    </Button>
                  </Box>
                ))}
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.58)', fontSize: 12.1, mt: 0.95 }}>
                O painel do gestor, o CRM e o acesso interno podem compartilhar a mesma rota, com permissões diferentes por perfil.
              </Typography>
            </CardContent>
          </Card>
        </SectionSpacing>

        <SectionSpacing id="sobre">
          <Card sx={{ borderRadius: 4, border: `1px solid ${cardBorder}`, bgcolor: 'rgba(255,255,255,0.03)' }}>
            <CardContent sx={{ p: { xs: 2.0, md: 2.5 } }}>
              <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.3rem', md: '1.72rem' }, mb: 0.65 }}>
                Por que o KAVIAR olha primeiro para o motorista?
              </Typography>
              <Typography sx={{ color: textSecondary, lineHeight: 1.68 }}>
                Motoristas precisam de mais clareza, suporte local e uma relação mais justa com a plataforma. O KAVIAR foi criado para aproximar tecnologia, gestão regional e valorização de quem move a cidade todos os dias.
              </Typography>
            </CardContent>
          </Card>
        </SectionSpacing>

        <SectionSpacing id="download">
          <Card sx={{ borderRadius: 4, border: `1px solid rgba(212,175,55,0.28)`, background: 'linear-gradient(155deg, rgba(12,16,24,0.98), rgba(5,8,12,0.98))', boxShadow: '0 24px 74px rgba(0,0,0,0.28)' }}>
            <CardContent sx={{ p: { xs: 2.0, md: 2.8 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.08fr 0.92fr' }, gap: 1.6, alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: '1.42rem', md: '1.92rem' }, mb: 0.65 }}>Baixe agora o app KAVIAR</Typography>
                  <Typography sx={{ color: textSecondary, lineHeight: 1.68, mb: 1.1 }}>
                    Sem Play Store. Baixe direto do nosso site com segurança e praticidade.
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.0}>
                    <Button href={passengerApk} target="_blank" rel="noopener noreferrer" sx={buttonGold}>
                      Baixar app do passageiro
                    </Button>
                    <Button href={driverApk} target="_blank" rel="noopener noreferrer" sx={buttonBlue}>
                      Baixar app do motorista
                    </Button>
                  </Stack>
                </Box>

                <Box sx={{ borderRadius: 2.8, border: `1px solid ${cardBorder}`, bgcolor: 'rgba(255,255,255,0.03)', p: 1.4, textAlign: 'center' }}>
                  <Typography sx={{ color: '#fff', fontWeight: 700, mb: 0.55 }}>QR Code oficial</Typography>
                  <Typography sx={{ color: textSecondary, fontSize: 12.7, mb: 0.95 }}>Escaneie para acessar https://kaviar.com.br</Typography>
                  <Box sx={{ p: 1.2, bgcolor: '#fff', borderRadius: 2, display: 'inline-flex' }}>
                    <QRCodeSVG value="https://kaviar.com.br" size={164} includeMargin />
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </SectionSpacing>
      </Container>

      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', py: 2.8, mt: 0.6, position: 'relative', zIndex: 1 }}>
        <Container maxWidth="xl">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr 1fr' }, gap: 1.6 }}>
            <Box>
              <Typography sx={{ color: goldSoft, fontWeight: 700, letterSpacing: '0.14em', fontSize: 24, mb: 0.55 }}>KAVIAR</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.62)', fontSize: 13, lineHeight: 1.58 }}>KAVIAR TECNOLOGIA E SERVIÇOS DIGITAIS LTDA</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.62)', fontSize: 13, lineHeight: 1.58 }}>Nome fantasia: KAVIAR</Typography>
            </Box>

            <Box>
              <Typography sx={{ color: '#fff', fontWeight: 700, mb: 0.65, fontSize: 14 }}>Links</Typography>
              <Stack spacing={0.38}>
                {[
                  ['Início', '#top'],
                  ['Para você', '#solucoes'],
                  ['Para motoristas', '#motorista'],
                  ['KAVIAR Moto', '#moto'],
                  ['KAVIAR Pet', '#pet'],
                  ['Para gestores', '#gestores'],
                  ['Painéis KAVIAR', '#paineis'],
                  ['Segurança', '#seguranca'],
                  ['Baixar app', '#download'],
                  ['Privacidade', '/privacidade'],
                  ['Termos Passageiro', '/termos-passageiro'],
                  ['Termos Motorista', '/termos-motorista'],
                  ['Excluir Conta', '/excluir-conta'],
                ].map((link) => (
                  <Box key={link[0]} component="a" href={link[1]} sx={{ color: 'rgba(255,255,255,0.66)', textDecoration: 'none', fontSize: 13, '&:hover': { color: '#fff' } }}>
                    {link[0]}
                  </Box>
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography sx={{ color: '#fff', fontWeight: 700, mb: 0.65, fontSize: 14 }}>Downloads</Typography>
              <Stack spacing={0.38}>
                <Box component="a" href={passengerApk} target="_blank" rel="noopener noreferrer" sx={{ color: 'rgba(255,255,255,0.66)', textDecoration: 'none', fontSize: 13, '&:hover': { color: '#fff' } }}>
                  App do passageiro
                </Box>
                <Box component="a" href={driverApk} target="_blank" rel="noopener noreferrer" sx={{ color: 'rgba(255,255,255,0.66)', textDecoration: 'none', fontSize: 13, '&:hover': { color: '#fff' } }}>
                  App do motorista
                </Box>
              </Stack>
            </Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

function SectionSpacing({ id, children }) {
  return (
    <Box id={id} sx={{ py: { xs: 2.7, md: 3.9 } }}>
      {children}
    </Box>
  );
}

function glassCard(accent) {
  return {
    background: cardBg,
    border: `1px solid ${accent ? 'rgba(244,114,182,0.24)' : cardBorder}`,
    borderRadius: 2.6,
    boxShadow: '0 12px 30px rgba(0,0,0,0.24)',
    backdropFilter: 'blur(14px)',
    transition: 'all 0.2s ease',
    '&:hover': {
      transform: 'translateY(-2px)',
      borderColor: accent ? 'rgba(244,114,182,0.34)' : 'rgba(255,255,255,0.18)',
    },
  };
}

function panelCardStyle(kind) {
  const base = {
    borderRadius: 2.6,
    border: `1px solid ${cardBorder}`,
    p: 1.2,
    background: 'rgba(255,255,255,0.04)',
  };

  if (kind === 'gold') {
    return {
      ...base,
      border: '1px solid rgba(212,175,55,0.38)',
      background: 'linear-gradient(165deg, rgba(26,21,10,0.78), rgba(12,14,18,0.92))',
      boxShadow: '0 14px 34px rgba(212,175,55,0.12)',
    };
  }

  if (kind === 'blue') {
    return {
      ...base,
      border: '1px solid rgba(37,99,235,0.40)',
      background: 'linear-gradient(165deg, rgba(11,21,44,0.78), rgba(11,14,18,0.92))',
      boxShadow: '0 14px 34px rgba(37,99,235,0.12)',
    };
  }

  return {
    ...base,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.025)',
  };
}

function panelButtonStyle(kind) {
  if (kind === 'gold') return buttonGold;
  if (kind === 'blue') return buttonBlue;
  return {
    border: '1px solid rgba(255,255,255,0.22)',
    color: 'rgba(255,255,255,0.84)',
    borderRadius: 999,
    px: 1.7,
    py: 0.82,
    textTransform: 'none',
    fontWeight: 600,
    background: 'rgba(255,255,255,0.04)',
    '&:hover': {
      background: 'rgba(255,255,255,0.08)',
    },
  };
}

const sectionTitle = {
  color: '#fff',
  textAlign: 'center',
  fontSize: { xs: '1.45rem', md: '1.94rem' },
  fontWeight: 700,
  mb: 1.5,
};

const buttonGold = {
  background: 'linear-gradient(180deg, #F8E6A0 0%, #D4AF37 45%, #A87917 100%)',
  color: '#070B10',
  borderRadius: 999,
  px: 2.2,
  py: 1.05,
  textTransform: 'none',
  fontWeight: 700,
  border: '1px solid rgba(255,255,255,0.18)',
  boxShadow: '0 14px 34px rgba(212,175,55,0.30)',
  '&:hover': {
    background: 'linear-gradient(180deg, #FAEBB6 0%, #DDB94A 45%, #B58318 100%)',
    transform: 'translateY(-1px)',
  },
};

const buttonGoldCompact = {
  ...buttonGold,
  px: 1.8,
  py: 0.82,
  fontSize: 13,
};

const buttonBlue = {
  background: 'linear-gradient(180deg, #2563EB 0%, #123B8A 100%)',
  color: '#FFFFFF',
  borderRadius: 999,
  px: 2.2,
  py: 1.05,
  textTransform: 'none',
  fontWeight: 700,
  boxShadow: '0 14px 34px rgba(37,99,235,0.25)',
  '&:hover': {
    background: 'linear-gradient(180deg, #3776F0 0%, #17439A 100%)',
    transform: 'translateY(-1px)',
  },
};

const buttonOutline = {
  border: '1px solid rgba(245,217,128,0.65)',
  color: '#F5D980',
  borderRadius: 999,
  px: 2.05,
  py: 0.98,
  textTransform: 'none',
  fontWeight: 700,
  background: 'rgba(212,175,55,0.08)',
  '&:hover': {
    background: 'rgba(212,175,55,0.14)',
    transform: 'translateY(-1px)',
  },
};

const buttonOutlineCompact = {
  ...buttonOutline,
  px: 1.4,
  py: 0.78,
  fontSize: 13,
};
