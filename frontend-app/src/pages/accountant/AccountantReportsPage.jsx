import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Grid, Chip, Button, Select, MenuItem, FormControl, InputLabel, Table, TableHead, TableBody, TableRow, TableCell, Skeleton } from '@mui/material';
import { Assessment, CloudDownload } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

const STATUS_LABELS = { DRAFT: 'Rascunho', SENT_TO_COMPANY: 'Enviado', VIEWED: 'Visualizado', SCHEDULED: 'Programado', PAID: 'Pago', PROOF_UPLOADED: 'Comprovante Enviado', UNDER_VERIFICATION: 'Em Verificação', VERIFIED: 'Verificado', RECONCILED: 'Conciliado', REJECTED: 'Rejeitado', CANCELED: 'Cancelado' };
const STATUS_COLORS = { DRAFT: '#6B7280', SENT_TO_COMPANY: '#3B82F6', VIEWED: '#8B5CF6', SCHEDULED: '#6366F1', PAID: '#10B981', PROOF_UPLOADED: '#F59E0B', UNDER_VERIFICATION: '#F59E0B', VERIFIED: '#22C55E', RECONCILED: '#22C55E', REJECTED: '#EF4444', CANCELED: '#6B7280' };

export default function AccountantReportsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', legal_entity_id: '' });
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    accountantApi.get('/api/accountant/portal/obligations/reports/summary')
      .then(r => setData(r.data?.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    accountantApi.get('/api/accountant/portal/companies').then(r => setCompanies(r.data?.data || [])).catch(() => {});
  }, []);

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.legal_entity_id) params.set('legal_entity_id', filters.legal_entity_id);
    accountantApi.get(`/api/accountant/portal/obligations/reports/csv?${params}`, { responseType: 'blob' })
      .then(r => {
        const url = URL.createObjectURL(new Blob([r.data]));
        const a = document.createElement('a'); a.href = url; a.download = `relatorio_obrigacoes_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        URL.revokeObjectURL(url);
      }).catch(() => alert('Erro ao exportar'));
  };

  const filteredObligations = (data?.obligations || []).filter(ob => {
    if (filters.status && ob.status !== filters.status) return false;
    if (filters.legal_entity_id && ob.legal_entity_id !== filters.legal_entity_id) return false;
    return true;
  });

  if (loading) return <AccountantPortalLayout><Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} /></AccountantPortalLayout>;

  const cards = data?.cards || {};

  return (
    <AccountantPortalLayout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>Relatórios</Typography>
        <Button startIcon={<CloudDownload />} onClick={handleExportCSV} sx={{ color: '#D4AF37', textTransform: 'none' }}>Exportar CSV</Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {[
          { label: 'Total', value: cards.total, color: '#fff' },
          { label: 'Aguardando Pagamento', value: cards.awaiting_payment, color: '#3B82F6' },
          { label: 'Vencidas', value: cards.overdue, color: '#EF4444' },
          { label: 'Pagas', value: cards.paid, color: '#10B981' },
          { label: 'Aguardando Conferência', value: cards.awaiting_verification, color: '#F59E0B' },
          { label: 'Verificadas', value: cards.verified, color: '#22C55E' },
          { label: 'Conciliadas', value: cards.reconciled, color: '#22C55E' },
        ].map(c => (
          <Grid item xs={6} sm={4} md={3} lg={2} key={c.label}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, mb: 0.3 }}>{c.label}</Typography>
                <Typography sx={{ color: c.color, fontSize: 20, fontWeight: 700 }}>{c.value || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Empresa</InputLabel>
          <Select value={filters.legal_entity_id} onChange={e => setFilters(f => ({ ...f, legal_entity_id: e.target.value }))} label="Empresa" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
            <MenuItem value="">Todas</MenuItem>
            {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.razao_social}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Status</InputLabel>
          <Select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} label="Status" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
            <MenuItem value="">Todos</MenuItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* Table */}
      <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <CardContent sx={{ p: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Descrição</TableCell>
                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Empresa</TableCell>
                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Valor</TableCell>
                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Vencimento</TableCell>
                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredObligations.map(ob => (
                <TableRow key={ob.id} onClick={() => navigate(`/contador/obrigacoes/${ob.id}`)} sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                  <TableCell sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.05)', fontSize: 13 }}>{ob.description}</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.05)', fontSize: 12 }}>{ob.legal_entity?.razao_social || ''}</TableCell>
                  <TableCell sx={{ color: '#D4AF37', borderColor: 'rgba(255,255,255,0.05)', fontSize: 13, fontWeight: 600 }}>{ob.amount_display}</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.05)', fontSize: 12 }}>{ob.due_date ? new Date(ob.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</TableCell>
                  <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <Chip label={STATUS_LABELS[ob.status] || ob.status} size="small" sx={{ bgcolor: `${STATUS_COLORS[ob.status] || '#6B7280'}20`, color: STATUS_COLORS[ob.status] || '#6B7280', fontSize: 10, height: 20 }} />
                  </TableCell>
                </TableRow>
              ))}
              {filteredObligations.length === 0 && (
                <TableRow><TableCell colSpan={5} sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', borderColor: 'rgba(255,255,255,0.05)' }}>Nenhuma obrigação encontrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AccountantPortalLayout>
  );
}
