import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  ACCOUNT_TYPE_OPTIONS,
  BANK_CODE_MAX_LENGTH,
  getAccountFormValues,
  getAccountTypeLabel,
  validateAccountFormValues,
} from '../../../utils/adminFinanceAccountUtils';

const requiredError = 'Preencha os campos obrigatorios.';
const titleId = 'account-form-dialog-title';
const discardTitleId = 'account-form-discard-dialog-title';

export default function AccountFormDialog({
  open,
  mode,
  account,
  legalEntities = [],
  role,
  isSuperAdmin,
  submitting,
  error,
  onClose,
  onReloadData,
  onSubmit,
}) {
  const [formValues, setFormValues] = useState(getAccountFormValues());
  const [validationError, setValidationError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const submitGuardRef = useRef(false);
  const initialFormValuesRef = useRef(getAccountFormValues());
  const focusFieldRef = useRef(null);
  const canEditStructuralFields = mode === 'create' || isSuperAdmin;

  useEffect(() => {
    if (!open) return;
    const initialValues = getAccountFormValues(account);
    initialFormValuesRef.current = initialValues;
    setFormValues(initialValues);
    setValidationError('');
    setFieldErrors({});
    setDiscardConfirmOpen(false);
  }, [open, account]);

  const title = useMemo(() => (mode === 'edit' ? 'Editar conta' : 'Nova conta'), [mode]);

  const structuralFieldsNotice = useMemo(() => {
    if (mode === 'create') {
      return 'Código, tipo, empresa/filial titular, moeda e saldo inicial são campos estruturais. A titularidade define a qual CNPJ a conta financeira pertence.';
    }

    if (!canEditStructuralFields) {
      return 'Código, tipo, empresa/filial titular, moeda e saldo inicial são campos estruturais. Nesta edição, somente SUPER_ADMIN pode alterá-los.';
    }

    return 'Código, tipo, empresa/filial titular, moeda e saldo inicial são campos estruturais e ficam protegidos após uso da conta.';
  }, [canEditStructuralFields, mode]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(formValues) !== JSON.stringify(initialFormValuesRef.current);
  }, [formValues]);

  const focusFormField = () => {
    setTimeout(() => {
      if (focusFieldRef.current && typeof focusFieldRef.current.focus === 'function') {
        focusFieldRef.current.focus();
        return;
      }

      const fallback = document.querySelector(
        '[aria-labelledby="account-form-dialog-title"] input:not([disabled]), [aria-labelledby="account-form-dialog-title"] textarea:not([disabled]), [aria-labelledby="account-form-dialog-title"] [role="combobox"]:not([aria-disabled="true"])'
      );
      if (fallback && typeof fallback.focus === 'function') {
        fallback.focus();
      }
    }, 0);
  };

  const handleRequestClose = (reason = 'cancelButton') => {
    if (submitting) return;

    if (hasUnsavedChanges && (reason === 'escapeKeyDown' || reason === 'backdropClick' || reason === 'cancelButton')) {
      setDiscardConfirmOpen(true);
      return;
    }

    onClose();
  };

  const handleDiscardContinueEditing = () => {
    setDiscardConfirmOpen(false);
    focusFormField();
  };

  const handleDiscardChanges = () => {
    setDiscardConfirmOpen(false);
    onClose();
  };

  const handleChange = (key, value) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    if (validationError) setValidationError('');

    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    if (submitGuardRef.current || submitting) return;

    const code = formValues.code.trim();
    const name = formValues.name.trim();
    const currency = formValues.currency.trim();

    if (!code || !name || !formValues.type || !formValues.legal_entity_id || !currency) {
      setValidationError(requiredError);
      return;
    }

    const validation = validateAccountFormValues(formValues, { mode, canEditStructuralFields });
    if (!validation.isValid) {
      setFieldErrors(validation.fieldErrors);
      setValidationError('Revise os campos informados.');
      return;
    }

    submitGuardRef.current = true;

    try {
      await onSubmit(formValues);
    } finally {
      submitGuardRef.current = false;
    }
  };

  const getTextFieldProps = (fieldName) => {
    const helperText = fieldErrors[fieldName];
    return {
      error: Boolean(helperText),
      helperText: helperText || ' ',
    };
  };

  const structuralInputProps = canEditStructuralFields
    ? {}
    : {
        InputProps: { readOnly: true },
        disabled: true,
      };

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
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent dividers sx={{ maxHeight: '75vh' }} aria-busy={submitting}>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12}>
            <Alert severity="info">{structuralFieldsNotice}</Alert>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Perfil atual: {role || 'ADMIN'}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Codigo"
              value={formValues.code}
              onChange={(event) => handleChange('code', event.target.value.toUpperCase())}
              fullWidth
              required
              size="small"
              autoFocus
              inputRef={focusFieldRef}
              {...structuralInputProps}
              {...getTextFieldProps('code')}
            />
          </Grid>
          <Grid item xs={12} md={8}>
            <TextField
              label="Nome"
              value={formValues.name}
              onChange={(event) => handleChange('name', event.target.value)}
              fullWidth
              required
              size="small"
              {...getTextFieldProps('name')}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Tipo"
              value={formValues.type}
              onChange={(event) => handleChange('type', event.target.value)}
              fullWidth
              required
              select
              size="small"
              {...structuralInputProps}
              {...getTextFieldProps('type')}
            >
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>{getAccountTypeLabel(option)}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={8}>
            <TextField
              label="Empresa / filial titular"
              value={formValues.legal_entity_id}
              onChange={(event) => handleChange('legal_entity_id', event.target.value)}
              fullWidth
              required
              select
              size="small"
              {...structuralInputProps}
              error={Boolean(fieldErrors.legal_entity_id)}
              helperText={fieldErrors.legal_entity_id || 'CNPJ responsável por esta conta financeira.'}
            >
              {legalEntities.map((entity) => (
                <MenuItem key={entity.id} value={entity.id}>
                  {(entity.nome_fantasia || entity.razao_social)} — {entity.cnpj} ({entity.entity_type})
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Moeda"
              value={formValues.currency}
              onChange={(event) => handleChange('currency', event.target.value.toUpperCase())}
              fullWidth
              required
              size="small"
              inputProps={{ maxLength: 3 }}
              {...structuralInputProps}
              {...getTextFieldProps('currency')}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Instituicao"
              value={formValues.institution_name}
              onChange={(event) => handleChange('institution_name', event.target.value)}
              fullWidth
              size="small"
              {...getTextFieldProps('institution_name')}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Banco"
              value={formValues.bank_code}
              onChange={(event) => handleChange('bank_code', event.target.value)}
              fullWidth
              size="small"
              inputProps={{ maxLength: BANK_CODE_MAX_LENGTH }}
              helperText={fieldErrors.bank_code || `Codigo bancario opcional, ate ${BANK_CODE_MAX_LENGTH} caracteres.`}
              error={Boolean(fieldErrors.bank_code)}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Saldo inicial"
              value={formValues.opening_balance_input}
              onChange={(event) => handleChange('opening_balance_input', event.target.value)}
              fullWidth
              size="small"
              placeholder="0,00"
              {...structuralInputProps}
              error={Boolean(fieldErrors.opening_balance_input)}
              helperText={fieldErrors.opening_balance_input || 'Valor em reais; sera enviado como string inteira de centavos.'}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Data de saldo inicial"
              type="date"
              value={formValues.opening_balance_date}
              onChange={(event) => handleChange('opening_balance_date', event.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              {...structuralInputProps}
              error={Boolean(fieldErrors.opening_balance_date)}
              helperText={fieldErrors.opening_balance_date || 'Formato YYYY-MM-DD, sem conversao de timezone.'}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Observacoes"
              value={formValues.notes}
              onChange={(event) => handleChange('notes', event.target.value)}
              fullWidth
              multiline
              minRows={3}
              size="small"
              {...getTextFieldProps('notes')}
            />
          </Grid>
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <FormControlLabel
                control={(
                  <Switch
                    checked={formValues.allows_negative_balance}
                    onChange={(event) => handleChange('allows_negative_balance', event.target.checked)}
                  />
                )}
                label="Permite saldo negativo"
              />
              <FormControlLabel
                control={(
                  <Switch
                    checked={formValues.is_cash_equivalent}
                    onChange={(event) => handleChange('is_cash_equivalent', event.target.checked)}
                  />
                )}
                label="Equivalente de caixa"
              />
              <FormControlLabel
                control={(
                  <Switch
                    checked={formValues.is_active}
                    onChange={(event) => handleChange('is_active', event.target.checked)}
                  />
                )}
                label="Ativa"
              />
            </Box>
            {fieldErrors.allows_negative_balance && (
              <Typography variant="caption" color="error">
                {fieldErrors.allows_negative_balance}
              </Typography>
            )}
          </Grid>
        </Grid>

        {(validationError || error?.message) && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span>{validationError || error?.message}</span>
              {error?.showReload && onReloadData && (
                <Box>
                  <Button size="small" onClick={onReloadData} disabled={submitting}>
                    {error.reloadLabel || 'Recarregar dados'}
                  </Button>
                </Box>
              )}
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => handleRequestClose('cancelButton')} disabled={submitting}>Cancelar</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
          <span aria-live="polite">{submitting ? 'Salvando...' : 'Salvar'}</span>
        </Button>
      </DialogActions>

      <Dialog
        open={discardConfirmOpen}
        onClose={(_, reason) => {
          if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
            handleDiscardContinueEditing();
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
            Existem alterações não salvas. Deseja continuar editando ou descartar alterações?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDiscardContinueEditing} autoFocus>
            Continuar editando
          </Button>
          <Button color="error" variant="contained" onClick={handleDiscardChanges}>
            Descartar alterações
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
