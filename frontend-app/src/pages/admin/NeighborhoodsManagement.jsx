import { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Typography, 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableRow, 
  CircularProgress,
  Alert,
  Paper,
  Chip,
  Grid,
  Button,
  Breadcrumbs,
  Link
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api';
import LeafletGeofenceMap from '../../components/maps/LeafletGeofenceMap';
import {
  getCityCenter,
  isCompatibleWithCity,
  normalizeGeofenceGeometry,
  shouldFetchGeofence
} from './neighborhoodsGeofenceUtils';

export default function NeighborhoodsManagement() {
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState(null);
  const [geofence, setGeofence] = useState(null);
  const [geofenceLoading, setGeofenceLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedCity = searchParams.get('city') || 'Rio de Janeiro';
  const requestIdRef = useRef(0);

  useEffect(() => {
    fetchNeighborhoods();
  }, []);

  const fetchNeighborhoods = async () => {
    try {
      const response = await api.get('/api/governance/neighborhoods');
      
      console.log('Neighborhoods API response:', response.data);
      
      if (response.data.success) {
        const neighborhoodsData = response.data.data || [];
        setNeighborhoods(neighborhoodsData);
      } else {
        setError(response.data.error || 'Erro ao carregar bairros');
      }
    } catch (err) {
      console.error('Error fetching neighborhoods:', err);
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectNeighborhood = async (neighborhood) => {
    const requestId = ++requestIdRef.current;
    setSelectedNeighborhood(neighborhood);
    setGeofence(null);
    setGeofenceLoading(true);

    if (!shouldFetchGeofence(neighborhood)) {
      if (requestId === requestIdRef.current) {
        setGeofence('NO_GEOMETRY');
        setGeofenceLoading(false);
      }
      return;
    }
    
    try {
      const response = await api.get(`/api/governance/neighborhoods/${neighborhood.id}/geofence`);

      if (requestId !== requestIdRef.current) return;
      
      const rawGeometry = response.data?.data?.coordinates;
      if (response.data.success && rawGeometry != null) {
        // Normaliza aceitando array legado OU objeto GeoJSON (Polygon/MultiPolygon).
        const geometry = normalizeGeofenceGeometry(rawGeometry);
        if (!geometry) {
          setGeofence('INVALID_GEOMETRY');
          return;
        }

        if (!isCompatibleWithCity(geometry, selectedCity)) {
          setGeofence('INCOMPATIBLE_CITY_GEOMETRY');
          return;
        }

        setGeofence(geometry);
      } else {
        setGeofence('NO_GEOMETRY');
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      console.error('Erro ao carregar geofence:', err);
      const status = err.response?.status;
      if (status === 401) {
        setGeofence('AUTH_ERROR');
      } else if (status === 403) {
        setGeofence('FORBIDDEN');
      } else if (status === 429) {
        setGeofence('RATE_LIMITED');
      } else {
        setGeofence('NETWORK_ERROR');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setGeofenceLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Carregando bairros...</Typography>
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

  const filteredNeighborhoods = neighborhoods.filter(n => n.city === selectedCity);
  // Geometria renderável = Polygon ou MultiPolygon já normalizado.
  const hasRenderableGeometry = geofence?.type === 'Polygon' || geofence?.type === 'MultiPolygon';
  
  console.log('🔍 Debug Neighborhoods:', {
    total: neighborhoods.length,
    selectedCity,
    filtered: filteredNeighborhoods.length,
    cities: [...new Set(neighborhoods.map(n => n.city))]
  });

  const getMatchType = (neighborhood) => {
    switch (neighborhood.area_type) {
      case 'BAIRRO_OFICIAL':
        return { label: 'Bairro oficial', color: 'primary' };
      case 'FAVELA':
        return { label: 'Favela', color: 'warning' };
      case 'COMUNIDADE':
        return { label: 'Comunidade', color: 'success' };
      case 'DISTRITO':
        return { label: 'Distrito', color: 'secondary' };
      default:
        return { label: 'Tipo não definido', color: 'default' };
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/admin/neighborhoods-by-city')}
          sx={{ mb: 2 }}
        >
          Voltar para Cidades
        </Button>
        
        <Breadcrumbs>
          <Link 
            underline="hover" 
            color="inherit" 
            onClick={() => navigate('/admin/neighborhoods-by-city')}
            sx={{ cursor: 'pointer' }}
          >
            Cidades
          </Link>
          <Typography color="text.primary">{selectedCity}</Typography>
        </Breadcrumbs>
      </Box>

      <Typography variant="h4" gutterBottom>
        🗺️ {selectedCity}
      </Typography>
      
      <Typography variant="body2" sx={{ mb: 3, color: '#D1D5DB' }}>
        {filteredNeighborhoods.length} áreas territoriais cadastradas
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Nome</strong></TableCell>
                  <TableCell><strong>Tipo territorial</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredNeighborhoods.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} align="center" sx={{ py: 4 }}>
                      <Typography sx={{ color: '#CBD5E1' }}>
                        Nenhuma área territorial encontrada para {selectedCity}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredNeighborhoods.map((neighborhood) => {
                    const matchInfo = getMatchType(neighborhood);
                    return (
                    <TableRow 
                      key={neighborhood.id} 
                      hover
                      onClick={() => handleSelectNeighborhood(neighborhood)}
                      sx={{ 
                        cursor: 'pointer',
                        bgcolor: selectedNeighborhood?.id === neighborhood.id ? 'action.selected' : 'inherit'
                      }}
                    >
                      <TableCell>{neighborhood.name}</TableCell>
                      <TableCell>
                        <Chip 
                          label={matchInfo.label} 
                          size="small" 
                          color={matchInfo.color}
                        />
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 600, display: 'flex', flexDirection: 'column' }}>
            {selectedNeighborhood ? (
              <>
                <Typography variant="h6" gutterBottom>
                  {selectedNeighborhood.name}
                </Typography>
                <Typography variant="caption" sx={{ mb: 2, color: '#9CA3AF' }}>
                  {selectedCity}
                </Typography>
                <Box sx={{ height: 360, border: '1px solid #334155', borderRadius: 1, mb: 2 }}>
                  <LeafletGeofenceMap
                    geometry={hasRenderableGeometry ? geofence : null}
                    referenceCenter={getCityCenter(selectedCity)}
                    zoom={getCityCenter(selectedCity).zoom}
                    noGeofence={geofence !== null && geofence !== undefined && !hasRenderableGeometry}
                    selectedAreaId={selectedNeighborhood.id}
                    isVisible
                    height={360}
                  />
                </Box>
                {geofence === 'NO_GEOMETRY' ? (
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    height: '100%',
                    textAlign: 'center',
                    p: 3
                  }}>
                    <Typography variant="h6" color="warning.main" gutterBottom>
                      ⚠️ Geofence ainda não cadastrada
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, color: '#475569' }}>
                      Geofence ainda não cadastrada — mapa apenas para referência.
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748B' }}>
                      Centro exibido para {selectedCity}.
                    </Typography>
                  </Box>
                ) : geofence === 'INVALID_GEOMETRY' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', p: 3 }}>
                    <Typography variant="h6" color="warning.main" gutterBottom>
                      ⚠️ Geometria inválida
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#475569' }}>
                      Geometria oficial com formato inválido. Mapa centralizado na cidade.
                    </Typography>
                  </Box>
                ) : geofence === 'INCOMPATIBLE_CITY_GEOMETRY' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', p: 3 }}>
                    <Typography variant="h6" color="warning.main" gutterBottom>
                      ⚠️ Geometria incompatível com a cidade selecionada
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#475569' }}>
                      Geometria oficial ignorada para evitar desenho fora de {selectedCity}.
                    </Typography>
                  </Box>
                ) : geofence === 'AUTH_ERROR' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', p: 3 }}>
                    <Typography variant="h6" color="error.main" gutterBottom>
                      🔒 Sessão expirada
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#CBD5E1' }}>
                      Faça login novamente para visualizar a geometria.
                    </Typography>
                  </Box>
                ) : geofence === 'FORBIDDEN' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', p: 3 }}>
                    <Typography variant="h6" color="error.main" gutterBottom>
                      🚫 Sem permissão
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#475569' }}>
                      Seu perfil não possui acesso à geometria dos bairros.
                    </Typography>
                  </Box>
                ) : geofence === 'RATE_LIMITED' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', p: 3 }}>
                    <Typography variant="h6" color="warning.main" gutterBottom>
                      ⏳ Limite temporário atingido
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#CBD5E1' }}>
                      Tente novamente em alguns segundos.
                    </Typography>
                  </Box>
                ) : geofence === 'NETWORK_ERROR' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', p: 3 }}>
                    <Typography variant="h6" color="error.main" gutterBottom>
                      ❌ Não foi possível carregar a geometria
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#475569' }}>
                      Erro de conexão com o servidor. Tente novamente.
                    </Typography>
                  </Box>
                ) : hasRenderableGeometry ? (
                  <Typography variant="body2" sx={{ color: '#CBD5E1' }}>
                    Geofence oficial exibida no mapa.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
                    <CircularProgress />
                  </Box>
                )}
                {geofenceLoading && (
                  <Typography variant="caption" sx={{ color: '#94A3B8', mt: 1 }}>
                    Carregando geometria...
                  </Typography>
                )}
              </>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Typography sx={{ color: '#CBD5E1' }}>
                  Selecione um bairro para ver o mapa
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {neighborhoods.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Nenhuma área territorial cadastrada no sistema.
        </Alert>
      )}
    </Box>
  );
}
