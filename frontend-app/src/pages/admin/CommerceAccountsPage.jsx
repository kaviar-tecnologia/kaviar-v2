import { useState, useEffect } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableHead, TableRow, Chip, Button, TextField, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar, Select, MenuItem, FormControl, InputLabel, IconButton, Tooltip, Drawer, Divider, Card, CardContent, Grid, Tabs, Tab } from '@mui/material';
import { Add, CheckCircle, LockReset, ContentCopy, AccountBalanceWallet, Close, Download, Place, Send } from '@mui/icons-material';
import { API_BASE_URL } from '../../config/api';
import { formatDate } from '../../utils/formatDate';

const GOLD = '#B8942E';
const STATUS_MAP = { pending: { label: 'Pendente', color: 'warning' }, approved: { label: 'Aprovado', color: 'info' }, active: { label: 'Ativo', color: 'success' }, paused: { label: 'Pausado', color: 'default' }, blocked: { label: 'Bloqueado', color: 'error' } };
const WD_STATUS = { REQUESTED: { label: 'Solicitado', color: '#F59E0B' }, APPROVED: { label: 'Aprovado', color: '#3B82F6' }, PAID: { label: 'Pago', color: '#10B981' }, REJECTED: { label: 'Rejeitado', color: '#EF4444' } };

export default function CommerceAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', trade_name: '', category: 'outro', phone: '', email: '', address: '', crm_lead_id: '', territory_id: '', neighborhood_id: '' });
  const [passwordResult, setPasswordResult] = useState(null);
  // Territories & Neighborhoods
  const [territories, setTerritories] = useState([]);
  const [neighborhoods, setNeighborhoods] = useState([]);
  // Edit drawer
  const [editOpen, setEditOpen] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [editTerritory, setEditTerritory] = useState('');
  const [editNeighborhood, setEditNeighborhood] = useState('');
  // Wallet drawer
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletAccount, setWalletAccount] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [walletTxs, setWalletTxs] = useState([]);
  // Finance tab
  const [mainTab, setMainTab] = useState(0);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [financeAccounts, setFinanceAccounts] = useState([]);

  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';
  const isManager = admin?.role === 'TERRITORIAL_MANAGER';
  const token = localStorage.getItem('kaviar_admin_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchAccounts = async () => { setLoading(true); try { const res = await fetch(`${API_BASE_URL}/api/admin/commerce/accounts`, { headers }); const data = await res.json(); if (data.success) setAccounts(data.data); } catch {} setLoading(false); };
  const fetchTerritories = async () => { try { const url = isManager ? `${API_BASE_URL}/api/admin/commerce/my-territories` : `${API_BASE_URL}/api/admin/territories`; const res = await fetch(url, { headers }); const data = await res.json(); if (data.success) { const active = (data.data || []).filter(t => t.is_active !== false); setTerritories(active); if (active.length === 1 && !form.territory_id) setForm(f => ({ ...f, territory_id: active[0].id })); } } catch {} };
  const fetchNeighborhoods = async () => { try { const res = await fetch(`${API_BASE_URL}/api/governance/neighborhoods`, { headers }); const data = await res.json(); if (data.success) setNeighborhoods(data.data.filter(n => n.is_active)); } catch {} };
  const fetchFinance = async () => { try { const [sRes, aRes] = await Promise.all([fetch(`${API_BASE_URL}/api/admin/commerce/finance/summary`, { headers }), fetch(`${API_BASE_URL}/api/admin/commerce/finance/by-account`, { headers })]); const [s, a] = await Promise.all([sRes.json(), aRes.json()]); if (s.success) setFinanceSummary(s.data); if (a.success) setFinanceAccounts(a.data); } catch {} };
  useEffect(() => { fetchAccounts(); fetchTerritories(); fetchNeighborhoods(); if (isSuperAdmin) fetchFinance(); }, []);

  const handleCreate = async () => { if (!form.name.trim()) return setSnack('Nome obrigatório'); try { const payload = { ...form, territory_id: form.territory_id || null, neighborhood_id: form.neighborhood_id || null, crm_lead_id: form.crm_lead_id || undefined }; if (!payload.crm_lead_id) delete payload.crm_lead_id; const res = await fetch(`${API_BASE_URL}/api/admin/commerce/accounts`, { method: 'POST', headers, body: JSON.stringify(payload) }); const data = await res.json(); if (data.success) { setCreateOpen(false); fetchAccounts(); setSnack('Comércio criado!'); setForm({ name: '', trade_name: '', category: 'outro', phone: '', email: '', address: '', crm_lead_id: '', territory_id: '', neighborhood_id: '' }); } else setSnack(data.error || 'Erro'); } catch { setSnack('Erro de conexão'); } };
  const handleEditTerritory = async () => { if (!editAccount) return; let payload = { territory_id: editTerritory || null, neighborhood_id: editNeighborhood || null }; if (isManager) { const reason = prompt('Motivo da alteração territorial (mín. 10 caracteres):'); if (!reason || reason.trim().length < 10) return setSnack('Motivo obrigatório (mínimo 10 caracteres)'); const password = prompt('Sua senha administrativa:'); if (!password) return; payload = { ...payload, password, reason: reason.trim() }; } const res = await fetch(`${API_BASE_URL}/api/admin/commerce/accounts/${editAccount.id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) }); const data = await res.json(); if (data.success) { setEditOpen(false); fetchAccounts(); setSnack('Território atualizado!'); } else setSnack(data.error || 'Erro'); };
  const openEdit = (account) => { setEditAccount(account); setEditTerritory(account.territory_id || ''); setEditNeighborhood(account.neighborhood_id || ''); setEditOpen(true); };
  const [activateDialog, setActivateDialog] = useState({ open: false, id: null, reason: '', password: '' });
  const handleActivateConfirm = async () => { const { id, reason, password } = activateDialog; if (!reason || reason.trim().length < 10) return setSnack('Motivo obrigatório (mínimo 10 caracteres)'); if (!password) return setSnack('Senha obrigatória'); const res = await fetch(`${API_BASE_URL}/api/admin/commerce/accounts/${id}/activate`, { method: 'POST', headers, body: JSON.stringify({ password, reason: reason.trim() }) }); const data = await res.json(); if (data.success) { setActivateDialog({ open: false, id: null, reason: '', password: '' }); setPasswordResult({ email: data.data.user?.email, temp_password: data.data.temp_password, action: 'ativação', email_sent: data.data.email_sent }); fetchAccounts(); } else setSnack(data.error || 'Erro'); };
  const handleActivate = (id) => { setActivateDialog({ open: true, id, reason: '', password: '' }); };
  const handleResendInvite = async (id) => { const res = await fetch(`${API_BASE_URL}/api/admin/commerce/accounts/${id}/resend-invite`, { method: 'POST', headers }); const data = await res.json(); if (data.success) { setPasswordResult({ email: data.data.email, temp_password: data.data.temp_password, action: 'reenvio', email_sent: data.data.email_sent }); } else setSnack(data.error || 'Erro'); };
  const handleResetPassword = async (id) => { if (!window.confirm('Gerar nova senha?')) return; const res = await fetch(`${API_BASE_URL}/api/admin/commerce/accounts/${id}/reset-password`, { method: 'POST', headers }); const data = await res.json(); if (data.success) setPasswordResult({ email: data.data.email, temp_password: data.data.temp_password, action: 'reset' }); else setSnack(data.error || 'Erro'); };
  const handleDelete = async (id, name) => { if (!window.confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return; try { const res = await fetch(`${API_BASE_URL}/api/admin/commerce/accounts/${id}`, { method: 'DELETE', headers }); const data = await res.json(); if (data.success) { fetchAccounts(); setSnack('Comércio excluído.'); } else setSnack(data.error || 'Erro ao excluir'); } catch { setSnack('Erro de conexão'); } };
  const copyToClipboard = (text) => { navigator.clipboard.writeText(text).then(() => setSnack('Copiado!')); };

  const openWallet = async (account) => {
    setWalletAccount(account);
    setWalletOpen(true);
    // Fetch wallet details via admin account detail
    try {
      const [accRes, wdRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/commerce/accounts/${account.id}`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/commerce/withdrawals?status=`, { headers }),
      ]);
      const accData = await accRes.json();
      const wdData = await wdRes.json();
      if (accData.success) setWalletData(accData.data);
      if (wdData.success) setWithdrawals(wdData.data.filter(w => w.commerce_account_id === account.id));
    } catch {}
  };

  const handleWithdrawalAction = async (wdId, action) => {
    if (action === 'pay' && !window.confirm('Confirme somente depois de realizar o Pix/transferência manual para o comércio. Esta ação debitará o saldo disponível.')) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/commerce/withdrawals/${wdId}`, { method: 'PATCH', headers, body: JSON.stringify({ action }) });
    const data = await res.json();
    if (data.success) { setSnack(action === 'approve' ? 'Aprovado!' : action === 'pay' ? 'Marcado como pago!' : 'Rejeitado'); openWallet(walletAccount); }
    else setSnack(data.error || 'Erro');
  };

  return (
    <Box sx={{ p: { xs: 1, md: 3 }, maxWidth: 1200, mx: 'auto', color: '#E5E7EB', '& .MuiTableCell-root': { color: '#D1D5DB', borderColor: 'rgba(255,255,255,0.08)' }, '& .MuiTableCell-head': { color: '#94A3B8' }, '& .MuiTab-root': { color: '#9CA3AF' }, '& .Mui-selected': { color: '#FFD700 !important' } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ color: GOLD, fontWeight: 800 }}>🏪 Comércios Locais</Typography>
        {(isSuperAdmin || isManager) && <Button variant="contained" size="small" startIcon={<Add />} onClick={() => { if (territories.length === 1) setForm(f => ({ ...f, territory_id: territories[0].id })); setCreateOpen(true); }} sx={{ bgcolor: GOLD, textTransform: 'none' }}>Novo Comércio</Button>}
      </Box>

      {isSuperAdmin && <Tabs value={mainTab} onChange={(_, v) => setMainTab(v)} sx={{ mb: 2, '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 } }}>
        <Tab label="Comércios" />
        <Tab label="Financeiro" />
      </Tabs>}

      {/* Comércios Tab */}
      {(mainTab === 0 || isManager) && (<>
      {loading ? <CircularProgress sx={{ color: GOLD }} /> : (
        <Table size="small">
          <TableHead><TableRow sx={{ '& th': { fontWeight: 700, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' } }}>
            <TableCell>Nome</TableCell><TableCell>Categoria</TableCell><TableCell>Email</TableCell><TableCell>Status</TableCell><TableCell>Ações</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {accounts.map(a => (
              <TableRow key={a.id} hover>
                <TableCell><Typography sx={{ fontWeight: 600, fontSize: 13, color: '#E5E7EB' }}>{a.name}</Typography>{a.trade_name && <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>{a.trade_name}</Typography>}</TableCell>
                <TableCell sx={{ fontSize: 12, color: '#D1D5DB' }}>{a.category}</TableCell>
                <TableCell sx={{ fontSize: 12, color: '#D1D5DB' }}>{a.email || '—'}</TableCell>
                <TableCell><Chip label={STATUS_MAP[a.status]?.label || a.status} color={STATUS_MAP[a.status]?.color || 'default'} size="small" /></TableCell>
                <TableCell>
                  {isSuperAdmin && a.status === 'pending' && <Button size="small" startIcon={<CheckCircle />} onClick={() => handleActivate(a.id)} sx={{ textTransform: 'none', color: '#10B981' }}>Ativar</Button>}
                  {isSuperAdmin && a.status === 'active' && <>
                    <Tooltip title="Reenviar convite"><IconButton size="small" onClick={() => handleResendInvite(a.id)} sx={{ color: '#3B82F6' }}><Send sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Editar território"><IconButton size="small" onClick={() => openEdit(a)} sx={{ color: '#6B7280' }}><Place sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Carteira / Saques"><IconButton size="small" onClick={() => openWallet(a)} sx={{ color: GOLD }}><AccountBalanceWallet sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Resetar senha"><IconButton size="small" onClick={() => handleResetPassword(a.id)} sx={{ color: '#6B7280' }}><LockReset sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                  </>}
                  {isSuperAdmin && a.status !== 'pending' && a.status !== 'active' && <Tooltip title="Editar território"><IconButton size="small" onClick={() => openEdit(a)} sx={{ color: '#6B7280' }}><Place sx={{ fontSize: 18 }} /></IconButton></Tooltip>}
                  {isManager && (a.status === 'pending' || a.status === 'approved') && <Button size="small" startIcon={<CheckCircle />} onClick={() => handleActivate(a.id)} sx={{ textTransform: 'none', color: '#10B981' }}>Ativar</Button>}
                  {isManager && a.status === 'active' && <>
                    <Tooltip title="Reenviar convite"><IconButton size="small" onClick={() => handleResendInvite(a.id)} sx={{ color: '#3B82F6' }}><Send sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Editar território"><IconButton size="small" onClick={() => openEdit(a)} sx={{ color: '#6B7280' }}><Place sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                  </>}
                  {isManager && a.status === 'blocked' && <Typography sx={{ fontSize: 11, color: '#EF4444' }}>Bloqueado</Typography>}
                  {(isSuperAdmin || isManager) && <Button size="small" color="error" onClick={() => handleDelete(a.id, a.name)} sx={{ textTransform: 'none', fontSize: 11 }}>Excluir</Button>}
                </TableCell>
              </TableRow>
            ))}
            {accounts.length === 0 && <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: '#9CA3AF' }}>Nenhum comércio</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      </>)}

      {/* Finance Tab — SA only */}
      {mainTab === 1 && isSuperAdmin && (
        <Box>
          {/* Print-only institutional header */}
          <Box className="print-header" sx={{ display: 'none', '@media print': { display: 'block', mb: 3, borderBottom: '2px solid #B8942E', pb: 2 } }}>
            {isSuperAdmin ? <>
              <Typography sx={{ fontWeight: 800, fontSize: 22, color: '#B8942E' }}>KAVIAR</Typography>
              <Typography sx={{ fontSize: 11, color: '#374151' }}>KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA</Typography>
              <Typography sx={{ fontSize: 11, color: '#374151' }}>CNPJ: 67.783.601/0001-99</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700, mt: 1 }}>Relatório Financeiro dos Comércios</Typography>
            </> : <>
              <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#B8942E' }}>Relatório do Gestor Territorial — KAVIAR</Typography>
              <Typography sx={{ fontSize: 12, color: '#374151', mt: 0.5 }}>Gestor responsável: {admin?.name || '—'}</Typography>
              <Typography sx={{ fontSize: 12, color: '#374151' }}>Base operacional: KAVIAR</Typography>
            </>}
            <Typography sx={{ fontSize: 11, color: '#6B7280' }}>Código: REL-KAV-{new Date().toISOString().slice(0,10).replace(/-/g,'')}-{String(new Date().getHours()).padStart(2,'0')}{String(new Date().getMinutes()).padStart(2,'0')}</Typography>
            <Typography sx={{ fontSize: 11, color: '#6B7280' }}>Emitido em: {new Date().toLocaleString('pt-BR')}</Typography>
          </Box>

          {financeSummary && (
            <Grid container spacing={1} sx={{ mb: 3 }}>
              {[
                ['Total Vendido', financeSummary.total_sold, '#111'],
                ['Comissão KAVIAR', financeSummary.kaviar_commission, GOLD],
                ['Pendente', financeSummary.pending_balance, '#F59E0B'],
                ['Disponível', financeSummary.available_balance, '#10B981'],
                ['Sacado', financeSummary.total_withdrawn, '#6B7280'],
                ['Saques Solicit.', financeSummary.withdrawals_requested, '#F59E0B', true],
                ['Saques Aprov.', financeSummary.withdrawals_approved, '#3B82F6', true],
                ['Saques Pagos', financeSummary.withdrawals_paid, '#10B981', true],
              ].map(([label, val, color, isCount]) => (
                <Grid item xs={6} sm={3} key={label}><Card><CardContent sx={{ py: 1, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 9, color: '#9CA3AF', textTransform: 'uppercase' }}>{label}</Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 800, color }}>{isCount ? val : `R$ ${(val / 100).toFixed(2)}`}</Typography>
                </CardContent></Card></Grid>
              ))}
            </Grid>
          )}

          {/* Action buttons */}
          <Box className="no-print" sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', '@media print': { display: 'none' } }}>
            {isSuperAdmin && <Button size="small" startIcon={<Download />} sx={{ textTransform: 'none', color: '#6B7280' }} onClick={async () => {
              const res = await fetch(`${API_BASE_URL}/api/admin/commerce/finance/export`, { headers });
              if (!res.ok) return setSnack('Erro');
              const blob = await res.blob(); const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `financeiro-comercios-${new Date().toISOString().slice(0,10)}.csv`; a.click();
            }}>CSV</Button>}
            <Button size="small" sx={{ textTransform: 'none', color: '#6B7280' }} onClick={() => window.print()}>🖨️ Imprimir</Button>
            <Button size="small" sx={{ textTransform: 'none', color: '#6B7280' }} onClick={() => {
              const code = `REL-KAV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(new Date().getHours()).padStart(2,'0')}${String(new Date().getMinutes()).padStart(2,'0')}`;
              const header = isSuperAdmin ? `📊 Relatório KAVIAR Comércio\n🏢 KAVIAR\nCNPJ: 67.783.601/0001-99` : `📊 Relatório do Gestor Territorial — KAVIAR\n👤 Gestor: ${admin?.name || '—'}`;
              const text = `${header}\nCódigo: ${code}\nEmitido: ${new Date().toLocaleString('pt-BR')}\n\n💰 Total vendido: R$ ${((financeSummary?.total_sold||0)/100).toFixed(2)}\n🏦 Comissão KAVIAR: R$ ${((financeSummary?.kaviar_commission||0)/100).toFixed(2)}\n⏳ Pendente: R$ ${((financeSummary?.pending_balance||0)/100).toFixed(2)}\n✅ Disponível: R$ ${((financeSummary?.available_balance||0)/100).toFixed(2)}\n💸 Sacado: R$ ${((financeSummary?.total_withdrawn||0)/100).toFixed(2)}\n\nRelatório operacional e gerencial. Não substitui nota fiscal.`;
              navigator.clipboard.writeText(text); setSnack('Resumo copiado!');
            }}>📋 Copiar</Button>
            {isSuperAdmin && <Button size="small" sx={{ textTransform: 'none', color: '#25D366' }} onClick={() => {
              const code = `REL-KAV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(new Date().getHours()).padStart(2,'0')}${String(new Date().getMinutes()).padStart(2,'0')}`;
              const text = `📊 Relatório KAVIAR Comércio\n🏢 KAVIAR\nCNPJ: 67.783.601/0001-99\nCódigo: ${code}\nEmitido: ${new Date().toLocaleString('pt-BR')}\n\n💰 Total vendido: R$ ${((financeSummary?.total_sold||0)/100).toFixed(2)}\n🏦 Comissão KAVIAR: R$ ${((financeSummary?.kaviar_commission||0)/100).toFixed(2)}\n✅ Disponível: R$ ${((financeSummary?.available_balance||0)/100).toFixed(2)}\n💸 Sacado: R$ ${((financeSummary?.total_withdrawn||0)/100).toFixed(2)}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            }}>📱 WhatsApp</Button>}
          </Box>

          <Table size="small">
            <TableHead><TableRow sx={{ '& th': { fontWeight: 700, fontSize: 10, color: '#94A3B8', textTransform: 'uppercase' } }}>
              <TableCell>Comércio</TableCell><TableCell>Vendido</TableCell><TableCell>Comissão</TableCell><TableCell>Pendente</TableCell><TableCell>Disponível</TableCell><TableCell>Sacado</TableCell><TableCell>Saques</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {financeAccounts.map(a => (
                <TableRow key={a.id} hover>
                  <TableCell><Typography sx={{ fontWeight: 600, fontSize: 12, color: '#E5E7EB' }}>{a.name}</Typography><Typography sx={{ fontSize: 10, color: '#9CA3AF' }}>{a.category}</Typography></TableCell>
                  <TableCell sx={{ fontSize: 12, color: '#D1D5DB' }}>R$ {(a.total_sold / 100).toFixed(2)}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: GOLD }}>R$ {(a.kaviar_commission / 100).toFixed(2)}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: '#F59E0B' }}>R$ {(a.pending_balance / 100).toFixed(2)}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: '#10B981' }}>R$ {(a.available_balance / 100).toFixed(2)}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: '#9CA3AF' }}>R$ {(a.total_withdrawn / 100).toFixed(2)}</TableCell>
                  <TableCell>{a.withdrawals_open > 0 && <Chip label={a.withdrawals_open} size="small" color="warning" sx={{ fontSize: 10 }} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Print-only footer */}
          <Box className="print-footer" sx={{ display: 'none', '@media print': { display: 'block', mt: 4, pt: 2, borderTop: '1px solid #E5E7EB' } }}>
            {isSuperAdmin ? <Typography sx={{ fontSize: 10, color: '#6B7280' }}>KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA — CNPJ 67.783.601/0001-99.</Typography>
            : <Typography sx={{ fontSize: 10, color: '#6B7280' }}>Relatório do Gestor Territorial — Base operacional KAVIAR.</Typography>}
            <Typography sx={{ fontSize: 9, color: '#9CA3AF', mt: 0.5 }}>Este relatório possui finalidade operacional e gerencial{isSuperAdmin ? '' : ' do território'}. Não substitui nota fiscal, recibo fiscal ou documento contábil oficial.</Typography>
            {isSuperAdmin && <Typography sx={{ fontSize: 9, color: '#9CA3AF' }}>Documento gerado eletronicamente. Validação interna KAVIAR.</Typography>}
          </Box>
        </Box>
      )}

      {/* Print CSS */}
      <style>{`@media print { .no-print, nav, header, [class*="MuiDrawer-root"], [class*="MuiTabs"], [class*="MuiBackdrop"] { display: none !important; } .print-header, .print-footer { display: block !important; } #individual-report { display: block !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; background: #fff !important; color: #000 !important; padding: 40px !important; z-index: 99999 !important; } }`}</style>

      {/* Wallet Drawer */}
      <Drawer anchor="right" open={walletOpen} onClose={() => setWalletOpen(false)} PaperProps={{ sx: { width: { xs: '100%', md: 520 }, p: 3 } }}>
        {walletAccount && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>💰 {walletAccount.name}</Typography>
              <IconButton onClick={() => setWalletOpen(false)}><Close /></IconButton>
            </Box>

            {walletData?.wallet ? (
              <Grid container spacing={1} sx={{ mb: 2 }}>
                <Grid item xs={6}><Card><CardContent sx={{ py: 1, textAlign: 'center' }}><Typography sx={{ fontSize: 10, color: '#6B7280' }}>Disponível</Typography><Typography sx={{ fontSize: 18, fontWeight: 800, color: '#10B981' }}>R$ {((walletData.wallet?.available_balance_cents || 0) / 100).toFixed(2)}</Typography></CardContent></Card></Grid>
                <Grid item xs={6}><Card><CardContent sx={{ py: 1, textAlign: 'center' }}><Typography sx={{ fontSize: 10, color: '#6B7280' }}>Pendente</Typography><Typography sx={{ fontSize: 18, fontWeight: 800, color: '#F59E0B' }}>R$ {((walletData.wallet?.pending_balance_cents || 0) / 100).toFixed(2)}</Typography></CardContent></Card></Grid>
                <Grid item xs={6}><Card><CardContent sx={{ py: 1, textAlign: 'center' }}><Typography sx={{ fontSize: 10, color: '#6B7280' }}>Total Recebido</Typography><Typography sx={{ fontSize: 16, fontWeight: 700 }}>R$ {((walletData.wallet?.total_received_cents || 0) / 100).toFixed(2)}</Typography></CardContent></Card></Grid>
                <Grid item xs={6}><Card><CardContent sx={{ py: 1, textAlign: 'center' }}><Typography sx={{ fontSize: 10, color: '#6B7280' }}>Total Sacado</Typography><Typography sx={{ fontSize: 16, fontWeight: 700, color: '#6B7280' }}>R$ {((walletData.wallet?.total_withdrawn_cents || 0) / 100).toFixed(2)}</Typography></CardContent></Card></Grid>
              </Grid>
            ) : <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>Carteira ainda não criada (nenhum pagamento recebido)</Alert>}

            <Divider sx={{ my: 2 }} />
            <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>Solicitações de Saque</Typography>
            {withdrawals.length === 0 ? <Typography sx={{ color: '#9CA3AF', fontSize: 12 }}>Nenhuma solicitação</Typography> : withdrawals.map(w => (
              <Box key={w.id} sx={{ p: 1.5, mb: 1, bgcolor: '#F9FAFB', borderRadius: 1, border: '1px solid #E5E7EB' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14 }}>R$ {(w.amount_cents / 100).toFixed(2)}</Typography>
                  <Chip label={WD_STATUS[w.status]?.label || w.status} size="small" sx={{ bgcolor: `${WD_STATUS[w.status]?.color || '#6B7280'}15`, color: WD_STATUS[w.status]?.color, fontWeight: 600 }} />
                </Box>
                <Typography sx={{ fontSize: 11, color: '#6B7280' }}>{formatDate(w.requested_at, { showTime: true })}</Typography>
                {w.receiver_name && <Typography sx={{ fontSize: 11, color: '#374151' }}>Recebedor: {w.receiver_name}</Typography>}
                {isSuperAdmin && w.pix_key && <Typography sx={{ fontSize: 11, color: '#374151' }}>Pix ({w.pix_key_type}): {w.pix_key}</Typography>}
                <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                  {w.status === 'REQUESTED' && isSuperAdmin && <>
                    <Button size="small" variant="contained" onClick={() => handleWithdrawalAction(w.id, 'approve')} sx={{ bgcolor: '#3B82F6', textTransform: 'none', fontSize: 11 }}>Aprovar</Button>
                    <Button size="small" onClick={() => handleWithdrawalAction(w.id, 'reject')} sx={{ color: '#EF4444', textTransform: 'none', fontSize: 11 }}>Rejeitar</Button>
                  </>}
                  {w.status === 'APPROVED' && isSuperAdmin && <Button size="small" variant="contained" onClick={() => handleWithdrawalAction(w.id, 'pay')} sx={{ bgcolor: '#10B981', textTransform: 'none', fontSize: 11 }}>💸 Marcar como Pago</Button>}
                </Box>
              </Box>
            ))}

            {walletAccount.payout_pix_key && <>
              <Divider sx={{ my: 2 }} />
              <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 0.5 }}>Dados Pix do Comércio</Typography>
              <Typography sx={{ fontSize: 12, color: '#374151' }}>Tipo: {walletAccount.payout_pix_key_type} • Chave: {walletAccount.payout_pix_key}</Typography>
              {walletAccount.payout_receiver_name && <Typography sx={{ fontSize: 12, color: '#374151' }}>Nome: {walletAccount.payout_receiver_name}</Typography>}
            </>}

            {/* Individual report actions */}
            <Divider sx={{ my: 2 }} />
            <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 1 }}>Relatório do Comércio</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size="small" sx={{ textTransform: 'none', color: '#6B7280' }} onClick={() => {
                const el = document.getElementById('individual-report');
                if (el) { el.style.display = 'block'; window.print(); setTimeout(() => { el.style.display = 'none'; }, 500); }
              }}>🖨️ Imprimir</Button>
              <Button size="small" sx={{ textTransform: 'none', color: '#6B7280' }} onClick={() => {
                const w = walletData?.wallet;
                const code = `REL-KAV-${walletAccount.name.slice(0,3).toUpperCase()}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(new Date().getHours()).padStart(2,'0')}${String(new Date().getMinutes()).padStart(2,'0')}`;
                const text = `📊 Relatório Individual — KAVIAR Comércio\n🏢 KAVIAR\nCNPJ: 67.783.601/0001-99\nCódigo: ${code}\nEmitido: ${new Date().toLocaleString('pt-BR')}\n\n🏪 ${walletAccount.name}\nCategoria: ${walletAccount.category || '—'}\n\n✅ Disponível: R$ ${((w?.available_balance_cents||0)/100).toFixed(2)}\n⏳ Pendente: R$ ${((w?.pending_balance_cents||0)/100).toFixed(2)}\n💰 Total recebido: R$ ${((w?.total_received_cents||0)/100).toFixed(2)}\n💸 Total sacado: R$ ${((w?.total_withdrawn_cents||0)/100).toFixed(2)}\nSaques em aberto: ${withdrawals.filter(x=>['REQUESTED','APPROVED'].includes(x.status)).length}\n\nRelatório operacional. Não substitui nota fiscal.\nKAVIAR — CNPJ 67.783.601/0001-99`;
                navigator.clipboard.writeText(text); setSnack('Relatório copiado!');
              }}>📋 Copiar</Button>
              <Button size="small" sx={{ textTransform: 'none', color: '#25D366' }} onClick={() => {
                const w = walletData?.wallet;
                const code = `REL-KAV-${walletAccount.name.slice(0,3).toUpperCase()}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
                const text = `📊 KAVIAR — Relatório\n🏪 ${walletAccount.name}\nCódigo: ${code}\n\n✅ Disponível: R$ ${((w?.available_balance_cents||0)/100).toFixed(2)}\n⏳ Pendente: R$ ${((w?.pending_balance_cents||0)/100).toFixed(2)}\n💰 Recebido: R$ ${((w?.total_received_cents||0)/100).toFixed(2)}\n💸 Sacado: R$ ${((w?.total_withdrawn_cents||0)/100).toFixed(2)}\n\nKAVIAR\nCNPJ: 67.783.601/0001-99`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
              }}>📱 WhatsApp</Button>
            </Box>
          </Box>
        )}

        {/* Hidden print area for individual report */}
        {walletAccount && (
          <Box id="individual-report" sx={{ display: 'none', '@media print': { display: 'block !important', position: 'fixed', top: 0, left: 0, width: '100%', bgcolor: '#fff', color: '#000', p: 4, zIndex: 9999 } }}>
            <Box sx={{ borderBottom: '2px solid #B8942E', pb: 2, mb: 3 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 22, color: '#B8942E' }}>KAVIAR</Typography>
              <Typography sx={{ fontSize: 11 }}>KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA</Typography>
              <Typography sx={{ fontSize: 11 }}>CNPJ: 67.783.601/0001-99</Typography>
            </Box>
            <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 0.5 }}>Relatório Individual — {walletAccount.name}</Typography>
            <Typography sx={{ fontSize: 11, color: '#6B7280' }}>Categoria: {walletAccount.category || '—'}</Typography>
            <Typography sx={{ fontSize: 11, color: '#6B7280' }}>Código: REL-KAV-{walletAccount.name.slice(0,3).toUpperCase()}-{new Date().toISOString().slice(0,10).replace(/-/g,'')}-{String(new Date().getHours()).padStart(2,'0')}{String(new Date().getMinutes()).padStart(2,'0')}</Typography>
            <Typography sx={{ fontSize: 11, color: '#6B7280', mb: 2 }}>Emitido em: {new Date().toLocaleString('pt-BR')}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
              <Typography sx={{ fontSize: 13 }}>Saldo disponível: <strong>R$ {((walletData?.wallet?.available_balance_cents||0)/100).toFixed(2)}</strong></Typography>
              <Typography sx={{ fontSize: 13 }}>Saldo pendente: <strong>R$ {((walletData?.wallet?.pending_balance_cents||0)/100).toFixed(2)}</strong></Typography>
              <Typography sx={{ fontSize: 13 }}>Total recebido: <strong>R$ {((walletData?.wallet?.total_received_cents||0)/100).toFixed(2)}</strong></Typography>
              <Typography sx={{ fontSize: 13 }}>Total sacado: <strong>R$ {((walletData?.wallet?.total_withdrawn_cents||0)/100).toFixed(2)}</strong></Typography>
            </Box>
            <Typography sx={{ fontSize: 12, mb: 2 }}>Saques em aberto: {withdrawals.filter(x=>['REQUESTED','APPROVED'].includes(x.status)).length}</Typography>
            <Box sx={{ borderTop: '1px solid #E5E7EB', pt: 2, mt: 3 }}>
              <Typography sx={{ fontSize: 9, color: '#6B7280' }}>KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA — CNPJ 67.783.601/0001-99.</Typography>
              <Typography sx={{ fontSize: 9, color: '#9CA3AF' }}>Este relatório possui finalidade operacional e gerencial. Não substitui nota fiscal, recibo fiscal ou documento contábil oficial.</Typography>
              <Typography sx={{ fontSize: 9, color: '#9CA3AF' }}>Documento gerado eletronicamente. Validação interna KAVIAR.</Typography>
            </Box>
          </Box>
        )}
      </Drawer>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Novo Comércio</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Nome *" size="small" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <TextField label="Nome Fantasia" size="small" value={form.trade_name} onChange={e => setForm(f => ({ ...f, trade_name: e.target.value }))} />
          <FormControl size="small"><InputLabel>Categoria</InputLabel><Select value={form.category} label="Categoria" onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {['padaria','restaurante','pizzaria','lanchonete','mercado','farmacia','pet_shop','salao','oficina','loja','bar','outro'].map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select></FormControl>
          <Box sx={{ display: 'flex', gap: 1 }}><TextField label="Telefone" size="small" fullWidth value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /><TextField label="Email" size="small" fullWidth value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Box>
          <TextField label="Endereço" size="small" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          {isSuperAdmin && <TextField label="CRM Lead ID (opcional)" size="small" value={form.crm_lead_id} onChange={e => setForm(f => ({ ...f, crm_lead_id: e.target.value }))} placeholder="UUID do lead no CRM" />}
          <FormControl size="small"><InputLabel>Território</InputLabel><Select value={form.territory_id} label="Território" onChange={e => setForm(f => ({ ...f, territory_id: e.target.value, neighborhood_id: '' }))}><MenuItem value="">Sem território</MenuItem>{territories.map(t => <MenuItem key={t.id} value={t.id}>{t.name}{t.uf ? ` (${t.uf})` : ''}</MenuItem>)}</Select></FormControl>
          <FormControl size="small" disabled={!form.territory_id}><InputLabel>Bairro (opcional)</InputLabel><Select value={form.neighborhood_id} label="Bairro (opcional)" onChange={e => setForm(f => ({ ...f, neighborhood_id: e.target.value }))}><MenuItem value=""><em>Todo o território</em></MenuItem>{neighborhoods.filter(n => n.territory_id === form.territory_id).map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}</Select></FormControl>
        </DialogContent>
        <DialogActions><Button onClick={() => setCreateOpen(false)}>Cancelar</Button><Button variant="contained" onClick={handleCreate} sx={{ bgcolor: GOLD }}>Criar</Button></DialogActions>
      </Dialog>

      {/* Password Result */}
      <Dialog open={!!passwordResult} onClose={() => setPasswordResult(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#10B981' }}>{passwordResult?.action === 'reset' ? '🔒 Senha Resetada' : passwordResult?.action === 'reenvio' ? '📧 Convite Reenviado' : '✅ Comércio Ativado'}</DialogTitle>
        <DialogContent>{passwordResult && <>{passwordResult.email_sent ? <Alert severity="success" sx={{ mb: 2 }}>✅ E-mail enviado para {passwordResult.email}</Alert> : <Alert severity="warning" sx={{ mb: 2 }}>⚠️ Não foi possível enviar o e-mail. Copie os dados abaixo e envie manualmente.</Alert>}<Box sx={{ bgcolor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 2, p: 2 }}><Typography sx={{ fontSize: 12, color: '#6B7280', mb: 0.5 }}>Login:</Typography><Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}><Typography sx={{ fontWeight: 600 }}>{passwordResult.email}</Typography><IconButton size="small" onClick={() => copyToClipboard(passwordResult.email)}><ContentCopy sx={{ fontSize: 14 }} /></IconButton></Box><Typography sx={{ fontSize: 12, color: '#6B7280', mb: 0.5 }}>Senha temporária:</Typography><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography sx={{ fontWeight: 800, fontSize: 20, fontFamily: 'monospace' }}>{passwordResult.temp_password}</Typography><IconButton size="small" onClick={() => copyToClipboard(passwordResult.temp_password)}><ContentCopy sx={{ fontSize: 14 }} /></IconButton></Box></Box><Button fullWidth variant="outlined" size="small" sx={{ mt: 2, textTransform: 'none' }} onClick={() => copyToClipboard(`Login: ${passwordResult.email}\nSenha: ${passwordResult.temp_password}\nAcesse: https://kaviar.com.br/comercio/login`)}>📋 Copiar tudo</Button></>}</DialogContent>
        <DialogActions><Button onClick={() => setPasswordResult(null)} variant="contained" sx={{ bgcolor: GOLD }}>Fechar</Button></DialogActions>
      </Dialog>

      {/* Activate Confirmation Dialog */}
      <Dialog open={activateDialog.open} onClose={() => setActivateDialog({ open: false, id: null, reason: '', password: '' })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Ativar Comércio</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Motivo da ativação (mín. 10 caracteres)" size="small" fullWidth multiline rows={2} value={activateDialog.reason} onChange={e => setActivateDialog(d => ({ ...d, reason: e.target.value }))} />
          <TextField label="Sua senha administrativa" size="small" fullWidth type="password" value={activateDialog.password} onChange={e => setActivateDialog(d => ({ ...d, password: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActivateDialog({ open: false, id: null, reason: '', password: '' })}>Cancelar</Button>
          <Button variant="contained" onClick={handleActivateConfirm} disabled={!activateDialog.reason || activateDialog.reason.trim().length < 10 || !activateDialog.password} sx={{ bgcolor: '#10B981' }}>Ativar e Enviar Convite</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Territory & Neighborhood */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Território e Bairro — {editAccount?.trade_name || editAccount?.name}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Território</InputLabel>
            <Select value={editTerritory} label="Território" onChange={e => { setEditTerritory(e.target.value); setEditNeighborhood(''); }}>
              <MenuItem value="">Sem território</MenuItem>
              {territories.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth disabled={!editTerritory}>
            <InputLabel>Bairro (opcional)</InputLabel>
            <Select value={editNeighborhood} label="Bairro (opcional)" onChange={e => setEditNeighborhood(e.target.value)}>
              <MenuItem value=""><em>Todo o território</em></MenuItem>
              {neighborhoods.filter(n => n.territory_id === editTerritory).map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions><Button onClick={() => setEditOpen(false)}>Cancelar</Button><Button variant="contained" onClick={handleEditTerritory} sx={{ bgcolor: GOLD }}>Salvar</Button></DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
