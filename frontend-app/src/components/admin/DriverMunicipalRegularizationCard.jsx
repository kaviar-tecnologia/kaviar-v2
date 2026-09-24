import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../api/index';
import { formatDate } from '../../utils/formatDate';

const STATUS_LABELS = {
  NOT_STARTED: 'Não iniciado',
  DOCUMENTS_PENDING: 'Documentos pendentes',
  IN_REVIEW_BY_KAVIAR: 'Em conferência pela KAVIAR',
  READY_FOR_CITY_HALL: 'Pronto para Prefeitura',
  SUBMITTED_TO_CITY_HALL: 'Enviado à Prefeitura',
  WAITING_CITY_HALL_REVIEW: 'Aguardando análise da Prefeitura',
  NEEDS_COMPLEMENT: 'Complemento solicitado',
  APPROVED_BY_CITY_HALL: 'Aprovado pela Prefeitura',
  REJECTED_BY_CITY_HALL: 'Indeferido pela Prefeitura',
  EXPIRED: 'Autorização vencida',
};

const REGULATION_STATUS_LABELS = {
  REGULATED: 'Regulamentado',
  NOT_REGULATED: 'Não regulamentado',
  UNKNOWN: 'Regra municipal indefinida',
  REQUIRES_CONFIRMATION: 'Requer confirmação municipal',
};

const MODALITY_LABELS = {
  CAR: 'Carro',
  MOTO_PASSENGER: 'Moto Passageiro',
  MOTO_DELIVERY: 'Moto Entrega',
  TAXI: 'Táxi',
  VAN: 'Van',
};

const STATUS_OPTIONS_SUPER_ADMIN = [
  'DOCUMENTS_PENDING',
  'IN_REVIEW_BY_KAVIAR',
  'READY_FOR_CITY_HALL',
  'SUBMITTED_TO_CITY_HALL',
  'WAITING_CITY_HALL_REVIEW',
  'NEEDS_COMPLEMENT',
  'APPROVED_BY_CITY_HALL',
  'REJECTED_BY_CITY_HALL',
  'EXPIRED',
];

const STATUS_OPTIONS_MANAGER = [
  'WAITING_CITY_HALL_REVIEW',
  'NEEDS_COMPLEMENT',
  'EXPIRED',
];

const INITIAL_STATUS_OPTIONS = [
  'DOCUMENTS_PENDING',
  'IN_REVIEW_BY_KAVIAR',
  'READY_FOR_CITY_HALL',
];

function getAdminRole() {
  try {
    const data = localStorage.getItem('kaviar_admin_data');
    return data ? JSON.parse(data)?.role : null;
  } catch {
    return null;
  }
}

function getStatusStyle(status) {
  if (status === 'APPROVED_BY_CITY_HALL') {
    return { color: '#0b6b33', backgroundColor: '#d9f4e5', borderColor: '#8ed1ad' };
  }
  if (status === 'NEEDS_COMPLEMENT') {
    return { color: '#9a3412', backgroundColor: '#ffedd5', borderColor: '#fdba74' };
  }
  if (['REJECTED_BY_CITY_HALL', 'EXPIRED'].includes(status)) {
    return { color: '#991b1b', backgroundColor: '#fee2e2', borderColor: '#fca5a5' };
  }
  if (status === 'NOT_STARTED') {
    return { color: '#4b5563', backgroundColor: '#f3f4f6', borderColor: '#d1d5db' };
  }
  return { color: '#92400e', backgroundColor: '#fef3c7', borderColor: '#fcd34d' };
}

function normalizeDocStatus(status) {
  return String(status || '').toUpperCase();
}

function splitRequirementsByDocumentStatus(authorization, documents) {
  const requirements = authorization?.regulation?.requirements || [];
  const docsByType = new Map((documents || []).map((doc) => [doc.type, doc]));

  const grouped = {
    pending: [],
    submitted: [],
    verified: [],
    conditional: [],
  };

  requirements.forEach((req) => {
    if (!req.is_required) {
      grouped.conditional.push(req);
      return;
    }

    if (!req.document_type) {
      grouped.pending.push(req);
      return;
    }

    const doc = docsByType.get(req.document_type);
    const normalizedStatus = normalizeDocStatus(doc?.status);

    if (normalizedStatus === 'VERIFIED') {
      grouped.verified.push(req);
      return;
    }

    if (normalizedStatus === 'SUBMITTED') {
      grouped.submitted.push(req);
      return;
    }

    grouped.pending.push(req);
  });

  return grouped;
}

function formatDateOnly(value) {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return formatDate(value);
}

export function DriverMunicipalRegularizationCard({ driverId, documents }) {
  const role = getAdminRole();
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isTerritorialManager = role === 'TERRITORIAL_MANAGER';

  const [authorizations, setAuthorizations] = useState([]);
  const [regulations, setRegulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createForm, setCreateForm] = useState({
    regulation_id: '',
    city: '',
    state: '',
    service_modality: 'CAR',
    status: 'DOCUMENTS_PENDING',
  });

  const [protocolForms, setProtocolForms] = useState({});
  const [statusForms, setStatusForms] = useState({});
  const [decisionForms, setDecisionForms] = useState({});

  const statusOptions = isSuperAdmin ? STATUS_OPTIONS_SUPER_ADMIN : STATUS_OPTIONS_MANAGER;

  const regulationOptions = useMemo(() => {
    return regulations.map((item) => ({
      value: item.id,
      label: `${item.city}/${item.state} • ${MODALITY_LABELS[item.service_modality] || item.service_modality} • ${REGULATION_STATUS_LABELS[item.regulation_status] || item.regulation_status}`,
      city: item.city,
      state: item.state,
      service_modality: item.service_modality,
      regulation_status: item.regulation_status,
    }));
  }, [regulations]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [authRes, regRes] = await Promise.all([
        api.get(`/api/admin/drivers/${driverId}/municipal-authorizations`),
        api.get('/api/admin/municipal-regulations?is_active=true'),
      ]);

      const authData = authRes.data?.data || [];
      setAuthorizations(authData);
      setRegulations(regRes.data?.data || []);

      const nextProtocolForms = {};
      const nextStatusForms = {};
      const nextDecisionForms = {};

      authData.forEach((auth) => {
        nextProtocolForms[auth.id] = {
          protocol_number: auth.protocol_number || '',
          protocol_date: auth.protocol_date ? String(auth.protocol_date).slice(0, 10) : '',
          protocol_agency: auth.protocol_agency || '',
          protocol_responsible_name: auth.protocol_responsible_name || '',
          protocol_receipt_url: auth.protocol_receipt_url || '',
          city_hall_notes: auth.city_hall_notes || '',
        };

        nextStatusForms[auth.id] = {
          status: auth.status || 'DOCUMENTS_PENDING',
          city_hall_notes: auth.city_hall_notes || '',
          authorization_number: auth.authorization_number || '',
          authorization_document_url: auth.authorization_document_url || '',
          authorization_valid_until: auth.authorization_valid_until ? String(auth.authorization_valid_until).slice(0, 10) : '',
        };

        nextDecisionForms[auth.id] = {
          decision: 'WAITING_CITY_HALL_REVIEW',
          city_hall_notes: auth.city_hall_notes || '',
          authorization_number: auth.authorization_number || '',
          authorization_document_url: auth.authorization_document_url || '',
          authorization_valid_until: auth.authorization_valid_until ? String(auth.authorization_valid_until).slice(0, 10) : '',
        };
      });

      setProtocolForms(nextProtocolForms);
      setStatusForms(nextStatusForms);
      setDecisionForms(nextDecisionForms);
    } catch (err) {
      setError(err?.response?.data?.error || 'Erro ao carregar regularização municipal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [driverId]);

  const withClearFeedback = async (action) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await action();
      setSuccess('Atualização realizada com sucesso.');
      await loadData();
    } catch (err) {
      if (err?.response?.status === 403) {
        setError(err?.response?.data?.error || 'Você não tem permissão para esta ação.');
        return;
      }
      setError(err?.response?.data?.error || 'Não foi possível concluir a ação.');
    } finally {
      setSaving(false);
    }
  };

  const createAuthorization = async () => {
    if (!createForm.city || !createForm.state || !createForm.service_modality) {
      setError('Preencha cidade, UF e modalidade para criar a autorização.');
      return;
    }

    if (!INITIAL_STATUS_OPTIONS.includes(createForm.status)) {
      setError('Status inicial inválido para criação de autorização municipal.');
      return;
    }

    await withClearFeedback(async () => {
      await api.post(`/api/admin/drivers/${driverId}/municipal-authorizations`, {
        regulation_id: createForm.regulation_id || undefined,
        city: createForm.city,
        state: createForm.state,
        service_modality: createForm.service_modality,
        status: createForm.status,
      });
    });
  };

  const patchAuthorization = async (authorizationId) => {
    const form = statusForms[authorizationId];
    if (!form) return;

    const authorization = authorizations.find((item) => item.id === authorizationId);
    const wantsSubmitted = form.status === 'SUBMITTED_TO_CITY_HALL';
    const hasPackageOrProtocol = Boolean(
      authorization?.municipal_package_url || authorization?.protocol_number || authorization?.protocol_receipt_url,
    );

    if (wantsSubmitted && !hasPackageOrProtocol) {
      setError('Gere o Pacote Prefeitura ou registre o protocolo antes de marcar como enviado.');
      return;
    }

    await withClearFeedback(async () => {
      await api.patch(`/api/admin/drivers/${driverId}/municipal-authorizations/${authorizationId}`, {
        status: form.status,
        city_hall_notes: form.city_hall_notes || null,
        authorization_number: form.authorization_number || null,
        authorization_document_url: form.authorization_document_url || null,
        authorization_valid_until: form.authorization_valid_until || null,
      });
    });
  };

  const generatePackage = async (authorizationId) => {
    await withClearFeedback(async () => {
      await api.post(`/api/admin/drivers/${driverId}/municipal-authorizations/${authorizationId}/generate-package`);
    });
  };

  const submitProtocol = async (authorizationId) => {
    const form = protocolForms[authorizationId];
    if (!form?.protocol_number) {
      setError('Número do protocolo é obrigatório para registrar protocolo.');
      return;
    }

    await withClearFeedback(async () => {
      await api.patch(`/api/admin/drivers/${driverId}/municipal-authorizations/${authorizationId}/protocol`, {
        protocol_number: form.protocol_number,
        protocol_date: form.protocol_date || null,
        protocol_agency: form.protocol_agency || null,
        protocol_responsible_name: form.protocol_responsible_name || null,
        protocol_receipt_url: form.protocol_receipt_url || null,
        city_hall_notes: form.city_hall_notes || null,
      });
    });
  };

  const submitDecision = async (authorizationId) => {
    const form = decisionForms[authorizationId];
    if (!form?.decision) {
      setError('Selecione uma decisão para atualizar o andamento municipal.');
      return;
    }

    await withClearFeedback(async () => {
      await api.patch(`/api/admin/drivers/${driverId}/municipal-authorizations/${authorizationId}/city-hall-decision`, {
        decision: form.decision,
        city_hall_notes: form.city_hall_notes || null,
        authorization_number: form.authorization_number || null,
        authorization_document_url: form.authorization_document_url || null,
        authorization_valid_until: form.authorization_valid_until || null,
      });
    });
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Regularização Municipal</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Esta etapa controla a autorização municipal do motorista. O gestor territorial somente poderá protocolar ou acompanhar o processo junto à Prefeitura quando houver autorização expressa da KAVIAR para aquele ato específico. A liberação final para operação depende de confirmação do Admin KAVIAR.
      </Alert>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {loading ? (
        <Typography variant="body2" color="text.secondary">Carregando regularização municipal...</Typography>
      ) : (
        <Stack spacing={2}>
          {isSuperAdmin && (
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>Criar autorização municipal</Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12} md={7}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Regra municipal"
                    value={createForm.regulation_id}
                    onChange={(e) => {
                      const regulation = regulationOptions.find((opt) => opt.value === e.target.value);
                      setCreateForm((prev) => ({
                        ...prev,
                        regulation_id: e.target.value,
                        city: regulation?.city || prev.city,
                        state: regulation?.state || prev.state,
                        service_modality: regulation?.service_modality || prev.service_modality,
                      }));
                    }}
                  >
                    <MenuItem value="">Selecionar manualmente</MenuItem>
                    {regulationOptions.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Cidade"
                    value={createForm.city}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, city: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} md={1}>
                  <TextField
                    fullWidth
                    size="small"
                    label="UF"
                    value={createForm.state}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Modalidade"
                    value={createForm.service_modality}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, service_modality: e.target.value }))}
                  >
                    {Object.keys(MODALITY_LABELS).map((key) => (
                      <MenuItem key={key} value={key}>{MODALITY_LABELS[key]}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Status inicial"
                    value={createForm.status}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    {INITIAL_STATUS_OPTIONS.map((status) => (
                      <MenuItem key={status} value={status}>{STATUS_LABELS[status]}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Button fullWidth variant="contained" disabled={saving} onClick={createAuthorization}>
                    Criar autorização
                  </Button>
                </Grid>
              </Grid>
            </Box>
          )}

          {authorizations.length === 0 ? (
            <Alert severity="warning">Nenhuma autorização municipal vinculada a este motorista.</Alert>
          ) : (
            authorizations.map((authorization) => {
              const style = getStatusStyle(authorization.status);
              const groupedRequirements = splitRequirementsByDocumentStatus(authorization, documents);
              const protocolForm = protocolForms[authorization.id] || {};
              const statusForm = statusForms[authorization.id] || {};
              const decisionForm = decisionForms[authorization.id] || {};

              const canDoFinalDecision = isSuperAdmin;
              const canManageProtocol = isSuperAdmin || isTerritorialManager;
              const canManageStatus = isSuperAdmin;
              const canGeneratePackage = isSuperAdmin || isTerritorialManager;
              const canDecisionProgress = isSuperAdmin || isTerritorialManager;
              const canSeeSensitiveLinks = isSuperAdmin;

              return (
                <Box key={authorization.id} sx={{ border: '1px solid #E5E7EB', borderRadius: 1, p: 2 }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1.5 }}>
                    <Chip
                      label={STATUS_LABELS[authorization.status] || authorization.status}
                      size="small"
                      sx={{
                        color: style.color,
                        backgroundColor: style.backgroundColor,
                        border: `1px solid ${style.borderColor}`,
                        fontWeight: 700,
                      }}
                    />
                    <Chip size="small" label={`${authorization.city}/${authorization.state}`} variant="outlined" />
                    <Chip size="small" label={MODALITY_LABELS[authorization.service_modality] || authorization.service_modality} variant="outlined" />
                    {authorization.municipal_package_url ? (
                      <Chip size="small" color="success" label="Pacote Prefeitura gerado" />
                    ) : (
                      <Chip size="small" color="warning" label="Pacote Prefeitura pendente" />
                    )}
                  </Box>

                  {authorization.municipal_package_url && (
                    <Box sx={{ mb: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">Pacote Prefeitura</Typography>
                      <Typography variant="body2">
                        <a href={authorization.municipal_package_url} target="_blank" rel="noopener noreferrer">Abrir pacote autorizado</a>
                      </Typography>
                    </Box>
                  )}

                  <Grid container spacing={1.5}>
                    <Grid item xs={12} md={4}>
                      <Typography variant="caption" color="text.secondary">Regra municipal aplicada</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {REGULATION_STATUS_LABELS[authorization?.regulation?.regulation_status] || authorization?.regulation?.regulation_status || '—'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography variant="caption" color="text.secondary">Órgão responsável</Typography>
                      <Typography variant="body2">{authorization?.regulation?.responsible_agency || authorization.protocol_agency || '—'}</Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography variant="caption" color="text.secondary">Validade autorização</Typography>
                      <Typography variant="body2">{formatDateOnly(authorization.authorization_valid_until)}</Typography>
                    </Grid>

                    <Grid item xs={12} md={3}>
                      <Typography variant="caption" color="text.secondary">Número de protocolo</Typography>
                      <Typography variant="body2">{authorization.protocol_number || '—'}</Typography>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Typography variant="caption" color="text.secondary">Data de protocolo</Typography>
                      <Typography variant="body2">{formatDateOnly(authorization.protocol_date)}</Typography>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Typography variant="caption" color="text.secondary">Responsável/Atendente</Typography>
                      <Typography variant="body2">{authorization.protocol_responsible_name || '—'}</Typography>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Typography variant="caption" color="text.secondary">Comprovante protocolo</Typography>
                      {authorization.protocol_receipt_url && canSeeSensitiveLinks ? (
                        <Typography variant="body2"><a href={authorization.protocol_receipt_url} target="_blank" rel="noopener noreferrer">Abrir comprovante</a></Typography>
                      ) : authorization.protocol_receipt_url ? (
                        <Typography variant="body2">Anexo registrado</Typography>
                      ) : (
                        <Typography variant="body2">—</Typography>
                      )}
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <Typography variant="caption" color="text.secondary">Número da autorização</Typography>
                      <Typography variant="body2">{authorization.authorization_number || '—'}</Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography variant="caption" color="text.secondary">Documento/autorização</Typography>
                      {authorization.authorization_document_url && canSeeSensitiveLinks ? (
                        <Typography variant="body2"><a href={authorization.authorization_document_url} target="_blank" rel="noopener noreferrer">Abrir autorização</a></Typography>
                      ) : authorization.authorization_document_url ? (
                        <Typography variant="body2">Anexo registrado</Typography>
                      ) : (
                        <Typography variant="body2">—</Typography>
                      )}
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography variant="caption" color="text.secondary">Observações da Prefeitura</Typography>
                      <Typography variant="body2">{authorization.city_hall_notes || '—'}</Typography>
                    </Grid>
                  </Grid>

                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Visão completa dos requisitos municipais</Typography>
                    {(() => {
                      const allRequirements = authorization?.regulation?.requirements || [];

                      if (allRequirements.length === 0) {
                        return <Typography variant="body2">Esta regra municipal não possui requisitos cadastrados.</Typography>;
                      }

                      const getBucketMeta = (req) => {
                        if (!req.is_required) return { label: 'Condicional', color: 'default' };

                        if (!req.document_type) return { label: 'Pendente', color: 'warning' };

                        const doc = (documents || []).find((item) => item.type === req.document_type);
                        const normalizedStatus = normalizeDocStatus(doc?.status);

                        if (normalizedStatus === 'VERIFIED') return { label: 'Verificado', color: 'success' };
                        if (normalizedStatus === 'SUBMITTED') return { label: 'Enviado', color: 'info' };
                        return { label: 'Pendente', color: 'warning' };
                      };

                      return (
                        <Box sx={{ mt: 1, border: '1px solid #E5E7EB', borderRadius: 1, overflow: 'hidden' }}>
                          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', p: 1, bgcolor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>Requisito</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>Situação</Typography>
                          </Box>
                          {allRequirements.map((req) => {
                            const bucket = getBucketMeta(req);
                            return (
                              <Box key={req.id} sx={{ display: 'grid', gridTemplateColumns: '1fr auto', p: 1, borderBottom: '1px solid #F3F4F6' }}>
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.label}</Typography>
                                  {req.document_type && (
                                    <Typography variant="caption" color="text.secondary">Documento: {req.document_type}</Typography>
                                  )}
                                </Box>
                                <Chip label={bucket.label} size="small" color={bucket.color} variant="outlined" />
                              </Box>
                            );
                          })}
                        </Box>
                      );
                    })()}
                  </Box>

                  <Box sx={{ mt: 1.5 }}>
                    <Grid container spacing={1}>
                      <Grid item xs={12} md={3}>
                        <Chip label={`Pendentes: ${groupedRequirements.pending.length}`} size="small" color="warning" variant="outlined" />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <Chip label={`Enviados: ${groupedRequirements.submitted.length}`} size="small" color="info" variant="outlined" />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <Chip label={`Verificados: ${groupedRequirements.verified.length}`} size="small" color="success" variant="outlined" />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <Chip label={`Condicionais: ${groupedRequirements.conditional.length}`} size="small" color="default" variant="outlined" />
                      </Grid>
                    </Grid>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Ações municipais</Typography>

                  {canManageStatus && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Grid container spacing={1.5}>
                        <Grid item xs={12} md={3}>
                          <TextField
                            select
                            fullWidth
                            size="small"
                            label="Status municipal"
                            value={statusForm.status || authorization.status}
                            onChange={(e) => setStatusForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...statusForm, status: e.target.value },
                            }))}
                          >
                            {STATUS_OPTIONS_SUPER_ADMIN.map((status) => (
                              <MenuItem key={status} value={status}>{STATUS_LABELS[status]}</MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Nº autorização"
                            value={statusForm.authorization_number || ''}
                            onChange={(e) => setStatusForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...statusForm, authorization_number: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField
                            fullWidth
                            size="small"
                            label="URL autorização"
                            value={statusForm.authorization_document_url || ''}
                            onChange={(e) => setStatusForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...statusForm, authorization_document_url: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField
                            fullWidth
                            type="date"
                            size="small"
                            label="Validade"
                            InputLabelProps={{ shrink: true }}
                            value={statusForm.authorization_valid_until || ''}
                            onChange={(e) => setStatusForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...statusForm, authorization_valid_until: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Observações"
                            multiline
                            minRows={2}
                            value={statusForm.city_hall_notes || ''}
                            onChange={(e) => setStatusForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...statusForm, city_hall_notes: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <Button fullWidth variant="contained" onClick={() => patchAuthorization(authorization.id)} disabled={saving}>
                            Salvar status/anexo
                          </Button>
                        </Grid>
                      </Grid>
                    </Box>
                  )}

                  {canGeneratePackage && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Organizar pacote para Prefeitura</Typography>
                      <Grid container spacing={1.5}>
                        <Grid item xs={12} md={4}>
                          <Button fullWidth variant="outlined" onClick={() => generatePackage(authorization.id)} disabled={saving}>
                            Gerar Pacote Prefeitura
                          </Button>
                        </Grid>
                      </Grid>
                    </Box>
                  )}

                  {canManageProtocol && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Registrar protocolo</Typography>
                      <Grid container spacing={1.5}>
                        <Grid item xs={12} md={3}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Nº protocolo"
                            value={protocolForm.protocol_number || ''}
                            onChange={(e) => setProtocolForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...protocolForm, protocol_number: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField
                            fullWidth
                            type="date"
                            size="small"
                            label="Data"
                            InputLabelProps={{ shrink: true }}
                            value={protocolForm.protocol_date || ''}
                            onChange={(e) => setProtocolForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...protocolForm, protocol_date: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Órgão"
                            value={protocolForm.protocol_agency || ''}
                            onChange={(e) => setProtocolForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...protocolForm, protocol_agency: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Responsável"
                            value={protocolForm.protocol_responsible_name || ''}
                            onChange={(e) => setProtocolForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...protocolForm, protocol_responsible_name: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Comprovante (URL)"
                            value={protocolForm.protocol_receipt_url || ''}
                            onChange={(e) => setProtocolForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...protocolForm, protocol_receipt_url: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Observações"
                            value={protocolForm.city_hall_notes || ''}
                            onChange={(e) => setProtocolForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...protocolForm, city_hall_notes: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <Button fullWidth variant="contained" onClick={() => submitProtocol(authorization.id)} disabled={saving}>
                            Registrar protocolo
                          </Button>
                        </Grid>
                      </Grid>
                    </Box>
                  )}

                  {canDecisionProgress && (
                    <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Andamento da Prefeitura</Typography>
                      <Grid container spacing={1.5}>
                        <Grid item xs={12} md={3}>
                          <TextField
                            select
                            fullWidth
                            size="small"
                            label="Decisão"
                            value={decisionForm.decision || 'WAITING_CITY_HALL_REVIEW'}
                            onChange={(e) => setDecisionForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...decisionForm, decision: e.target.value },
                            }))}
                          >
                            {statusOptions.map((status) => (
                              <MenuItem
                                key={status}
                                value={status}
                                disabled={!canDoFinalDecision && (status === 'APPROVED_BY_CITY_HALL' || status === 'REJECTED_BY_CITY_HALL')}
                              >
                                {STATUS_LABELS[status]}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Nº autorização"
                            value={decisionForm.authorization_number || ''}
                            onChange={(e) => setDecisionForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...decisionForm, authorization_number: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Documento autorização (URL)"
                            value={decisionForm.authorization_document_url || ''}
                            onChange={(e) => setDecisionForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...decisionForm, authorization_document_url: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField
                            fullWidth
                            type="date"
                            size="small"
                            label="Validade"
                            InputLabelProps={{ shrink: true }}
                            value={decisionForm.authorization_valid_until || ''}
                            onChange={(e) => setDecisionForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...decisionForm, authorization_valid_until: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Observações da Prefeitura"
                            value={decisionForm.city_hall_notes || ''}
                            onChange={(e) => setDecisionForms((prev) => ({
                              ...prev,
                              [authorization.id]: { ...decisionForm, city_hall_notes: e.target.value },
                            }))}
                          />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <Button fullWidth variant="contained" onClick={() => submitDecision(authorization.id)} disabled={saving}>
                            Atualizar andamento
                          </Button>
                        </Grid>
                        {isTerritorialManager && (
                          <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">
                              Aprovação final e indeferimento final são confirmados apenas pelo Admin KAVIAR.
                            </Typography>
                          </Grid>
                        )}
                      </Grid>
                    </Box>
                  )}
                </Box>
              );
            })
          )}
        </Stack>
      )}
    </Paper>
  );
}
