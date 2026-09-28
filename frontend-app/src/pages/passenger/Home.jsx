import { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  TextField,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import MyLocation from '@mui/icons-material/MyLocation';
import LocationOn from '@mui/icons-material/LocationOn';
import DirectionsCar from '@mui/icons-material/DirectionsCar';
import Layout from '../../components/common/Layout';
import AddressAutocomplete from '../../components/common/AddressAutocomplete';
import MapComponent from '../../components/common/MapComponent';
import RideStatusCard from '../../components/common/RideStatusCard';
import { FadeInCard, premiumButtonStyles } from '../../components/common/Animations';
import { useNavigate } from 'react-router-dom';
import { useRide } from '../../contexts/RideContext';

const PassengerHome = () => {
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [serviceType, setServiceType] = useState('STANDARD_RIDE');
  const [careNotes, setCareNotes] = useState('');
  const [careNeedsEscort, setCareNeedsEscort] = useState(false);

  // WhatsApp do suporte (pode configurar por env VITE_SUPPORT_WHATSAPP)
  const SUPPORT_WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP || '5521968648777';

  const openCareWhatsApp = () => {
    // Opening a third-party channel is not a booking; do not prefill health notes or addresses.
    const msg = 'Olá! Gostaria de informações sobre o KAVIAR CARE. Entendo que esta conversa não solicita nem confirma uma corrida.';

    const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { rideStatus, requestRide, demoEnabled } = useRide();

  const serviceOptions = [
    { value: 'STANDARD_RIDE', label: 'Corrida Normal', description: 'Transporte padrão', icon: '🚗' },
    { value: 'TOUR_GUIDE', label: 'Guia Turístico', description: 'Motorista como guia local', icon: '🧭' },
    { value: 'ELDERLY_ASSISTANCE', label: 'Care / Acompanhamento', description: 'Atendimento especializado', icon: '🧓' }
  ];

  const handleRequestRide = () => {
    if (!pickup || !destination) {
      setError('Preencha origem e destino');
      return;
    }

    setError('');
    const demoStarted = requestRide({
      origin: pickup,
      destination: destination,
      serviceType: serviceType,
      pickupCoords,
      destinationCoords
    });

    if (!demoStarted) {
      setError('Este painel não realiza solicitações reais. Utilize o aplicativo KAVIAR Passageiro.');
      return;
    }

    // Navegar somente quando a demonstração local for iniciada
    setTimeout(() => {
      navigate('/passageiro/status');
    }, 1000);
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setPickupCoords(coords);
          setPickup(`${coords.lat}, ${coords.lng}`);
        },
        () => {
          setError('Erro ao obter localização atual');
        }
      );
    }
  };

  const selectedService = serviceOptions.find(s => s.value === serviceType);

  // Legacy view uses fictitious drivers, prices and timers. Fail closed in production.
  if (!demoEnabled) {
    return (
      <Layout title="Área do passageiro">
        <Alert severity="info" sx={{ mb: 3 }}>
          Esta área web de corridas está em preparação e não solicita viagens reais.
          Para solicitar uma corrida, utilize o aplicativo oficial KAVIAR Passageiro.
        </Alert>
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>KAVIAR CARE — em implantação</Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              A mobilidade assistida ainda não está disponível para solicitação automática.
              É possível consultar informações pelo canal de atendimento, sem reserva ou disponibilidade garantida.
            </Typography>
            <Button variant="outlined" onClick={openCareWhatsApp}>
              Consultar informações CARE (WhatsApp)
            </Button>
            <Typography variant="caption" display="block" sx={{ mt: 2 }}>
              Nenhuma informação sobre saúde ou mobilidade é preenchida automaticamente na mensagem.
            </Typography>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="Demonstração de corridas">
      <Alert severity="warning" sx={{ mb: 3 }}>
        DEMONSTRAÇÃO LOCAL: motoristas, preços, status e avaliações são fictícios.
        Nenhuma corrida é solicitada, nenhum pagamento é realizado e nenhum alerta é enviado.
      </Alert>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
        Simular corrida (sem solicitação real)
      </Typography>

      {/* Atalhos rápidos de serviço */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Atalhos rápidos
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant={serviceType === 'STANDARD_RIDE' ? 'contained' : 'outlined'}
              startIcon={<DirectionsCar />}
              onClick={() => setServiceType('STANDARD_RIDE')}
              disabled={rideStatus !== 'idle'}
            >
              Corrida Normal
            </Button>

            <Button
              variant={serviceType === 'TOUR_GUIDE' ? 'contained' : 'outlined'}
              onClick={() => setServiceType('TOUR_GUIDE')}
              disabled={rideStatus !== 'idle'}
            >
              🧭 Guia Turístico
            </Button>

            <Button
              variant={serviceType === 'ELDERLY_ASSISTANCE' ? 'contained' : 'outlined'}
              color="secondary"
              onClick={() => setServiceType('ELDERLY_ASSISTANCE')}
              disabled={rideStatus !== 'idle'}
            >
              🧓 CARE (Idosos/Consulta)
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Status da corrida ativa */}
      {rideStatus !== 'idle' && <RideStatusCard />}

      <FadeInCard>
        <Card sx={{ 
          mb: 3,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': rideStatus === 'idle' ? {
            boxShadow: '0 8px 25px rgba(0,0,0,0.12)'
          } : {}
        }}>
          <CardContent sx={{ p: 3 }}>
            {/* Origem */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
                  📍 Onde você está?
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={getCurrentLocation}
                  disabled={rideStatus !== 'idle'}
                  sx={{ 
                    ...premiumButtonStyles,
                    minWidth: 'auto',
                    px: 2
                  }}
                >
                  Localização Atual
                </Button>
              </Box>
              <AddressAutocomplete
                label="Endereço de origem"
                placeholder="Digite seu endereço atual"
                value={pickup}
                onChange={setPickup}
                onPlaceSelect={(place) => {
                  setPickup(place.address);
                  setPickupCoords({ lat: place.lat, lng: place.lng });
                }}
                icon={<MyLocation sx={{ color: 'primary.main' }} />}
                disabled={rideStatus !== 'idle'}
              />
            </Box>

            {/* Destino */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                🎯 Para onde vamos?
              </Typography>
              <AddressAutocomplete
                label="Endereço de destino"
                placeholder="Digite para onde você quer ir"
                value={destination}
                onChange={setDestination}
                onPlaceSelect={(place) => {
                  setDestination(place.address);
                  setDestinationCoords({ lat: place.lat, lng: place.lng });
                }}
                icon={<LocationOn sx={{ color: 'error.main' }} />}
                disabled={rideStatus !== 'idle'}
              />
            </Box>

            {/* Mapa */}
            {(pickupCoords || destinationCoords) && (
              <Box sx={{ mb: 3 }}>
                <MapComponent
                  pickup={pickupCoords}
                  destination={destinationCoords}
                  showDirections={!!(pickupCoords && destinationCoords)}
                />
              </Box>
            )}

            <Divider sx={{ my: 3 }} />

            {/* Tipo de Serviço */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                ✨ Escolha seu serviço
              </Typography>
              <FormControl fullWidth disabled={rideStatus !== 'idle'}>
                <InputLabel>Tipo de Serviço</InputLabel>
                <Select
                  value={serviceType}
                  label="Tipo de Serviço"
                  onChange={(e) => setServiceType(e.target.value)}
                >
                  {serviceOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Box>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {option.icon} {option.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* CARE - campos extras + WhatsApp */}
            {serviceType === 'ELDERLY_ASSISTANCE' && (
              <Card sx={{ mb: 3, border: '1px solid', borderColor: 'secondary.light' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                    🧓 CARE / Acompanhamento
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Para levar/ buscar em consulta, acompanhamento de idosos ou pessoas doentes.
                  </Typography>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={careNeedsEscort}
                        onChange={(e) => setCareNeedsEscort(e.target.checked)}
                      />
                    }
                    label="Preciso de acompanhante/ajuda no trajeto"
                    sx={{ mb: 1 }}
                  />

                  <TextField
                    label="Observações (opcional)"
                    placeholder="Ex.: retornar com receita, esperar na clínica, cadeira de rodas..."
                    value={careNotes}
                    onChange={(e) => setCareNotes(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                    sx={{ mb: 2 }}
                  />

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      color="secondary"
                      onClick={openCareWhatsApp}
                      disabled={rideStatus !== 'idle'}
                    >
                      Falar com agente (WhatsApp)
                    </Button>

                    <Button
                      variant="outlined"
                      onClick={handleRequestRide}
                      disabled={rideStatus !== 'idle'}
                    >
                      Solicitar corrida CARE
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Serviço Selecionado */}
            <Box sx={{ mb: 3, textAlign: 'center' }}>
              <Chip 
                label={`${selectedService?.icon} ${selectedService?.label}`}
                color={serviceType === 'STANDARD_RIDE' ? 'default' : 'primary'}
                size="large"
                sx={{ 
                  fontWeight: 600,
                  fontSize: '1rem',
                  py: 1
                }}
              />
            </Box>

            {/* Botão Solicitar */}
            <Button
              variant="contained"
              fullWidth
              size="large"
              startIcon={rideStatus === 'requesting' ? null : <DirectionsCar />}
              onClick={handleRequestRide}
              disabled={rideStatus !== 'idle' || !pickup || !destination}
              sx={{ 
                ...premiumButtonStyles,
                mb: 2,
                py: 2,
                fontSize: '1.1rem',
                fontWeight: 600,
                background: rideStatus === 'idle' 
                  ? 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)'
                  : undefined
              }}
            >
              {rideStatus === 'requesting' ? (
                <>
                  <CircularProgress size={24} sx={{ mr: 1, color: 'white' }} />
                  Buscando motorista KAVIAR...
                </>
              ) : (
                'Solicitar Corrida KAVIAR'
              )}
            </Button>
          </CardContent>
        </Card>
      </FadeInCard>

    </Layout>
  );
};

export default PassengerHome;
