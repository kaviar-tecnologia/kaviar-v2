import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import {
  RECOGNITION_POLICY_LABELS,
  RECOGNITION_POLICY_OPTIONS,
  RECOGNITION_SCOPE_LABELS,
  RECOGNITION_SCOPE_OPTIONS,
  RECOGNITION_SUBJECT_LABELS,
  RECOGNITION_SUBJECT_OPTIONS,
} from '../../../utils/adminFinanceRecognitionUtils';
import {
  createFinanceRecognitionPolicy,
  getFinanceRecognitionPolicyById,
  listFinanceCostCenters,
  listFinanceBusinessUnits,
  listTerritories,
  updateFinanceRecognitionPolicy,
} from '../../../services/adminFinanceService';
import { listLegalEntities } from '../../../services/adminAccountingService';

const titleId = 'recognition-policy-form-title';
const discardTitleId = 'recognition-policy-discard-title';
const reloadTitleId = 'recognition-policy-reload-title';

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CC_PAGE_LIMIT = 25;

const defaultFormValues = () => ({
  code: '',
  subject: '',
  policy: '',
  scope_type: '',
  territory_id: '',
  cost_center_id: '',
  legal_entity_id: '',
  business_unit_id: '',
  city: '',
  state: '',
  effective_from: '',
  effective_until: '',
  reason: '',
  notes: '',
});

function policyToFormValues(policy) {
  if (!policy) return defaultFormValues();
  return {
    code: policy.code || '',
    subject: policy.subject || '',
    policy: policy.policy || '',
    scope_type: policy.scope_type || '',
    territory_id: policy.territory_id || '',
    cost_center_id: policy.cost_center_id || '',
    legal_entity_id: policy.legal_entity_id || '',
    business_unit_id: policy.business_unit_id || '',
    city: policy.city || '',
    state: policy.state || '',
    effective_from: policy.effective_from ? policy.effective_from.substring(0, 10) : '',
    effective_until: policy.effective_until ? policy.effective_until.substring(0, 10) : '',
    reason: policy.reason || '',
    notes: policy.notes || '',
  };
}

function validateForm(values) {
  const errors = {};

  const code = values.code.trim();
  if (!code) {
    errors.code = 'Código é obrigatório.';
  } else if (!CODE_PATTERN.test(code)) {
    errors.code = 'Use letras, números, ponto, underscore ou hífen, começando com letra ou número.';
  }

  if (!values.subject) errors.subject = 'Operação é obrigatória.';
  if (!values.policy) errors.policy = 'Classificação é obrigatória.';
  if (!values.scope_type) errors.scope_type = 'Escopo é obrigatório.';

  if (values.scope_type === 'TERRITORY' && !values.territory_id) {
    errors.territory_id = 'Território é obrigatório para este escopo.';
  }
  if (values.scope_type === 'CITY') {
    if (!values.city.trim()) errors.city = 'Cidade é obrigatória para este escopo.';
    if (!values.state.trim()) {
      errors.state = 'Estado (UF) é obrigatório para este escopo.';
    } else if (!/^[A-Z]{2}$/.test(values.state.trim().toUpperCase())) {
      errors.state = 'Informe a sigla do estado com 2 letras.';
    }
  }
  if (values.scope_type === 'COST_CENTER' && !values.cost_center_id) {
    errors.cost_center_id = 'Centro de custo é obrigatório para este escopo.';
  }

  if (!values.effective_from) errors.effective_from = 'Data de início é obrigatória.';

  if (values.effective_until && values.effective_from && values.effective_until <= values.effective_from) {
    errors.effective_until = 'Data final deve ser posterior à data inicial.';
  }

  if (!values.reason.trim()) errors.reason = 'Justificativa é obrigatória.';

  return errors;
}

function buildPostPayload(values) {
  const scope = values.scope_type;
  return {
    code: values.code.trim(),
    subject: values.subject,
    policy: values.policy,
    scope_type: scope,
    territory_id: scope === 'TERRITORY' ? values.territory_id : null,
    cost_center_id: scope === 'COST_CENTER' ? values.cost_center_id : null,
    legal_entity_id: values.legal_entity_id || null,
    business_unit_id: values.business_unit_id || null,
    city: scope === 'CITY' ? values.city.trim() : null,
    state: scope === 'CITY' ? values.state.trim().toUpperCase() : null,
    effective_from: values.effective_from,
    effective_until: values.effective_until || null,
    reason: values.reason.trim(),
    notes: values.notes.trim() || null,
  };
}

function buildPatchPayload(values, expectedUpdatedAt, initialValues) {
  const payload = { ...buildPostPayload(values) };
  if (initialValues && values.code === initialValues.code) {
    delete payload.code;
  }
  payload.expected_updated_at = expectedUpdatedAt;
  return payload;
}

function buildErrorPresentation(error) {
  const status = error?.status;
  const msg = error?.rawMessage || error?.message || '';
  const low = msg.toLowerCase();

  if (status === 400 || status === 422) {
    const fe = {};
    if (low.includes('effective_until') || low.includes('vigência até') || low.includes('vigencia ate')) {
      fe.effective_until = msg;
    } else if (low.includes('effective_from') || low.includes('vigência a partir') || low.includes('vigencia a partir')) {
      fe.effective_from = msg;
    } else if (low.includes('territory_id') || low.includes('território')) {
      fe.territory_id = msg;
    } else if (low.includes('cost_center_id') || low.includes('centro de custo')) {
      fe.cost_center_id = msg;
    } else if (low.includes('city') || low.includes('cidade')) {
      fe.city = msg;
    } else if (low.includes('state') || low.includes('estado')) {
      fe.state = msg;
    } else if (low.includes(' code') || low.includes('código') || low.includes('codigo')) {
      fe.code = msg;
    } else if (low.includes('scope')) {
      fe.scope_type = msg;
    }
    return {
      message: Object.keys(fe).length > 0 ? 'Revise os campos informados.' : (msg || 'Dados inválidos. Revise os campos.'),
      showReload: false,
      fieldErrors: Object.keys(fe).length > 0 ? fe : undefined,
    };
  }

  if (status === 403) {
    return {
      message: 'Você não tem permissão para realizar esta operação.',
      showReload: false,
    };
  }

  if (status === 404) {
    return {
      message: 'A política não foi encontrada ou foi removida.',
      showReload: false,
      kind: 'not_found',
    };
  }

  if (status === 409) {
    const isDuplicateCode =
      low.includes('exist') || low.includes('duplicat') ||
      low.includes('único') || low.includes('unico') || low.includes('unique');
    const isVersionConflict =
      low.includes('expected_updated_at') || low.includes('divergente') ||
      low.includes('stale') || low.includes('desatualiz') || low.includes('concurrenc');

    if (isDuplicateCode && !isVersionConflict) {
      return {
        message: 'Já existe uma política com este código.',
        showReload: false,
        fieldErrors: { code: 'Código já cadastrado. Escolha outro.' },
      };
    }

    if (isVersionConflict) {
      return {
        message: 'Esta política foi alterada por outro administrador. Recarregue os dados antes de salvar novamente.',
        showReload: true,
        reloadLabel: 'Recarregar dados',
        kind: 'version_conflict',
      };
    }

    return {
      message: msg || 'Conflito ao salvar. Tente novamente.',
      showReload: true,
      reloadLabel: 'Recarregar dados',
    };
  }

  return {
    message: msg || 'Erro ao salvar a política. Tente novamente.',
    showReload: false,
  };
}

export default function RecognitionPolicyFormDialog({ open, mode, policyId, onClose, onSuccess }) {
  const [formValues, setFormValues] = useState(defaultFormValues());
  const [fieldErrors, setFieldErrors] = useState({});
  const [validationError, setValidationError] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState('');

  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);

  const [legalEntities, setLegalEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [dimensionsLoading, setDimensionsLoading] = useState(false);

  const [territories, setTerritories] = useState([]);
  const [territoriesLoaded, setTerritoriesLoaded] = useState(false);
  const [loadingTerritories, setLoadingTerritories] = useState(false);

  const [costCenters, setCostCenters] = useState([]);
  const [costCentersPage, setCostCentersPage] = useState(0);      // 0 = not yet loaded
  const [costCentersTotalPages, setCostCentersTotalPages] = useState(1);
  const [loadingCostCenters, setLoadingCostCenters] = useState(false);
  const [costCentersError, setCostCentersError] = useState(false);

  const submitGuardRef = useRef(false);
  const initialFormValuesRef = useRef(defaultFormValues());
  const codeFieldRef = useRef(null);
  const ccFetchGenRef = useRef(0);
  const ccLoadingRef = useRef(false);

  // Reset and load on open
  useEffect(() => {
    if (!open) {
      setFormValues(defaultFormValues());
      setFieldErrors({});
      setValidationError('');
      setSubmitError(null);
      setDiscardConfirmOpen(false);
      setReloadConfirmOpen(false);
      setExpectedUpdatedAt('');
      setTerritories([]);
      setTerritoriesLoaded(false);
      setCostCenters([]);
      setCostCentersPage(0);
      setCostCentersTotalPages(1);
      setCostCentersError(false);
      ccFetchGenRef.current += 1;
      ccLoadingRef.current = false;
      return;
    }

    if (mode === 'create') {
      const initial = defaultFormValues();
      initialFormValuesRef.current = initial;
      setFormValues(initial);
      setFieldErrors({});
      setValidationError('');
      setSubmitError(null);
      setTimeout(() => codeFieldRef.current?.focus(), 50);
      return;
    }

    // Edit mode: fetch policy by ID
    if (mode === 'edit' && policyId) {
      setLoadingPolicy(true);
      setFieldErrors({});
      setValidationError('');
      setSubmitError(null);
      getFinanceRecognitionPolicyById(policyId)
        .then((res) => {
          if (res?.data) {
            const values = policyToFormValues(res.data);
            initialFormValuesRef.current = values;
            setFormValues(values);
            setExpectedUpdatedAt(res.data.updated_at || '');
          } else {
            setSubmitError({ message: 'Política não encontrada.', kind: 'not_found' });
          }
        })
        .catch((err) => {
          setSubmitError({ message: err?.message || 'Erro ao carregar política.', kind: 'load_error' });
        })
        .finally(() => {
          setLoadingPolicy(false);
        });
    }
  }, [open, mode, policyId]);

  useEffect(() => {
    if (!open) {
      setLegalEntities([]);
      setBusinessUnits([]);
      return;
    }
    setDimensionsLoading(true);
    Promise.allSettled([
      listLegalEntities({ page: 1, limit: 100, is_active: 'true' }),
      listFinanceBusinessUnits(),
    ]).then(([entities, units]) => {
      if (entities.status === 'fulfilled') setLegalEntities(Array.isArray(entities.value?.data) ? entities.value.data : []);
      if (units.status === 'fulfilled') setBusinessUnits(Array.isArray(units.value?.data) ? units.value.data : []);
    }).finally(() => setDimensionsLoading(false));
  }, [open]);

  // Lazy-load territories when scope = TERRITORY
  useEffect(() => {
    if (!open || formValues.scope_type !== 'TERRITORY') return;
    if (territoriesLoaded || loadingTerritories) return;
    setLoadingTerritories(true);
    listTerritories()
      .then((res) => {
        setTerritories(Array.isArray(res?.data) ? res.data : []);
        setTerritoriesLoaded(true);
      })
      .catch(() => { setTerritoriesLoaded(false); })
      .finally(() => setLoadingTerritories(false));
  }, [open, formValues.scope_type, territoriesLoaded, loadingTerritories]);

  // Lazy-load cost centers when scope = COST_CENTER (incremental pagination)
  const fetchCostCentersPage = useCallback((page) => {
    if (ccLoadingRef.current) return;
    const gen = ccFetchGenRef.current;
    ccLoadingRef.current = true;
    setLoadingCostCenters(true);
    setCostCentersError(false);
    listFinanceCostCenters({ is_active: true, page, limit: CC_PAGE_LIMIT })
      .then((res) => {
        if (gen !== ccFetchGenRef.current) return;
        const items = Array.isArray(res?.data) ? res.data : [];
        if (page === 1) {
          setCostCenters(items);
        } else {
          setCostCenters((prev) => {
            const ids = new Set(prev.map((c) => c.id));
            return [...prev, ...items.filter((c) => !ids.has(c.id))];
          });
        }
        setCostCentersPage(page);
        setCostCentersTotalPages(res?.pagination?.totalPages ?? 1);
      })
      .catch(() => {
        if (gen !== ccFetchGenRef.current) return;
        setCostCentersError(true);
      })
      .finally(() => {
        ccLoadingRef.current = false;
        if (gen === ccFetchGenRef.current) setLoadingCostCenters(false);
      });
  }, []);

  useEffect(() => {
    if (!open || formValues.scope_type !== 'COST_CENTER') return;
    if (costCentersPage !== 0 || ccLoadingRef.current) return;
    fetchCostCentersPage(1);
  }, [open, formValues.scope_type, costCentersPage, fetchCostCentersPage]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(formValues) !== JSON.stringify(initialFormValuesRef.current);
  }, [formValues]);

  const clearFieldError = useCallback((field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleChange = useCallback((field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    if (validationError) setValidationError('');
    clearFieldError(field);
  }, [validationError, clearFieldError]);

  const handleScopeChange = useCallback((newScope) => {
    if (newScope !== 'COST_CENTER') {
      ccFetchGenRef.current += 1;
      setCostCenters([]);
      setCostCentersPage(0);
      setCostCentersTotalPages(1);
      setCostCentersError(false);
      ccLoadingRef.current = false;
    }
    setFormValues((prev) => ({
      ...prev,
      scope_type: newScope,
      ...(newScope !== 'TERRITORY' && { territory_id: '' }),
      ...(newScope !== 'COST_CENTER' && { cost_center_id: '' }),
      ...(newScope !== 'CITY' && { city: '', state: '' }),
    }));
    if (validationError) setValidationError('');
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.scope_type;
      delete next.territory_id;
      delete next.cost_center_id;
      delete next.city;
      delete next.state;
      return next;
    });
  }, [validationError]);

  const handleRequestClose = (reason = 'cancel') => {
    if (submitting || loadingPolicy) return;
    if (hasUnsavedChanges && ['escapeKeyDown', 'backdropClick', 'cancel'].includes(reason)) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  };

  const doReload = async () => {
    setLoadingPolicy(true);
    setSubmitError(null);
    try {
      const res = await getFinanceRecognitionPolicyById(policyId);
      if (res?.data) {
        const values = policyToFormValues(res.data);
        initialFormValuesRef.current = values;
        setFormValues(values);
        setExpectedUpdatedAt(res.data.updated_at || '');
      }
    } catch (err) {
      setSubmitError({ message: err?.message || 'Erro ao recarregar dados.' });
    } finally {
      setLoadingPolicy(false);
    }
  };

  const handleReloadRequest = () => {
    if (hasUnsavedChanges) {
      setReloadConfirmOpen(true);
    } else {
      doReload();
    }
  };

  const handleSubmit = async () => {
    if (submitGuardRef.current || submitting || loadingPolicy) return;

    const errors = validateForm(formValues);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setValidationError('Revise os campos obrigatórios.');
      return;
    }

    setSubmitError(null);
    setValidationError('');
    setSubmitting(true);
    submitGuardRef.current = true;

    try {
      if (mode === 'create') {
        const result = await createFinanceRecognitionPolicy(buildPostPayload(formValues));
        onSuccess('Política criada como rascunho.', result?.data);
      } else {
        const result = await updateFinanceRecognitionPolicy(policyId, buildPatchPayload(formValues, expectedUpdatedAt, initialFormValuesRef.current));
        onSuccess('Política atualizada com sucesso.', result?.data);
      }
    } catch (error) {
      const pres = buildErrorPresentation(error);
      setSubmitError(pres);
      if (pres.fieldErrors) {
        setFieldErrors((prev) => ({ ...prev, ...pres.fieldErrors }));
      }
    } finally {
      setSubmitting(false);
      submitGuardRef.current = false;
    }
  };

  const tf = (field) => ({
    error: Boolean(fieldErrors[field]),
    helperText: fieldErrors[field] || ' ',
  });

  const isCreate = mode === 'create';
  const title = isCreate ? 'Nova política financeira' : 'Editar política financeira';
  const subtitle = isCreate
    ? 'Crie um rascunho para definir como uma operação será reconhecida.'
    : 'Altere os dados do rascunho. A política continuará sem produzir efeitos até ser aprovada.';

  const selectedTerritory = territories.find((t) => t.id === formValues.territory_id) || null;
  const selectedCostCenter = costCenters.find((cc) => cc.id === formValues.cost_center_id) || null;

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => handleRequestClose(reason)}
      disableEscapeKeyDown={submitting}
      fullWidth
      maxWidth="md"
      scroll="paper"
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>
        {title}
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
          {subtitle}
        </Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ maxHeight: '75vh' }} aria-busy={submitting || loadingPolicy}>
        {loadingPolicy ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={2} sx={{ mt: 0.25 }}>
            {/* ── Code ──────────────────────────────────────────────────────── */}
            <Grid item xs={12} md={6}>
              <TextField
                label="Código"
                value={formValues.code}
                onChange={(e) => handleChange('code', e.target.value)}
                fullWidth
                required
                size="small"
                autoFocus={isCreate}
                inputRef={codeFieldRef}
                inputProps={{ maxLength: 120, style: { fontFamily: 'monospace' } }}
                placeholder="EX.: RIDE_REVENUE.CITY_RIO_2026"
                {...tf('code')}
                helperText={fieldErrors.code || 'Letras (maiúsculas ou minúsculas), números, ponto, underscore ou hífen.'}
              />
            </Grid>

            {/* ── Subject ───────────────────────────────────────────────────── */}
            <Grid item xs={12} md={6}>
              <TextField
                label="Operação"
                value={formValues.subject}
                onChange={(e) => handleChange('subject', e.target.value)}
                fullWidth
                required
                select
                size="small"
                {...tf('subject')}
              >
                {RECOGNITION_SUBJECT_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>{RECOGNITION_SUBJECT_LABELS[s]}</MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* ── Policy (classification) ────────────────────────────────────── */}
            <Grid item xs={12} md={6}>
              <TextField
                label="Classificação contábil"
                value={formValues.policy}
                onChange={(e) => handleChange('policy', e.target.value)}
                fullWidth
                required
                select
                size="small"
                {...tf('policy')}
                helperText={
                  fieldErrors.policy ||
                  'Define como a receita será reconhecida. A política continuará como rascunho até uma aprovação separada.'
                }
              >
                {RECOGNITION_POLICY_OPTIONS.map((p) => (
                  <MenuItem key={p} value={p}>{RECOGNITION_POLICY_LABELS[p]}</MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* ── Independent accounting dimensions ────────────────────────────── */}
            <Grid item xs={12} md={6}>
              <TextField
                label="Empresa / filial"
                value={formValues.legal_entity_id}
                onChange={(e) => handleChange('legal_entity_id', e.target.value)}
                fullWidth
                select
                size="small"
                disabled={dimensionsLoading}
                helperText="Opcional. Em branco, a regra vale para todas as empresas/CNPJs dentro do escopo."
              >
                <MenuItem value="">Todas as empresas</MenuItem>
                {legalEntities.map((entity) => (
                  <MenuItem key={entity.id} value={entity.id}>
                    {entity.nome_fantasia || entity.razao_social} — {entity.entity_type}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Produto / linha de negócio"
                value={formValues.business_unit_id}
                onChange={(e) => handleChange('business_unit_id', e.target.value)}
                fullWidth
                select
                size="small"
                disabled={dimensionsLoading}
                helperText="Opcional. Permite regras específicas para Mobilidade, KAVIAR AR, Pet, Care e demais linhas."
              >
                <MenuItem value="">Todos os produtos</MenuItem>
                {businessUnits.map((unit) => (
                  <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* ── Scope type ────────────────────────────────────────────────── */}
            <Grid item xs={12} md={6}>
              <TextField
                label="Escopo"
                value={formValues.scope_type}
                onChange={(e) => handleScopeChange(e.target.value)}
                fullWidth
                required
                select
                size="small"
                {...tf('scope_type')}
              >
                {RECOGNITION_SCOPE_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>{RECOGNITION_SCOPE_LABELS[s]}</MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* ── Scope-conditional: TERRITORY ──────────────────────────────── */}
            {formValues.scope_type === 'TERRITORY' && (
              <Grid item xs={12}>
                <Autocomplete
                  options={territories}
                  getOptionLabel={(opt) => opt.name || ''}
                  value={selectedTerritory}
                  onChange={(_, newValue) => handleChange('territory_id', newValue?.id || '')}
                  loading={loadingTerritories}
                  isOptionEqualToValue={(opt, val) => opt.id === val.id}
                  noOptionsText={loadingTerritories ? 'Carregando...' : 'Nenhum território encontrado'}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Território"
                      required
                      size="small"
                      error={Boolean(fieldErrors.territory_id)}
                      helperText={fieldErrors.territory_id || ' '}
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingTerritories && <CircularProgress size={16} />}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />
              </Grid>
            )}

            {/* ── Scope-conditional: CITY ───────────────────────────────────── */}
            {formValues.scope_type === 'CITY' && (
              <>
                <Grid item xs={12} md={8}>
                  <TextField
                    label="Cidade"
                    value={formValues.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    fullWidth
                    required
                    size="small"
                    {...tf('city')}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Estado (UF)"
                    value={formValues.state}
                    onChange={(e) => handleChange('state', e.target.value.toUpperCase())}
                    fullWidth
                    required
                    size="small"
                    inputProps={{ maxLength: 2 }}
                    placeholder="SP"
                    {...tf('state')}
                  />
                </Grid>
              </>
            )}

            {/* ── Scope-conditional: COST_CENTER ────────────────────────────── */}
            {formValues.scope_type === 'COST_CENTER' && (
              <Grid item xs={12}>
                <Autocomplete
                  options={costCenters}
                  getOptionLabel={(opt) => `${opt.code} — ${opt.name}` || ''}
                  value={selectedCostCenter}
                  onChange={(_, newValue) => handleChange('cost_center_id', newValue?.id || '')}
                  loading={loadingCostCenters && costCentersPage === 0}
                  isOptionEqualToValue={(opt, val) => opt.id === val.id}
                  noOptionsText={
                    loadingCostCenters ? 'Carregando...'
                    : costCentersError ? 'Erro ao carregar centros de custo.'
                    : 'Nenhum centro de custo encontrado'
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Centro de custo"
                      required
                      size="small"
                      error={Boolean(fieldErrors.cost_center_id)}
                      helperText={fieldErrors.cost_center_id || 'Somente centros de custo ativos.'}
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingCostCenters && costCentersPage === 0 && <CircularProgress size={16} />}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />
                {/* Error state */}
                {costCentersError && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Typography variant="caption" color="error.main">
                      {costCentersPage === 0
                        ? 'Erro ao carregar centros de custo.'
                        : 'Erro ao carregar mais centros. Os itens anteriores foram mantidos.'}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => fetchCostCentersPage(costCentersPage === 0 ? 1 : costCentersPage + 1)}
                      disabled={loadingCostCenters}
                    >
                      Tentar novamente
                    </Button>
                  </Box>
                )}
                {/* Load more */}
                {!costCentersError && costCentersPage > 0 && costCentersPage < costCentersTotalPages && (
                  <Box sx={{ mt: 0.5 }}>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => fetchCostCentersPage(costCentersPage + 1)}
                      disabled={loadingCostCenters}
                      endIcon={loadingCostCenters ? <CircularProgress size={12} /> : undefined}
                    >
                      {loadingCostCenters
                        ? 'Carregando mais centros de custo...'
                        : 'Carregar mais centros de custo'}
                    </Button>
                  </Box>
                )}
              </Grid>
            )}

            {/* ── Vigência ──────────────────────────────────────────────────── */}
            <Grid item xs={12} md={6}>
              <TextField
                label="Vigência a partir de"
                type="date"
                value={formValues.effective_from}
                onChange={(e) => handleChange('effective_from', e.target.value)}
                fullWidth
                required
                size="small"
                InputLabelProps={{ shrink: true }}
                {...tf('effective_from')}
                helperText={fieldErrors.effective_from || 'Formato YYYY-MM-DD, sem conversão de fuso horário.'}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Vigência até (opcional)"
                type="date"
                value={formValues.effective_until}
                onChange={(e) => handleChange('effective_until', e.target.value)}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: formValues.effective_from || undefined }}
                {...tf('effective_until')}
                helperText={fieldErrors.effective_until || 'Deixe em branco para vigência aberta.'}
              />
            </Grid>

            {/* ── Reason ────────────────────────────────────────────────────── */}
            <Grid item xs={12}>
              <TextField
                label="Justificativa"
                value={formValues.reason}
                onChange={(e) => handleChange('reason', e.target.value)}
                fullWidth
                required
                multiline
                minRows={3}
                size="small"
                inputProps={{ maxLength: 2000 }}
                {...tf('reason')}
                helperText={
                  fieldErrors.reason || `${formValues.reason.length}/2000 caracteres`
                }
              />
            </Grid>

            {/* ── Notes ─────────────────────────────────────────────────────── */}
            <Grid item xs={12}>
              <TextField
                label="Observações internas (opcional)"
                value={formValues.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                fullWidth
                multiline
                minRows={2}
                size="small"
                inputProps={{ maxLength: 2000 }}
                helperText={fieldErrors.notes || `${formValues.notes.length}/2000 caracteres`}
                error={Boolean(fieldErrors.notes)}
              />
            </Grid>
          </Grid>
        )}

        {/* ── Error / submit error ───────────────────────────────────────────── */}
        {(validationError || submitError) && !loadingPolicy && (
          <Alert severity={submitError?.kind === 'version_conflict' ? 'warning' : 'error'} sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span>{validationError || submitError?.message}</span>
              {submitError?.showReload && mode === 'edit' && (
                <Box>
                  <Button size="small" onClick={handleReloadRequest} disabled={submitting || loadingPolicy}>
                    {submitError.reloadLabel || 'Recarregar dados'}
                  </Button>
                </Box>
              )}
            </Box>
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={() => handleRequestClose('cancel')} disabled={submitting || loadingPolicy}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || loadingPolicy}
          aria-label={isCreate ? 'Criar política como rascunho' : 'Salvar alterações na política'}
        >
          <span aria-live="polite">
            {submitting ? 'Salvando...' : (isCreate ? 'Criar rascunho' : 'Salvar alterações')}
          </span>
        </Button>
      </DialogActions>

      {/* ── Discard confirm ───────────────────────────────────────────────────── */}
      <Dialog
        open={discardConfirmOpen}
        onClose={(_, reason) => {
          if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
            setDiscardConfirmOpen(false);
            return;
          }
          setDiscardConfirmOpen(false);
        }}
        fullWidth
        maxWidth="xs"
        aria-labelledby={discardTitleId}
      >
        <DialogTitle id={discardTitleId}>Descartar alterações?</DialogTitle>
        <DialogContent dividers>
          <Typography>
            Existem alterações não salvas. Deseja descartá-las?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setDiscardConfirmOpen(false)}>
            Continuar editando
          </Button>
          <Button color="error" variant="contained" onClick={() => { setDiscardConfirmOpen(false); onClose(); }}>
            Descartar alterações
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Reload confirm (version conflict with unsaved changes) ────────────── */}
      <Dialog
        open={reloadConfirmOpen}
        onClose={() => setReloadConfirmOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby={reloadTitleId}
      >
        <DialogTitle id={reloadTitleId}>Recarregar dados?</DialogTitle>
        <DialogContent dividers>
          <Typography>
            As alterações não salvas serão perdidas ao recarregar os dados do servidor. Deseja continuar?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setReloadConfirmOpen(false)}>
            Continuar editando
          </Button>
          <Button color="warning" variant="contained" onClick={() => { setReloadConfirmOpen(false); doReload(); }}>
            Recarregar dados
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
