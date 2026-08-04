import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import { listAccountingFirms } from '../../../services/adminAccountingService';
import FirmFormDialog from '../../../components/admin/accounting/FirmFormDialog';

export default function FirmsTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page: page + 1, limit: rowsPerPage };
      if (search.trim()) params.search = search.trim();
      const res = await listAccountingFirms(params);
      setRows(res.data || []);
      setTotal(res.pagination?.total || res.data?.length || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search]);

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
          placeholder="Buscar escritório..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          sx={{ minWidth: 200 }}
        />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<Add />} onClick={handleCreate} size="small">
          Novo Escritório
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
                <TableCell>Documento</TableCell>
                <TableCell>CRC</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Contadores</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#6B7280' }}>
                    Nenhum escritório encontrado.
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.razao_social}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.document_number || '—'}</TableCell>
                  <TableCell>{row.crc ? `${row.crc}/${row.crc_uf || ''}` : '—'}</TableCell>
                  <TableCell>{row.email || '—'}</TableCell>
                  <TableCell>{row._count?.accountants ?? row.accountants_count ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={row.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                      size="small"
                      color={row.status === 'ACTIVE' ? 'success' : 'default'}
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

      <FirmFormDialog
        open={dialogOpen}
        mode={editId ? 'edit' : 'create'}
        firmId={editId}
        onClose={() => { setDialogOpen(false); setEditId(null); }}
        onSuccess={handleSuccess}
      />
    </Box>
  );
}
