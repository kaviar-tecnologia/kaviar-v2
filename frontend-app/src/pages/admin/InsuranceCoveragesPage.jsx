import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Refresh } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';

const PREVILEMOS_FACTS = [
  'Seguro APP contratado para início com carros.',
  'API homologada com inclusão e cancelamento validados.',
  'Backend da integração já implantado com proteção contra duplicidade e estados ambíguos.',
  'Cobertura mensal por placa, 24h por dia e 7 dias por semana.',
  'Capitais atuais: R$ 30 mil morte, R$ 30 mil invalidez e R$ 3 mil DMHO por ocupante.',
];

const RCF_FACTS = [
  'Cotação solicitada à Previlemos em 22/09/2026.',
  'Disponível para cotação em carros; motos não foram oferecidas neste momento.',
  'A cobertura é feita por seguradora distinta do APP.',
  'A mesma relação de veículos do APP pode ser reaproveitada no processo do RC.',
  'Ainda sem preço, apólice, endpoint/API ou ativação no sistema.',
];

const MODALITIES = [
  { value: 'CAR_PASSENGER', label: 'Carro Passageiro' },
  { value: 'MOTO_PASSENGER', label: 'Moto Passageiro' },
  { value: 'MOTO_DELIVERY', label: 'Moto Delivery' },
];

const COVERAGE_TYPES = [
  { value: 'APP', label: 'APP' },
  { value: 'RC_F', label: 'RC-F' },
  { value: 'PERSONAL_ACCIDENT', label: 'Acidente Pessoal' },
  { value: 'CARGO', label: 'Carga' },
  { value: 'OTHER', label: 'Outro' },
];

const STATUSES = [
  { value: 'DRAFT', label: 'Rascunho', color: '#6B7280' },
  { value: 'ACTIVE', label: 'Ativa', color: '#15803D' },
  { value: 'EXPIRED', label: 'Expirada', color: '#B91C1C' },
  { value: 'SUSPENDED', label: 'Suspensa', color: '#B45309' },
];

const DRIVER_INSURANCE_STATUSES = {
  PENDING: { label: 'Processando', color: '#B45309' },
  ACTIVE: { label: 'Ativo', color: '#15803D' },
  FAILED: { label: 'Falhou', color: '#B91C1C' },
  REVIEW: { label: 'Revisão necessária', color: '#7C3AED' },
  CANCELLING: { label: 'Cancelando', color: '#B45309' },
  CANCELLED: { label: 'Cancelado', color: '#6B7280' },
  CANCELLATION_REVIEW: { label: 'Revisar cancelamento', color: '#7C3AED' },
};

const emptyPrevilemosForm = {
  dataInicial: '',
  dataFinal: '',
  numPassageiro: '5',
  dataNascimento: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  marca: '',
  modelo: '',
  anoFabricacao: '',
  anoModelo: '',
  chassi: '',
  renavam: '',
  proprietario: '',
  cpfCnpjProprietario: '',
  confirmation: '',
};

const emptyForm = {
  territory_id: 'GLOBAL',
  modality: 'MOTO_PASSENGER',
  provider_name: '',
  policy_number: '',
  coverage_type: 'APP',
  coverage_description: '',
  coverage_amount_death: '',
  coverage_amount_disability: '',
  coverage_amount_medical: '',
  valid_from: '',
  valid_until: '',
  status: 'DRAFT',
  document_url: '',
  notes: '',
};

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

function modalityLabel(value) {
  return MODALITIES.find((m) => m.value === value)?.label || value;
}

function statusChip(value) {
  const cfg = STATUSES.find((s) => s.value === value) || { label: value, color: '#6B7280' };
  return (
    <Chip
      size="small"
      label={cfg.label}
      sx={{
        bgcolor: `${cfg.color}15`,
        color: cfg.color,
        border: `1px solid ${cfg.color}30`,
        fontWeight: 600,
      }}
    />
  );
}

function driverInsuranceStatusChip(value) {
  const cfg = DRIVER_INSURANCE_STATUSES[value] || { label: value || '-', color: '#6B7280' };
  return (
    <Chip
      size="small"
      label={cfg.label}
      sx={{
        bgcolor: `${cfg.color}15`,
        color: cfg.color,
        border: `1px solid ${cfg.color}35`,
        fontWeight: 700,
      }}
    />
  );
}

function certificateUrl(item) {
  const response = item?.providerResponse;
  const activation = response?.activation || response;
  return activation?.Links?.Certificado || activation?.Links?.Impressao || null;
}

function daysTo(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  const end = new Date(dateValue);
  const ms = end.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.floor(ms / 86400000);
}

function toPayload(form) {
  return {
    territory_id: form.territory_id === 'GLOBAL' ? null : form.territory_id,
    modality: form.modality,
    provider_name: form.provider_name.trim(),
    policy_number: form.policy_number.trim(),
    coverage_type: form.coverage_type,
    coverage_description: form.coverage_description.trim() || null,
    coverage_amount_death: form.coverage_amount_death === '' ? null : Number(form.coverage_amount_death),
    coverage_amount_disability: form.coverage_amount_disability === '' ? null : Number(form.coverage_amount_disability),
    coverage_amount_medical: form.coverage_amount_medical === '' ? null : Number(form.coverage_amount_medical),
    valid_from: form.valid_from,
    valid_until: form.valid_until,
    status: form.status,
    document_url: form.document_url.trim() || null,
    notes: form.notes.trim() || null,
  };
}

export default function InsuranceCoveragesPage() {
  const token = localStorage.getItem('kaviar_admin_token');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);
  const admin = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('kaviar_admin_data') || 'null');
    } catch {
      return null;
    }
  }, []);
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [list, setList] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState({ id: '', status: 'DRAFT', valid_until: '', document_url: '', notes: '' });

  const [previlemosDrivers, setPrevilemosDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [previlemosEnrollments, setPrevilemosEnrollments] = useState([]);
  const [previlemosLoading, setPrevilemosLoading] = useState(false);
  const [previlemosSubmitting, setPrevilemosSubmitting] = useState(false);
  const [openPrevilemosActivate, setOpenPrevilemosActivate] = useState(false);
  const [openPrevilemosCancel, setOpenPrevilemosCancel] = useState(false);
  const [previlemosForm, setPrevilemosForm] = useState(emptyPrevilemosForm);
  const [cancelForm, setCancelForm] = useState({ insuranceId: '', dataCancelamento: '', confirmation: '' });

  const selectedDriver = useMemo(
    () => previlemosDrivers.find((driver) => driver.id === selectedDriverId) || null,
    [previlemosDrivers, selectedDriverId],
  );

  const territoryOptions = useMemo(() => {
    const fromReadiness = readiness?.territories || [];
    return [{ id: 'GLOBAL', name: 'GLOBAL (todas as operações)' }, ...fromReadiness.map((t) => ({ id: t.id, name: t.name }))];
  }, [readiness]);

  const fetchAll = async () => {
    setLoading(true);
    setFeedback({ type: '', message: '' });
    try {
      const [listRes, readinessRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/insurance-coverages`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/insurance-coverages/readiness`, { headers }),
      ]);
      const [listJson, readinessJson] = await Promise.all([listRes.json(), readinessRes.json()]);

      if (!listJson.success) throw new Error(listJson.error || 'Falha ao carregar coberturas.');
      if (!readinessJson.success) throw new Error(readinessJson.error || 'Falha ao calcular readiness.');

      setList(listJson.data || []);
      setReadiness(readinessJson.data || null);
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Erro ao carregar dados.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchPrevilemosDrivers = async () => {
    if (!isSuperAdmin) return;
    setPrevilemosLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/drivers?status=approved&limit=100`, { headers });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Falha ao carregar motoristas aprovados.');
      setPrevilemosDrivers(json.data || []);
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Erro ao carregar motoristas para o seguro.' });
    } finally {
      setPrevilemosLoading(false);
    }
  };

  const fetchPrevilemosInsurance = async (driverId) => {
    if (!driverId || !isSuperAdmin) {
      setPrevilemosEnrollments([]);
      return;
    }

    setPrevilemosLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/drivers/${driverId}/insurance/previlemos`, { headers });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || json.error || 'Falha ao carregar seguros Previlemos.');
      setPrevilemosEnrollments(json.data || []);
    } catch (err) {
      setPrevilemosEnrollments([]);
      setFeedback({ type: 'error', message: err?.message || 'Erro ao consultar seguros Previlemos.' });
    } finally {
      setPrevilemosLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    if (isSuperAdmin) fetchPrevilemosDrivers();
  }, []);

  const openActivatePrevilemos = () => {
    if (!selectedDriver) return;
    setPrevilemosForm({
      ...emptyPrevilemosForm,
      modelo: selectedDriver.vehicleModel || '',
      proprietario: selectedDriver.name || '',
    });
    setOpenPrevilemosActivate(true);
  };

  const handleActivatePrevilemos = async () => {
    if (!selectedDriver || previlemosForm.confirmation !== 'ATIVAR') return;

    setPrevilemosSubmitting(true);
    try {
      const payload = {
        dataInicial: previlemosForm.dataInicial,
        dataFinal: previlemosForm.dataFinal,
        numPassageiro: Number(previlemosForm.numPassageiro),
        dataNascimento: previlemosForm.dataNascimento,
        endereco: {
          Logradouro: previlemosForm.logradouro.trim(),
          Numero: previlemosForm.numero.trim(),
          ...(previlemosForm.complemento.trim() ? { Complemento: previlemosForm.complemento.trim() } : {}),
          Bairro: previlemosForm.bairro.trim(),
          Cidade: previlemosForm.cidade.trim(),
          Uf: previlemosForm.uf.trim().toUpperCase(),
          Cep: previlemosForm.cep.trim(),
        },
        veiculo: {
          Marca: previlemosForm.marca.trim(),
          ...(previlemosForm.modelo.trim() ? { Modelo: previlemosForm.modelo.trim() } : {}),
          AnoFabricacao: Number(previlemosForm.anoFabricacao),
          AnoModelo: Number(previlemosForm.anoModelo),
          ...(previlemosForm.chassi.trim() ? { Chassi: previlemosForm.chassi.trim() } : {}),
          ...(previlemosForm.renavam.trim() ? { Renavam: previlemosForm.renavam.trim() } : {}),
          ...(previlemosForm.proprietario.trim() ? { Proprietario: previlemosForm.proprietario.trim() } : {}),
          ...(previlemosForm.cpfCnpjProprietario.trim() ? { CpfCnpjProprietario: previlemosForm.cpfCnpjProprietario.trim() } : {}),
        },
      };

      const res = await fetch(
        `${API_BASE_URL}/api/admin/drivers/${selectedDriver.id}/insurance/previlemos/activate`,
        { method: 'POST', headers, body: JSON.stringify(payload) },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.message || json.error || 'Falha ao ativar seguro.');

      setOpenPrevilemosActivate(false);
      setFeedback({
        type: 'success',
        message: json.idempotent
          ? 'Seguro já existente localizado sem nova emissão.'
          : `Seguro Previlemos ativado. NumSeguro: ${json.data?.providerReference || '-'}.`,
      });
      await fetchPrevilemosInsurance(selectedDriver.id);
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Erro ao ativar seguro Previlemos.' });
    } finally {
      setPrevilemosSubmitting(false);
    }
  };

  const openCancelPrevilemos = (item) => {
    setCancelForm({ insuranceId: item.id, dataCancelamento: '', confirmation: '' });
    setOpenPrevilemosCancel(true);
  };

  const handleCancelPrevilemos = async () => {
    if (!selectedDriver || cancelForm.confirmation !== 'CANCELAR') return;

    setPrevilemosSubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/drivers/${selectedDriver.id}/insurance/previlemos/${cancelForm.insuranceId}/cancel`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ dataCancelamento: cancelForm.dataCancelamento }),
        },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.message || json.error || 'Falha ao cancelar seguro.');

      setOpenPrevilemosCancel(false);
      setFeedback({
        type: 'success',
        message: json.idempotent ? 'Seguro já estava cancelado.' : 'Cancelamento enviado e registrado com sucesso.',
      });
      await fetchPrevilemosInsurance(selectedDriver.id);
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Erro ao cancelar seguro Previlemos.' });
    } finally {
      setPrevilemosSubmitting(false);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const payload = toPayload(createForm);
      const res = await fetch(`${API_BASE_URL}/api/admin/insurance-coverages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Falha ao criar cobertura.');
      setOpenCreate(false);
      setCreateForm(emptyForm);
      setFeedback({ type: 'success', message: 'Cobertura cadastrada com sucesso.' });
      fetchAll();
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Erro ao cadastrar cobertura.' });
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (item) => {
    setEditForm({
      id: item.id,
      status: item.status || 'DRAFT',
      valid_until: item.valid_until ? String(item.valid_until).slice(0, 10) : '',
      document_url: item.document_url || '',
      notes: item.notes || '',
    });
    setOpenEdit(true);
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/insurance-coverages/${editForm.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: editForm.status,
          valid_until: editForm.valid_until,
          document_url: editForm.document_url || null,
          notes: editForm.notes || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Falha ao atualizar cobertura.');
      setOpenEdit(false);
      setFeedback({ type: 'success', message: 'Cobertura atualizada com sucesso.' });
      fetchAll();
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Erro ao atualizar cobertura.' });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 3 }, maxWidth: 1380, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ color: '#B8942E', fontWeight: 800 }}>
            Central de Seguros — APP e Responsabilidade Civil
          </Typography>
          <Typography sx={{ color: '#6B7280', fontSize: 13 }}>
            Gestão do APP Previlemos, preparação do RCF-V e readiness de coberturas por modalidade e território.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={fetchAll}>
            Atualizar
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => setOpenCreate(true)} sx={{ bgcolor: '#B8942E', '&:hover': { bgcolor: '#9A7B24' } }}>
            Nova Cobertura
          </Button>
        </Stack>
      </Box>

      {feedback.message && (
        <Alert severity={feedback.type || 'info'} sx={{ mb: 2 }} onClose={() => setFeedback({ type: '', message: '' })}>
          {feedback.message}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={7}>
          <Card
            sx={{
              height: '100%',
              border: '1px solid #E8E5DE',
              borderTop: '3px solid #15803D',
              background: 'linear-gradient(135deg, #F7FFF9 0%, #F1F8F3 100%)',
            }}
          >
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ mb: 1.2, flexWrap: 'wrap', gap: 0.5 }}>
                <Chip size="small" label="APP" sx={{ bgcolor: '#15803D15', color: '#15803D', fontWeight: 800 }} />
                <Chip size="small" label="Previlemos" sx={{ bgcolor: '#2563EB15', color: '#2563EB', fontWeight: 800 }} />
                <Chip size="small" label="API integrada" sx={{ bgcolor: '#15803D15', color: '#15803D', fontWeight: 700 }} />
                <Chip size="small" label="Homologação concluída" sx={{ bgcolor: '#15803D15', color: '#15803D', fontWeight: 700 }} />
              </Stack>

              <Typography variant="h6" sx={{ color: '#1F2937', fontWeight: 800, mb: 0.5 }}>
                Seguro APP — Previlemos
              </Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 13, mb: 1.5 }}>
                Integração principal de Seguro APP da KAVIAR. A emissão e o cancelamento reais são operações controladas e restritas ao SUPER_ADMIN.
              </Typography>

              <Stack spacing={0.65}>
                {PREVILEMOS_FACTS.map((item) => (
                  <Typography key={item} sx={{ color: '#4B5563', fontSize: 13, lineHeight: 1.45 }}>
                    • {item}
                  </Typography>
                ))}
              </Stack>

              <Alert severity="warning" sx={{ mt: 1.5 }}>
                A tela nunca deve ser usada como teste contra produção. Quando o backend estiver habilitado em PRD, o botão de ativação gera uma operação real no provedor.
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card
            sx={{
              height: '100%',
              border: '1px solid #E8E5DE',
              borderTop: '3px solid #B8942E',
              background: 'linear-gradient(135deg, #FFFDF7 0%, #F7F2E7 100%)',
            }}
          >
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ mb: 1.2, flexWrap: 'wrap', gap: 0.5 }}>
                <Chip size="small" label="RCF-V" sx={{ bgcolor: '#B8942E15', color: '#8A6A11', fontWeight: 800 }} />
                <Chip size="small" label="Cotação em andamento" sx={{ bgcolor: '#B4530915', color: '#B45309', fontWeight: 700 }} />
                <Chip size="small" label="Sem integração ativa" sx={{ bgcolor: '#6B728015', color: '#6B7280', fontWeight: 700 }} />
              </Stack>

              <Typography variant="h6" sx={{ color: '#1F2937', fontWeight: 800, mb: 0.5 }}>
                Responsabilidade Civil — RCF-V
              </Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 13, mb: 1.5 }}>
                Estrutura reservada para futura incorporação do RC à mesma central, sem misturar a cobertura com o APP.
              </Typography>

              <Stack spacing={0.65}>
                {RCF_FACTS.map((item) => (
                  <Typography key={item} sx={{ color: '#4B5563', fontSize: 13, lineHeight: 1.45 }}>
                    • {item}
                  </Typography>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ mb: 2, border: '1px solid #E8E5DE', borderTop: '3px solid #2563EB' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 800, color: '#1F2937' }}>Operação APP Previlemos</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 13 }}>
                Consulta por motorista, NumSeguro, vigência, certificado, ativação e cancelamento.
              </Typography>
            </Box>
            {isSuperAdmin && (
              <Button variant="outlined" size="small" startIcon={<Refresh />} onClick={fetchPrevilemosDrivers} disabled={previlemosLoading}>
                Atualizar motoristas
              </Button>
            )}
          </Box>

          {!isSuperAdmin ? (
            <Alert severity="info">
              Consulta, contratação e cancelamento da Previlemos são restritos ao perfil SUPER_ADMIN. O restante da central continua disponível para acompanhamento de readiness.
            </Alert>
          ) : (
            <>
              <Grid container spacing={1.5} alignItems="center">
                <Grid item xs={12} md={7}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Motorista aprovado"
                    value={selectedDriverId}
                    onChange={(e) => {
                      const driverId = e.target.value;
                      setSelectedDriverId(driverId);
                      fetchPrevilemosInsurance(driverId);
                    }}
                    helperText="A lista traz motoristas aprovados; a emissão ainda valida CPF, placa e modelo no backend."
                  >
                    {previlemosDrivers.map((driver) => (
                      <MenuItem key={driver.id} value={driver.id}>
                        {driver.name} — {driver.vehiclePlate || 'sem placa'} {driver.vehicleModel ? `· ${driver.vehicleModel}` : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={5}>
                  <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', md: 'flex-end' }} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {selectedDriver && (
                      <>
                        <Chip size="small" label={selectedDriver.vehiclePlate || 'Placa ausente'} />
                        <Chip size="small" label={`${previlemosEnrollments.filter((item) => item.status === 'ACTIVE').length} ativo(s)`} />
                      </>
                    )}
                    <Button
                      variant="contained"
                      onClick={openActivatePrevilemos}
                      disabled={!selectedDriver || previlemosSubmitting}
                      sx={{ bgcolor: '#15803D', '&:hover': { bgcolor: '#166534' } }}
                    >
                      Ativar APP Previlemos
                    </Button>
                  </Stack>
                </Grid>
              </Grid>

              <Box sx={{ mt: 2, overflowX: 'auto' }}>
                {previlemosLoading && selectedDriverId ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Status</TableCell>
                        <TableCell>Placa</TableCell>
                        <TableCell>NumSeguro</TableCell>
                        <TableCell>Vigência</TableCell>
                        <TableCell>Certificado</TableCell>
                        <TableCell>Última ocorrência</TableCell>
                        <TableCell align="right">Ações</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {!selectedDriverId && (
                        <TableRow><TableCell colSpan={7}>Selecione um motorista para consultar o histórico de seguros.</TableCell></TableRow>
                      )}
                      {selectedDriverId && previlemosEnrollments.length === 0 && (
                        <TableRow><TableCell colSpan={7}>Nenhum seguro Previlemos registrado para este motorista.</TableCell></TableRow>
                      )}
                      {previlemosEnrollments.map((item) => {
                        const certUrl = certificateUrl(item);
                        return (
                          <TableRow key={item.id} hover>
                            <TableCell>{driverInsuranceStatusChip(item.status)}</TableCell>
                            <TableCell>{item.vehiclePlate || '-'}</TableCell>
                            <TableCell>{item.providerReference || '-'}</TableCell>
                            <TableCell>{formatDate(item.validFrom)} - {formatDate(item.validUntil)}</TableCell>
                            <TableCell>
                              {certUrl ? (
                                <Button size="small" component="a" href={certUrl} target="_blank" rel="noopener noreferrer">Abrir</Button>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {item.lastErrorMessage ? (
                                <Typography sx={{ color: '#B91C1C', fontSize: 12 }}>{item.lastErrorMessage}</Typography>
                              ) : (
                                <Typography sx={{ color: '#6B7280', fontSize: 12 }}>{formatDate(item.updatedAt)}</Typography>
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Button
                                size="small"
                                color="error"
                                disabled={item.status !== 'ACTIVE' || previlemosSubmitting}
                                onClick={() => openCancelPrevilemos(item)}
                              >
                                Cancelar
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ border: '1px solid #E8E5DE' }}>
            <CardContent>
              <Typography sx={{ color: '#6B7280', fontSize: 12 }}>Coberturas cadastradas</Typography>
              <Typography sx={{ color: '#1A1A1A', fontSize: 30, fontWeight: 800 }}>{readiness?.totals?.coverages ?? '-'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ border: '1px solid #E8E5DE' }}>
            <CardContent>
              <Typography sx={{ color: '#6B7280', fontSize: 12 }}>Ativas e vigentes</Typography>
              <Typography sx={{ color: '#15803D', fontSize: 30, fontWeight: 800 }}>{readiness?.totals?.activeNow ?? '-'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ border: '1px solid #E8E5DE' }}>
            <CardContent>
              <Typography sx={{ color: '#6B7280', fontSize: 12 }}>Vencendo em 30 dias</Typography>
              <Typography sx={{ color: '#B45309', fontSize: 30, fontWeight: 800 }}>{readiness?.totals?.expiringIn30Days ?? '-'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ border: '1px solid #E8E5DE' }}>
            <CardContent>
              <Typography sx={{ color: '#6B7280', fontSize: 12 }}>Alertas de ausência ativa</Typography>
              <Typography sx={{ color: '#B91C1C', fontSize: 30, fontWeight: 800 }}>{readiness?.missingAlerts?.length ?? '-'}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {Object.entries(readiness?.byModality || {}).map(([modality, stats]) => (
          <Grid item xs={12} md={4} key={modality}>
            <Card sx={{ border: '1px solid #E8E5DE', borderTop: '3px solid #2563EB' }}>
              <CardContent>
                <Typography sx={{ fontWeight: 700, color: '#1A1A1A', mb: 1 }}>{modalityLabel(modality)}</Typography>
                <Typography sx={{ fontSize: 13, color: '#6B7280' }}>Coberturas ativas: {stats.activeCoverageCount}</Typography>
                <Typography sx={{ fontSize: 13, color: '#6B7280' }}>Vencendo em 30 dias: {stats.expiringIn30Days}</Typography>
                <Typography sx={{ fontSize: 13, color: '#6B7280' }}>Territórios sem cobertura ativa: {stats.missingActiveTerritoryCount}</Typography>
                <Chip
                  size="small"
                  label={stats.hasActiveCoverage ? 'Readiness parcial OK' : 'Sem cobertura ativa'}
                  sx={{
                    mt: 1,
                    bgcolor: stats.hasActiveCoverage ? '#15803D15' : '#B91C1C15',
                    color: stats.hasActiveCoverage ? '#15803D' : '#B91C1C',
                    border: `1px solid ${stats.hasActiveCoverage ? '#15803D40' : '#B91C1C40'}`,
                    fontWeight: 600,
                  }}
                />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {(readiness?.missingAlerts?.length || 0) > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Existem modalidades sem cobertura ativa em territórios operacionais. Revise os alertas abaixo para preparação da fase de gate.
        </Alert>
      )}

      {(readiness?.expiringCoverages?.length || 0) > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {readiness.expiringCoverages.length} cobertura(s) ativa(s) vencendo em até 30 dias.
        </Alert>
      )}

      <Card sx={{ border: '1px solid #E8E5DE' }}>
        <CardContent>
          <Typography sx={{ fontWeight: 700, mb: 1.2 }}>Coberturas cadastradas</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Território</TableCell>
                <TableCell>Modalidade</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Seguradora</TableCell>
                <TableCell>Apólice</TableCell>
                <TableCell>Vigência</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography sx={{ color: '#6B7280', py: 1 }}>Nenhuma cobertura cadastrada.</Typography>
                  </TableCell>
                </TableRow>
              )}
              {list.map((item) => {
                const d = daysTo(item.valid_until);
                return (
                  <TableRow key={item.id} hover>
                    <TableCell>{item.territory?.name || 'GLOBAL'}</TableCell>
                    <TableCell>{modalityLabel(item.modality)}</TableCell>
                    <TableCell>{item.coverage_type}</TableCell>
                    <TableCell>{item.provider_name}</TableCell>
                    <TableCell>{item.policy_number}</TableCell>
                    <TableCell>
                      {formatDate(item.valid_from)} - {formatDate(item.valid_until)}
                      {d !== null && (
                        <Typography sx={{ fontSize: 11, color: d < 0 ? '#B91C1C' : d <= 30 ? '#B45309' : '#6B7280' }}>
                          {d < 0 ? `Vencida há ${Math.abs(d)} dia(s)` : `Vence em ${d} dia(s)`}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{statusChip(item.status)}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => openEditDialog(item)}>Editar</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={openPrevilemosActivate} onClose={() => !previlemosSubmitting && setOpenPrevilemosActivate(false)} maxWidth="md" fullWidth>
        <DialogTitle>Ativar Seguro APP Previlemos</DialogTitle>
        <DialogContent sx={{ mt: 1 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Esta ação chama o endpoint de ativação. Se a integração estiver habilitada em PRD, será uma emissão real. Confira todos os dados antes de confirmar.
          </Alert>

          <Typography sx={{ fontWeight: 700, mb: 1 }}>
            {selectedDriver?.name || '-'} — {selectedDriver?.vehiclePlate || 'sem placa'}
          </Typography>

          <Grid container spacing={1.5}>
            <Grid item xs={12} md={4}>
              <TextField type="date" label="Início da vigência" InputLabelProps={{ shrink: true }} fullWidth value={previlemosForm.dataInicial} onChange={(e) => setPrevilemosForm((p) => ({ ...p, dataInicial: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField type="date" label="Fim da vigência" InputLabelProps={{ shrink: true }} fullWidth value={previlemosForm.dataFinal} onChange={(e) => setPrevilemosForm((p) => ({ ...p, dataFinal: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField type="number" label="Ocupantes cobertos" fullWidth inputProps={{ min: 1 }} value={previlemosForm.numPassageiro} onChange={(e) => setPrevilemosForm((p) => ({ ...p, numPassageiro: e.target.value }))} />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField type="date" label="Nascimento do motorista" InputLabelProps={{ shrink: true }} fullWidth value={previlemosForm.dataNascimento} onChange={(e) => setPrevilemosForm((p) => ({ ...p, dataNascimento: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Logradouro" fullWidth value={previlemosForm.logradouro} onChange={(e) => setPrevilemosForm((p) => ({ ...p, logradouro: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField label="Número" fullWidth value={previlemosForm.numero} onChange={(e) => setPrevilemosForm((p) => ({ ...p, numero: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField label="Complemento" fullWidth value={previlemosForm.complemento} onChange={(e) => setPrevilemosForm((p) => ({ ...p, complemento: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField label="Bairro" fullWidth value={previlemosForm.bairro} onChange={(e) => setPrevilemosForm((p) => ({ ...p, bairro: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField label="Cidade" fullWidth value={previlemosForm.cidade} onChange={(e) => setPrevilemosForm((p) => ({ ...p, cidade: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField label="UF" fullWidth inputProps={{ maxLength: 2 }} value={previlemosForm.uf} onChange={(e) => setPrevilemosForm((p) => ({ ...p, uf: e.target.value.toUpperCase() }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="CEP" fullWidth value={previlemosForm.cep} onChange={(e) => setPrevilemosForm((p) => ({ ...p, cep: e.target.value }))} />
            </Grid>

            <Grid item xs={12} md={3}>
              <TextField label="Marca" fullWidth value={previlemosForm.marca} onChange={(e) => setPrevilemosForm((p) => ({ ...p, marca: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField label="Modelo" fullWidth value={previlemosForm.modelo} onChange={(e) => setPrevilemosForm((p) => ({ ...p, modelo: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField type="number" label="Ano fabricação" fullWidth value={previlemosForm.anoFabricacao} onChange={(e) => setPrevilemosForm((p) => ({ ...p, anoFabricacao: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField type="number" label="Ano modelo" fullWidth value={previlemosForm.anoModelo} onChange={(e) => setPrevilemosForm((p) => ({ ...p, anoModelo: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="Renavam" fullWidth value={previlemosForm.renavam} onChange={(e) => setPrevilemosForm((p) => ({ ...p, renavam: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Chassi" fullWidth value={previlemosForm.chassi} onChange={(e) => setPrevilemosForm((p) => ({ ...p, chassi: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Proprietário" fullWidth value={previlemosForm.proprietario} onChange={(e) => setPrevilemosForm((p) => ({ ...p, proprietario: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="CPF/CNPJ do proprietário" fullWidth value={previlemosForm.cpfCnpjProprietario} onChange={(e) => setPrevilemosForm((p) => ({ ...p, cpfCnpjProprietario: e.target.value }))} />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label='Confirmação — digite ATIVAR'
                fullWidth
                value={previlemosForm.confirmation}
                onChange={(e) => setPrevilemosForm((p) => ({ ...p, confirmation: e.target.value.toUpperCase() }))}
                helperText="Confirmação obrigatória para evitar emissão acidental."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPrevilemosActivate(false)} disabled={previlemosSubmitting}>Cancelar</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleActivatePrevilemos}
            disabled={
              previlemosSubmitting ||
              previlemosForm.confirmation !== 'ATIVAR' ||
              !previlemosForm.dataInicial ||
              !previlemosForm.dataFinal ||
              !previlemosForm.dataNascimento ||
              !previlemosForm.logradouro ||
              !previlemosForm.numero ||
              !previlemosForm.bairro ||
              !previlemosForm.cidade ||
              previlemosForm.uf.length !== 2 ||
              !previlemosForm.cep ||
              !previlemosForm.marca ||
              !previlemosForm.anoFabricacao ||
              !previlemosForm.anoModelo
            }
          >
            {previlemosSubmitting ? 'Ativando...' : 'Confirmar ativação'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openPrevilemosCancel} onClose={() => !previlemosSubmitting && setOpenPrevilemosCancel(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Cancelar Seguro APP Previlemos</DialogTitle>
        <DialogContent sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Alert severity="warning">
            O cancelamento também é uma operação real no provedor. Em caso de timeout ou resposta ambígua, o backend mantém o registro para revisão e evita reenvio cego.
          </Alert>
          <TextField
            type="date"
            label="Data do cancelamento"
            InputLabelProps={{ shrink: true }}
            value={cancelForm.dataCancelamento}
            onChange={(e) => setCancelForm((p) => ({ ...p, dataCancelamento: e.target.value }))}
          />
          <TextField
            label='Confirmação — digite CANCELAR'
            value={cancelForm.confirmation}
            onChange={(e) => setCancelForm((p) => ({ ...p, confirmation: e.target.value.toUpperCase() }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPrevilemosCancel(false)} disabled={previlemosSubmitting}>Voltar</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCancelPrevilemos}
            disabled={previlemosSubmitting || !cancelForm.dataCancelamento || cancelForm.confirmation !== 'CANCELAR'}
          >
            {previlemosSubmitting ? 'Cancelando...' : 'Confirmar cancelamento'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="md" fullWidth>
        <DialogTitle>Nova Cobertura Operacional</DialogTitle>
        <DialogContent sx={{ mt: 1 }}>
          <Grid container spacing={1.5}>
            <Grid item xs={12} md={6}>
              <TextField
                select
                label="Território"
                fullWidth
                value={createForm.territory_id}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, territory_id: e.target.value }))}
              >
                {territoryOptions.map((t) => (
                  <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField select label="Modalidade" fullWidth value={createForm.modality} onChange={(e) => setCreateForm((prev) => ({ ...prev, modality: e.target.value }))}>
                {MODALITIES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Seguradora" fullWidth value={createForm.provider_name} onChange={(e) => setCreateForm((prev) => ({ ...prev, provider_name: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Número da Apólice" fullWidth value={createForm.policy_number} onChange={(e) => setCreateForm((prev) => ({ ...prev, policy_number: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField select label="Tipo de Cobertura" fullWidth value={createForm.coverage_type} onChange={(e) => setCreateForm((prev) => ({ ...prev, coverage_type: e.target.value }))}>
                {COVERAGE_TYPES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField type="date" label="Válida de" InputLabelProps={{ shrink: true }} fullWidth value={createForm.valid_from} onChange={(e) => setCreateForm((prev) => ({ ...prev, valid_from: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField type="date" label="Válida até" InputLabelProps={{ shrink: true }} fullWidth value={createForm.valid_until} onChange={(e) => setCreateForm((prev) => ({ ...prev, valid_until: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField type="number" label="Cobertura óbito (R$)" fullWidth value={createForm.coverage_amount_death} onChange={(e) => setCreateForm((prev) => ({ ...prev, coverage_amount_death: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField type="number" label="Cobertura invalidez (R$)" fullWidth value={createForm.coverage_amount_disability} onChange={(e) => setCreateForm((prev) => ({ ...prev, coverage_amount_disability: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField type="number" label="Cobertura médica (R$)" fullWidth value={createForm.coverage_amount_medical} onChange={(e) => setCreateForm((prev) => ({ ...prev, coverage_amount_medical: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField select label="Status" fullWidth value={createForm.status} onChange={(e) => setCreateForm((prev) => ({ ...prev, status: e.target.value }))}>
                {STATUSES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="URL do documento" fullWidth value={createForm.document_url} onChange={(e) => setCreateForm((prev) => ({ ...prev, document_url: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Descrição" fullWidth multiline minRows={2} value={createForm.coverage_description} onChange={(e) => setCreateForm((prev) => ({ ...prev, coverage_description: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Notas" fullWidth multiline minRows={2} value={createForm.notes} onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreate(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving || !createForm.provider_name || !createForm.policy_number || !createForm.valid_from || !createForm.valid_until}
            sx={{ bgcolor: '#B8942E', '&:hover': { bgcolor: '#9A7B24' } }}
          >
            {saving ? 'Salvando...' : 'Salvar Cobertura'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Atualizar Cobertura</DialogTitle>
        <DialogContent sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField select label="Status" value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}>
            {STATUSES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
          </TextField>
          <TextField type="date" label="Válida até" InputLabelProps={{ shrink: true }} value={editForm.valid_until} onChange={(e) => setEditForm((prev) => ({ ...prev, valid_until: e.target.value }))} />
          <TextField label="URL do documento" value={editForm.document_url} onChange={(e) => setEditForm((prev) => ({ ...prev, document_url: e.target.value }))} />
          <TextField label="Notas" multiline minRows={3} value={editForm.notes} onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEdit(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleUpdate} disabled={updating || !editForm.valid_until} sx={{ bgcolor: '#B8942E', '&:hover': { bgcolor: '#9A7B24' } }}>
            {updating ? 'Atualizando...' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
