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
import { listAccountants, updateAccountant } from '../../../services/adminAccountingService';
import AccountantFormDialog from '../../../components/admin/accounting/AccountantFormDialog';

export default function AccountantsTab() {
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
      const res = await listAccountants(params);
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

  const handleSuspend = async (id) => {
    try {
      await updateAccountant(id, { status: 'SUSPENDED' });
      setSuccessMsg('Contador suspenso com sucesso.');
      fetchData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar contador..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          sx={{ minWidth: 200 }}
        />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<Add />} onClick={handleCreate} size="small">
          Novo Contador
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
                <TableCell>Nome</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>CPF</TableCell>
                <TableCell>Escritório</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Ativo</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#6B7280' }}>
                    Nenhum contador encontrado.
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.nome_completo}</TableCell>
                  <TableCell>{row.email || '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.cpf_masked || '***.***.***-**'}</TableCell>
                  <TableCell>{row.accounting_firm?.razao_social || '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={row.status === 'ACTIVE' ? 'Ativo' : row.status || 'Inativo'}
                      size="small"
                      color={row.status === 'ACTIVE' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.is_active ? 'Sim' : 'Não'}
                      size="small"
                      variant="outlined"
                      color={row.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => handleEdit(row.id)}>Editar</Button>
                    {row.status === 'ACTIVE' && (
                      <Button size="small" color="warning" onClick={() => handleSuspend(row.id)}>Suspender</Button>
                    )}
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

      <AccountantFormDialog
        open={dialogOpen}
        mode={editId ? 'edit' : 'create'}
        accountantId={editId}
        onClose={() => { setDialogOpen(false); setEditId(null); }}
        onSuccess={handleSuccess}
      />
    </Box>
  );
}
