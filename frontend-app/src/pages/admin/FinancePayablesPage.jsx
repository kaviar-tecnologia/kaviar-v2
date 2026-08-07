import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, CircularProgress, Alert, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip } from '@mui/material';
import { adminApi } from '../../services/adminApi';

const formatCents = (cents) => {
  if (!cents || cents === '0') return 'R$ 0,00';
  const str = String(cents);
  const n = str.length;
  if (n <= 2) return `R$ 0,${str.padStart(2, '0')}`;
  return `R$ ${str.slice(0, n - 2)},${str.slice(n - 2)}`;
};

export default function FinancePayablesPage() {
  const [incentiveData, setIncentiveData] = useState(null);
  const [cyclesData, setCyclesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      adminApi.get('/admin/finance/annual-incentive/provision').then(r => r.data.data).catch(() => null),
      adminApi.get('/admin/finance/manager-cycles?limit=50').then(r => r.data.data).catch(() => null),
    ]).then(([inc, cyc]) => {
      setIncentiveData(inc);
      setCyclesData(cyc);
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box p={3}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Contas a Pagar
      </Typography>

      {/* GRATIFICAÇÃO ANUAL */}
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

      <Divider sx={{ my: 4 }} />

      {/* REPASSES DE GESTORES */}
      <Typography variant="h6" fontWeight={600} mb={2} color="primary.main">
        Repasses de Gestores — Comissão Territorial
      </Typography>
      {cyclesData && cyclesData.length > 0 ? (
        <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Competência</TableCell>
                <TableCell>Gestor</TableCell>
                <TableCell align="right">Provisionado</TableCell>
                <TableCell align="right">Aprovado</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cyclesData.map(c => (
                <TableRow key={c.id}>
                  <TableCell>{c.referenceMonth}</TableCell>
                  <TableCell>{c.managerId || '—'}</TableCell>
                  <TableCell align="right">{formatCents(c.grossManagerCommissionCents)}</TableCell>
                  <TableCell align="right">{formatCents(c.approvedAmountCents)}</TableCell>
                  <TableCell>
                    <Chip
                      label={c.status}
                      size="small"
                      color={
                        c.status === 'PAID' ? 'success' :
                        c.status === 'OBLIGATION_CREATED' ? 'info' :
                        c.status === 'APPROVED' ? 'warning' :
                        'default'
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Alert severity="info">Nenhum ciclo de repasse disponível.</Alert>
      )}
    </Box>
  );
}
