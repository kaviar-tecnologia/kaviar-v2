import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Stack
} from '@mui/material';
import { LocationCity, Map } from '@mui/icons-material';
import api from '../../api';

// UF por cidade (rótulo). Novas cidades entram aqui conforme onboarding.
const CITY_UF = {
  'Rio de Janeiro': 'RJ',
  'São Paulo': 'SP',
  'Cariacica': 'ES',
};

export default function NeighborhoodsByCity() {
  const navigate = useNavigate();
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cityStats, setCityStats] = useState({});
  const [ratesConfig, setRatesConfig] = useState(null);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState('');

  useEffect(() => {
    loadData();
    loadRatesConfig();
  }, []);

  const loadRatesConfig = async () => {
    setRatesLoading(true);
    setRatesError('');
    try {
      const response = await api.get('/api/match/config');
      setRatesConfig(response.data || null);
    } catch (err) {
      console.error('❌ Rates config fetch error:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setRatesError('Sem permissão para carregar a configuração de taxas territoriais.');
      } else {
        setRatesError('Não foi possível carregar a configuração de taxas territoriais.');
      }
      setRatesConfig(null);
    } finally {
      setRatesLoading(false);
    }
  };

  const formatPercent = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return `${value.toFixed(2).replace('.', ',')}%`;
  };

  const loadData = async () => {
    try {
      const response = await api.get('/api/governance/neighborhoods');

      if (!response.data.success) {
        setError(response.data.error || 'Erro ao carregar bairros');
        return;
      }

      const data = response.data.data || [];
      setNeighborhoods(data);

      // Calcular stats direto da resposta — zero chamadas individuais
      const stats = {};
      data.forEach(n => {
        if (!n.city) return;
        if (!stats[n.city]) {
          stats[n.city] = { total: 0, withGeofence: 0, matchLocal: 0, matchBairro: 0 };
        }
        stats[n.city].total++;
        if (n.has_geofence) stats[n.city].withGeofence++;
        if (n.area_type === 'FAVELA' || n.area_type === 'COMUNIDADE') {
          stats[n.city].matchLocal++;
        } else if (n.area_type === 'BAIRRO_OFICIAL') {
          stats[n.city].matchBairro++;
        }
      });
      setCityStats(stats);
    } catch (err) {
      console.error('❌ Fetch error:', err);
      if (err.response?.status === 401) {
        setError('Token ausente ou inválido. Faça login novamente.');
      } else {
        setError('Erro de conexão com o servidor: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Carregando cidades...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const cities = Object.keys(cityStats).sort();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 'bold' }}>
        🗺️ Gestão Territorial por Cidade
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Total: {neighborhoods.length} áreas territoriais em {cities.length} cidades
      </Typography>

      <Card sx={{ mb: 3, border: '1px solid #E8E5DE' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Configuração de taxas territoriais
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Regras tarifárias globais de match territorial. Estes percentuais não representam desempenho de cada bairro.
          </Typography>

          {ratesLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Carregando configuração de taxas...
              </Typography>
            </Box>
          )}

          {!ratesLoading && ratesError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {ratesError}
            </Alert>
          )}

          {!ratesLoading && !ratesError && ratesConfig && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Chip label={`Match Local: ${formatPercent(ratesConfig.match_local_percent)}`} color="success" />
              <Chip label={`Match Bairro: ${formatPercent(ratesConfig.match_bairro_percent)}`} color="primary" />
              <Chip label={`Match Externo: ${formatPercent(ratesConfig.match_externo_percent)}`} color="warning" />
            </Stack>
          )}

          {!ratesLoading && !ratesError && !ratesConfig && (
            <Alert severity="info">Configuração de taxas indisponível no momento.</Alert>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {cities.map(city => {
          const stats = cityStats[city];

          return (
            <Grid item xs={12} sm={6} md={4} key={city}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 6
                  }
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <LocationCity sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                        {city}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {CITY_UF[city] || ''}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="h3" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      {stats.total}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      áreas territoriais cadastradas
                    </Typography>
                    {stats.withGeofence > 0 && (
                      <Typography variant="caption" color="success.main">
                        {stats.withGeofence} com geofence
                      </Typography>
                    )}
                    {stats.withGeofence === 0 && (
                      <Typography variant="caption" color="warning.main">
                        ⚠️ Sem geofences cadastradas
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
                      Cobertura de geofence: {stats.withGeofence} de {stats.total} — {stats.total > 0 ? Math.round((stats.withGeofence / stats.total) * 100) : 0}%
                    </Typography>
                  </Box>

                  <Button
                    variant="contained"
                    fullWidth
                    startIcon={<Map />}
                    onClick={() => navigate(`/admin/neighborhoods?city=${encodeURIComponent(city)}`)}
                  >
                    Ver Bairros
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {cities.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            Nenhuma cidade cadastrada ainda
          </Typography>
        </Box>
      )}
    </Box>
  );
}
