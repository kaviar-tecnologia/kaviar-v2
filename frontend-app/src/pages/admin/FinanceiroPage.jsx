import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Tab,
  Tabs,
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
import {
  AccountBalance,
  Add,
  Category,
  Edit,
  PlayCircleOutline,
  Refresh,
  Schema,
  StopCircleOutlined,
} from '@mui/icons-material';
import {
  createFinanceAccount,
  getFinanceAccountErrorPresentation,
  listFinanceAccounts,
  listFinanceCategories,
  listFinanceCostCenters,
  updateFinanceAccount,
} from '../../services/adminFinanceService';
import AccountFormDialog from '../../components/admin/finance/AccountFormDialog';
import CategoryFormDialog from '../../components/admin/finance/CategoryFormDialog';
import {
  ACCOUNT_TYPE_OPTIONS,
  buildAccountStatusPatchPayload,
  buildCreateAccountPayload,
  buildUpdateAccountPayload,
  getAccountTypeLabel,
  hasAccountChanges,
} from '../../utils/adminFinanceAccountUtils';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const BLUE = {
  pageBg: 'linear-gradient(180deg, #EEF6FF 0%, #E3F0FF 100%)',
  sectionBg: '#F8FBFF',
  cardBg: '#FFFFFF',
  border: '#BFDBFE',
  borderStrong: '#60A5FA',
  text: '#0F172A',
  subtext: '#475569',
  primary: '#2563EB',
  secondary: '#1D4ED8',
  accent: '#22D3EE',
};

const TAB_DEFS = [
  { key: 'accounts', label: 'Contas', icon: <AccountBalance fontSize="small" /> },
  { key: 'categories', label: 'Categorias', icon: <Category fontSize="small" /> },
  { key: 'costCenters', label: 'Centros de custo', icon: <Schema fontSize="small" /> },
];

const defaultPagination = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
};

const initialListState = {
  loading: false,
  error: '',
  data: [],
  pagination: defaultPagination,
};

const toBooleanLabel = (value) => (value ? 'Ativo' : 'Inativo');

const toDateTime = (value) => {
  if (!value) return '-';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(timestamp);
};

const resolveListPayload = (payload) => {
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    pagination: payload?.pagination || defaultPagination,
  };
};

const tabA11yProps = (index) => ({
  id: `financeiro-tab-${index}`,
  'aria-controls': `financeiro-tabpanel-${index}`,
});

const getPaginationAriaLabel = (type) => {
  if (type === 'first') return 'Ir para a primeira página';
  if (type === 'last') return 'Ir para a última página';
  if (type === 'next') return 'Ir para a próxima página';
  return 'Ir para a página anterior';
};

const formatPaginationDisplayedRows = ({ from, to, count, page }) => {
  const totalLabel = count !== -1 ? count : `mais de ${to}`;
  return `Página ${page + 1}: ${from}-${to} de ${totalLabel}`;
};

function EmptyState({ message }) {
  return (
    <Box sx={{ py: 6, textAlign: 'center' }}>
      <Typography sx={{ color: BLUE.subtext }}>{message}</Typography>
    </Box>
  );
}

export default function FinanceiroPage() {
  const { getAdminData } = useAdminAuth();

  let admin = null;
  try {
    admin = getAdminData();
  } catch (_error) {
    admin = null;
  }

  const adminRole = admin?.role || '';
  const isSuperAdmin = adminRole === 'SUPER_ADMIN';
  const [activeTab, setActiveTab] = useState(0);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [accountDialogMode, setAccountDialogMode] = useState('create');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountDialogError, setAccountDialogError] = useState(null);
  const [accountActionError, setAccountActionError] = useState('');
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [toggleDialogState, setToggleDialogState] = useState({
    open: false,
    account: null,
    nextIsActive: false,
    loading: false,
    error: null,
  });
  const accountSubmitGuardRef = useRef(false);
  const toggleGuardRef = useRef(false);
  const accountDialogTriggerRef = useRef(null);
  const toggleDialogTriggerRef = useRef(null);

  // Category dialog state
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState('create');
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  const [accountsQuery, setAccountsQuery] = useState({
    page: 1,
    limit: 25,
    search: '',
    type: '',
    is_active: '',
    allows_negative_balance: '',
  });
  const [categoriesQuery, setCategoriesQuery] = useState({
    page: 1,
    limit: 25,
    kind: '',
    is_active: '',
    is_system: '',
  });
  const [costCentersQuery, setCostCentersQuery] = useState({
    page: 1,
    limit: 25,
    type: '',
    state: '',
    is_active: '',
  });

  const [accountsState, setAccountsState] = useState(initialListState);
  const [categoriesState, setCategoriesState] = useState(initialListState);
  const [costCentersState, setCostCentersState] = useState(initialListState);

  const headerKpis = useMemo(
    () => [
      { label: 'Contas listadas', value: accountsState.pagination.total || 0 },
      { label: 'Categorias listadas', value: categoriesState.pagination.total || 0 },
      { label: 'Centros listados', value: costCentersState.pagination.total || 0 },
    ],
    [accountsState.pagination.total, categoriesState.pagination.total, costCentersState.pagination.total]
  );

  const loadAccounts = async () => {
    setAccountActionError('');
    setAccountsState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const payload = await listFinanceAccounts(accountsQuery);
      const resolved = resolveListPayload(payload);
      setAccountsState({ loading: false, error: '', ...resolved });
    } catch (error) {
      setAccountsState((prev) => ({ ...prev, loading: false, error: error.message || 'Erro ao carregar contas.' }));
    }
  };

  const openCreateAccountDialog = (event) => {
    accountDialogTriggerRef.current = event?.currentTarget || null;
    setAccountDialogError(null);
    setSelectedAccount(null);
    setAccountDialogMode('create');
    setAccountDialogOpen(true);
  };

  const openEditAccountDialog = (account, event) => {
    accountDialogTriggerRef.current = event?.currentTarget || null;
    setAccountDialogError(null);
    setSelectedAccount(account);
    setAccountDialogMode('edit');
    setAccountDialogOpen(true);
  };

  const closeAccountDialog = () => {
    if (accountSubmitting) return;
    setAccountDialogOpen(false);
    setSelectedAccount(null);
    setAccountDialogError(null);

    const triggerElement = accountDialogTriggerRef.current;
    accountDialogTriggerRef.current = null;
    setTimeout(() => {
      if (triggerElement && typeof triggerElement.focus === 'function') {
        triggerElement.focus();
      }
    }, 0);
  };

  const openToggleAccountDialog = (account, event) => {
    toggleDialogTriggerRef.current = event?.currentTarget || null;
    setAccountActionError('');
    setToggleDialogState({
      open: true,
      account,
      nextIsActive: !account?.is_active,
      loading: false,
      error: null,
    });
  };

  const closeToggleAccountDialog = () => {
    if (toggleDialogState.loading) return;
    setToggleDialogState({
      open: false,
      account: null,
      nextIsActive: false,
      loading: false,
      error: null,
    });

    const triggerElement = toggleDialogTriggerRef.current;
    toggleDialogTriggerRef.current = null;
    setTimeout(() => {
      if (triggerElement && typeof triggerElement.focus === 'function') {
        triggerElement.focus();
      }
    }, 0);
  };

  const handleReloadAccountsFromForm = async () => {
    await loadAccounts();
    closeAccountDialog();
  };

  const handleReloadAccountsFromToggle = async () => {
    await loadAccounts();
    closeToggleAccountDialog();
  };

  const handleAccountSubmit = async (formValues) => {
    if (accountSubmitGuardRef.current) return;

    accountSubmitGuardRef.current = true;
    setAccountDialogError(null);
    setAccountSubmitting(true);

    try {
      if (accountDialogMode === 'create') {
        const payload = buildCreateAccountPayload(formValues);
        await createFinanceAccount(payload);
      } else {
        const payload = buildUpdateAccountPayload(formValues, selectedAccount, {
          isSuperAdmin,
          role: adminRole,
        });
        if (!hasAccountChanges(payload)) {
          setAccountDialogOpen(false);
          setSelectedAccount(null);
          return;
        }
        await updateFinanceAccount(selectedAccount.id, payload);
      }

      setAccountDialogOpen(false);
      setSelectedAccount(null);
      await loadAccounts();
    } catch (error) {
      setAccountDialogError(
        getFinanceAccountErrorPresentation(error, {
          operation: accountDialogMode === 'create' ? 'create' : 'update',
        })
      );
    } finally {
      setAccountSubmitting(false);
      accountSubmitGuardRef.current = false;
    }
  };

  const handleToggleAccountStatus = async () => {
    if (toggleGuardRef.current) return;

    const account = toggleDialogState.account;
    if (!account) return;

    toggleGuardRef.current = true;
    setToggleDialogState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await updateFinanceAccount(account.id, buildAccountStatusPatchPayload(account, toggleDialogState.nextIsActive));
      setToggleDialogState({
        open: false,
        account: null,
        nextIsActive: false,
        loading: false,
        error: null,
      });

      const triggerElement = toggleDialogTriggerRef.current;
      toggleDialogTriggerRef.current = null;
      setTimeout(() => {
        if (triggerElement && typeof triggerElement.focus === 'function') {
          triggerElement.focus();
        }
      }, 0);

      await loadAccounts();
    } catch (error) {
      const presentation = getFinanceAccountErrorPresentation(error, { operation: 'toggle' });
      setAccountActionError(presentation.message);
      setToggleDialogState((prev) => ({
        ...prev,
        loading: false,
        error: presentation,
      }));
    } finally {
      setToggleDialogState((prev) => ({ ...prev, loading: false }));
      toggleGuardRef.current = false;
    }
  };

  const loadCategories = async () => {
    setCategoriesState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const payload = await listFinanceCategories(categoriesQuery);
      const resolved = resolveListPayload(payload);
      setCategoriesState({ loading: false, error: '', ...resolved });
    } catch (error) {
      setCategoriesState((prev) => ({ ...prev, loading: false, error: error.message || 'Erro ao carregar categorias.' }));
    }
  };

  const loadCostCenters = async () => {
    setCostCentersState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const payload = await listFinanceCostCenters(costCentersQuery);
      const resolved = resolveListPayload(payload);
      setCostCentersState({ loading: false, error: '', ...resolved });
    } catch (error) {
      setCostCentersState((prev) => ({ ...prev, loading: false, error: error.message || 'Erro ao carregar centros de custo.' }));
    }
  };

  // ── Category dialog handlers ──────────────────────────────────────────────
  const openCreateCategoryDialog = () => {
    setSelectedCategoryId(null);
    setCategoryDialogMode('create');
    setCategoryDialogOpen(true);
  };

  const openEditCategoryDialog = (categoryId) => {
    setSelectedCategoryId(categoryId);
    setCategoryDialogMode('edit');
    setCategoryDialogOpen(true);
  };

  const closeCategoryDialog = () => {
    setCategoryDialogOpen(false);
    setSelectedCategoryId(null);
  };

  const handleCategorySuccess = () => {
    closeCategoryDialog();
    loadCategories();
  };

  useEffect(() => {
    loadAccounts();
  }, [accountsQuery]);

  useEffect(() => {
    loadCategories();
  }, [categoriesQuery]);

  useEffect(() => {
    loadCostCenters();
  }, [costCentersQuery]);

  const renderAccountsTab = () => {
    return (
      <>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              label="Buscar"
              value={accountsQuery.search}
              onChange={(event) =>
                setAccountsQuery((prev) => ({ ...prev, page: 1, search: event.target.value }))
              }
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              select
              size="small"
              label="Tipo"
              value={accountsQuery.type}
              onChange={(event) =>
                setAccountsQuery((prev) => ({ ...prev, page: 1, type: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>{getAccountTypeLabel(option)}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              select
              size="small"
              label="Situação"
              value={accountsQuery.is_active}
              onChange={(event) =>
                setAccountsQuery((prev) => ({ ...prev, page: 1, is_active: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="true">Ativo</MenuItem>
              <MenuItem value="false">Inativo</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              select
              size="small"
              label="Saldo negativo"
              value={accountsQuery.allows_negative_balance}
              onChange={(event) =>
                setAccountsQuery((prev) => ({ ...prev, page: 1, allows_negative_balance: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="true">Permite</MenuItem>
              <MenuItem value="false">Não permite</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={2}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Refresh />}
              onClick={loadAccounts}
              sx={{ height: '40px' }}
            >
              {accountsState.error ? 'Tentar novamente' : 'Atualizar'}
            </Button>
          </Grid>
          <Grid item xs={12} md={2}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<Add />}
              onClick={openCreateAccountDialog}
              sx={{ height: '40px' }}
            >
              Nova conta
            </Button>
          </Grid>
        </Grid>

        {accountsState.error && <Alert severity="error" sx={{ mb: 2 }}>{accountsState.error}</Alert>}
        {accountActionError && <Alert severity="warning" sx={{ mb: 2 }}>{accountActionError}</Alert>}

        <Card sx={{ border: `1px solid ${BLUE.border}` }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Código</TableCell>
                  <TableCell>Nome</TableCell>
                  <TableCell>Instituição</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Moeda</TableCell>
                  <TableCell>Situação</TableCell>
                  <TableCell>Saldo negativo</TableCell>
                  <TableCell>Atualizado em</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accountsState.loading ? (
                  <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={22} />
                    </TableCell>
                  </TableRow>
                ) : accountsState.data.length === 0 ? (
                  <TableRow>
                      <TableCell colSpan={9}>
                      <EmptyState message="Nenhuma conta encontrada para os filtros selecionados." />
                    </TableCell>
                  </TableRow>
                ) : (
                  accountsState.data.map((item) => (
                    <TableRow hover key={item.id}>
                      <TableCell>{item.code || '-'}</TableCell>
                      <TableCell>{item.name || '-'}</TableCell>
                        <TableCell>{item.institution_name || '-'}</TableCell>
                      <TableCell>{item.type || '-'}</TableCell>
                      <TableCell>{item.currency || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={toBooleanLabel(Boolean(item.is_active))}
                          sx={{ bgcolor: item.is_active ? '#DCFCE7' : '#F1F5F9', color: item.is_active ? '#166534' : '#475569' }}
                        />
                      </TableCell>
                        <TableCell>{item.allows_negative_balance ? 'Sim' : 'Não'}</TableCell>
                      <TableCell>{toDateTime(item.updated_at)}</TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'inline-flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Edit fontSize="small" />}
                            onClick={(event) => openEditAccountDialog(item, event)}
                            disabled={toggleDialogState.loading}
                          >
                            Editar
                          </Button>
                          <Button
                            size="small"
                            color={item.is_active ? 'warning' : 'success'}
                            variant="outlined"
                            startIcon={item.is_active ? <StopCircleOutlined fontSize="small" /> : <PlayCircleOutline fontSize="small" />}
                            onClick={(event) => openToggleAccountDialog(item, event)}
                            disabled={toggleDialogState.loading}
                          >
                            {item.is_active ? 'Desativar' : 'Ativar'}
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={accountsState.pagination.total || 0}
            page={Math.max((accountsState.pagination.page || 1) - 1, 0)}
              getItemAriaLabel={getPaginationAriaLabel}
              labelRowsPerPage="Itens por página:"
              labelDisplayedRows={formatPaginationDisplayedRows}
            onPageChange={(_, nextPage) =>
              setAccountsQuery((prev) => ({ ...prev, page: nextPage + 1 }))
            }
            rowsPerPage={accountsQuery.limit}
            onRowsPerPageChange={(event) =>
              setAccountsQuery((prev) => ({ ...prev, page: 1, limit: Number(event.target.value) }))
            }
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Card>
      </>
    );
  };

  const renderCategoriesTab = () => {
    return (
      <>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              select
              size="small"
              label="Tipo"
              value={categoriesQuery.kind}
              onChange={(event) =>
                setCategoriesQuery((prev) => ({ ...prev, page: 1, kind: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="REVENUE">REVENUE</MenuItem>
              <MenuItem value="EXPENSE">EXPENSE</MenuItem>
              <MenuItem value="TRANSFER">TRANSFER</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              select
              size="small"
              label="Sistema"
              value={categoriesQuery.is_system}
              onChange={(event) =>
                setCategoriesQuery((prev) => ({ ...prev, page: 1, is_system: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="true">Sistema</MenuItem>
              <MenuItem value="false">Comum</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              select
              size="small"
              label="Situação"
              value={categoriesQuery.is_active}
              onChange={(event) =>
                setCategoriesQuery((prev) => ({ ...prev, page: 1, is_active: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="true">Ativo</MenuItem>
              <MenuItem value="false">Inativo</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Refresh />}
              onClick={loadCategories}
              sx={{ height: '40px' }}
            >
              {categoriesState.error ? 'Tentar novamente' : 'Atualizar'}
            </Button>
          </Grid>
          <Grid item xs={12} md={3}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<Add />}
              onClick={openCreateCategoryDialog}
              sx={{ height: '40px' }}
            >
              Nova categoria
            </Button>
          </Grid>
        </Grid>

        {categoriesState.error && <Alert severity="error" sx={{ mb: 2 }}>{categoriesState.error}</Alert>}

        <Card sx={{ border: `1px solid ${BLUE.border}` }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                    <TableCell>Código</TableCell>
                  <TableCell>Nome</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Categoria pai</TableCell>
                  <TableCell>Sistema</TableCell>
                    <TableCell>Situação</TableCell>
                  <TableCell>Classificação</TableCell>
                  <TableCell>Cód. contábil</TableCell>
                  <TableCell>Grupo DRE</TableCell>
                  <TableCell>Dedutível</TableCell>
                  <TableCell>Ordem</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categoriesState.loading ? (
                  <TableRow>
                    <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={22} />
                    </TableCell>
                  </TableRow>
                ) : categoriesState.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12}>
                      <EmptyState message="Nenhuma categoria encontrada para os filtros selecionados." />
                    </TableCell>
                  </TableRow>
                ) : (
                  categoriesState.data.map((item) => (
                    <TableRow hover key={item.id}>
                      <TableCell>{item.code || '-'}</TableCell>
                      <TableCell>{item.name || '-'}</TableCell>
                      <TableCell>{item.kind || '-'}</TableCell>
                      <TableCell>{item.parent?.name || '-'}</TableCell>
                        <TableCell>{item.is_system ? 'Sim' : 'Não'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={toBooleanLabel(Boolean(item.is_active))}
                          sx={{ bgcolor: item.is_active ? '#DCFCE7' : '#F1F5F9', color: item.is_active ? '#166534' : '#475569' }}
                        />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const isPostable = item.is_postable === true;
                          return (
                            <Chip
                              size="small"
                              label={isPostable ? 'Permite lançamentos' : 'Somente agrupamento'}
                              sx={{ bgcolor: isPostable ? '#DBEAFE' : '#F1F5F9', color: isPostable ? '#1E40AF' : '#475569' }}
                            />
                          );
                        })()}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', color: '#6B7280' }}>{item.accounting_code || '-'}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', color: '#6B7280' }}>{item.dre_group || '-'}</TableCell>
                      <TableCell>
                        {item.deductible === true ? (
                          <Chip size="small" label="Sim" sx={{ bgcolor: '#DCFCE7', color: '#166534' }} />
                        ) : item.deductible === false ? (
                          <Chip size="small" label="Não" sx={{ bgcolor: '#FEE2E2', color: '#991B1B' }} />
                        ) : '-'}
                      </TableCell>
                      <TableCell>{item.sort_order ?? '-'}</TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          startIcon={<Edit />}
                          onClick={() => openEditCategoryDialog(item.id)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={categoriesState.pagination.total || 0}
            page={Math.max((categoriesState.pagination.page || 1) - 1, 0)}
              getItemAriaLabel={getPaginationAriaLabel}
              labelRowsPerPage="Itens por página:"
              labelDisplayedRows={formatPaginationDisplayedRows}
            onPageChange={(_, nextPage) =>
              setCategoriesQuery((prev) => ({ ...prev, page: nextPage + 1 }))
            }
            rowsPerPage={categoriesQuery.limit}
            onRowsPerPageChange={(event) =>
              setCategoriesQuery((prev) => ({ ...prev, page: 1, limit: Number(event.target.value) }))
            }
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Card>
      </>
    );
  };

  const renderCostCentersTab = () => {
    return (
      <>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              select
              size="small"
              label="Tipo"
              value={costCentersQuery.type}
              onChange={(event) =>
                setCostCentersQuery((prev) => ({ ...prev, page: 1, type: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="DEPARTMENT">DEPARTMENT</MenuItem>
              <MenuItem value="PROJECT">PROJECT</MenuItem>
              <MenuItem value="SERVICE_LINE">SERVICE_LINE</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              size="small"
              label="UF"
              value={costCentersQuery.state}
              inputProps={{ maxLength: 2 }}
              onChange={(event) =>
                setCostCentersQuery((prev) => ({
                  ...prev,
                  page: 1,
                  state: event.target.value.toUpperCase(),
                }))
              }
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              select
              size="small"
              label="Situação"
              value={costCentersQuery.is_active}
              onChange={(event) =>
                setCostCentersQuery((prev) => ({ ...prev, page: 1, is_active: event.target.value }))
              }
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="true">Ativo</MenuItem>
              <MenuItem value="false">Inativo</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Refresh />}
              onClick={loadCostCenters}
              sx={{ height: '40px' }}
            >
              {costCentersState.error ? 'Tentar novamente' : 'Atualizar'}
            </Button>
          </Grid>
        </Grid>

        {costCentersState.error && <Alert severity="error" sx={{ mb: 2 }}>{costCentersState.error}</Alert>}

        <Card sx={{ border: `1px solid ${BLUE.border}` }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                    <TableCell>Código</TableCell>
                  <TableCell>Nome</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Centro pai</TableCell>
                    <TableCell>Território</TableCell>
                  <TableCell>Cidade</TableCell>
                  <TableCell>UF</TableCell>
                    <TableCell>Situação</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {costCentersState.loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={22} />
                    </TableCell>
                  </TableRow>
                ) : costCentersState.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState message="Nenhum centro de custo encontrado para os filtros selecionados." />
                    </TableCell>
                  </TableRow>
                ) : (
                  costCentersState.data.map((item) => (
                    <TableRow hover key={item.id}>
                      <TableCell>{item.code || '-'}</TableCell>
                      <TableCell>{item.name || '-'}</TableCell>
                      <TableCell>{item.type || '-'}</TableCell>
                      <TableCell>{item.parent?.name || '-'}</TableCell>
                      <TableCell>{item.territory?.name || '-'}</TableCell>
                      <TableCell>{item.city || '-'}</TableCell>
                      <TableCell>{item.state || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={toBooleanLabel(Boolean(item.is_active))}
                          sx={{ bgcolor: item.is_active ? '#DCFCE7' : '#F1F5F9', color: item.is_active ? '#166534' : '#475569' }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={costCentersState.pagination.total || 0}
            page={Math.max((costCentersState.pagination.page || 1) - 1, 0)}
              getItemAriaLabel={getPaginationAriaLabel}
              labelRowsPerPage="Itens por página:"
              labelDisplayedRows={formatPaginationDisplayedRows}
            onPageChange={(_, nextPage) =>
              setCostCentersQuery((prev) => ({ ...prev, page: nextPage + 1 }))
            }
            rowsPerPage={costCentersQuery.limit}
            onRowsPerPageChange={(event) =>
              setCostCentersQuery((prev) => ({ ...prev, page: 1, limit: Number(event.target.value) }))
            }
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Card>
      </>
    );
  };

  return (
    <Box sx={{ minHeight: '100vh', background: BLUE.pageBg, py: 3 }}>
      <Container maxWidth="xl">
        <Card
          sx={{
            mb: 2,
            border: `1px solid ${BLUE.borderStrong}`,
            background: `linear-gradient(120deg, ${BLUE.cardBg} 0%, ${BLUE.sectionBg} 100%)`,
            boxShadow: '0 10px 25px rgba(37, 99, 235, 0.12)',
          }}
        >
          <CardContent sx={{ py: 2.5 }}>
            <Typography sx={{ color: BLUE.primary, fontWeight: 800, fontSize: 24 }}>
              Painel Financeiro Administrativo
            </Typography>
            <Typography sx={{ color: BLUE.subtext, mt: 0.5 }}>
              Etapa 1C-B: painel financeiro com gestão de contas e consulta de categorias e centros de custo.
            </Typography>

            <Grid container spacing={1.5} sx={{ mt: 1 }}>
              {headerKpis.map((kpi) => (
                <Grid item xs={12} sm={4} key={kpi.label}>
                  <Card sx={{ border: `1px solid ${BLUE.border}`, backgroundColor: BLUE.cardBg }}>
                    <CardContent sx={{ py: 1.5 }}>
                      <Typography sx={{ color: BLUE.subtext, fontSize: 12 }}>{kpi.label}</Typography>
                      <Typography sx={{ color: BLUE.text, fontWeight: 800, fontSize: 28, lineHeight: 1.1 }}>
                        {kpi.value}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>

        <Card sx={{ border: `1px solid ${BLUE.border}` }}>
          <CardContent sx={{ pb: 1 }}>
            <Tabs
              value={activeTab}
              onChange={(_, nextTab) => setActiveTab(nextTab)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                mb: 2,
                '& .MuiTabs-indicator': {
                  backgroundColor: BLUE.primary,
                  height: 3,
                },
                '& .MuiTab-root': {
                  textTransform: 'none',
                  minHeight: 40,
                  color: BLUE.subtext,
                  fontWeight: 600,
                },
                '& .Mui-selected': {
                  color: BLUE.secondary,
                },
              }}
            >
              {TAB_DEFS.map((tabDef, index) => (
                <Tab
                  key={tabDef.key}
                  icon={tabDef.icon}
                  iconPosition="start"
                  label={tabDef.label}
                  {...tabA11yProps(index)}
                />
              ))}
            </Tabs>
            <Box
              role="tabpanel"
              id="financeiro-tabpanel-0"
              aria-labelledby="financeiro-tab-0"
              hidden={activeTab !== 0}
            >
              {activeTab === 0 && renderAccountsTab()}
            </Box>
            <Box
              role="tabpanel"
              id="financeiro-tabpanel-1"
              aria-labelledby="financeiro-tab-1"
              hidden={activeTab !== 1}
            >
              {activeTab === 1 && renderCategoriesTab()}
            </Box>
            <Box
              role="tabpanel"
              id="financeiro-tabpanel-2"
              aria-labelledby="financeiro-tab-2"
              hidden={activeTab !== 2}
            >
              {activeTab === 2 && renderCostCentersTab()}
            </Box>
          </CardContent>
        </Card>
      </Container>
      <AccountFormDialog
        open={accountDialogOpen}
        mode={accountDialogMode}
        account={selectedAccount}
        role={adminRole}
        isSuperAdmin={isSuperAdmin}
        submitting={accountSubmitting}
        error={accountDialogError}
        onClose={closeAccountDialog}
        onReloadData={handleReloadAccountsFromForm}
        onSubmit={handleAccountSubmit}
      />
      <CategoryFormDialog
        open={categoryDialogOpen}
        mode={categoryDialogMode}
        categoryId={selectedCategoryId}
        categories={categoriesState.data}
        onClose={closeCategoryDialog}
        onSuccess={handleCategorySuccess}
      />
      <Dialog
        open={toggleDialogState.open}
        onClose={(_, reason) => {
          if (toggleDialogState.loading) return;
          if (reason === 'escapeKeyDown' || reason === 'backdropClick') {
            closeToggleAccountDialog();
            return;
          }
          closeToggleAccountDialog();
        }}
        disableEscapeKeyDown={toggleDialogState.loading}
        fullWidth
        maxWidth="sm"
        aria-labelledby="finance-account-toggle-dialog-title"
      >
        <DialogTitle id="finance-account-toggle-dialog-title">
          {toggleDialogState.nextIsActive ? 'Ativar conta' : 'Desativar conta'}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity={toggleDialogState.nextIsActive ? 'info' : 'warning'}>
              {toggleDialogState.nextIsActive
                ? `Confirme a ativacao da conta ${toggleDialogState.account?.name || '-'}.`
                : `Confirme a desativacao da conta ${toggleDialogState.account?.name || '-'}. A operacao pode ser bloqueada se a conta ja tiver uso ou transacoes pendentes.`}
            </Alert>
            {toggleDialogState.error?.message && (
              <Alert severity="warning">
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span>{toggleDialogState.error.message}</span>
                  {toggleDialogState.error.showReload && (
                    <Box>
                      <Button size="small" onClick={handleReloadAccountsFromToggle} disabled={toggleDialogState.loading}>
                        {toggleDialogState.error.reloadLabel || 'Recarregar dados'}
                      </Button>
                    </Box>
                  )}
                </Box>
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeToggleAccountDialog} disabled={toggleDialogState.loading}>Cancelar</Button>
          <Button
            variant="contained"
            color={toggleDialogState.nextIsActive ? 'success' : 'error'}
            onClick={handleToggleAccountStatus}
            disabled={toggleDialogState.loading}
          >
            {toggleDialogState.loading
              ? (toggleDialogState.nextIsActive ? 'Ativando...' : 'Desativando...')
              : (toggleDialogState.nextIsActive ? 'Ativar conta' : 'Desativar conta')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
