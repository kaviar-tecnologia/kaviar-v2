import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress, Alert, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton, Tooltip,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CloseIcon from '@mui/icons-material/Close';
import { adminApi } from '../../services/adminApi';

const formatCents = (cents) => {
  if (!cents || cents === '0') return 'R$ 0,00';
  const str = String(cents).replace(/\D/g, '');
  if (!str || str === '0') return 'R$ 0,00';
  const padded = str.padStart(3, '0');
  const intPart = padded.slice(0, padded.length - 2).replace(/^0+/, '') || '0';
  const decPart = padded.slice(padded.length - 2);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${grouped},${decPart}`;
};

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const statusColor = (status) => {
  switch (status) {
    case 'PAGO': return 'success';
    case 'PAGO PARCIAL': return 'success';
    case 'PROCESSANDO': return 'info';
    case 'RESERVADO': case 'SOLICITADO': return 'warning';
    case 'FALHOU': return 'error';
    case 'DISPONÍVEL': return 'default';
    case 'APROVADO': return 'warning';
    case 'EM_REVISÃO': case 'CALCULADO': return 'default';
    case 'CANCELADO': return 'error';
    default: return 'default';
  }
};

function EvidenceDialog({ open, onClose, evidence, name, pixMasked, amount, type }) {
  if (!evidence) return null;
  const hasOfficialReceipt = false; // No official receipt URL available from provider today

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {hasOfficialReceipt ? 'Comprovante' : 'Evidência da transação'}
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box display="flex" flexDirection="column" gap={1.5}>
          <Typography variant="body2"><strong>Beneficiário:</strong> {name}</Typography>
          <Typography variant="body2"><strong>Tipo:</strong> {type}</Typography>
          <Typography variant="body2"><strong>Pix (mascarado):</strong> {pixMasked || 'Não cadastrado'}</Typography>
          {amount && <Typography variant="body2"><strong>Valor:</strong> {formatCents(amount)}</Typography>}
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2"><strong>Data/hora confirmação:</strong> {formatDate(evidence.confirmed_at)}</Typography>
          <Typography variant="body2"><strong>Enviado ao provedor:</strong> {formatDate(evidence.submitted_at)}</Typography>
          {evidence.failed_at && (
            <Typography variant="body2" color="error"><strong>Falha em:</strong> {formatDate(evidence.failed_at)}</Typography>
          )}
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2"><strong>Provider Payout ID:</strong> {evidence.provider_payout_id || '—'}</Typography>
          <Typography variant="body2"><strong>External Reference (KAVIAR):</strong> {evidence.external_reference || '—'}</Typography>
          <Typography variant="body2"><strong>Status provedor:</strong> {evidence.provider_status || '—'}</Typography>
          <Typography variant="body2"><strong>Status interno:</strong> {evidence.internal_status || '—'}</Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function FinancePayablesPage() {
  const [incentiveData, setIncentiveData] = useState(null);
  const [driversData, setDriversData] = useState(null);
  const [cyclesData, setCyclesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [evidenceDialog, setEvidenceDialog] = useState({ open: false, evidence: null, name: '', pixMasked: '', amount: null, type: '' });

  useEffect(() => {
    Promise.all([
      adminApi.get('/admin/finance/annual-incentive/provision').then(r => r.data),
      adminApi.get('/admin/finance/annual-incentive/provision/drivers?limit=200').then(r => r.data),
      adminApi.get('/admin/finance/manager-cycles?limit=50').then(r => r.data),
    ]).then(([inc, drv, cyc]) => {
      setIncentiveData(inc);
      setDriversData(drv);
      setCyclesData(cyc);
    }).catch(e => setError(e.message || 'Erro ao carregar dados')).finally(() => setLoading(false));
  }, []);

  const openEvidence = (evidence, name, pixMasked, amount, type) => {
    setEvidenceDialog({ open: true, evidence, name, pixMasked, amount, type });
  };

  if (loading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box p={3}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Contas a Pagar
      </Typography>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* GRATIFICAÇÃO ANUAL — RESUMO */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Typography variant="h6" fontWeight={600} mt={3} mb={2} color="success.main">
        Gratificação Anual — Motoristas
      </Typography>
      {incentiveData?.summary ? (
        <Grid container spacing={2}>
          <Grid item xs={6} md={2}>
            <Card><CardContent>
              <Typography variant="caption" color="text.secondary">Provisionado</Typography>
              <Typography variant="h6" fontWeight={700}>{formatCents(incentiveData.summary.total_accrued_cents)}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card><CardContent>
              <Typography variant="caption" color="text.secondary">Disponível (não solicitado)</Typography>
              <Typography variant="h6" fontWeight={700}>{formatCents(incentiveData.summary.total_available_cents)}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card><CardContent>
              <Typography variant="caption" color="text.secondary">Reservado/Solicitado</Typography>
              <Typography variant="h6" fontWeight={700} color="warning.main">{formatCents(incentiveData.summary.total_reserved_cents)}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card><CardContent>
              <Typography variant="caption" color="text.secondary">Pago</Typography>
              <Typography variant="h6" fontWeight={700} color="success.main">{formatCents(incentiveData.summary.total_paid_cents)}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card><CardContent>
              <Typography variant="caption" color="text.secondary">Revertido</Typography>
              <Typography variant="h6" fontWeight={700} color="error.main">{formatCents(incentiveData.summary.total_reversed_cents)}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card><CardContent>
              <Typography variant="caption" color="text.secondary">Motoristas com saldo</Typography>
              <Typography variant="h6" fontWeight={700}>{incentiveData.summary.drivers_with_balance}</Typography>
            </CardContent></Card>
          </Grid>
        </Grid>
      ) : (
        <Alert severity="info">Nenhum dado de gratificação anual disponível.</Alert>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TABELA OPERACIONAL — MOTORISTAS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Typography variant="subtitle1" fontWeight={600} mt={3} mb={1}>
        Tabela operacional — Motoristas ({driversData?.total ?? 0})
      </Typography>
      {driversData?.drivers && driversData.drivers.length > 0 ? (
        <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Pix (mascarado)</TableCell>
                <TableCell align="right">Acumulado</TableCell>
                <TableCell align="right">Disponível</TableCell>
                <TableCell align="right">Reservado</TableCell>
                <TableCell align="right">Pago</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Pagamento confirmado</TableCell>
                <TableCell align="center">Evidência</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {driversData.drivers.map(d => (
                <TableRow key={d.driver_id}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>{d.type}</TableCell>
                  <TableCell>{d.pix_masked || 'Não cadastrado'}</TableCell>
                  <TableCell align="right">{formatCents(d.accrued_cents)}</TableCell>
                  <TableCell align="right">{formatCents(d.available_cents)}</TableCell>
                  <TableCell align="right">{formatCents(d.reserved_cents)}</TableCell>
                  <TableCell align="right">{formatCents(d.paid_cents)}</TableCell>
                  <TableCell>
                    <Chip label={d.display_status} size="small" color={statusColor(d.display_status)} />
                  </TableCell>
                  <TableCell>{formatDate(d.confirmed_at)}</TableCell>
                  <TableCell align="center">
                    {d.evidence ? (
                      <Tooltip title="Ver evidência">
                        <IconButton size="small" onClick={() => openEvidence(d.evidence, d.name, d.pix_masked, d.paid_cents, 'MOTORISTA')}>
                          <ReceiptLongIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Alert severity="info">Nenhum motorista com saldo de gratificação.</Alert>
      )}

      <Divider sx={{ my: 4 }} />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* REPASSES DE GESTORES */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Typography variant="h6" fontWeight={600} mb={2} color="primary.main">
        Repasses de Gestores — Comissão Territorial
      </Typography>
      {cyclesData && cyclesData.length > 0 ? (
        <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Gestor</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>CPF/CNPJ (mascarado)</TableCell>
                <TableCell>Pix (mascarado)</TableCell>
                <TableCell>Competência</TableCell>
                <TableCell align="right">Provisionado</TableCell>
                <TableCell align="right">Aprovado</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Pagamento confirmado</TableCell>
                <TableCell align="center">Evidência</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cyclesData.map(c => (
                <TableRow key={c.id}>
                  <TableCell>{c.managerName}</TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell>{c.managerCpfCnpjMasked || '—'}</TableCell>
                  <TableCell>{c.managerPixMasked || 'Não cadastrado'}</TableCell>
                  <TableCell>{c.referenceMonth}</TableCell>
                  <TableCell align="right">{formatCents(c.grossManagerCommissionCents)}</TableCell>
                  <TableCell align="right">{formatCents(c.approvedAmountCents)}</TableCell>
                  <TableCell>
                    <Chip label={c.displayStatus} size="small" color={statusColor(c.displayStatus)} />
                  </TableCell>
                  <TableCell>{formatDate(c.confirmedAt)}</TableCell>
                  <TableCell align="center">
                    {c.evidence ? (
                      <Tooltip title="Ver evidência">
                        <IconButton size="small" onClick={() => openEvidence(c.evidence, c.managerName, c.managerPixMasked, c.approvedAmountCents, 'GESTOR')}>
                          <ReceiptLongIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Alert severity="info">Nenhum ciclo de repasse disponível.</Alert>
      )}

      {/* EVIDENCE DIALOG */}
      <EvidenceDialog
        open={evidenceDialog.open}
        onClose={() => setEvidenceDialog(prev => ({ ...prev, open: false }))}
        evidence={evidenceDialog.evidence}
        name={evidenceDialog.name}
        pixMasked={evidenceDialog.pixMasked}
        amount={evidenceDialog.amount}
        type={evidenceDialog.type}
      />
    </Box>
  );
}
