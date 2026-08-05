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
import { listAccountantLinks, updateAccountantLink } from '../../../services/adminAccountingService';
import LinkFormDialog from '../../../components/admin/accounting/LinkFormDialog';

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
};

export default function LinksTab() {
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
      const res = await listAccountantLinks(params);
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

  const handleRevoke = async (id) => {
    try {
      await updateAccountantLink(id, { status: 'REVOKED' });
      setSuccessMsg('Vínculo revogado com sucesso.');
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
          placeholder="Buscar vínculo..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          sx={{ minWidth: 200 }}
        />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<Add />} onClick={handleCreate} size="small">
          Novo Vínculo
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
                <TableCell>Contador</TableCell>
                <TableCell>Empresa</TableCell>
                <TableCell>Escopo</TableCell>
                <TableCell>Permissões</TableCell>
                <TableCell>Vigência</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#6B7280' }}>
                    Nenhum vínculo encontrado.
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.accountant?.nome_completo || '—'}</TableCell>
                  <TableCell>{row.legal_entity?.razao_social || '—'}</TableCell>
                  <TableCell>{row.scope || '—'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {[
                        row.can_view && 'Visualizar',
                        row.can_upload && 'Enviar',
                        row.can_download && 'Baixar',
                        row.can_request_correction && 'Correção',
                        row.can_mark_processed && 'Processado',
                        row.can_close_period && 'Competência',
                      ].filter(Boolean).map((perm) => (
                        <Chip key={perm} label={perm} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                      ))}
                      {![row.can_view, row.can_upload, row.can_download, row.can_request_correction, row.can_mark_processed, row.can_close_period].some(Boolean) && '—'}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>
                    {formatDate(row.starts_at)} — {formatDate(row.ends_at)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.status === 'ACTIVE' ? 'Ativo' : row.status || 'Inativo'}
                      size="small"
                      color={row.status === 'ACTIVE' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => handleEdit(row.id)}>Editar</Button>
                    {row.status === 'ACTIVE' && (
                      <Button size="small" color="warning" onClick={() => handleRevoke(row.id)}>Revogar</Button>
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

      <LinkFormDialog
        open={dialogOpen}
        mode={editId ? 'edit' : 'create'}
        linkId={editId}
        onClose={() => { setDialogOpen(false); setEditId(null); }}
        onSuccess={handleSuccess}
      />
    </Box>
  );
}
