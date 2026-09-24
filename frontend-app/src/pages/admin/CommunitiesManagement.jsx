import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Switch,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel
} from '@mui/material';
import Map from '@mui/icons-material/Map';
import Visibility from '@mui/icons-material/Visibility';
import LocationCity from '@mui/icons-material/LocationCity';
import WarningAmber from '@mui/icons-material/WarningAmber';
import LeafletGeofenceMap from '../../components/maps/LeafletGeofenceMap';


export default function CommunitiesManagement() {
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [healthData, setHealthData] = useState({});
  const [reactivating, setReactivating] = useState(null);
  const [reactivateMsg, setReactivateMsg] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, community: null });
  const [mapDialog, setMapDialog] = useState({ open: false, community: null });
  const [createDialog, setCreateDialog] = useState({ open: false });
  const [newCommunity, setNewCommunity] = useState({ name: '', isActive: true });
  const [editMode, setEditMode] = useState(false);
  const [editedGeofence, setEditedGeofence] = useState(null);
  const [saving, setSaving] = useState(false);
  const [centerMode, setCenterMode] = useState(false);
  const [centerCandidate, setCenterCandidate] = useState(null);
  const [showOnlyWithMap, setShowOnlyWithMap] = useState(false);
  const adminRole = JSON.parse(localStorage.getItem('kaviar_admin_data') || '{}')?.role;
  const canAccessCommunityLeaders = ['SUPER_ADMIN', 'OPERATOR', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR'].includes(adminRole);

  useEffect(() => {
    fetchCommunities();
  }, []);

  const loadHealth = async (communityIds) => {
    const results = {};
    await Promise.all(communityIds.map(async (id) => {
      try {
        const { data } = await api.get(`/api/admin/communities/${id}/health`);
        if (data.success) results[id] = data.data;
      } catch { /* ignore */ }
    }));
    setHealthData(results);
  };

  const handleReactivate = async (id) => {
    setReactivating(id);
    setReactivateMsg('');
    try {
      const { data } = await api.post(`/api/admin/communities/${id}/reactivate-drivers`);
      if (data.success) {
        setReactivateMsg(`✅ ${data.data.sent} motorista(s) reativado(s), ${data.data.skipped} ignorado(s).`);
        loadHealth([id]);
      } else {
        setReactivateMsg(`⚠️ ${data.error}`);
      }
    } catch (err) {
      setReactivateMsg(`⚠️ ${err.response?.data?.error || 'Erro ao reativar.'}`);
    } finally {
      setReactivating(null);
    }
  };

  const fetchCommunities = async () => {
    try {
      // CORREÇÃO: Usar endpoint governance (IDs canônicos) em vez de admin
      // Motivo: admin tem bug na deduplicação, retorna IDs sem geofence
      const response = await api.get('/api/governance/communities');

      if (response.data.success) {
        // Transformar dados do governance para formato esperado pela UI admin
        const transformedData = response.data.data.map(community => ({
          ...community,
          // Adicionar campos esperados pela UI admin (com valores padrão)
          stats: {
            activeDrivers: 0,
            premiumDrivers: 0,
            activePassengers: 0,
            activeGuides: 0,
            canActivate: true, // Assumir que pode ativar (governance só lista ativos)
            minRequired: 3
          },
          isActive: true // Governance só retorna ativos
        }));
        setCommunities(transformedData);
        loadHealth(transformedData.map(c => c.id));
      } else {
        setError(response.data.error || 'Erro ao carregar comunidades');
      }
    } catch (error) {
      console.error('Erro ao carregar comunidades:', error);
      if (error.response?.status === 401) {
        setError('Token ausente ou inválido. Faça login novamente.');
      } else {
        setError('Erro de conexão');
      }
    } finally {
      setLoading(false);
    }
  };

  const createCommunity = async () => {
    if (!newCommunity.name.trim()) return;

    setSaving(true);
    try {
      // NOTA: Criação ainda usa endpoint admin (requer auth)
      // Apenas a listagem foi movida para governance
      const token = localStorage.getItem('kaviar_admin_token');
      const response = await fetch(`${API_BASE_URL}/api/admin/communities`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newCommunity.name.trim(),
          isActive: newCommunity.isActive
        })
      });

      if (response.status === 401) {
        localStorage.removeItem('kaviar_admin_token');
        // redirect removido — ProtectedAdminRoute cuida
        return;
      }

      const data = await response.json();
      if (data.success) {
        const created = data?.data;
        if (!created?.id) {
          throw new Error("Create community: resposta sem data.id");
        }

        await fetchCommunities();
        setCreateDialog({ open: false });
        setNewCommunity({ name: '', isActive: true });
        
        // Auto-abrir mapa do bairro recém-criado com guard
        setTimeout(() => {
          if (created.id) {
            openMapDialog(created);
          }
        }, 500);
      } else {
        setError(data.message || 'Erro ao criar comunidade');
      }
    } catch (error) {
      setError('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (community) => {
    try {
      const token = localStorage.getItem('kaviar_admin_token');
      const response = await fetch(`${API_BASE_URL}/api/admin/communities/${community.id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        localStorage.removeItem('kaviar_admin_token');
        // redirect removido — ProtectedAdminRoute cuida
        return;
      }

      const data = await response.json();
      if (data.success) {
        fetchCommunities(); // Recarregar lista
        setConfirmDialog({ open: false, community: null });
      } else {
        setError(data.error || 'Erro ao alterar status da comunidade');
      }
    } catch (error) {
      setError('Erro de conexão');
    }
  };

  const openMapDialog = async (community) => {
    try {
      // Buscar dados completos do geofence da API
      console.log("[MAP DIAGNOSTIC] fetching geofence", `/api/governance/communities/${community.id}/geofence`);
      const response = await api.get(`/api/governance/communities/${community.id}/geofence`);

      if (response.data.success && response.data.data?.geometry) {
        const geofenceData = response.data.data;
        const geometryType = geofenceData.geometry.type;
        
        // Atualizar status da comunidade localmente
        setCommunities(prev => prev.map(c => 
          c.id === community.id 
            ? { ...c, geofenceStatus: geometryType }
            : c
        ));
        
        // Transformar para o formato esperado pelo componente
        const communityForMap = {
          ...community,
          geometry: geofenceData.geometry,
          centerLat: geofenceData.centerLat || community.center_lat,
          centerLng: geofenceData.centerLng || community.center_lng,
          radiusMeters: geofenceData.radiusMeters || community.radius_meters,
          geofence: null
        };
        
        setMapDialog({ open: true, community: communityForMap });
      } else {
        // SEM DADOS ou dados inválidos
        console.log(`📍 [MAP DIAGNOSTIC] Community ${community.name}: SEM DADOS`);
        
        setCommunities(prev => prev.map(c => 
          c.id === community.id 
            ? { ...c, geofenceStatus: 'SEM_DADOS' }
            : c
        ));
        
        setMapDialog({ 
          open: true, 
          community: {
            ...community,
            geometry: null, geofence: null, hasNoGeofence: true,
            centerLat: community.center_lat,
            centerLng: community.center_lng,
            radiusMeters: community.radius_meters,
          }
        });
      }
    } catch (error) {
      console.error('Erro ao buscar geofence:', error);
      
      if (error.response?.status === 401) {
        setError('Sessão expirada. Faça login novamente.');
        return;
      }
      
      // Fallback para outros erros
      setMapDialog({ 
        open: true, 
        community: { ...community, geometry: null, geofence: null, centerLat: community.center_lat, centerLng: community.center_lng, radiusMeters: community.radius_meters }
      });
    }
  };

  const closeMapDialog = () => {
    setMapDialog({ open: false, community: null });
    setEditMode(false);
    setEditedGeofence(null);
    setCenterMode(false);
    setCenterCandidate(null);
  };

  const handleGeofenceChange = (geofence) => {
    setEditedGeofence(geofence);
  };

  const handleCenterChange = (center) => {
    setCenterCandidate(center);
  };

  const saveGeofence = async () => {
    if (!mapDialog.community) return;

    setSaving(true);
    try {
      const payload = {};
      
      if (editedGeofence !== null) {
        payload.geofence = editedGeofence;
      }
      
      if (centerCandidate) {
        payload.centerLat = centerCandidate.lat;
        payload.centerLng = centerCandidate.lng;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/communities/${mapDialog.community.id}/geofence`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('kaviar_admin_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        localStorage.removeItem('kaviar_admin_token');
        // redirect removido — ProtectedAdminRoute cuida
        return;
      }

      if (!response.ok) throw new Error('Erro ao salvar');

      const data = await response.json();
      
      // Atualizar lista de comunidades
      fetchCommunities();
      
      // Fechar modal
      closeMapDialog();
      
      setError('');
    } catch (err) {
      setError('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const clearGeofence = () => {
    setEditedGeofence(null);
  };

  const clearCenter = () => {
    setCenterCandidate(null);
  };

  const openConfirmDialog = (community) => {
    setConfirmDialog({ open: true, community });
  };

  const getStatusColor = (isActive, canActivate) => {
    if (isActive) return 'success';
    if (canActivate) return 'warning';
    return 'error';
  };

  const getStatusText = (isActive, canActivate) => {
    if (isActive) return 'Ativo';
    if (canActivate) return 'Inativo';
    return 'Bloqueado';
  };

  const getGeofenceStatus = (community) => {
    if (community.geofenceStatus === 'SEM_DADOS') return 'SEM DADOS';
    if (community.geofenceStatus === 'Polygon' || community.geofenceStatus === 'MultiPolygon') return community.geofenceStatus;
    if (community.geofenceStatus === 'Point' || community.geofenceStatus === 'LineString') return community.geofenceStatus;
    return 'Verificar mapa';
  };

  const getGeofenceColor = (community) => {
    if (community.geofenceStatus === 'SEM_DADOS') return 'error';
    if (community.geofenceStatus === 'Polygon' || community.geofenceStatus === 'MultiPolygon') return 'success';
    if (community.geofenceStatus === 'Point' || community.geofenceStatus === 'LineString') return 'warning';
    return 'default';
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Carregando comunidades...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Gerenciamento de Comunidades
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Switch
                checked={showOnlyWithMap}
                onChange={(e) => setShowOnlyWithMap(e.target.checked)}
              />
            }
            label="Mostrar apenas com mapa"
          />
          {canAccessCommunityLeaders && (
            <Button
              variant="outlined"
              component={Link}
              to="/admin/community-leaders"
            >
              Lideranças Comunitárias
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<LocationCity />}
            onClick={() => setCreateDialog({ open: true })}
          >
            Criar nova comunidade
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {communities.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <LocationCity sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Nenhuma comunidade cadastrada
          </Typography>
          <Typography variant="body2" color="text.secondary">
            As comunidades aparecerão aqui quando forem importadas no sistema.
          </Typography>
        </Box>
      )}

      {reactivateMsg && <Alert severity={reactivateMsg.startsWith('✅') ? 'success' : 'warning'} sx={{ mb: 2 }} onClose={() => setReactivateMsg('')}>{reactivateMsg}</Alert>}
      <Grid container spacing={3}>
        {/* 
        ✅ CHECK 3 - AUDIT DO HANDLER:
        - onClick usa openMapDialog(community) com row vindo da própria linha ✓
        - key={community.id} (nunca index) ✓  
        - Não há uso de index/array externo ✓
        - Não há busca por substring/includes ✓
        */}
        {communities
          .filter(community => !showOnlyWithMap || community.geofenceStatus !== 'SEM_DADOS')
          .map((community) => (
          <Grid item xs={12} md={6} lg={4} key={community.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <LocationCity sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                    {community.name}
                  </Typography>
                </Box>

                <Chip
                  label={getStatusText(community.isActive, community.stats.canActivate)}
                  color={getStatusColor(community.isActive, community.stats.canActivate)}
                  sx={{ mb: 2 }}
                />

                {/* Badge de Status do Geofence */}
                <Box sx={{ mb: 2 }}>
                  <Chip
                    label={getGeofenceStatus(community)}
                    color={getGeofenceColor(community)}
                    size="small"
                    variant="outlined"
                  />
                </Box>

                {/* Estatísticas */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Motoristas ativos: <strong>{community.stats.activeDrivers}</strong>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Motoristas premium: <strong>{community.stats.premiumDrivers}</strong>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Passageiros: <strong>{community.stats.activePassengers}</strong>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Guias turísticos: <strong>{community.stats.activeGuides}</strong>
                  </Typography>
                </Box>

                {/* Critério de ativação */}
                <Box sx={{ mb: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Critério mínimo: {community.stats.minRequired} motoristas
                  </Typography>
                  {!community.stats.canActivate && (
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                      <WarningAmber sx={{ fontSize: 16, color: 'warning.main', mr: 0.5 }} />
                      <Typography variant="caption" color="warning.main">
                        Não pode ativar: poucos motoristas
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Saúde da Região */}
                {healthData[community.id] && (() => {
                  const h = healthData[community.id];
                  const healthColor = h.health === 'active' ? 'success' : h.health === 'weak' ? 'warning' : 'info';
                  const healthLabel = h.health === 'active' ? 'Ativa' : h.health === 'weak' ? 'Fraca' : 'Em formação';
                  return (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f8f9fa', borderRadius: 1, border: '1px solid #e0e0e0' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#555' }}>Saúde da Região</Typography>
                        <Chip label={healthLabel} color={healthColor} size="small" />
                      </Box>
                      <Typography variant="caption" display="block" color="text.secondary">
                        Online agora: <strong>{h.driversOnline}</strong> / {h.driversTotal} motoristas
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        Inativos &gt;7d: <strong>{h.driversInactive7d}</strong>
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        Corridas 7d: <strong>{h.ridesCompleted7d}</strong> concluídas, <strong>{h.ridesNoDriver7d}</strong> sem motorista
                      </Typography>
                      {h.driversInactive7d > 0 && (
                        <Button
                          size="small"
                          variant="outlined"
                          sx={{ mt: 1, fontSize: '0.7rem' }}
                          disabled={reactivating === community.id}
                          onClick={() => handleReactivate(community.id)}
                        >
                          {reactivating === community.id ? '⏳ Enviando...' : `Reativar ${h.driversInactive7d} inativo(s)`}
                        </Button>
                      )}
                    </Box>
                  );
                })()}

                {/* Controles */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Botão Ver no Mapa */}
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Map />}
                    onClick={() => {
                      console.log("[MAP DIAGNOSTIC] clicked row", { name: community.name, id: community.id });
                      openMapDialog(community);
                    }}
                    fullWidth
                  >
                    Ver no Mapa
                  </Button>

                  {/* Switch de Ativação - DESABILITADO: governance só mostra ativos */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">
                      Ativo (governance)
                    </Typography>
                    <Switch
                      checked={true}
                      disabled={true}
                    />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Dialog de Confirmação */}
      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, community: null })}
      >
        <DialogTitle>
          Confirmar alteração
        </DialogTitle>
        <DialogContent>
          <Typography>
            Tem certeza que deseja {confirmDialog.community?.isActive ? 'desativar' : 'ativar'} a comunidade{' '}
            <strong>{confirmDialog.community?.name}</strong>?
          </Typography>
          {confirmDialog.community && !confirmDialog.community.isActive && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Esta comunidade será ativada e ficará disponível para operação.
            </Alert>
          )}
          {confirmDialog.community?.isActive && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Esta comunidade será desativada e não receberá novas corridas.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, community: null })}>
            Cancelar
          </Button>
          <Button
            onClick={() => handleToggleStatus(confirmDialog.community)}
            variant="contained"
            color={confirmDialog.community?.isActive ? 'warning' : 'primary'}
          >
            {confirmDialog.community?.isActive ? 'Desativar' : 'Ativar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog do Mapa */}
      <Dialog
        open={mapDialog.open}
        onClose={closeMapDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Map sx={{ mr: 1 }} />
              Mapa da Comunidade: {mapDialog.community?.name}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editMode}
                    onChange={(e) => setEditMode(e.target.checked)}
                  />
                }
                label="Editar"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={centerMode}
                    onChange={(e) => setCenterMode(e.target.checked)}
                  />
                }
                label="Centro"
              />
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {/* Diagnóstico técnico */}
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <Typography variant="caption" component="div">
              🗺️ <strong>Provider:</strong> Leaflet + OpenStreetMap<br/>
              📍 <strong>Community:</strong> {mapDialog.community?.name} ({mapDialog.community?.id?.substring(0, 8)}...)<br/>
              📏 <strong>Centro:</strong> {mapDialog.community?.centerLat}, {mapDialog.community?.centerLng} | Raio: {mapDialog.community?.radiusMeters}m
            </Typography>
          </Alert>

          {mapDialog.community?.hasNoGeofence && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                ⚠️ <strong>Sem dados de cerca ainda</strong><br/>
                Esta comunidade não possui dados de geofence cadastrados.
                {mapDialog.community?.centerLat && mapDialog.community?.centerLng && 
                  ' Será exibido apenas o marcador do centro.'}
              </Typography>
            </Alert>
          )}

          {editMode && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                🖊️ Modo edição ativo. Use as ferramentas do mapa para desenhar ou editar o polígono.
              </Typography>
            </Alert>
          )}

          {centerMode && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                📍 Modo centro ativo. Clique no mapa para definir o centro da comunidade.
              </Typography>
            </Alert>
          )}
          
          {mapDialog.community ? (
            <Box sx={{ height: 400, width: '100%' }}>
              <LeafletGeofenceMap
                communities={[mapDialog.community]}
                selectedCommunity={mapDialog.community}
                showGeofenceValidation={false}
                editMode={editMode}
                onGeofenceChange={handleGeofenceChange}
                showSearch={true}
                onCenterChange={centerMode ? handleCenterChange : null}
              />
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          {editMode || centerMode ? (
            <>
              {editMode && (
                <Button onClick={clearGeofence} color="warning">
                  Limpar Polígono
                </Button>
              )}
              {centerMode && (
                <Button onClick={clearCenter} color="warning">
                  Limpar Centro
                </Button>
              )}
              <Button onClick={closeMapDialog}>
                Cancelar
              </Button>
              <Button 
                onClick={saveGeofence} 
                variant="contained"
                disabled={saving || (!editedGeofence && !centerCandidate)}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          ) : (
            <Button onClick={closeMapDialog}>
              Fechar
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Create Community Dialog */}
      <Dialog open={createDialog.open} onClose={() => setCreateDialog({ open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>Criar Nova Comunidade</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nome da Comunidade"
            fullWidth
            variant="outlined"
            value={newCommunity.name}
            onChange={(e) => setNewCommunity({ ...newCommunity, name: e.target.value })}
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={newCommunity.isActive}
                onChange={(e) => setNewCommunity({ ...newCommunity, isActive: e.target.checked })}
              />
            }
            label="Ativo"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog({ open: false })}>
            Cancelar
          </Button>
          <Button 
            onClick={createCommunity} 
            variant="contained"
            disabled={saving || !newCommunity.name.trim()}
          >
            {saving ? 'Criando...' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
