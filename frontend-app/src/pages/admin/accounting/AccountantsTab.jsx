import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import {
  listAccountants,
  updateAccountant,
  inviteAccountant,
  reinviteAccountant,
  revokeAccountantInvite,
} from '../../../services/adminAccountingService';
import AccountantFormDialog from '../../../components/admin/accounting/AccountantFormDialog';

function getInviteChip(row) {
  if (row.status === 'ACTIVE') {
    return <Chip label="Ativado" size="small" color="primary" />;
  }
  if (row.status === 'INVITED') {
    if (row.last_email_status === 'SENT') {
      return <Chip label="Enviado" size="small" color="success" />;
    }
    if (row.last_email_status === 'FAILED') {
      return <Chip label="Falha no envio" size="small" color="error" />;
    }
    return <Chip label="Pendente" size="small" color="default" />;
  }
  return <Chip label={row.status || '—'} size="small" color="default" />;
}

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
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [inviteLoading, setInviteLoading] = useState({});
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const actionRef = useRef({});

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

  const handleInvite = async (id) => {
    if (actionRef.current[`invite-${id}`]) return;
    actionRef.current[`invite-${id}`] = true;
    setInviteLoading((prev) => ({ ...prev, [`invite-${id}`]: true }));
    setError('');
    try {
      await inviteAccountant(id);
      setSnackbarMsg('Convite enviado com sucesso.');
      setSnackbarOpen(true);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setInviteLoading((prev) => ({ ...prev, [`invite-${id}`]: false }));
      actionRef.current[`invite-${id}`] = false;
    }
  };

  const handleReinvite = async (id) => {
    if (actionRef.current[`reinvite-${id}`]) return;
    actionRef.current[`reinvite-${id}`] = true;
    setInviteLoading((prev) => ({ ...prev, [`reinvite-${id}`]: true }));
    setError('');
    try {
      await reinviteAccountant(id);
      setSnackbarMsg('Convite reenviado com sucesso.');
      setSnackbarOpen(true);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setInviteLoading((prev) => ({ ...prev, [`reinvite-${id}`]: false }));
      actionRef.current[`reinvite-${id}`] = false;
    }
  };

  const handleOpenRevokeDialog = (row) => {
    setRevokeTarget(row);
    setRevokeDialogOpen(true);
  };

  const handleCloseRevokeDialog = () => {
    setRevokeDialogOpen(false);
    setRevokeTarget(null);
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    const id = revokeTarget.id;
    if (actionRef.current[`revoke-${id}`]) return;
    actionRef.current[`revoke-${id}`] = true;
    setInviteLoading((prev) => ({ ...prev, [`revoke-${id}`]: true }));
    setError('');
    try {
      await revokeAccountantInvite(id);
      setSnackbarMsg('Convite revogado com sucesso.');
      setSnackbarOpen(true);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setInviteLoading((prev) => ({ ...prev, [`revoke-${id}`]: false }));
      actionRef.current[`revoke-${id}`] = false;
      handleCloseRevokeDialog();
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
                <TableCell>Convite</TableCell>
                <TableCell>Ativo</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: '#6B7280' }}>
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
                  <TableCell>{getInviteChip(row)}</TableCell>
                  <TableCell>
                    <Chip
                      label={row.status === 'ACTIVE' ? 'Sim' : 'Não'}
                      size="small"
                      variant="outlined"
                      color={row.status === 'ACTIVE' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => handleEdit(row.id)}>Editar</Button>
                    {row.status === 'ACTIVE' && (
                      <Button size="small" color="warning" onClick={() => handleSuspend(row.id)}>Suspender</Button>
                    )}
                    {row.status === 'INVITED' && !row.last_email_sent_at && (
                      <Button
                        size="small"
                        color="primary"
                        disabled={!!inviteLoading[`invite-${row.id}`]}
                        onClick={() => handleInvite(row.id)}
                      >
                        {inviteLoading[`invite-${row.id}`] ? <CircularProgress size={16} /> : 'Convidar'}
                      </Button>
                    )}
                    {row.status === 'INVITED' && !!row.last_email_sent_at && (
                      <Button
                        size="small"
                        color="primary"
                        disabled={!!inviteLoading[`reinvite-${row.id}`]}
                        onClick={() => handleReinvite(row.id)}
                      >
                        {inviteLoading[`reinvite-${row.id}`] ? <CircularProgress size={16} /> : 'Reenviar'}
                      </Button>
                    )}
                    {row.status === 'INVITED' && (
                      <Button
                        size="small"
                        color="error"
                        disabled={!!inviteLoading[`revoke-${row.id}`]}
                        onClick={() => handleOpenRevokeDialog(row)}
                      >
                        {inviteLoading[`revoke-${row.id}`] ? <CircularProgress size={16} /> : 'Revogar convite'}
                      </Button>
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

      <Dialog
        open={revokeDialogOpen}
        onClose={handleCloseRevokeDialog}
        aria-labelledby="revoke-invite-dialog-title"
      >
        <DialogTitle id="revoke-invite-dialog-title">Revogar convite</DialogTitle>
        <DialogContent>
          <Typography>Deseja revogar o convite? O contador precisará de um novo convite.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRevokeDialog}>Cancelar</Button>
          <Button onClick={handleConfirmRevoke} color="error">Revogar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
