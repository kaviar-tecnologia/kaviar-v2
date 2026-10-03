import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../api';

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'VERIFIED', label: 'Verificado' },
  { value: 'REJECTED', label: 'Rejeitado' },
  { value: 'SUSPENDED', label: 'Suspenso' },
  { value: 'EXPIRED', label: 'Expirado' },
];

const statusColor = (status) => {
  if (status === 'VERIFIED') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'REJECTED' || status === 'SUSPENDED' || status === 'EXPIRED') return 'error';
  return 'default';
};

const emptyQualification = {
  status: 'PENDING',
  assisted_training_verified: false,
  folding_training_verified: false,
  adapted_training_verified: false,
  valid_until: '',
};

const emptyVehicle = {
  status: 'PENDING',
  folding_storage_verified: false,
  ramp_or_lift_verified: false,
  wheelchair_restraint_verified: false,
  occupant_restraint_verified: false,
  adaptation_document_verified: false,
  wheelchair_capacity: 0,
  companion_seats: 0,
  inspection_valid_until: '',
};

const getAdminData = () => {
  try {
    return JSON.parse(localStorage.getItem('kaviar_admin_data') || '{}');
  } catch {
    return {};
  }
};

const isSuperAdmin = () => getAdminData()?.role === 'SUPER_ADMIN';

const toDateInput = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const toDateTimeOrNull = (value) => {
  if (!value) return null;
  return new Date(`${value}T23:59:59.000Z`).toISOString();
};

const bool = (value) => Boolean(value);

export function DriverCareCapabilitiesCard({ driverId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [note, setNote] = useState('');
  const [officialCareEnabled, setOfficialCareEnabled] = useState(false);
  const [driver, setDriver] = useState(null);
  const [qualification, setQualification] = useState(emptyQualification);
  const [vehicle, setVehicle] = useState(emptyVehicle);

  const canEdit = isSuperAdmin();

  useEffect(() => {
    loadCareCapabilities();
  }, [driverId]);

  const normalizeQualification = (data) => ({
    status: data?.status || 'PENDING',
    assisted_training_verified: bool(data?.assisted_training_verified),
    folding_training_verified: bool(data?.folding_training_verified),
    adapted_training_verified: bool(data?.adapted_training_verified),
    valid_until: toDateInput(data?.valid_until),
  });

  const normalizeVehicle = (data) => ({
    status: data?.status || 'PENDING',
    folding_storage_verified: bool(data?.folding_storage_verified),
    ramp_or_lift_verified: bool(data?.ramp_or_lift_verified),
    wheelchair_restraint_verified: bool(data?.wheelchair_restraint_verified),
    occupant_restraint_verified: bool(data?.occupant_restraint_verified),
    adaptation_document_verified: bool(data?.adaptation_document_verified),
    wheelchair_capacity: Number(data?.wheelchair_capacity || 0),
    companion_seats: Number(data?.companion_seats || 0),
    inspection_valid_until: toDateInput(data?.inspection_valid_until),
  });

  const loadCareCapabilities = async () => {
    try {
      setLoading(true);
      setMessage(null);

      const { data } = await api.get(`/api/admin/drivers/${driverId}/care-capabilities`);

      if (!data.success) {
        throw new Error(data.error || 'Erro ao carregar capacidades CARE');
      }

      setDriver(data.data.driver || null);
      setQualification(normalizeQualification(data.data.qualification));
      setVehicle(normalizeVehicle(data.data.vehicle));
      setOfficialCareEnabled(Boolean(data.data.officialCareEnabled));
      setNote(data.data.note || '');
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Erro ao carregar capacidades CARE',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateQualification = (field, value) => {
    setQualification((current) => ({ ...current, [field]: value }));
  };

  const updateVehicle = (field, value) => {
    setVehicle((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const payload = {
        qualification: {
          status: qualification.status,
          assisted_training_verified: Boolean(qualification.assisted_training_verified),
          folding_training_verified: Boolean(qualification.folding_training_verified),
          adapted_training_verified: Boolean(qualification.adapted_training_verified),
          valid_until: toDateTimeOrNull(qualification.valid_until),
        },
        vehicle: {
          status: vehicle.status,
          folding_storage_verified: Boolean(vehicle.folding_storage_verified),
          ramp_or_lift_verified: Boolean(vehicle.ramp_or_lift_verified),
          wheelchair_restraint_verified: Boolean(vehicle.wheelchair_restraint_verified),
          occupant_restraint_verified: Boolean(vehicle.occupant_restraint_verified),
          adaptation_document_verified: Boolean(vehicle.adaptation_document_verified),
          wheelchair_capacity: Number(vehicle.wheelchair_capacity || 0),
          companion_seats: Number(vehicle.companion_seats || 0),
          inspection_valid_until: toDateTimeOrNull(vehicle.inspection_valid_until),
        },
      };

      const { data } = await api.patch(`/api/admin/drivers/${driverId}/care-capabilities`, payload);

      if (!data.success) {
        throw new Error(data.error || 'Erro ao salvar capacidades CARE');
      }

      setQualification(normalizeQualification(data.data.qualification));
      setVehicle(normalizeVehicle(data.data.vehicle));
      setOfficialCareEnabled(Boolean(data.data.officialCareEnabled));
      setNote(data.data.note || '');
      setMessage({ type: 'success', text: 'Capacidades CARE salvas sem habilitar CARE oficial.' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Erro ao salvar capacidades CARE',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="CARE — Capacidades administrativas"
        subheader="Preparação oficial: não libera despacho, preço, aceite ou reserva CARE."
        action={
          <Chip
            label={officialCareEnabled ? 'CARE oficial ativo' : 'CARE oficial bloqueado'}
            color={officialCareEnabled ? 'error' : 'default'}
            variant={officialCareEnabled ? 'filled' : 'outlined'}
          />
        }
      />
      <CardContent>
        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight={700}>
            Cadastro preparatório apenas.
          </Typography>
          <Typography variant="body2">
            Não habilita CARE_ASSISTED, não altera dispatcher, não altera pricing e não altera aceite do motorista.
          </Typography>
          {note && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              Backend: {note}
            </Typography>
          )}
        </Alert>

        {driver && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Motorista: <strong>{driver.name || driver.id}</strong>
              {driver.vehicle_plate ? ` • Placa atual: ${driver.vehicle_plate}` : ''}
            </Typography>
          </Box>
        )}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="h6">Qualificação do motorista</Typography>
              <Chip size="small" label={qualification.status} color={statusColor(qualification.status)} />
            </Box>

            <TextField
              select
              fullWidth
              size="small"
              label="Status"
              value={qualification.status}
              disabled={!canEdit || saving}
              onChange={(e) => updateQualification('status', e.target.value)}
              sx={{ mb: 2 }}
            >
              {STATUS_OPTIONS.map((item) => (
                <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
              ))}
            </TextField>

            <FormControlLabel
              control={
                <Checkbox
                  checked={qualification.assisted_training_verified}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateQualification('assisted_training_verified', e.target.checked)}
                />
              }
              label="Treinamento de acompanhamento simples verificado"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={qualification.folding_training_verified}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateQualification('folding_training_verified', e.target.checked)}
                />
              }
              label="Treinamento para cadeira dobrável verificado"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={qualification.adapted_training_verified}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateQualification('adapted_training_verified', e.target.checked)}
                />
              }
              label="Treinamento para veículo adaptado verificado"
            />

            <TextField
              fullWidth
              size="small"
              type="date"
              label="Válido até"
              value={qualification.valid_until}
              disabled={!canEdit || saving}
              onChange={(e) => updateQualification('valid_until', e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 1 }}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="h6">Capacidade do veículo</Typography>
              <Chip size="small" label={vehicle.status} color={statusColor(vehicle.status)} />
            </Box>

            <TextField
              select
              fullWidth
              size="small"
              label="Status"
              value={vehicle.status}
              disabled={!canEdit || saving}
              onChange={(e) => updateVehicle('status', e.target.value)}
              sx={{ mb: 2 }}
            >
              {STATUS_OPTIONS.map((item) => (
                <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
              ))}
            </TextField>

            <FormControlLabel
              control={
                <Checkbox
                  checked={vehicle.folding_storage_verified}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateVehicle('folding_storage_verified', e.target.checked)}
                />
              }
              label="Porta-malas para cadeira dobrável verificado"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={vehicle.ramp_or_lift_verified}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateVehicle('ramp_or_lift_verified', e.target.checked)}
                />
              }
              label="Rampa ou elevador verificado"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={vehicle.wheelchair_restraint_verified}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateVehicle('wheelchair_restraint_verified', e.target.checked)}
                />
              }
              label="Fixação de cadeira de rodas verificada"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={vehicle.occupant_restraint_verified}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateVehicle('occupant_restraint_verified', e.target.checked)}
                />
              }
              label="Cinto/retenção do ocupante verificado"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={vehicle.adaptation_document_verified}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateVehicle('adaptation_document_verified', e.target.checked)}
                />
              }
              label="Documento de adaptação verificado"
            />

            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Capacidade cadeiras"
                  value={vehicle.wheelchair_capacity}
                  disabled={!canEdit || saving}
                  inputProps={{ min: 0, max: 8 }}
                  onChange={(e) => updateVehicle('wheelchair_capacity', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Assentos acompanhante"
                  value={vehicle.companion_seats}
                  disabled={!canEdit || saving}
                  inputProps={{ min: 0, max: 32 }}
                  onChange={(e) => updateVehicle('companion_seats', e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Inspeção válida até"
                  value={vehicle.inspection_valid_until}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateVehicle('inspection_valid_until', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">
            {canEdit
              ? 'Somente SUPER_ADMIN pode salvar alterações.'
              : 'Seu perfil pode visualizar, mas não editar estas capacidades.'}
          </Typography>

          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!canEdit || saving}
          >
            {saving ? 'Salvando...' : 'Salvar capacidades CARE'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
