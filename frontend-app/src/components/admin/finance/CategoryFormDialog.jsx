/**
 * CategoryFormDialog — Create/Edit financial categories with accounting fields.
 *
 * Self-contained pattern (like RecognitionPolicyFormDialog):
 * - Owns its own API calls
 * - Handles error presentation internally
 * - Notifies parent via onSuccess callback
 *
 * Props:
 *   open       — dialog visibility
 *   mode       — 'create' | 'edit'
 *   categoryId — ID for edit mode (fetched on open)
 *   categories — existing categories list for parent selector
 *   onClose    — close callback
 *   onSuccess  — (message) => void — called after successful save
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { HelpOutline } from '@mui/icons-material';
import {
  createFinanceCategory,
  updateFinanceCategory,
  getFinanceCategoryErrorPresentation,
  listFinanceCategories,
} from '../../../services/adminFinanceService';

// ── Constants ─────────────────────────────────────────────────────────────────

const CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const KIND_OPTIONS = [
  { value: 'REVENUE', label: 'Receita' },
  { value: 'EXPENSE', label: 'Despesa' },
  { value: 'CONTRIBUTION', label: 'Aporte' },
  { value: 'WITHDRAWAL', label: 'Retirada' },
  { value: 'TRANSFER', label: 'Transferência' },
  { value: 'LIABILITY', label: 'Passivo' },
  { value: 'CLEARING', label: 'Compensação' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
];

const NATURE_OPTIONS = [
  { value: '', label: '— Não definida —' },
  { value: 'DEBIT', label: 'Devedora (Débito)' },
  { value: 'CREDIT', label: 'Credora (Crédito)' },
];

const DIRECTION_OPTIONS = [
  { value: '', label: '— Sem padrão —' },
  { value: 'IN', label: 'Entrada (IN)' },
  { value: 'OUT', label: 'Saída (OUT)' },
];

const FIELD_TOOLTIPS = {
  accounting_code: 'Código do plano de contas oficial (ex: 3.1.01.01)',
  accounting_nature: 'Natureza contábil: Devedora = aumenta com débito, Credora = aumenta com crédito',
  dre_group: 'Grupo na Demonstração de Resultado do Exercício (ex: Custos Operacionais)',
  balance_sheet_group: 'Grupo no Balanço Patrimonial (ex: Ativo Circulante)',
  fiscal_classification: 'Classificação fiscal para obrigações acessórias (CFOP, CST, etc.)',
  deductible: 'Se a despesa é dedutível para fins de apuração de impostos',
  export_code: 'Código para integração com sistema contábil externo',
  accountant_notes: 'Observações livres do contador sobre esta categoria',
};

function emptyForm() {
  return {
    code: '',
    name: '',
    kind: 'EXPENSE',
    parent_id: '',
    default_direction: '',
    requires_document: false,
    is_active: true,
    sort_order: 0,
    accounting_code: '',
    accounting_nature: '',
    dre_group: '',
    balance_sheet_group: '',
    fiscal_classification: '',
    deductible: null,
    export_code: '',
    accountant_notes: '',
  };
}

function categoryToForm(cat) {
  return {
    code: cat.code || '',
    name: cat.name || '',
    kind: cat.kind || 'EXPENSE',
    parent_id: cat.parent_id || '',
    default_direction: cat.default_direction || '',
    requires_document: cat.requires_document ?? false,
    is_active: cat.is_active ?? true,
    sort_order: cat.sort_order ?? 0,
    accounting_code: cat.accounting_code || '',
    accounting_nature: cat.accounting_nature || '',
    dre_group: cat.dre_group || '',
    balance_sheet_group: cat.balance_sheet_group || '',
    fiscal_classification: cat.fiscal_classification || '',
    deductible: cat.deductible,
    export_code: cat.export_code || '',
    accountant_notes: cat.accountant_notes || '',
  };
}

function validateForm(form, mode) {
  const errors = {};
  if (!form.code.trim()) {
    errors.code = 'Código é obrigatório';
  } else if (!CODE_REGEX.test(form.code.trim())) {
    errors.code = 'Código inválido (use letras, números, ".", "-", "_")';
  } else if (form.code.trim().length > 120) {
    errors.code = 'Máximo 120 caracteres';
  }
  if (!form.name.trim()) {
    errors.name = 'Nome é obrigatório';
  } else if (form.name.trim().length > 160) {
    errors.name = 'Máximo 160 caracteres';
  }
  if (!form.kind) {
    errors.kind = 'Tipo é obrigatório';
  }
  if (form.accounting_code && form.accounting_code.length > 50) {
    errors.accounting_code = 'Máximo 50 caracteres';
  }
  if (form.dre_group && form.dre_group.length > 200) {
    errors.dre_group = 'Máximo 200 caracteres';
  }
  if (form.balance_sheet_group && form.balance_sheet_group.length > 200) {
    errors.balance_sheet_group = 'Máximo 200 caracteres';
  }
  if (form.fiscal_classification && form.fiscal_classification.length > 200) {
    errors.fiscal_classification = 'Máximo 200 caracteres';
  }
  if (form.export_code && form.export_code.length > 100) {
    errors.export_code = 'Máximo 100 caracteres';
  }
  if (form.accountant_notes && form.accountant_notes.length > 2000) {
    errors.accountant_notes = 'Máximo 2000 caracteres';
  }
  return errors;
}

function buildCreatePayload(form) {
  const payload = {
    code: form.code.trim(),
    name: form.name.trim(),
    kind: form.kind,
    is_active: form.is_active,
    sort_order: Number(form.sort_order) || 0,
  };
  if (form.parent_id) payload.parent_id = form.parent_id;
  if (form.default_direction) payload.default_direction = form.default_direction;
  if (form.requires_document) payload.requires_document = true;
  // Accounting fields
  if (form.accounting_code.trim()) payload.accounting_code = form.accounting_code.trim();
  if (form.accounting_nature) payload.accounting_nature = form.accounting_nature;
  if (form.dre_group.trim()) payload.dre_group = form.dre_group.trim();
  if (form.balance_sheet_group.trim()) payload.balance_sheet_group = form.balance_sheet_group.trim();
  if (form.fiscal_classification.trim()) payload.fiscal_classification = form.fiscal_classification.trim();
  if (form.deductible !== null) payload.deductible = form.deductible;
  if (form.export_code.trim()) payload.export_code = form.export_code.trim();
  if (form.accountant_notes.trim()) payload.accountant_notes = form.accountant_notes.trim();
  return payload;
}

function buildPatchPayload(form, original, expectedUpdatedAt) {
  const payload = { expected_updated_at: expectedUpdatedAt };
  const strFields = ['code', 'name', 'kind', 'default_direction', 'accounting_code', 'dre_group', 'balance_sheet_group', 'fiscal_classification', 'export_code', 'accountant_notes', 'accounting_nature'];
  for (const key of strFields) {
    const val = (form[key] || '').trim();
    const orig = original[key] || '';
    if (val !== orig) {
      payload[key] = val || null;
    }
  }
  if (form.parent_id !== (original.parent_id || '')) {
    payload.parent_id = form.parent_id || null;
  }
  if (form.requires_document !== original.requires_document) {
    payload.requires_document = form.requires_document;
  }
  if (form.is_active !== original.is_active) {
    payload.is_active = form.is_active;
  }
  if (Number(form.sort_order) !== (original.sort_order ?? 0)) {
    payload.sort_order = Number(form.sort_order) || 0;
  }
  if (form.deductible !== original.deductible) {
    payload.deductible = form.deductible;
  }
  return payload;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CategoryFormDialog({ open, mode, categoryId, categories = [], onClose, onSuccess }) {
  const [form, setForm] = useState(emptyForm());
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [errorPresentation, setErrorPresentation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [originalData, setOriginalData] = useState(null);
  const submitGuardRef = useRef(false);

  const title = mode === 'create' ? 'Nova categoria financeira' : 'Editar categoria financeira';

  // Load category data in edit mode
  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setErrorPresentation(null);
    setSubmitting(false);
    submitGuardRef.current = false;

    if (mode === 'edit' && categoryId) {
      setLoading(true);
      // Find the category from the list (already loaded by parent)
      const found = categories.find((c) => c.id === categoryId);
      if (found) {
        setForm(categoryToForm(found));
        setOriginalData(found);
        setLoading(false);
      } else {
        // Fallback: fetch from API
        listFinanceCategories({ limit: 500 })
          .then((res) => {
            const cat = res?.data?.find((c) => c.id === categoryId);
            if (cat) {
              setForm(categoryToForm(cat));
              setOriginalData(cat);
            } else {
              setErrorPresentation({ message: 'Categoria não encontrada.', showReload: false });
            }
          })
          .catch(() => {
            setErrorPresentation({ message: 'Erro ao carregar categoria.', showReload: false });
          })
          .finally(() => setLoading(false));
      }
    } else {
      setForm(emptyForm());
      setOriginalData(null);
      setLoading(false);
    }
  }, [open, mode, categoryId, categories]);

  const handleChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitGuardRef.current) return;

    const errors = validateForm(form, mode);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    submitGuardRef.current = true;
    setSubmitting(true);
    setErrorPresentation(null);

    try {
      if (mode === 'create') {
        const payload = buildCreatePayload(form);
        await createFinanceCategory(payload);
        onSuccess?.('Categoria criada com sucesso.');
      } else {
        const payload = buildPatchPayload(form, originalData, originalData?.updated_at);
        // Only submit if there are actual changes beyond expected_updated_at
        const changeKeys = Object.keys(payload).filter((k) => k !== 'expected_updated_at');
        if (changeKeys.length === 0) {
          onClose?.();
          return;
        }
        await updateFinanceCategory(categoryId, payload);
        onSuccess?.('Categoria atualizada com sucesso.');
      }
    } catch (error) {
      const presentation = getFinanceCategoryErrorPresentation(error);
      setErrorPresentation(presentation);
    } finally {
      setSubmitting(false);
      submitGuardRef.current = false;
    }
  }, [form, mode, categoryId, originalData, onSuccess, onClose]);

  // Filter parent options: only categories of the same kind that are not the current one
  const parentOptions = useMemo(() => {
    return categories.filter(
      (c) => c.kind === form.kind && c.id !== categoryId && c.is_active
    );
  }, [categories, form.kind, categoryId]);

  const getFieldProps = (field, label) => ({
    value: form[field] || '',
    onChange: (e) => handleChange(field, e.target.value),
    error: Boolean(fieldErrors[field]),
    helperText: fieldErrors[field] || '',
    label,
    size: 'small',
    fullWidth: true,
    disabled: submitting,
  });

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            {/* ── Dados Básicos ─────────────────────────────────────────── */}
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
              Dados básicos
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                {...getFieldProps('code', 'Código')}
                required
                disabled={submitting || (mode === 'edit' && originalData?.is_system)}
                placeholder="EX: SERVICOS_JURIDICOS"
                inputProps={{ maxLength: 120 }}
              />
              <TextField
                {...getFieldProps('name', 'Nome')}
                required
                placeholder="Ex: Serviços jurídicos"
                inputProps={{ maxLength: 160 }}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <FormControl size="small" fullWidth error={Boolean(fieldErrors.kind)}>
                <InputLabel>Tipo *</InputLabel>
                <Select
                  value={form.kind}
                  label="Tipo *"
                  onChange={(e) => handleChange('kind', e.target.value)}
                  disabled={submitting || (mode === 'edit' && originalData?.is_system)}
                >
                  {KIND_OPTIONS.map((o) => (
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </Select>
                {fieldErrors.kind && <FormHelperText>{fieldErrors.kind}</FormHelperText>}
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Categoria pai</InputLabel>
                <Select
                  value={form.parent_id}
                  label="Categoria pai"
                  onChange={(e) => handleChange('parent_id', e.target.value)}
                  disabled={submitting}
                >
                  <MenuItem value="">— Nenhuma (raiz) —</MenuItem>
                  {parentOptions.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Direção padrão</InputLabel>
                <Select
                  value={form.default_direction}
                  label="Direção padrão"
                  onChange={(e) => handleChange('default_direction', e.target.value)}
                  disabled={submitting}
                >
                  {DIRECTION_OPTIONS.map((o) => (
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <TextField
                type="number"
                size="small"
                label="Ordem"
                value={form.sort_order}
                onChange={(e) => handleChange('sort_order', e.target.value)}
                disabled={submitting}
                sx={{ width: 120 }}
                inputProps={{ min: 0, max: 100000 }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.requires_document}
                    onChange={(e) => handleChange('requires_document', e.target.checked)}
                    disabled={submitting}
                    size="small"
                  />
                }
                label="Exige documento"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.is_active}
                    onChange={(e) => handleChange('is_active', e.target.checked)}
                    disabled={submitting}
                    size="small"
                  />
                }
                label="Ativa"
              />
            </Box>

            <Divider sx={{ my: 1 }} />

            {/* ── Classificação Contábil ────────────────────────────────── */}
            <Typography variant="subtitle2" color="text.secondary">
              Classificação contábil
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <TextField
                  {...getFieldProps('accounting_code', 'Código contábil')}
                  placeholder="Ex: 3.1.01.01"
                  inputProps={{ maxLength: 50 }}
                />
                <Tooltip title={FIELD_TOOLTIPS.accounting_code} arrow>
                  <HelpOutline sx={{ fontSize: 16, color: 'text.secondary', mt: 1.2 }} />
                </Tooltip>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Natureza contábil</InputLabel>
                  <Select
                    value={form.accounting_nature}
                    label="Natureza contábil"
                    onChange={(e) => handleChange('accounting_nature', e.target.value)}
                    disabled={submitting}
                  >
                    {NATURE_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Tooltip title={FIELD_TOOLTIPS.accounting_nature} arrow>
                  <HelpOutline sx={{ fontSize: 16, color: 'text.secondary', mt: 1.2 }} />
                </Tooltip>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <TextField
                  {...getFieldProps('dre_group', 'Grupo DRE')}
                  placeholder="Ex: Custos Operacionais"
                  inputProps={{ maxLength: 200 }}
                />
                <Tooltip title={FIELD_TOOLTIPS.dre_group} arrow>
                  <HelpOutline sx={{ fontSize: 16, color: 'text.secondary', mt: 1.2 }} />
                </Tooltip>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <TextField
                  {...getFieldProps('balance_sheet_group', 'Grupo balanço patrimonial')}
                  placeholder="Ex: Ativo Circulante"
                  inputProps={{ maxLength: 200 }}
                />
                <Tooltip title={FIELD_TOOLTIPS.balance_sheet_group} arrow>
                  <HelpOutline sx={{ fontSize: 16, color: 'text.secondary', mt: 1.2 }} />
                </Tooltip>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <TextField
                  {...getFieldProps('fiscal_classification', 'Classificação fiscal')}
                  placeholder="Ex: CFOP 5102"
                  inputProps={{ maxLength: 200 }}
                />
                <Tooltip title={FIELD_TOOLTIPS.fiscal_classification} arrow>
                  <HelpOutline sx={{ fontSize: 16, color: 'text.secondary', mt: 1.2 }} />
                </Tooltip>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <TextField
                  {...getFieldProps('export_code', 'Código exportação')}
                  placeholder="Ex: EXP-001"
                  inputProps={{ maxLength: 100 }}
                />
                <Tooltip title={FIELD_TOOLTIPS.export_code} arrow>
                  <HelpOutline sx={{ fontSize: 16, color: 'text.secondary', mt: 1.2 }} />
                </Tooltip>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.deductible === true}
                    indeterminate={form.deductible === null}
                    onChange={() => {
                      // Cycle: null → true → false → null
                      const next = form.deductible === null ? true : form.deductible === true ? false : null;
                      handleChange('deductible', next);
                    }}
                    disabled={submitting}
                    size="small"
                  />
                }
                label={
                  form.deductible === true
                    ? 'Dedutível: Sim'
                    : form.deductible === false
                      ? 'Dedutível: Não'
                      : 'Dedutível: Não definido'
                }
              />
              <Tooltip title={FIELD_TOOLTIPS.deductible} arrow>
                <HelpOutline sx={{ fontSize: 16, color: 'text.secondary' }} />
              </Tooltip>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
              <TextField
                {...getFieldProps('accountant_notes', 'Observações do contador')}
                multiline
                rows={3}
                placeholder="Notas livres para o contador..."
                inputProps={{ maxLength: 2000 }}
              />
              <Tooltip title={FIELD_TOOLTIPS.accountant_notes} arrow>
                <HelpOutline sx={{ fontSize: 16, color: 'text.secondary', mt: 1.2 }} />
              </Tooltip>
            </Box>

            {/* ── Error display ─────────────────────────────────────────── */}
            {errorPresentation && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {errorPresentation.message}
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} color="inherit">
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || loading}
          variant="contained"
          aria-live="polite"
        >
          {submitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
