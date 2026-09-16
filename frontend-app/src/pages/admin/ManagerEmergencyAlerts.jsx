import { useState, useEffect } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, CircularProgress, Alert } from '@mui/material';
import { Shield } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';

const STATUS_MAP = {
  active: { label: 'Ativo', color: 'error' },
  resolved: { label: 'Resolvido', color: 'success' },
  false_alarm: { label: 'Falso alarme', color: 'warning' },
};

export default function ManagerEmergencyAlerts() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const token = localStorage.getItem('kaviar_admin_token');
  const headers = { 'Authorization': `Bearer ${token}` };

  useEffect(() => {
    const params = filter ? `?status=${filter}` : '';
    fetch(`${API_BASE_URL}/api/admin/manager-emergency${params}`, { headers })
      .then(r => r.json())
      .then(d => setEvents(d.data || []))
      .catch(() => setError('Erro ao carregar alertas'))
      .finally(() => setLoading(false));
  }, [filter]);

  const fmtDate = (d) => { if (!d) return '—'; const dt = new Date(d); return isNaN(dt.getTime()) ? '—' : dt.toLocaleString('pt-BR'); };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Shield color="error" />
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#C8A84E' }}>Alertas do Território</Typography>
      </Box>

      <Alert severity="warning" sx={{ mb: 2, bgcolor: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)' }}>
        Este painel não substitui serviços públicos de emergência. Em risco imediato, acione 190, 192 ou os canais públicos competentes. O Gestor Territorial atua como apoio local. A central KAVIAR mantém a coordenação, auditoria e encerramento dos alertas.
      </Alert>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {['', 'active', 'resolved', 'false_alarm'].map(s => (
          <Chip key={s} label={s ? STATUS_MAP[s]?.label : 'Todos'} variant={filter === s ? 'filled' : 'outlined'}
            color={s ? STATUS_MAP[s]?.color : 'default'} onClick={() => { setFilter(s); setLoading(true); }} sx={{ cursor: 'pointer', ...(!s && filter === '' && { bgcolor: '#C8A84E', color: '#fff' }), ...(!s && filter !== '' && { borderColor: '#C8A84E', color: '#C8A84E' }) }} size="small" />
        ))}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? <CircularProgress size={24} /> : (
        <TableContainer component={Paper} sx={{ border: '1px solid #E8E5DE' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#FAFAF8' }}>
                <TableCell sx={{ fontWeight: 700 }}>Data</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Acionado por</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Passageiro</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Motorista</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Placa</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Origem</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: '#6B7280' }}>Nenhum alerta no território</TableCell></TableRow>
              )}
              {events.map(ev => (
                <TableRow key={ev.id} hover>
                  <TableCell sx={{ fontSize: 12 }}>{fmtDate(ev.created_at)}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{ev.triggered_by_type === 'passenger' ? 'Passageiro' : 'Motorista'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{ev.passenger_name || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{ev.driver_name || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 12, fontFamily: 'monospace' }}>{ev.driver_plate || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{ev.origin_text || '—'}</TableCell>
                  <TableCell><Chip size="small" label={STATUS_MAP[ev.status]?.label || ev.status} color={STATUS_MAP[ev.status]?.color || 'default'} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
