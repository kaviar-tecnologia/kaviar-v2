import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, TextField, Button, Skeleton, Table, TableHead, TableBody, TableRow, TableCell, Chip, IconButton, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { ArrowBack, CloudDownload, DirectionsCar } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

const STATUS_COLORS = { SETTLED: '#22C55E', UNSETTLED: '#F59E0B', UNAVAILABLE: '#6B7280' };
const STATUS_LABELS = { SETTLED: 'Liquidado', UNSETTLED: 'Pendente', UNAVAILABLE: 'Indisponível' };

export default function AccountantRidesReportPage() {
  const navigate = useNavigate();
  const { entityId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ start_date: '', end_date: '', status: '' });
  const [entityName, setEntityName] = useState('');

  const fetchData = (overrideFilters) => {
    setLoading(true);
    const f = overrideFilters || filters;
    const params = new URLSearchParams({ legal_entity_id: entityId });
    if (f.start_date) params.set('start_date', f.start_date);
    if (f.end_date) params.set('end_date', f.end_date);
    if (f.status) params.set('status', f.status);

    accountantApi.get(`/api/accountant/portal/rides-report?${params}`)
      .then(r => setData(r.data?.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [entityId]);

  useEffect(() => {
    accountantApi.get(`/api/accountant/portal/companies`)
      .then(r => {
        const company = (r.data?.data || []).find(c => c.id === entityId);
        if (company) setEntityName(company.razao_social);
      }).catch(() => {});
  }, [entityId]);

  const handleExportCSV = () => {
    const params = new URLSearchParams({ legal_entity_id: entityId });
    if (filters.start_date) params.set('start_date', filters.start_date);
    if (filters.end_date) params.set('end_date', filters.end_date);
    accountantApi.get(`/api/accountant/portal/rides-report/csv?${params}`, { responseType: 'blob' })
      .then(r => {
        const url = URL.createObjectURL(new Blob([r.data]));
        const a = document.createElement('a'); a.href = url; a.download = `corridas_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        URL.revokeObjectURL(url);
      }).catch(() => alert('Erro ao exportar CSV'));
  };

  return (
    <AccountantPortalLayout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate(`/contador/empresas/${entityId}`)} sx={{ color: 'rgba(255,255,255,0.5)' }}><ArrowBack /></IconButton>
        <Box>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>Financeiro de Corridas</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{entityName}</Typography>
        </Box>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField label="De" type="date" size="small" value={filters.start_date} onChange={e => setFilters(f => ({ ...f, start_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
        <TextField label="Até" type="date" size="small" value={filters.end_date} onChange={e => setFilters(f => ({ ...f, end_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }} />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Status</InputLabel>
          <Select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} label="Status" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="SETTLED">Liquidado</MenuItem>
            <MenuItem value="UNSETTLED">Pendente</MenuItem>
          </Select>
        </FormControl>
        <Button onClick={() => fetchData()} sx={{ color: '#D4AF37', textTransform: 'none' }}>Filtrar</Button>
        <Button startIcon={<CloudDownload />} onClick={handleExportCSV} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none', ml: 'auto' }}>Exportar CSV</Button>
      </Box>

      {loading ? (
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} />
      ) : !data ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <DirectionsCar sx={{ fontSize: 64, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>Nenhuma corrida encontrada no período</Typography>
        </Box>
      ) : (
        <>
          {/* Summary Cards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2, mb: 3 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <CardContent sx={{ py: 1.5 }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Total de Corridas</Typography>
                <Typography sx={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>{data.summary.total_rides}</Typography>
              </CardContent>
            </Card>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <CardContent sx={{ py: 1.5 }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Liquidadas</Typography>
                <Typography sx={{ color: '#22C55E', fontSize: 22, fontWeight: 700 }}>{data.summary.settled_rides}</Typography>
              </CardContent>
            </Card>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <CardContent sx={{ py: 1.5 }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Receita Total</Typography>
                <Typography sx={{ color: '#D4AF37', fontSize: 22, fontWeight: 700 }}>R$ {data.summary.total_revenue || '0,00'}</Typography>
              </CardContent>
            </Card>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <CardContent sx={{ py: 1.5 }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Taxas</Typography>
                <Typography sx={{ color: '#F59E0B', fontSize: 22, fontWeight: 700 }}>R$ {data.summary.total_fees || '0,00'}</Typography>
              </CardContent>
            </Card>
          </Box>

          {/* Rides Table */}
          <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <CardContent sx={{ p: 0 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Data</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Motorista</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Passageiro</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Valor</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Taxa</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rides.map(ride => (
                    <TableRow key={ride.id}>
                      <TableCell sx={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.05)', fontSize: 12 }}>{new Date(ride.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell sx={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.05)', fontSize: 12 }}>{ride.driver_name || '—'}</TableCell>
                      <TableCell sx={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.05)', fontSize: 12 }}>{ride.passenger_first_name || '—'}</TableCell>
                      <TableCell sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.05)', fontSize: 12 }}>{ride.final_price ? `R$ ${ride.final_price}` : '—'}</TableCell>
                      <TableCell sx={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.05)', fontSize: 12 }}>{ride.fee_amount ? `R$ ${ride.fee_amount}` : '—'}</TableCell>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Chip label={STATUS_LABELS[ride.financial_status] || ride.financial_status} size="small" sx={{ bgcolor: `${STATUS_COLORS[ride.financial_status] || '#6B7280'}20`, color: STATUS_COLORS[ride.financial_status] || '#6B7280', fontSize: 10, height: 20 }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {data.pagination?.totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, gap: 1 }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, alignSelf: 'center' }}>
                Página {data.pagination.page} de {data.pagination.totalPages} • {data.pagination.total} corridas
              </Typography>
            </Box>
          )}
        </>
      )}
    </AccountantPortalLayout>
  );
}
