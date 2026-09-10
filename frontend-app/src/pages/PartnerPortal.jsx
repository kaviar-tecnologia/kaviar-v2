import { useState, useEffect } from 'react';
import { Alert, Box, Typography, TextField, Button, Grid, Table, TableBody, TableCell, TableHead, TableRow, Chip, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Select, FormControl, InputLabel, Tabs, Tab } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { API_BASE_URL } from '../config/api';
import { formatDate } from '../utils/formatDate';

const gold = '#B8942E';

const defaultArPlaceForm = {
  id: '',
  name: '',
  address: '',
  summary: '',
  description: '',
  learn_more: '',
  useful_info: '',
};

export function buildPartnerArPlaceChangeRequestPayload(form) {
  return {
    name: form.name.trim(),
    address: form.address.trim() || null,
    summary: form.summary.trim() || null,
    description: form.description.trim() || null,
    learn_more: form.learn_more.trim() || null,
    useful_info: form.useful_info.trim() || null,
  };
}

export default function PartnerPortal() {
  const [token, setToken] = useState(localStorage.getItem('kaviar_partner_token') || '');
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [resetStep, setResetStep] = useState(0); // 0=login, 1=email, 2=code, 3=done
  const [resetForm, setResetForm] = useState({ email: '', code: '', password: '' });
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ income_total: 0, expense_total: 0, balance: 0, members_active: 0, members_paid: 0, members_overdue: 0 });
  const [mensalidade, setMensalidade] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState(0);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [txDialog, setTxDialog] = useState(null); // 'income' | 'expense' | null
  const [txForm, setTxForm] = useState({ description: '', amount: '', category: 'outro' });
  const [memberDialog, setMemberDialog] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: '', unit: '' });
  const [showReport, setShowReport] = useState(false);
  const [portalTab, setPortalTab] = useState(0);
  const [changePwDialog, setChangePwDialog] = useState(false);
  const [changePwForm, setChangePwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [changePwError, setChangePwError] = useState('');
  const [memberPayments, setMemberPayments] = useState([]);
  const [payMonth, setPayMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payDialog, setPayDialog] = useState(false);
  const [payForm, setPayForm] = useState({ member_id: '', amount: '', payment_method: 'pix', notes: '' });
  const [arPlaces, setArPlaces] = useState([]);
  const [arPlaceDialog, setArPlaceDialog] = useState(false);
  const [arPlaceForm, setArPlaceForm] = useState(defaultArPlaceForm);
  const [arPlaceError, setArPlaceError] = useState('');
  const [arPlaceSaving, setArPlaceSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const handleLogin = async () => {
    setLoginError('');
    const res = await fetch(`${API_BASE_URL}/api/partner/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginForm) });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('kaviar_partner_token', data.token);
      setToken(data.token);
      setUser(data.data);
    } else { setLoginError(data.error || 'Erro no login'); }
  };

  const openArPlaceDialog = async (id) => {
    setArPlaceError('');
    const res = await fetch(`${API_BASE_URL}/api/partner/ar-places/${id}`, { headers });
    const data = await res.json();
    if (!data.success) {
      setArPlaceError(data.error || 'Erro ao carregar hotel');
      return;
    }
    const content = data.data?.pending_change_request || data.data?.content || {};
    setArPlaceForm({
      id: data.data.id,
      name: content.name || data.data.name || '',
      address: content.address || data.data.address || '',
      summary: content.summary || '',
      description: content.description || '',
      learn_more: content.learn_more || '',
      useful_info: content.useful_info || '',
    });
    setArPlaceDialog(true);
  };

  const handleSaveArPlaceChange = async () => {
    if (!arPlaceForm.id) return;
    setArPlaceSaving(true);
    setArPlaceError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/partner/ar-places/${arPlaceForm.id}/change-request`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(buildPartnerArPlaceChangeRequestPayload(arPlaceForm)),
      });
      const data = await res.json();
      if (!data.success) {
        setArPlaceError(data.error || 'Erro ao salvar alteração');
        return;
      }
      setArPlaceDialog(false);
      setArPlaceForm(defaultArPlaceForm);
      fetchData();
    } finally {
      setArPlaceSaving(false);
    }
  };

  const fetchData = async () => {
    if (!token) return;
    try {
      const [meRes, memRes, txRes, drRes, arRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/partner/me`, { headers }),
        fetch(`${API_BASE_URL}/api/partner/members`, { headers }),
        fetch(`${API_BASE_URL}/api/partner/transactions?reference_month=${month}`, { headers }),
        fetch(`${API_BASE_URL}/api/partner/drivers`, { headers }),
        fetch(`${API_BASE_URL}/api/partner/ar-places`, { headers }),
      ]);
      const me = await meRes.json();
      const mem = await memRes.json();
      const tx = await txRes.json();
      const dr = await drRes.json();
      const ar = await arRes.json();
      if (me.success) setUser(me.data);
      else { setToken(''); localStorage.removeItem('kaviar_partner_token'); return; }
      if (mem.success) setMembers(mem.data);
      if (tx.success) { setTransactions(tx.data.transactions); setSummary({ income_total: tx.data.income_total, expense_total: tx.data.expense_total, balance: tx.data.balance, members_active: tx.data.members_active, members_paid: tx.data.members_paid, members_overdue: tx.data.members_overdue }); setMensalidade(tx.data.mensalidade || []); }
      if (dr.success) { setDrivers(dr.data.drivers || []); setPendingDrivers(dr.data.pending_requests || 0); }
      if (ar.success) setArPlaces(ar.data || []);
    } catch { setToken(''); localStorage.removeItem('kaviar_partner_token'); }
  };

  useEffect(() => { if (token) fetchData(); }, [token, month]);
  useEffect(() => { if (token && portalTab === 2) { fetch(`${API_BASE_URL}/api/partner/member-payments?month=${payMonth}`, { headers }).then(r => r.json()).then(d => { if (d.success) setMemberPayments(d.data); }); } }, [token, portalTab, payMonth]);

  const handleAddMember = async () => {
    if (!memberForm.name) return;
    await fetch(`${API_BASE_URL}/api/partner/members`, { method: 'POST', headers, body: JSON.stringify(memberForm) });
    setMemberDialog(false); setMemberForm({ name: '', unit: '' }); fetchData();
  };

  const handleToggleMember = async (id, currentStatus) => {
    await fetch(`${API_BASE_URL}/api/partner/members/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: currentStatus === 'active' ? 'inactive' : 'active' }) });
    fetchData();
  };

  const handleAddTx = async () => {
    if (!txForm.description || !txForm.amount) return;
    await fetch(`${API_BASE_URL}/api/partner/transactions`, { method: 'POST', headers, body: JSON.stringify({ type: txDialog, amount_cents: Math.round(Number(txForm.amount) * 100), description: txForm.description, category: txForm.category, reference_month: month }) });
    setTxDialog(null); setTxForm({ description: '', amount: '', category: 'outro' }); fetchData();
  };

  const handleDeleteTx = async (id) => {
    if (!confirm('Remover esta movimentação?')) return;
    await fetch(`${API_BASE_URL}/api/partner/transactions/${id}`, { method: 'DELETE', headers });
    fetchData();
  };

  const handlePayMensalidade = async (member) => {
    await fetch(`${API_BASE_URL}/api/partner/transactions`, { method: 'POST', headers, body: JSON.stringify({ type: 'income', amount_cents: 5000, description: `Mensalidade - ${member.name}`, category: 'mensalidade', reference_month: month, member_id: member.id }) });
    fetchData();
  };

  const handleLogout = () => { setToken(''); setUser(null); localStorage.removeItem('kaviar_partner_token'); };

  // Login screen
  if (!token || !user) return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Box sx={{ maxWidth: 360, width: '100%' }}>
        <Typography sx={{ color: gold, fontWeight: 800, fontSize: 22, textAlign: 'center', mb: 0.5, letterSpacing: 2 }}>KAVIAR</Typography>
        <Typography sx={{ color: '#999', textAlign: 'center', mb: 3, fontSize: 13 }}>Portal do Parceiro</Typography>

        {resetStep === 0 && (<>
          <TextField fullWidth size="small" label="Email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
          <TextField fullWidth size="small" label="Senha" type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} sx={{ mb: 2, '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
          {loginError && <Typography sx={{ color: '#ef5350', fontSize: 12, mb: 1 }}>{loginError}</Typography>}
          <Button fullWidth variant="contained" onClick={handleLogin} sx={{ bgcolor: gold, '&:hover': { bgcolor: '#9A7B24' } }}>Entrar</Button>
          <Button fullWidth size="small" onClick={() => setResetStep(1)} sx={{ color: '#888', mt: 1, fontSize: 12 }}>Esqueci minha senha</Button>
        </>)}

        {resetStep === 1 && (<>
          <Typography sx={{ color: '#E8E3D5', mb: 2, fontSize: 14 }}>Informe seu email ou telefone para receber o código de recuperação.</Typography>
          <TextField fullWidth size="small" label="Email ou telefone" value={resetForm.email} onChange={(e) => setResetForm({ ...resetForm, email: e.target.value })} sx={{ mb: 2, '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
          <Button fullWidth variant="contained" sx={{ bgcolor: gold }} onClick={async () => {
            const val = resetForm.email.trim();
            const isPhone = /^\d{10,}$/.test(val.replace(/\D/g, ''));
            const body = isPhone ? { phone: val } : { email: val };
            await fetch(`${API_BASE_URL}/api/partner/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            setResetStep(2);
          }}>Enviar código</Button>
          <Button fullWidth size="small" onClick={() => setResetStep(0)} sx={{ color: '#888', mt: 1 }}>Voltar</Button>
        </>)}

        {resetStep === 2 && (<>
          <Typography sx={{ color: '#E8E3D5', mb: 2, fontSize: 14 }}>Digite o código de 6 dígitos enviado por WhatsApp ou email e a nova senha.</Typography>
          <TextField fullWidth size="small" label="Código" value={resetForm.code} onChange={(e) => setResetForm({ ...resetForm, code: e.target.value })} sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
          <TextField fullWidth size="small" label="Nova senha" type="password" value={resetForm.password} onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })} sx={{ mb: 2, '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
          {loginError && <Typography sx={{ color: '#ef5350', fontSize: 12, mb: 1 }}>{loginError}</Typography>}
          <Button fullWidth variant="contained" sx={{ bgcolor: gold }} onClick={async () => {
            setLoginError('');
            const val = resetForm.email.trim();
            const isPhone = /^\d{10,}$/.test(val.replace(/\D/g, ''));
            const body = isPhone ? { phone: val, code: resetForm.code, new_password: resetForm.password } : { email: val, code: resetForm.code, new_password: resetForm.password };
            const res = await fetch(`${API_BASE_URL}/api/partner/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json();
            if (data.success) { setResetStep(3); } else { setLoginError(data.error); }
          }}>Redefinir senha</Button>
          <Button fullWidth size="small" onClick={() => setResetStep(1)} sx={{ color: '#888', mt: 1 }}>Reenviar código</Button>
        </>)}

        {resetStep === 3 && (<>
          <Typography sx={{ color: '#4caf50', textAlign: 'center', mb: 2 }}>✅ Senha alterada com sucesso!</Typography>
          <Button fullWidth variant="contained" sx={{ bgcolor: gold }} onClick={() => { setResetStep(0); setLoginError(''); }}>Fazer login</Button>
        </>)}
      </Box>
    </Box>
  );

  // Portal
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0a0a0a', color: '#E8E3D5', p: 2 }}>
      <Box sx={{ maxWidth: 700, mx: 'auto' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {user.logo_url ? <img src={user.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain' }} /> : null}
            <Box>
              <Typography sx={{ color: gold, fontWeight: 800, fontSize: 16, letterSpacing: 2 }}>KAVIAR</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{user.name}</Typography>
            </Box>
          </Box>
          <Button size="small" onClick={handleLogout} sx={{ color: '#888' }}>Sair</Button>
          <Button size="small" onClick={() => { setChangePwDialog(true); setChangePwForm({ current: '', newPw: '', confirm: '' }); setChangePwError(''); }} sx={{ color: '#888' }}>Alterar senha</Button>
        </Box>

        {/* Dialog alterar senha */}
        <Dialog open={changePwDialog} onClose={() => setChangePwDialog(false)} PaperProps={{ sx: { bgcolor: '#1a1a1a', color: '#E8E3D5' } }}>
          <DialogTitle sx={{ color: gold }}>Alterar senha</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important', minWidth: 300 }}>
            <TextField size="small" label="Senha atual" type="password" value={changePwForm.current} onChange={(e) => setChangePwForm({ ...changePwForm, current: e.target.value })} sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <TextField size="small" label="Nova senha" type="password" value={changePwForm.newPw} onChange={(e) => setChangePwForm({ ...changePwForm, newPw: e.target.value })} sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <TextField size="small" label="Confirmar nova senha" type="password" value={changePwForm.confirm} onChange={(e) => setChangePwForm({ ...changePwForm, confirm: e.target.value })} sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            {changePwError && <Typography sx={{ color: '#ef5350', fontSize: 12 }}>{changePwError}</Typography>}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setChangePwDialog(false)} sx={{ color: '#888' }}>Cancelar</Button>
            <Button variant="contained" sx={{ bgcolor: gold }} onClick={async () => {
              setChangePwError('');
              if (changePwForm.newPw !== changePwForm.confirm) { setChangePwError('Senhas não conferem'); return; }
              if (changePwForm.newPw.length < 6) { setChangePwError('Mínimo 6 caracteres'); return; }
              const res = await fetch(`${API_BASE_URL}/api/partner/change-password`, { method: 'POST', headers, body: JSON.stringify({ current_password: changePwForm.current, new_password: changePwForm.newPw }) });
              const data = await res.json();
              if (data.success) { setChangePwDialog(false); alert('Senha alterada com sucesso!'); }
              else { setChangePwError(data.error || 'Erro'); }
            }}>Salvar</Button>
          </DialogActions>
        </Dialog>

        {/* Tabs */}
        <Tabs value={portalTab} onChange={(_, v) => setPortalTab(v)} centered sx={{ mb: 2, '& .MuiTab-root': { color: '#888', fontSize: 13 }, '& .Mui-selected': { color: `${gold} !important` }, '& .MuiTabs-indicator': { backgroundColor: gold } }}>
          <Tab label="Corridas" />
          <Tab label="Gestão" />
          <Tab label="Mensalidades" />
          <Tab label="KAVIAR AR" />
        </Tabs>

        {/* Tab 0: Corridas */}
        {portalTab === 0 && (
          <Box>
            <Grid container spacing={1.5} sx={{ mb: 3 }}>
              {[
                { label: 'Motoristas vinculados', value: drivers.length },
                { label: 'Corridas geradas', value: drivers.reduce((s, d) => s + (d.rides || 0), 0) },
                { label: 'Comissão total', value: `R$ ${drivers.reduce((s, d) => s + (d.commission || 0), 0).toFixed(2)}` },
                { label: 'Pendentes aprovação', value: pendingDrivers },
              ].map(k => (
                <Grid item xs={6} key={k.label}>
                  <Box sx={{ textAlign: 'center', p: 1.5, border: '1px solid #222', borderRadius: 2 }}>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: gold }}>{k.value}</Typography>
                    <Typography variant="caption" sx={{ color: '#999' }}>{k.label}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>

            {/* Drivers table */}
            {drivers.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ color: gold, mb: 1 }}>Motoristas</Typography>
                <Table size="small">
                  <TableHead><TableRow><TableCell sx={{ color: '#888', borderColor: '#222' }}>Nome</TableCell><TableCell sx={{ color: '#888', borderColor: '#222' }}>Status</TableCell><TableCell align="right" sx={{ color: '#888', borderColor: '#222' }}>Corridas</TableCell><TableCell align="right" sx={{ color: '#888', borderColor: '#222' }}>Comissão</TableCell></TableRow></TableHead>
                  <TableBody>
                    {drivers.map((d, i) => (
                      <TableRow key={i}><TableCell sx={{ color: '#E8E3D5', borderColor: '#1a1a1a' }}>{d.name}</TableCell><TableCell sx={{ borderColor: '#1a1a1a' }}><Chip label={d.status} size="small" sx={{ bgcolor: d.status === 'approved' ? '#1b5e20' : '#333', color: '#fff', fontSize: 10 }} /></TableCell><TableCell align="right" sx={{ color: gold, fontWeight: 700, borderColor: '#1a1a1a' }}>{d.rides}</TableCell><TableCell align="right" sx={{ color: '#E8E3D5', borderColor: '#1a1a1a' }}>R$ {Number(d.commission || 0).toFixed(2)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}

            {/* QR Code + Links */}
            {user?.referral_code && (
              <Box sx={{ textAlign: 'center', p: 3, border: '1px solid #222', borderRadius: 2, mb: 3 }}>
                <Typography variant="subtitle2" sx={{ color: gold, mb: 2 }}>Convide motoristas</Typography>
                <Box sx={{ bgcolor: '#fff', display: 'inline-block', p: 1.5, borderRadius: 1 }}>
                  <QRCodeSVG value={`https://kaviar.com.br/driver/register?partner_code=${user.referral_code}`} size={140} />
                </Box>
                <Typography variant="caption" sx={{ color: '#666', display: 'block', mt: 1 }}>Código: <strong style={{ color: gold }}>{user.referral_code}</strong></Typography>
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 2, flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" sx={{ borderColor: '#333', color: gold }} onClick={() => { navigator.clipboard.writeText(`https://kaviar.com.br/driver/register?partner_code=${user.referral_code}`); alert('Link copiado!'); }}>Copiar link motorista</Button>
                  <Button size="small" variant="outlined" sx={{ borderColor: '#333', color: '#4caf50' }} onClick={() => { navigator.clipboard.writeText('https://downloads.kaviar.com.br/kaviar-passageiro-v1.13.8-ota.apk'); alert('Link copiado!'); }}>Copiar link passageiro</Button>
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* Tab 1: Gestão */}
        {portalTab === 1 && (<Box>
        {/* Month + Summary */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ background: '#111', border: '1px solid #333', color: '#E8E3D5', padding: '6px 12px', borderRadius: 4, fontSize: 14 }} />
        </Box>

        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          <Grid item xs={4}><Box sx={{ textAlign: 'center', p: 1.5, border: '1px solid #222', borderRadius: 2 }}><Typography variant="h6" sx={{ fontWeight: 800, color: '#4caf50' }}>R$ {(summary.income_total / 100).toFixed(2)}</Typography><Typography variant="caption" sx={{ color: '#999' }}>Entradas</Typography></Box></Grid>
          <Grid item xs={4}><Box sx={{ textAlign: 'center', p: 1.5, border: '1px solid #222', borderRadius: 2 }}><Typography variant="h6" sx={{ fontWeight: 800, color: '#ef5350' }}>R$ {(summary.expense_total / 100).toFixed(2)}</Typography><Typography variant="caption" sx={{ color: '#999' }}>Saídas</Typography></Box></Grid>
          <Grid item xs={4}><Box sx={{ textAlign: 'center', p: 1.5, border: '1px solid #222', borderRadius: 2 }}><Typography variant="h6" sx={{ fontWeight: 800, color: summary.balance >= 0 ? gold : '#ef5350' }}>R$ {(summary.balance / 100).toFixed(2)}</Typography><Typography variant="caption" sx={{ color: '#999' }}>Saldo</Typography></Box></Grid>
        </Grid>

        {/* Mensalidades */}
        {mensalidade.length > 0 && (
          <Box sx={{ mb: 3, p: 2, border: '1px solid #222', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ color: gold }}>Mensalidades — {month}</Typography>
              <Typography variant="caption" sx={{ color: summary.members_overdue > 0 ? '#ef5350' : '#4caf50' }}>
                {summary.members_paid} de {summary.members_active} pagaram
              </Typography>
            </Box>
            {mensalidade.map(m => (
              <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.8, borderBottom: '1px solid #1a1a1a' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: m.paid ? '#4caf50' : '#ef5350' }} />
                  <Typography variant="body2" sx={{ color: '#E8E3D5' }}>{m.name}</Typography>
                  {m.unit && <Typography variant="caption" sx={{ color: '#666' }}>({m.unit})</Typography>}
                </Box>
                {m.paid ? (
                  <Chip label="Pago" size="small" sx={{ bgcolor: '#1b5e20', color: '#fff', fontSize: 10 }} />
                ) : (
                  <Button size="small" variant="outlined" sx={{ borderColor: '#333', color: gold, fontSize: 11 }} onClick={() => handlePayMensalidade(m)}>Registrar pgto</Button>
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* Transactions */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ color: gold }}>Movimentações — {month}</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button size="small" variant="contained" color="success" onClick={() => setTxDialog('income')}>+ Entrada</Button>
            <Button size="small" variant="contained" color="error" onClick={() => setTxDialog('expense')}>+ Saída</Button>
          </Box>
        </Box>
        <Table size="small" sx={{ mb: 3 }}>
          <TableHead><TableRow><TableCell sx={{ color: '#888', borderColor: '#222' }}>Descrição</TableCell><TableCell sx={{ color: '#888', borderColor: '#222' }}>Categoria</TableCell><TableCell align="right" sx={{ color: '#888', borderColor: '#222' }}>Valor</TableCell><TableCell sx={{ borderColor: '#222' }}></TableCell></TableRow></TableHead>
          <TableBody>
            {transactions.map(t => (
              <TableRow key={t.id}>
                <TableCell sx={{ color: '#E8E3D5', borderColor: '#1a1a1a' }}>{t.description}</TableCell>
                <TableCell sx={{ color: '#999', borderColor: '#1a1a1a', fontSize: 11 }}>{t.category}</TableCell>
                <TableCell align="right" sx={{ color: t.type === 'income' ? '#4caf50' : '#ef5350', fontWeight: 700, borderColor: '#1a1a1a' }}>{t.type === 'income' ? '+' : '-'} R$ {(t.amount_cents / 100).toFixed(2)}</TableCell>
                <TableCell sx={{ borderColor: '#1a1a1a' }}><Button size="small" sx={{ color: '#555', minWidth: 0, fontSize: 11 }} onClick={() => handleDeleteTx(t.id)}>×</Button></TableCell>
              </TableRow>
            ))}
            {transactions.length === 0 && <TableRow><TableCell colSpan={4} sx={{ color: '#555', borderColor: '#1a1a1a', textAlign: 'center' }}>Nenhuma movimentação</TableCell></TableRow>}
          </TableBody>
        </Table>


        {/* Members */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ color: gold }}>Associados ({members.length})</Typography>
          <Button size="small" variant="outlined" sx={{ borderColor: '#333', color: gold }} onClick={() => setMemberDialog(true)}>+ Associado</Button>
        </Box>
        <Table size="small">
          <TableHead><TableRow><TableCell sx={{ color: '#888', borderColor: '#222' }}>Nome</TableCell><TableCell sx={{ color: '#888', borderColor: '#222' }}>Unidade</TableCell><TableCell sx={{ color: '#888', borderColor: '#222' }}>Status</TableCell></TableRow></TableHead>
          <TableBody>
            {members.map(m => (
              <TableRow key={m.id}>
                <TableCell sx={{ color: '#E8E3D5', borderColor: '#1a1a1a' }}>{m.name}</TableCell>
                <TableCell sx={{ color: '#999', borderColor: '#1a1a1a' }}>{m.unit || '—'}</TableCell>
                <TableCell sx={{ borderColor: '#1a1a1a' }}><Chip label={m.status === 'active' ? 'Ativo' : 'Inativo'} size="small" sx={{ bgcolor: m.status === 'active' ? '#1b5e20' : '#333', color: '#fff', fontSize: 10, cursor: 'pointer' }} onClick={() => handleToggleMember(m.id, m.status)} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Box sx={{ textAlign: 'center', mt: 3, mb: 1 }}>
          <Button variant="contained" onClick={() => setShowReport(true)} sx={{ bgcolor: gold, '&:hover': { bgcolor: '#9A7B24' } }}>Relatório do mês</Button>
        </Box>

        <Typography variant="caption" sx={{ color: '#333', display: 'block', textAlign: 'center', mt: 2, fontStyle: 'italic' }}>
          Controle interno. Não substitui contabilidade oficial.
        </Typography>
        </Box>)}

        {/* Tab 2: Mensalidades */}
        {portalTab === 2 && (<Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField size="small" type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <Button size="small" variant="contained" sx={{ bgcolor: gold }} onClick={() => { setPayForm({ member_id: '', amount: '', payment_method: 'pix', notes: '' }); setPayDialog(true); }}>Registrar pagamento</Button>
            <Button size="small" variant="outlined" sx={{ color: gold, borderColor: '#333' }} onClick={async () => {
              const res = await fetch(`${API_BASE_URL}/api/partner/member-payments?month=${payMonth}`, { headers });
              const data = await res.json();
              if (data.success) setMemberPayments(data.data);
            }}>Atualizar</Button>
          </Box>

          {memberPayments.length === 0 && <Typography sx={{ color: '#666', textAlign: 'center', py: 3 }}>Nenhum pagamento registrado para {payMonth}</Typography>}

          {memberPayments.map(p => (
            <Box key={p.id} sx={{ p: 1.5, mb: 1, border: '1px solid #222', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{p.member?.name} {p.member?.unit ? `(${p.member.unit})` : ''}</Typography>
                <Typography variant="caption" sx={{ color: '#888' }}>R$ {(p.amount_cents / 100).toFixed(2)} • {p.payment_method} • {formatDate(p.paid_at)}</Typography>
                <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>Código: {p.receipt_code}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {p.whatsapp_sent_at && <Chip label="Enviado" size="small" color="success" sx={{ fontSize: 10 }} />}
                <Button size="small" sx={{ color: '#4caf50', fontSize: 11 }} onClick={async () => {
                  const phone = p.member?.phone || prompt('Telefone do associado (com DDD):');
                  if (!phone) return;
                  const res = await fetch(`${API_BASE_URL}/api/partner/member-payments/${p.id}/send-whatsapp`, { method: 'POST', headers, body: JSON.stringify({ phone }) });
                  const data = await res.json();
                  if (data.success) {
                    window.open(`https://wa.me/${data.data.phone.replace('+', '')}?text=${encodeURIComponent(data.data.message)}`, '_blank');
                    // Refresh
                    const r2 = await fetch(`${API_BASE_URL}/api/partner/member-payments?month=${payMonth}`, { headers });
                    const d2 = await r2.json();
                    if (d2.success) setMemberPayments(d2.data);
                  } else { alert(data.error); }
                }}>Enviar comprovante</Button>
                <Button size="small" sx={{ color: gold, fontSize: 11 }} onClick={() => window.open(`${API_BASE_URL}/api/partner/member-payments/${p.id}/pdf?token=${token}`, '_blank')}>PDF</Button>
                <Button size="small" sx={{ color: '#888', fontSize: 11 }} onClick={() => { navigator.clipboard.writeText(`https://kaviar.com.br/comprovante/${p.receipt_code}`); alert('Link copiado!'); }}>Copiar link</Button>
              </Box>
            </Box>
          ))}
        </Box>)}

        {/* Tab 3: KAVIAR AR */}
        {portalTab === 3 && (
          <Box>
            <Typography variant="h6" sx={{ color: gold, fontWeight: 700, mb: 1 }}>
              Meu Hotel
            </Typography>
            <Typography variant="body2" sx={{ color: '#999', mb: 2 }}>
              Edite somente as informações operacionais do seu hotel. A versão publicada continua ativa até a revisão da KAVIAR.
            </Typography>

            {arPlaceError && <Alert severity="error" sx={{ mb: 2 }}>{arPlaceError}</Alert>}

            {arPlaces.length === 0 && (
              <Box sx={{ p: 2, border: '1px solid #222', borderRadius: 2 }}>
                <Typography sx={{ color: '#999' }}>
                  Nenhum hotel KAVIAR AR vinculado a este parceiro.
                </Typography>
              </Box>
            )}

            {arPlaces.map((place) => (
              <Box key={place.id} sx={{ p: 2, mb: 1.5, border: '1px solid #222', borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
                  <Box>
                    <Typography sx={{ color: '#E8E3D5', fontWeight: 700 }}>{place.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#888' }}>{place.city}/{place.state} • {place.place_id}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={place.status} size="small" sx={{ bgcolor: '#333', color: '#fff' }} />
                    {place.pending_change_request && <Chip label="Alteração pendente" size="small" sx={{ bgcolor: '#8a6d1f', color: '#fff' }} />}
                  </Box>
                </Box>

                {place.pending_change_request && (
                  <Alert severity="warning" sx={{ mb: 1.5 }}>
                    Alteração pendente. A versão publicada continua ativa até revisão da KAVIAR.
                  </Alert>
                )}

                <Typography variant="body2" sx={{ color: '#E8E3D5', mb: 0.75, whiteSpace: 'pre-wrap' }}>
                  {place.content?.summary || 'Sem resumo publicado.'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#888', display: 'block', mb: 1.5 }}>
                  Última atualização: {formatDate(place.updated_at)}
                </Typography>
                <Button variant="contained" onClick={() => openArPlaceDialog(place.id)} sx={{ bgcolor: gold, '&:hover': { bgcolor: '#9A7B24' } }}>
                  Editar meu hotel
                </Button>
              </Box>
            ))}
          </Box>
        )}

        {/* Dialog registrar pagamento */}
        <Dialog open={payDialog} onClose={() => setPayDialog(false)} PaperProps={{ sx: { bgcolor: '#1a1a1a', color: '#E8E3D5' } }}>
          <DialogTitle sx={{ color: gold }}>Registrar pagamento</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important', minWidth: 300 }}>
            <FormControl size="small"><InputLabel sx={{ color: '#888' }}>Associado</InputLabel><Select label="Associado" value={payForm.member_id} onChange={(e) => setPayForm({ ...payForm, member_id: e.target.value })} sx={{ color: '#E8E3D5', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}>
              {members.filter(m => m.status === 'active').map(m => <MenuItem key={m.id} value={m.id}>{m.name} {m.unit ? `(${m.unit})` : ''}</MenuItem>)}
            </Select></FormControl>
            <TextField size="small" label="Valor (R$)" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <FormControl size="small"><InputLabel sx={{ color: '#888' }}>Forma</InputLabel><Select label="Forma" value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })} sx={{ color: '#E8E3D5', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}>
              <MenuItem value="pix">Pix</MenuItem><MenuItem value="dinheiro">Dinheiro</MenuItem><MenuItem value="transferencia">Transferência</MenuItem><MenuItem value="cartao">Cartão</MenuItem><MenuItem value="outro">Outro</MenuItem>
            </Select></FormControl>
            <TextField size="small" label="Observação (opcional)" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPayDialog(false)} sx={{ color: '#888' }}>Cancelar</Button>
            <Button variant="contained" sx={{ bgcolor: gold }} onClick={async () => {
              if (!payForm.member_id || !payForm.amount) return;
              const res = await fetch(`${API_BASE_URL}/api/partner/member-payments`, { method: 'POST', headers, body: JSON.stringify({ member_id: payForm.member_id, reference_month: payMonth, amount_cents: Math.round(Number(payForm.amount) * 100), payment_method: payForm.payment_method, notes: payForm.notes || undefined }) });
              const data = await res.json();
              if (data.success) {
                setPayDialog(false);
                const r2 = await fetch(`${API_BASE_URL}/api/partner/member-payments?month=${payMonth}`, { headers });
                const d2 = await r2.json();
                if (d2.success) setMemberPayments(d2.data);
              } else { alert(data.error); }
            }}>Registrar</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={arPlaceDialog} onClose={() => !arPlaceSaving && setArPlaceDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#111', color: '#E8E3D5' } }}>
          <DialogTitle sx={{ color: gold }}>Meu Hotel</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
            <Alert severity="info">
              Envie apenas dados operacionais do hotel. Regras da IA, status e governança continuam sob revisão da KAVIAR.
            </Alert>
            {arPlaceError && <Alert severity="error">{arPlaceError}</Alert>}
            <TextField label="Nome" value={arPlaceForm.name} onChange={(e) => setArPlaceForm({ ...arPlaceForm, name: e.target.value })} fullWidth sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <TextField label="Endereço" value={arPlaceForm.address} onChange={(e) => setArPlaceForm({ ...arPlaceForm, address: e.target.value })} fullWidth sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <TextField label="Resumo" value={arPlaceForm.summary} onChange={(e) => setArPlaceForm({ ...arPlaceForm, summary: e.target.value })} fullWidth sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <TextField label="Descrição" value={arPlaceForm.description} onChange={(e) => setArPlaceForm({ ...arPlaceForm, description: e.target.value })} multiline minRows={3} fullWidth sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <TextField label="Saiba mais" value={arPlaceForm.learn_more} onChange={(e) => setArPlaceForm({ ...arPlaceForm, learn_more: e.target.value })} fullWidth sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <TextField label="Informações úteis" value={arPlaceForm.useful_info} onChange={(e) => setArPlaceForm({ ...arPlaceForm, useful_info: e.target.value })} multiline minRows={2} fullWidth sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setArPlaceDialog(false)} sx={{ color: '#888' }} disabled={arPlaceSaving}>Cancelar</Button>
            <Button variant="contained" onClick={handleSaveArPlaceChange} sx={{ bgcolor: gold }} disabled={arPlaceSaving}>Enviar para revisão</Button>
          </DialogActions>
        </Dialog>

        {/* Report Dialog */}
        <Dialog open={showReport} onClose={() => setShowReport(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#0a0a0a', color: '#E8E3D5' } }}>
          <DialogContent sx={{ p: 0 }}>
            <Box id="partner-month-report" sx={{ p: 3 }}>
              <Typography sx={{ color: gold, fontWeight: 800, fontSize: 18, textAlign: 'center', letterSpacing: 2 }}>KAVIAR</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, textAlign: 'center', mt: 0.5 }}>{user?.name}</Typography>
              <Typography variant="body2" sx={{ color: '#999', textAlign: 'center', mb: 3 }}>Prestação de contas — {month}</Typography>

              <Grid container spacing={1} sx={{ mb: 2 }}>
                <Grid item xs={4}><Box sx={{ textAlign: 'center', p: 1, border: '1px solid #222', borderRadius: 1 }}><Typography sx={{ fontWeight: 700, color: '#4caf50' }}>R$ {(summary.income_total / 100).toFixed(2)}</Typography><Typography variant="caption" sx={{ color: '#999', fontSize: 10 }}>Entradas</Typography></Box></Grid>
                <Grid item xs={4}><Box sx={{ textAlign: 'center', p: 1, border: '1px solid #222', borderRadius: 1 }}><Typography sx={{ fontWeight: 700, color: '#ef5350' }}>R$ {(summary.expense_total / 100).toFixed(2)}</Typography><Typography variant="caption" sx={{ color: '#999', fontSize: 10 }}>Saídas</Typography></Box></Grid>
                <Grid item xs={4}><Box sx={{ textAlign: 'center', p: 1, border: '1px solid #222', borderRadius: 1 }}><Typography sx={{ fontWeight: 700, color: gold }}>R$ {(summary.balance / 100).toFixed(2)}</Typography><Typography variant="caption" sx={{ color: '#999', fontSize: 10 }}>Saldo</Typography></Box></Grid>
              </Grid>

              <Typography variant="caption" sx={{ color: '#999', display: 'block', mb: 0.5 }}>Associados: {summary.members_active} ativos • {summary.members_paid} pagaram • {summary.members_overdue} inadimplentes</Typography>

              <Typography variant="subtitle2" sx={{ color: gold, mt: 2, mb: 0.5 }}>Entradas</Typography>
              <Table size="small">
                <TableBody>
                  {transactions.filter(t => t.type === 'income').map(t => (
                    <TableRow key={t.id}><TableCell sx={{ color: '#E8E3D5', borderColor: '#1a1a1a', py: 0.5 }}>{t.description}</TableCell><TableCell align="right" sx={{ color: '#4caf50', borderColor: '#1a1a1a', py: 0.5 }}>R$ {(t.amount_cents / 100).toFixed(2)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>

              <Typography variant="subtitle2" sx={{ color: gold, mt: 2, mb: 0.5 }}>Saídas</Typography>
              <Table size="small">
                <TableBody>
                  {transactions.filter(t => t.type === 'expense').map(t => (
                    <TableRow key={t.id}><TableCell sx={{ color: '#E8E3D5', borderColor: '#1a1a1a', py: 0.5 }}>{t.description}</TableCell><TableCell align="right" sx={{ color: '#ef5350', borderColor: '#1a1a1a', py: 0.5 }}>R$ {(t.amount_cents / 100).toFixed(2)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>

              {mensalidade.length > 0 && (<>
                <Typography variant="subtitle2" sx={{ color: gold, mt: 2, mb: 0.5 }}>Mensalidades</Typography>
                {mensalidade.map(m => (
                  <Typography key={m.id} variant="body2" sx={{ color: '#E8E3D5', py: 0.2 }}>{m.paid ? '✅' : '❌'} {m.name} {m.unit ? `(${m.unit})` : ''}</Typography>
                ))}
              </>)}

              <Typography variant="caption" sx={{ color: '#444', display: 'block', textAlign: 'center', mt: 3, fontStyle: 'italic' }}>
                Controle interno da associação. Não substitui contabilidade oficial.
              </Typography>
              <Typography variant="caption" sx={{ color: '#333', display: 'block', textAlign: 'center', mt: 0.5 }}>
                Gerado em {new Date().toLocaleString('pt-BR')} • KAVIAR
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions sx={{ bgcolor: '#0a0a0a', borderTop: '1px solid #222', px: 2 }}>
            <Button onClick={() => setShowReport(false)} sx={{ color: '#888' }}>Fechar</Button>
            {navigator.share && <Button sx={{ color: gold }} onClick={() => navigator.share({ title: `Relatório ${user?.name} - ${month}`, text: `Entradas: R$${(summary.income_total/100).toFixed(2)} | Saídas: R$${(summary.expense_total/100).toFixed(2)} | Saldo: R$${(summary.balance/100).toFixed(2)}` }).catch(()=>{})}>Compartilhar</Button>}
            <Button variant="contained" onClick={() => window.print()} sx={{ bgcolor: gold }}>Imprimir / PDF</Button>
          </DialogActions>
        </Dialog>

        {/* Transaction Dialog */}
        <Dialog open={!!txDialog} onClose={() => setTxDialog(null)} PaperProps={{ sx: { bgcolor: '#111', color: '#E8E3D5' } }}>
          <DialogTitle sx={{ color: gold }}>{txDialog === 'income' ? 'Nova Entrada' : 'Nova Saída'}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2, minWidth: 300 }}>
            <TextField label="Descrição" value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} size="small" sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <TextField label="Valor (R$)" type="number" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} size="small" helperText="Ex: 50.00" sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <FormControl size="small"><InputLabel sx={{ color: '#888' }}>Categoria</InputLabel><Select label="Categoria" value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })} sx={{ color: '#E8E3D5', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}>
              <MenuItem value="mensalidade">Mensalidade</MenuItem><MenuItem value="manutencao">Manutenção</MenuItem><MenuItem value="limpeza">Limpeza</MenuItem><MenuItem value="evento">Evento</MenuItem><MenuItem value="doacao">Doação</MenuItem><MenuItem value="outro">Outro</MenuItem>
            </Select></FormControl>
          </DialogContent>
          <DialogActions><Button onClick={() => setTxDialog(null)} sx={{ color: '#888' }}>Cancelar</Button><Button variant="contained" onClick={handleAddTx} sx={{ bgcolor: gold }}>Salvar</Button></DialogActions>
        </Dialog>

        {/* Member Dialog */}
        <Dialog open={memberDialog} onClose={() => setMemberDialog(false)} PaperProps={{ sx: { bgcolor: '#111', color: '#E8E3D5' } }}>
          <DialogTitle sx={{ color: gold }}>Novo Associado</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2, minWidth: 300 }}>
            <TextField label="Nome" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} size="small" sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
            <TextField label="Unidade/Casa" value={memberForm.unit} onChange={(e) => setMemberForm({ ...memberForm, unit: e.target.value })} size="small" sx={{ '& .MuiOutlinedInput-root': { color: '#E8E3D5' }, '& .MuiInputLabel-root': { color: '#888' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }} />
          </DialogContent>
          <DialogActions><Button onClick={() => setMemberDialog(false)} sx={{ color: '#888' }}>Cancelar</Button><Button variant="contained" onClick={handleAddMember} sx={{ bgcolor: gold }}>Salvar</Button></DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
