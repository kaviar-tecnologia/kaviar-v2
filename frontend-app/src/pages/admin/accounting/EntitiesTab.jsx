import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import { listLegalEntities } from '../../../services/adminAccountingService';
import EntityFormDialog from '../../../components/admin/accounting/EntityFormDialog';

const formatCnpj = (cnpj) => {
  if (!cnpj) return '—';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

export default function EntitiesTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page: page + 1, limit: rowsPerPage };
      if (filterType) params.entity_type = filterType;
      if (filterStatus) params.is_active = filterStatus === 'active' ? 'true' : 'false';
      if (search.trim()) params.search = search.trim();
      const res = await listLegalEntities(params);
      setRows(res.data || []);
      setTotal(res.pagination?.total || res.data?.length || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filterType, filterStatus, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEdit = (id) => {
    setEditId(id);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditId(null);
    setDialogOpen(true);
  };

  const handleSuccess = (msg) => {
    setSuccessMsg(msg);
    setDialogOpen(false);
    setEditId(null);
    fetchData();
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar razão social..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          sx={{ minWidth: 200 }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Tipo</InputLabel>
          <Select value={filterType} label="Tipo" onChange={(e) => { setFilterType(e.target.value); setPage(0); }}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="MATRIZ">Matriz</MenuItem>
            <MenuItem value="FILIAL">Filial</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Status</InputLabel>
          <Select value={filterStatus} label="Status" onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="ACTIVE">Ativo</MenuItem>
            <MenuItem value="INACTIVE">Inativo</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<Add />} onClick={handleCreate} size="small">
          Nova Empresa
        </Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Razão Social</TableCell>
                <TableCell>CNPJ</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>UF</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#6B7280' }}>
                    Nenhuma empresa encontrada.
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.razao_social}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{formatCnpj(row.cnpj)}</TableCell>
                  <TableCell>
                    <Chip label={row.entity_type} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{row.uf || '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={row.is_active ? 'Ativo' : 'Inativo'}
                      size="small"
                      color={row.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => handleEdit(row.id)}>Editar</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 20, 50]}
            labelRowsPerPage="Por página"
          />
        </TableContainer>
      )}

      <EntityFormDialog
        open={dialogOpen}
        mode={editId ? 'edit' : 'create'}
        entityId={editId}
        onClose={() => { setDialogOpen(false); setEditId(null); }}
        onSuccess={handleSuccess}
      />
    </Box>
  );
}
