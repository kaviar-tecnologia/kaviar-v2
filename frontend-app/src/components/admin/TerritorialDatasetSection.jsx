import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, CircularProgress, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, Divider, FormControlLabel, Checkbox,
} from '@mui/material';
import { CloudDownload, Preview as PreviewIcon, PlayArrow, Block } from '@mui/icons-material';
import {
  DATASET_STATUS, isSuperAdmin, latestDataset, availableActions, canConfirmApply,
  shortChecksum, fetchDatasets, acquireDataset, previewDataset, rejectDataset, applyDataset,
} from '../../pages/admin/territorialDatasetFlow';
import { formatDate } from '../../utils/formatDate';

const STATUS_CHIP = {
  DRAFT: { label: 'DRAFT', color: '#6B7280' },
  PREVIEWED: { label: 'PREVIEWED', color: '#D97706' },
  APPLIED: { label: 'APPLIED', color: '#059669' },
  REJECTED: { label: 'REJECTED', color: '#DC2626' },
};

function Field({ label, value, color }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: '#6B7280' }}>{label}</Typography>
      <Typography sx={{ fontWeight: 600, color: color || '#111827' }}>{value ?? '—'}</Typography>
    </Box>
  );
}

/**
 * Seção "Dataset territorial" — fluxo Super Admin ACQUIRE→PREVIEW→APPLY.
 * Toda a decisão de estado vem de territorialDatasetFlow (lógica pura/testada).
 * Fail-closed: sem otimismo; recarrega o estado do backend após cada ação.
 */
export default function TerritorialDatasetSection({ territory, token }) {
  const superAdmin = isSuperAdmin();
  const territoryId = territory?.id;

  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState(null);
  const [preview, setPreview] = useState(null);       // último plan do preview
  const [applyResult, setApplyResult] = useState(null); // counters pós-apply
  const [error, setError] = useState(null);           // {code, message, conflicts}
  const [inFlight, setInFlight] = useState(false);     // protege double-click
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const reload = useCallback(async () => {
    if (!territoryId || !token) return;
    setLoading(true); setError(null);
    const r = await fetchDatasets(territoryId, token);
    if (r.ok) {
      const latest = latestDataset(r.datasets);
      setDataset(latest);
      // Fail-closed: prévia NÃO é persistida. Se recarregou e a version atual
      // não corresponde à prévia em memória, descarta a prévia (força novo preview).
      setPreview((prev) => (prev && latest && prev.versionId === latest.id ? prev : null));
    } else {
      setError({ code: r.code, message: r.message });
    }
    setLoading(false);
  }, [territoryId, token]);

  useEffect(() => { reload(); }, [reload]);

  const actions = availableActions({ superAdmin, dataset });

  // Wrapper genérico fail-closed: 1 chamada por vez; sem retry; sem estado otimista.
  const run = async (fn) => {
    if (inFlight) return null;
    setInFlight(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError({ code: r.code, message: r.message, conflicts: r.conflicts }); return r; }
      return r;
    } finally {
      setInFlight(false);
    }
  };

  const onAcquire = async () => {
    const r = await run(() => acquireDataset(territoryId, token));
    if (r?.ok) { setPreview(null); setApplyResult(null); await reload(); }
  };
  const onPreview = async () => {
    if (!dataset) return;
    const r = await run(() => previewDataset(territoryId, dataset.id, token));
    if (r?.ok) {
      // Guarda a prévia AMARRADA à version que a gerou (fail-closed p/ apply).
      const plan = r.data?.plan || null;
      setPreview(plan ? { ...plan, versionId: dataset.id } : null);
      await reload();
    }
  };
  const onReject = async () => {
    if (!dataset) return;
    const r = await run(() => rejectDataset(territoryId, dataset.id, token));
    if (r?.ok) { setPreview(null); await reload(); }
  };
  const openConfirm = () => { setConfirmChecked(false); setConfirmOpen(true); };
  const onConfirmApply = async () => {
    if (!canConfirmApply({ superAdmin, dataset, preview, confirmChecked, inFlight })) return;
    const r = await run(() => applyDataset(territoryId, dataset.id, token, true));
    setConfirmOpen(false);
    if (r?.ok) { setApplyResult(r.data); await reload(); }
  };

  if (!superAdmin) return null; // RBAC: seção invisível para não-SUPER_ADMIN

  const chip = dataset ? (STATUS_CHIP[dataset.status] || { label: dataset.status, color: '#6B7280' }) : null;

  return (
    <Box sx={{ mt: 3, p: 2, border: '1px solid #E8E5DE', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>🗺️ Dataset territorial</Typography>
        {chip && <Chip label={chip.label} size="small" sx={{ bgcolor: `${chip.color}15`, color: chip.color, fontWeight: 700 }} />}
        <Box sx={{ flex: 1 }} />
        {loading && <CircularProgress size={18} sx={{ color: '#B8942E' }} />}
        <Button size="small" onClick={reload} disabled={inFlight} sx={{ color: '#6B7280' }}>Atualizar</Button>
      </Box>

      {/* Fail-closed: erro do backend exibido com código + mensagem; sem otimismo */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} data-testid="dataset-error">
          <strong>{error.code}</strong>: {error.message}
          {Array.isArray(error.conflicts) && error.conflicts.length > 0 && (
            <ul style={{ margin: '4px 0 0 16px' }}>
              {error.conflicts.map((c, i) => <li key={i}><Typography variant="caption">{c.name}: {c.reason}</Typography></li>)}
            </ul>
          )}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2, mb: 2 }}>
        <Field label="Cidade / UF" value={dataset ? `${dataset.city} / ${dataset.uf}` : `${territory?.city_name || '—'} / ${territory?.uf || '—'}`} />
        <Field label="territory_id" value={territoryId} />
        <Field label="Status território" value={territory?.status} />
        {dataset && <>
          <Field label="Dataset version" value={dataset.id} />
          <Field label="Status dataset" value={dataset.status} color={chip?.color} />
          <Field label="Provider / source" value={`${dataset.provider_id} · ${dataset.source}`} />
          <Field label="is_official" value={String(dataset.is_official)} />
          <Field label="source_verified" value={String(dataset.source_verified)} />
          <Field label="feature_count" value={dataset.feature_count} />
          <Field label="invalid_count" value={dataset.invalid_count} color={dataset.invalid_count ? '#D97706' : undefined} />
          <Field label="duplicate_count" value={dataset.duplicate_count} color={dataset.duplicate_count ? '#D97706' : undefined} />
          <Field label="out_of_bbox_count" value={dataset.out_of_bbox_count} color={dataset.out_of_bbox_count ? '#DC2626' : undefined} />
          <Field label="checksum" value={shortChecksum(dataset.checksum)} />
          <Field label="created_at" value={formatDate(dataset.created_at, { showTime: true })} />
          <Field label="applied_at" value={dataset.applied_at ? formatDate(dataset.applied_at, { showTime: true }) : '—'} />
        </>}
      </Box>

      {!dataset && (
        <Alert severity="info" sx={{ mb: 2 }}>Nenhum dataset territorial. Adquira dados do provedor (OSM) para gerar uma versão DRAFT.</Alert>
      )}

      {/* Resultado da preview */}
      {preview && (
        <Alert severity={preview.canProceed ? 'success' : 'warning'} sx={{ mb: 2 }} data-testid="preview-result">
          <Typography variant="caption" sx={{ fontWeight: 700 }}>Prévia:</Typography>{' '}
          features={preview.totals?.featuresInFile} · válidos={preview.totals?.validNeighborhoods} · geofences={preview.totals?.withValidGeofence} ·
          inválidas={preview.totals?.invalidGeometries} · duplicadas={preview.totals?.duplicatesInFile} ·
          toCreate={preview.totals?.toCreate} · toUpdate={preview.totals?.toUpdate} · vínculos={preview.totals?.toLinkTerritory} ·
          canProceed={String(preview.canProceed)}
        </Alert>
      )}

      {/* Resultado do apply */}
      {applyResult && (
        <Alert severity="success" sx={{ mb: 2 }} data-testid="apply-result">
          Aplicado: created={applyResult.counters?.created} · updated={applyResult.counters?.updated} ·
          unchanged={applyResult.counters?.unchanged} · conflicts={applyResult.counters?.conflicts} ·
          skipped={applyResult.counters?.skipped} · geofencesWritten={applyResult.counters?.geofencesWritten} ·
          status={applyResult.status}
        </Alert>
      )}

      {/* Ações por estado (todas gateadas por availableActions) */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {actions.canAcquire && (
          <Button variant="contained" startIcon={<CloudDownload />} disabled={inFlight} onClick={onAcquire}
            data-testid="btn-acquire" sx={{ bgcolor: '#B8942E' }}>
            {inFlight ? 'Adquirindo…' : 'Adquirir dados territoriais'}
          </Button>
        )}
        {actions.canPreview && (
          <Button variant="outlined" startIcon={<PreviewIcon />} disabled={inFlight} onClick={onPreview}
            data-testid="btn-preview" sx={{ color: '#B8942E', borderColor: '#B8942E' }}>
            {inFlight ? 'Gerando…' : 'Gerar prévia'}
          </Button>
        )}
        {actions.canApply && (
          <Button variant="contained" startIcon={<PlayArrow />} disabled={inFlight} onClick={openConfirm}
            data-testid="btn-apply" sx={{ bgcolor: '#059669' }}>
            Aplicar dataset
          </Button>
        )}
        {actions.canReject && (
          <Button variant="outlined" color="error" startIcon={<Block />} disabled={inFlight} onClick={onReject}
            data-testid="btn-reject">
            Rejeitar dataset
          </Button>
        )}
        {dataset?.status === DATASET_STATUS.APPLIED && (
          <Typography variant="body2" sx={{ color: '#059669', alignSelf: 'center' }}>
            ✓ Dataset já aplicado — nenhuma ação disponível.
          </Typography>
        )}
      </Box>

      {/* Modal de confirmação obrigatória do apply */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: '#059669', fontWeight: 700 }}>Confirmar aplicação do dataset</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 1.5, mb: 2 }}>
            <Field label="Cidade / UF" value={dataset ? `${dataset.city} / ${dataset.uf}` : '—'} />
            <Field label="Dataset version" value={dataset?.id} />
            <Field label="Bairros a criar" value={preview?.totals?.toCreate ?? '—'} color="#059669" />
            <Field label="Bairros a atualizar" value={preview?.totals?.toUpdate ?? '—'} color="#D97706" />
            <Field label="Vínculos territoriais" value={preview?.totals?.toLinkTerritory ?? '—'} color="#B8942E" />
          </Box>
          <Divider sx={{ my: 1 }} />
          {(!preview || preview.versionId !== dataset?.id) ? (
            <Alert severity="warning" sx={{ mb: 2 }} data-testid="need-preview">
              Gere a prévia desta versão antes de aplicar. Recarregar a página exige gerar a prévia novamente.
            </Alert>
          ) : preview.canProceed !== true ? (
            <Alert severity="error" sx={{ mb: 2 }}>A prévia indica que o dataset não pode prosseguir (canProceed=false).</Alert>
          ) : null}
          <Alert severity="warning" sx={{ mb: 2 }}>
            Esta ação escreverá bairros e geofences no banco de produção.
          </Alert>
          <FormControlLabel
            control={<Checkbox checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} data-testid="confirm-checkbox" />}
            label="Confirmo que revisei a prévia e desejo aplicar este dataset."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} sx={{ color: '#6B7280' }}>Cancelar</Button>
          <Button
            variant="contained"
            data-testid="btn-confirm-apply"
            disabled={!canConfirmApply({ superAdmin, dataset, preview, confirmChecked, inFlight })}
            onClick={onConfirmApply}
            sx={{ bgcolor: '#059669' }}
          >
            {inFlight ? 'Aplicando…' : 'Confirmar aplicação'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
