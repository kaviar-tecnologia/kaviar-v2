import { useState, useEffect } from 'react';
import { Box, Typography, Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Alert, CircularProgress, Switch } from '@mui/material';
import { API_BASE_URL } from '../../config/api';
import { formatDate } from '../../utils/formatDate';

const RECIPIENT_LABELS = { individual: 'Pessoa Física', company: 'Pessoa Jurídica', association: 'Associação' };
const STATUS_COLORS = { calculated: '#D97706', requested: '#8B5CF6', approved: '#2563EB', paid: '#059669', received: '#047857', canceled: '#DC2626', pending: '#6B7280', verified: '#059669', rejected: '#DC2626' };

function ContractDataDiagnostic({ operatorId, token, headers }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    document_cpf: '',
    document_rg: '',
    company_name: '',
    trade_name: '',
    document_cnpj: '',
    legal_representative_name: '',
    legal_representative_cpf: '',
    address: '',
    phone: '',
    pix_key: '',
    pix_key_type: 'cpf',
  });
  const [saving, setSaving] = useState(false);
  const [genConfirm, setGenConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);

  const fetchData = () => {
    if (!operatorId) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${operatorId}/contract-data`, { headers })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [operatorId]);

  const handleSave = async () => {
    const cpf = form.document_cpf.trim();
    const representativeCpf = form.legal_representative_cpf.trim();
    const cnpj = form.document_cnpj.trim();
    const cpfRegex = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
    if (cpf && !cpfRegex.test(cpf)) { alert('CPF inválido. Use 000.000.000-00 ou 11 dígitos.'); return; }
    if (representativeCpf && !cpfRegex.test(representativeCpf)) { alert('CPF do representante inválido.'); return; }
    if (cnpj && cnpj.replace(/\D/g, '').length !== 14) { alert('CNPJ inválido. Informe 14 dígitos.'); return; }
    const phone = form.phone.trim();
    if (phone && !/^(\+55)?\d{10,11}$/.test(phone.replace(/[\s()-]/g, ''))) { alert('Telefone inválido. Use +5521999990000 ou formato brasileiro.'); return; }
    if (form.address.trim() && form.address.trim().length < 10) { alert('Endereço deve ter no mínimo 10 caracteres.'); return; }
    setSaving(true);
    try {
      const body = {};
      if (form.email.trim()) body.email = form.email.trim();
      if (form.full_name.trim()) body.full_name = form.full_name.trim();
      if (cpf) body.document_cpf = cpf;
      if (form.document_rg.trim()) body.document_rg = form.document_rg.trim();
      if (form.company_name.trim()) body.company_name = form.company_name.trim();
      if (form.trade_name.trim()) body.trade_name = form.trade_name.trim();
      if (cnpj) body.document_cnpj = cnpj;
      if (form.legal_representative_name.trim()) body.legal_representative_name = form.legal_representative_name.trim();
      if (representativeCpf) body.legal_representative_cpf = representativeCpf;
      if (form.address.trim().length >= 10) body.address = form.address.trim();
      if (phone) body.phone = phone;
      if (form.pix_key.trim()) { body.pix_key = form.pix_key.trim(); body.pix_key_type = form.pix_key_type; }
      const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${operatorId}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (d.success) { setEditOpen(false); fetchData(); } else alert(d.error || 'Erro ao salvar.');
    } catch { alert('Erro de conexão.'); }
    setSaving(false);
  };

  const handleGenerate = async () => {
    setGenerating(true); setGenResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${operatorId}/generate-contract-template`, { method: 'POST', headers });
      const d = await res.json();
      if (d.success) { setGenResult(d.data); setGenConfirm(false); fetchData(); }
      else alert(d.error || 'Erro ao gerar contrato.');
    } catch { alert('Erro de conexão.'); }
    setGenerating(false);
  };

  if (!operatorId || loading) return null;
  if (!data) return null;

  const { canGenerateContract, missingFields, availableFields, warnings } = data;
  const isIndividual = availableFields.recipientType === 'individual';
  const fields = [
    { key: 'displayName', label: isIndividual ? 'Nome' : 'Perfil' },
    { key: 'email', label: 'E-mail' },
    { key: 'telefone', label: 'Telefone' },
    ...(isIndividual
      ? [
          { key: 'fullName', label: 'Nome completo' },
          { key: 'cpf', label: 'CPF' },
          { key: 'rg', label: 'RG/CIN' },
        ]
      : [
          { key: 'companyName', label: 'Razão social' },
          { key: 'tradeName', label: 'Nome fantasia' },
          { key: 'cnpj', label: 'CNPJ' },
          { key: 'legalRepresentativeName', label: 'Representante' },
          { key: 'legalRepresentativeCpf', label: 'CPF representante' },
        ]),
    { key: 'endereco', label: 'Endereço' },
    { key: 'territorio', label: 'Território' },
    { key: 'cidadeUf', label: 'Cidade/UF' },
    { key: 'managerAssignmentId', label: 'Assignment' },
    { key: 'managerAssignmentStatus', label: 'Status assignment' },
    { key: 'territoryVersion', label: 'Versão territorial' },
  ];

  return (
    <Box sx={{ mt: 2, p: 1.5, border: '1px solid #333', borderRadius: 1, bgcolor: '#12131a' }}>
      <Typography variant="caption" sx={{ color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, display: 'block', mb: 1 }}>Dados para contrato</Typography>
      {fields.map(f => (
        <Box key={f.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
          <Typography sx={{ fontSize: 11, width: 14 }}>{availableFields[f.key] ? '✅' : '❌'}</Typography>
          <Typography sx={{ fontSize: 11, color: availableFields[f.key] ? '#E5E7EB' : '#EF4444', minWidth: 70 }}>{f.label}:</Typography>
          <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>{availableFields[f.key] || 'não cadastrado'}</Typography>
        </Box>
      ))}
      {warnings?.pixMissing && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
          <Typography sx={{ fontSize: 11, width: 14 }}>⚠️</Typography>
          <Typography sx={{ fontSize: 11, color: '#F59E0B' }}>Pix: não cadastrado (necessário para repasses)</Typography>
        </Box>
      )}
      {warnings?.contractApplicabilityNote && <Alert severity="info" sx={{ mt: 1, '& .MuiAlert-message': { fontSize: 10 } }}>{warnings.contractApplicabilityNote}</Alert>}
      {warnings?.assignmentNote && <Alert severity="warning" sx={{ mt: 1, '& .MuiAlert-message': { fontSize: 10 } }}>{warnings.assignmentNote}</Alert>}
      {warnings?.financialActivation && <Alert severity="info" sx={{ mt: 1, '& .MuiAlert-message': { fontSize: 10 } }}>{warnings.financialActivation}</Alert>}
      <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {canGenerateContract ? (
          <>
            <Chip label="Dados suficientes para gerar contrato" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10B981', fontSize: 10 }} />
            <Button size="small" variant="contained" onClick={() => { setGenResult(null); setGenConfirm(true); }} sx={{ bgcolor: '#10B981', '&:hover': { bgcolor: '#059669' }, fontSize: 10, whiteSpace: 'nowrap' }}>
              Gerar contrato automaticamente
            </Button>
          </>
        ) : (
          <>
            <Alert severity="warning" sx={{ py: 0, flex: 1, '& .MuiAlert-message': { fontSize: 10 } }}>
              Campos faltantes: {missingFields.join(', ')}
            </Alert>
            <Button size="small" variant="outlined" onClick={() => { setForm({
              email: availableFields.email || '',
              full_name: availableFields.fullName || '',
              document_cpf: availableFields.cpf || '',
              document_rg: availableFields.rg || '',
              company_name: availableFields.companyName || '',
              trade_name: availableFields.tradeName || '',
              document_cnpj: availableFields.cnpj || '',
              legal_representative_name: availableFields.legalRepresentativeName || '',
              legal_representative_cpf: availableFields.legalRepresentativeCpf || '',
              address: availableFields.endereco || '',
              phone: availableFields.telefone || '',
              pix_key: availableFields.pixKey || '',
              pix_key_type: 'cpf',
            }); setEditOpen(true); }} sx={{ borderColor: '#3B82F6', color: '#3B82F6', fontSize: 10, whiteSpace: 'nowrap' }}>
              Completar dados
            </Button>
          </>
        )}
      </Box>

      {genResult && (
        <Alert severity="success" sx={{ mt: 1, '& .MuiAlert-message': { fontSize: 11 } }}>
          ✅ Contrato gerado e disponibilizado. Status: {genResult.contract_status}. WhatsApp: {genResult.whatsappSent ? 'enviado' : 'não enviado'}.
        </Alert>
      )}

      {/* Dialog confirmação gerar contrato */}
      <Dialog open={genConfirm} onClose={() => setGenConfirm(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: '#1A1A24', color: '#E5E7EB' } }}>
        <DialogTitle sx={{ color: '#10B981', fontWeight: 700 }}>Gerar contrato automaticamente</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#9CA3AF', mb: 2 }}>O sistema irá gerar o PDF do contrato personalizado com os dados abaixo e disponibilizá-lo para assinatura.</Typography>
          <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, border: '1px solid rgba(16,185,129,0.3)', mb: 2 }}>
            <Typography variant="body2"><strong>{isIndividual ? 'Nome completo' : 'Razão social'}:</strong> {isIndividual ? availableFields?.fullName : availableFields?.companyName}</Typography>
            <Typography variant="body2"><strong>Versão:</strong> {data.contractVersion}</Typography>
            <Typography variant="body2"><strong>Assignment:</strong> {availableFields?.managerAssignmentId} ({availableFields?.managerAssignmentStatus})</Typography>
            <Typography variant="body2"><strong>Território:</strong> {availableFields?.territorio}</Typography>
            <Typography variant="body2"><strong>Cidade/UF:</strong> {availableFields?.cidadeUf}</Typography>
          </Box>
          <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: 11 } }}>O PDF será disponibilizado para o(a) gestor(a) baixar e assinar. Se o WhatsApp estiver configurado, será enviada notificação automática.</Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setGenConfirm(false)} sx={{ color: '#9CA3AF' }}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={generating} variant="contained" sx={{ bgcolor: '#10B981', '&:hover': { bgcolor: '#059669' } }}>{generating ? 'Gerando...' : 'Confirmar geração'}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog completar dados */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1A1A24', color: '#E5E7EB' } }}>
        <DialogTitle sx={{ color: '#3B82F6', fontWeight: 700 }}>Completar dados contratuais</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="E-mail" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
          {isIndividual ? (
            <>
              <TextField label="Nome completo" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
              <TextField label="CPF" value={form.document_cpf} onChange={e => setForm({ ...form, document_cpf: e.target.value })} size="small" placeholder="000.000.000-00" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
              <TextField label="RG/CIN (opcional)" value={form.document_rg} onChange={e => setForm({ ...form, document_rg: e.target.value })} size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
            </>
          ) : (
            <>
              <TextField label="Razão social / nome da associação" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
              <TextField label="Nome fantasia (opcional)" value={form.trade_name} onChange={e => setForm({ ...form, trade_name: e.target.value })} size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
              <TextField label="CNPJ" value={form.document_cnpj} onChange={e => setForm({ ...form, document_cnpj: e.target.value })} size="small" placeholder="00.000.000/0000-00" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
              <TextField label="Representante legal" value={form.legal_representative_name} onChange={e => setForm({ ...form, legal_representative_name: e.target.value })} size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
              <TextField label="CPF do representante" value={form.legal_representative_cpf} onChange={e => setForm({ ...form, legal_representative_cpf: e.target.value })} size="small" placeholder="000.000.000-00" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
            </>
          )}
          <TextField label="Endereço completo" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} size="small" placeholder="Rua, nº, bairro, cidade/UF, CEP" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} helperText="Mínimo 10 caracteres" />
          <TextField label="Telefone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} size="small" placeholder="+5521999990000" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField label="Chave Pix" value={form.pix_key} onChange={e => setForm({ ...form, pix_key: e.target.value })} size="small" sx={{ flex: 1 }} InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }} />
            <TextField label="Tipo" select value={form.pix_key_type} onChange={e => setForm({ ...form, pix_key_type: e.target.value })} size="small" sx={{ width: 120 }} InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB' } }} InputLabelProps={{ sx: { color: '#9CA3AF' } }}>
              <MenuItem value="cpf">CPF</MenuItem><MenuItem value="email">E-mail</MenuItem><MenuItem value="phone">Telefone</MenuItem><MenuItem value="random">Aleatória</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)} sx={{ color: '#9CA3AF' }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} variant="contained" sx={{ bgcolor: '#3B82F6', '&:hover': { bgcolor: '#2563EB' } }}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function ContractsQueue({ token, headers }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchQueue = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/contracts-queue`, { headers });
      const data = await res.json();
      if (data.success) setQueue(data.data || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchQueue(); }, []);

  const handleOpenPdf = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/submissions/${id}/url`, { headers });
      const data = await res.json();
      if (data.success && data.data?.url) window.open(data.data.url, '_blank');
      else alert('PDF não disponível.');
    } catch { alert('Erro ao abrir PDF.'); }
  };

  const handleApprove = async (id) => {
    if (!confirm('Confirma a aprovação deste contrato?')) return;
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/submissions/${id}/review`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) });
      const data = await res.json();
      if (data.success) { alert('Contrato aprovado.'); fetchQueue(); }
      else alert(data.error || 'Erro ao aprovar.');
    } catch { alert('Erro de conexão.'); } finally { setProcessing(false); }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 3) { alert('Motivo obrigatório (mínimo 3 caracteres).'); return; }
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/submissions/${rejectId}/review`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', rejection_reason: rejectReason }) });
      const data = await res.json();
      if (data.success) { alert('Contrato rejeitado.'); setRejectId(null); setRejectReason(''); fetchQueue(); }
      else alert(data.error || 'Erro ao rejeitar.');
    } catch { alert('Erro de conexão.'); } finally { setProcessing(false); }
  };

  if (loading) return <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: '#B8942E' }} /></Box>;

  return (
    <Box>
      {queue.length === 0 ? (
        <Alert severity="info" sx={{ bgcolor: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}>Nenhum contrato pendente de revisão.</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ border: '1px solid #E8E5DE' }}>
          <Table size="small">
            <TableHead><TableRow sx={{ bgcolor: '#FAFAF8' }}>
              <TableCell sx={{ fontWeight: 700 }}>Operador</TableCell><TableCell>Território</TableCell><TableCell>Status</TableCell><TableCell>Enviado em</TableCell><TableCell>Ações</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {queue.map(s => (
                <TableRow key={s.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{s.operator_name}</TableCell>
                  <TableCell>{s.territory}</TableCell>
                  <TableCell><Chip label={s.status} size="small" color={s.status === 'submitted' ? 'warning' : 'info'} /></TableCell>
                  <TableCell>{formatDate(s.submitted_at)}</TableCell>
                  <TableCell sx={{ display: 'flex', gap: 0.5 }}>
                    <Button size="small" onClick={() => handleOpenPdf(s.id)} sx={{ color: '#3B82F6' }}>Abrir PDF</Button>
                    <Button size="small" onClick={() => handleApprove(s.id)} disabled={processing} sx={{ color: '#059669' }}>Aprovar</Button>
                    <Button size="small" onClick={() => { setRejectId(s.id); setRejectReason(''); }} sx={{ color: '#DC2626' }}>Rejeitar</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dialog de rejeição */}
      <Dialog open={!!rejectId} onClose={() => setRejectId(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1A1A24', color: '#E5E7EB' } }}>
        <DialogTitle sx={{ color: '#DC2626', fontWeight: 700 }}>Rejeitar contrato</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#9CA3AF', mb: 2 }}>Informe o motivo da rejeição. O operador poderá enviar novamente após correção.</Typography>
          <TextField fullWidth multiline rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Motivo da rejeição (obrigatório)..." InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(220,38,38,0.3)' } } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRejectId(null)} sx={{ color: '#9CA3AF' }}>Cancelar</Button>
          <Button onClick={handleReject} disabled={processing || rejectReason.trim().length < 3} variant="contained" sx={{ bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' } }}>{processing ? 'Rejeitando...' : 'Confirmar rejeição'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function TerritorialPayoutsPage() {
  const [tab, setTab] = useState(0);
  const [operators, setOperators] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('kaviar_admin_token');

  // Operator form
  const [opOpen, setOpOpen] = useState(false);
  const [opForm, setOpForm] = useState({ admin_id: '', territory_id: '', recipient_type: 'individual', display_name: '', full_name: '', document_cpf: '', company_name: '', document_cnpj: '', legal_representative_name: '', legal_representative_cpf: '', pix_key: '', pix_key_type: 'cpf', email: '', phone: '' });
  const [opSaving, setOpSaving] = useState(false);
  const [opError, setOpError] = useState('');
  const [createAccess, setCreateAccess] = useState(false);
  const [accessForm, setAccessForm] = useState({ name: '', email: '', password: '' });
  const [accessSaving, setAccessSaving] = useState(false);

  // Payout calculate
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcForm, setCalcForm] = useState({ territory_id: '', reference_month: new Date().toISOString().slice(0, 7) });
  const [calcSaving, setCalcSaving] = useState(false);
  const [calcError, setCalcError] = useState('');

  // Pay modal
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ payment_method: 'pix', payment_ref: '', receipt_url: '', fiscal_document_url: '', fiscal_document_ref: '', fiscal_notes: '', _file: null });
  const [paySaving, setPaySaving] = useState(false);

  // Admins for operator creation (loaded per territory)
  const [territoryAdmins, setTerritoryAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });

  // Verify modal
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [verifyChecks, setVerifyChecks] = useState([false, false, false, false, false, false, false, false]);

  // Details modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Contract modal
  const [contractOpen, setContractOpen] = useState(false);
  const [contractTarget, setContractTarget] = useState(null);
  const [contractForm, setContractForm] = useState({ contract_url: '', contract_signed_at: '', contract_status: 'signed', notes: '' });
  const [contractSaving, setContractSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchAll = async () => {
    try {
      const [opRes, payRes, terRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/territorial-payouts/payouts`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/territories`, { headers }),
      ]);
      const [opData, payData, terData] = await Promise.all([opRes.json(), payRes.json(), terRes.json()]);
      if (opData.success) setOperators(opData.data);
      if (payData.success) setPayouts(payData.data);
      if (terData.success) setTerritories(terData.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Fetch admins when territory changes in operator form
  useEffect(() => {
    if (!opForm.territory_id) { setTerritoryAdmins([]); return; }
    setLoadingAdmins(true);
    fetch(`${API_BASE_URL}/api/admin/territories/${opForm.territory_id}`, { headers })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data.admin_access) {
          setTerritoryAdmins(d.data.admin_access.map(a => a.admin).filter(a => a.is_active));
        } else { setTerritoryAdmins([]); }
      })
      .catch(() => setTerritoryAdmins([]))
      .finally(() => setLoadingAdmins(false));
    setOpForm(f => ({ ...f, admin_id: '' }));
  }, [opForm.territory_id]);

  // Operator actions
  const handleCreateOperator = async () => {
    setOpSaving(true); setOpError('');
    const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators`, { method: 'POST', headers, body: JSON.stringify(opForm) });
    const d = await res.json();
    if (d.success) { setOpOpen(false); fetchAll(); } else setOpError(d.error);
    setOpSaving(false);
  };

  const handleCreateAccess = async () => {
    if (!accessForm.name || !accessForm.email || !accessForm.password || !opForm.territory_id) return;
    setAccessSaving(true); setOpError('');
    const res = await fetch(`${API_BASE_URL}/api/admin/territories/regional-admins`, { method: 'POST', headers, body: JSON.stringify({ name: accessForm.name, email: accessForm.email, password: accessForm.password, territory_id: opForm.territory_id }) });
    const d = await res.json();
    if (d.success) {
      setOpForm(f => ({ ...f, admin_id: d.data.id }));
      setTerritoryAdmins(prev => [...prev, { id: d.data.id, name: d.data.name, email: d.data.email, role: d.data.role || 'TERRITORIAL_OPERATOR', is_active: true }]);
      setCreateAccess(false);
      setFeedback({ open: true, severity: 'success', message: 'Acesso criado e selecionado para este operador.' });
    } else setOpError(d.error || 'Erro ao criar acesso');
    setAccessSaving(false);
  };

  const handleVerify = async (id) => {
    const isManager = verifyTarget?.relationship_type === 'territorial_manager';
    const now = new Date().toISOString();
    const adminId = JSON.parse(atob(token.split('.')[1])).id || '';
    const payload = isManager
      ? { document_status: 'verified' }
      : { document_status: 'verified', contract_status: 'not_required', terms_accepted_at: now, responsibility_terms_accepted_at: now, confidentiality_terms_accepted_at: now, terms_version: 'v1.0', terms_accepted_by: adminId };
    const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
    const d = await res.json();
    if (d.success) {
      setVerifyOpen(false);
      setFeedback({
        open: true,
        severity: 'success',
        message: isManager ? 'Documentos do Gestor verificados. O contrato v1.2 permanece no fluxo formal.' : 'Operador verificado com sucesso.',
      });
      fetchAll();
    } else setFeedback({ open: true, severity: 'error', message: d.error || 'Erro ao verificar operador.' });
  };

  const handleActivate = async (id) => {
    const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ is_active: true }) });
    const d = await res.json();
    if (d.success) { setFeedback({ open: true, severity: 'success', message: 'Operador ativado com sucesso.' }); fetchAll(); }
    else setFeedback({ open: true, severity: 'error', message: d.error || 'Erro ao ativar operador.' });
  };

  const handleDeactivate = async (id) => {
    if (!confirm('Desativar este operador territorial? Ele não poderá receber novos repasses, mas o histórico será preservado.')) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ is_active: false }) });
    const d = await res.json();
    if (d.success) { setFeedback({ open: true, severity: 'success', message: 'Operador desativado.' }); fetchAll(); }
    else setFeedback({ open: true, severity: 'error', message: d.error || 'Erro ao desativar operador.' });
  };

  const openVerifyModal = (op) => { setVerifyTarget(op); setVerifyChecks([false, false, false, false, false, false, false, false]); setVerifyOpen(true); };

  const handleRegularizeTerms = async (id) => {
    if (verifyTarget?.relationship_type === 'territorial_manager') {
      setFeedback({
        open: true,
        severity: 'warning',
        message: 'Gestor Territorial usa o fluxo formal do Contrato v1.2. Termos v1.0 não podem ser regularizados manualmente.',
      });
      return;
    }
    const now = new Date().toISOString();
    const adminId = JSON.parse(atob(token.split('.')[1])).id || '';
    const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ terms_accepted_at: now, responsibility_terms_accepted_at: now, confidentiality_terms_accepted_at: now, terms_version: 'v1.0', terms_accepted_by: adminId }) });
    const d = await res.json();
    if (d.success) { setVerifyOpen(false); setFeedback({ open: true, severity: 'success', message: 'Termos regularizados com sucesso.' }); fetchAll(); }
    else setFeedback({ open: true, severity: 'error', message: d.error || 'Erro ao regularizar termos.' });
  };

  const openDetailModal = async (op) => {
    setDetailLoading(true); setDetailOpen(true);
    const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${op.id}`, { headers });
    const d = await res.json();
    setDetailTarget(d.success ? d.data : op);
    setDetailLoading(false);
  };

  const handleSaveContract = async () => {
    if (contractTarget?.relationship_type === 'territorial_manager') {
      setFeedback({
        open: true,
        severity: 'warning',
        message: 'Gestor Territorial deve usar o gerador e o fluxo formal de revisão do Contrato v1.2.',
      });
      return;
    }
    setContractSaving(true);
    const payload = { contract_status: contractForm.contract_status };
    if (contractForm.contract_url) payload.contract_url = contractForm.contract_url;
    if (contractForm.contract_signed_at) payload.contract_signed_at = new Date(contractForm.contract_signed_at).toISOString();
    if (contractForm.notes) payload.notes = contractForm.notes;
    const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${contractTarget.id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
    const d = await res.json();
    if (d.success) { setContractOpen(false); setFeedback({ open: true, severity: 'success', message: 'Contrato registrado com sucesso.' }); fetchAll(); }
    else setFeedback({ open: true, severity: 'error', message: d.error || 'Erro ao registrar contrato.' });
    setContractSaving(false);
  };

  // Payout actions
  const handleCalculate = async () => {
    setCalcSaving(true); setCalcError('');
    const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/payouts/calculate`, { method: 'POST', headers, body: JSON.stringify(calcForm) });
    const d = await res.json();
    if (d.success) { setCalcOpen(false); fetchAll(); } else setCalcError(d.error);
    setCalcSaving(false);
  };

  const handleApprove = async (id) => {
    if (!confirm('Aprovar este repasse?')) return;
    await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/payouts/${id}/approve`, { method: 'PATCH', headers, body: JSON.stringify({}) });
    fetchAll();
  };

  const handlePay = async () => {
    setPaySaving(true);
    const { _file, ...formData } = payForm;
    await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/payouts/${payTarget.id}/pay`, { method: 'PATCH', headers, body: JSON.stringify(formData) });
    // Upload receipt file if selected
    if (_file) {
      const fd = new FormData(); fd.append('file', _file);
      await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/payouts/${payTarget.id}/receipt`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    }
    setPayOpen(false); setPaySaving(false); fetchAll();
  };

  const handleCancel = async (id) => {
    const reason = prompt('Motivo do cancelamento:');
    if (!reason) return;
    await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/payouts/${id}/cancel`, { method: 'PATCH', headers, body: JSON.stringify({ cancel_reason: reason }) });
    fetchAll();
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress sx={{ color: '#B8942E' }} /></Box>;

  return (
    <Box>
      <Typography variant="h5" sx={{ color: '#C8A84E', fontWeight: 800, mb: 1 }}>💰 Repasses Territoriais</Typography>
      <Alert severity="warning" sx={{ mb: 2, bgcolor: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)' }}>Repasse manual. O sistema não faz Pix automático, split, saque ou pagamento automático.</Alert>
      <Alert severity="info" sx={{ mb: 3, bgcolor: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}>Este registro não substitui orientação contábil, contrato ou obrigação fiscal. Consulte o contador antes de repasses recorrentes.</Alert>

      {feedback.open && <Alert severity={feedback.severity} onClose={() => setFeedback({ ...feedback, open: false })} sx={{ mb: 2 }}>{feedback.message}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, '& .MuiTab-root': { fontWeight: 600, color: '#9CA3AF' }, '& .Mui-selected': { color: '#C8A84E !important' }, '& .MuiTabs-indicator': { bgcolor: '#B8942E' } }}>
        <Tab label={`Gestores/Operadores (${operators.length})`} />
        <Tab label={`Repasses (${payouts.length})`} />
        <Tab label="Contratos pendentes" />
      </Tabs>

      {tab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" onClick={() => setOpOpen(true)} sx={{ bgcolor: '#B8942E', '&:hover': { bgcolor: '#9A7B24' } }}>+ Cadastrar Gestor/Operador</Button>
          </Box>
          <TableContainer component={Paper} sx={{ border: '1px solid #E8E5DE' }}>
            <Table size="small">
              <TableHead><TableRow sx={{ bgcolor: '#FAFAF8' }}><TableCell sx={{ fontWeight: 700 }}>Nome</TableCell><TableCell>Tipo</TableCell><TableCell>Território</TableCell><TableCell>Pix</TableCell><TableCell>Doc</TableCell><TableCell>Contrato</TableCell><TableCell>Ativo</TableCell><TableCell>Ações</TableCell></TableRow></TableHead>
              <TableBody>
                {operators.map(o => (
                  <TableRow key={o.id}>
                    <TableCell sx={{ fontWeight: 600 }}>{o.display_name}</TableCell>
                    <TableCell><Chip label={RECIPIENT_LABELS[o.recipient_type]} size="small" /></TableCell>
                    <TableCell>{o.territory?.name}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{o.pix_key || '—'}</TableCell>
                    <TableCell><Chip label={o.document_status} size="small" sx={{ color: STATUS_COLORS[o.document_status], bgcolor: `${STATUS_COLORS[o.document_status]}15` }} /></TableCell>
                    <TableCell><Chip label={o.contract_status} size="small" /></TableCell>
                    <TableCell><Chip label={o.is_active ? 'Ativo' : 'Inativo'} size="small" color={o.is_active ? 'success' : 'default'} /></TableCell>
                    <TableCell sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      <Button size="small" onClick={() => openDetailModal(o)} sx={{ color: '#6B7280' }}>Detalhes</Button>
                      {o.document_status === 'pending' && <Button size="small" onClick={() => openVerifyModal(o)} sx={{ color: '#059669' }}>Verificar</Button>}
                      {o.document_status === 'verified' && !o.is_active && <Button size="small" onClick={() => handleActivate(o.id)} sx={{ color: '#2563EB' }}>Ativar</Button>}
                      {o.is_active && !o.responsibility_terms_accepted_at && <Button size="small" onClick={() => openVerifyModal(o)} sx={{ color: '#D97706' }}>Regularizar Termos</Button>}
                      {o.is_active && <Button size="small" onClick={() => handleDeactivate(o.id)} sx={{ color: '#DC2626' }}>Desativar</Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {!operators.length && <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', color: '#6B7280', py: 4 }}>Nenhum gestor/operador cadastrado</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" onClick={() => setCalcOpen(true)} sx={{ bgcolor: '#B8942E', '&:hover': { bgcolor: '#9A7B24' } }}>Calcular Repasse</Button>
          </Box>
          <TableContainer component={Paper} sx={{ border: '1px solid #E8E5DE' }}>
            <Table size="small">
              <TableHead><TableRow sx={{ bgcolor: '#FAFAF8' }}><TableCell sx={{ fontWeight: 700 }}>Território</TableCell><TableCell>Mês</TableCell><TableCell>Gestor/Operador</TableCell><TableCell>Calculado</TableCell><TableCell>Aprovado</TableCell><TableCell>Status</TableCell><TableCell>Fiscal</TableCell><TableCell>Ações</TableCell></TableRow></TableHead>
              <TableBody>
                {payouts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.territory?.name}</TableCell>
                    <TableCell>{p.reference_month}</TableCell>
                    <TableCell>{p.operator?.display_name}</TableCell>
                    <TableCell>R$ {Number(p.calculated_amount).toFixed(2)}</TableCell>
                    <TableCell>{p.approved_amount ? `R$ ${Number(p.approved_amount).toFixed(2)}` : '—'}</TableCell>
                    <TableCell><Chip label={p.status} size="small" sx={{ color: STATUS_COLORS[p.status], bgcolor: `${STATUS_COLORS[p.status]}15`, fontWeight: 600 }} /></TableCell>
                    <TableCell>{p.fiscal_document_required ? <Chip label="Exige doc" size="small" color="warning" /> : '—'}</TableCell>
                    <TableCell sx={{ display: 'flex', gap: 0.5 }}>
                      {(p.status === 'calculated' || p.status === 'requested') && <Button size="small" onClick={() => handleApprove(p.id)} sx={{ color: '#2563EB' }}>Aprovar</Button>}
                      {p.status === 'approved' && <Button size="small" onClick={() => { setPayTarget(p); setPayOpen(true); }} sx={{ color: '#059669' }}>Pagar</Button>}
                      {(p.status === 'calculated' || p.status === 'approved') && <Button size="small" color="error" onClick={() => handleCancel(p.id)}>Cancelar</Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {!payouts.length && <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', color: '#6B7280', py: 4 }}>Nenhum repasse calculado</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Aba Contratos pendentes */}
      {tab === 2 && (
        <Box>
          <ContractsQueue token={token} headers={headers} />
        </Box>
      )}

      {/* Modal Criar Operador */}
      <Dialog open={opOpen} onClose={() => setOpOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1A1A24', color: '#E5E7EB', maxHeight: '90vh' } }}>
        <DialogTitle sx={{ color: '#C8A84E', fontWeight: 700 }}>Cadastrar Gestor/Operador Territorial</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1, pb: 4, overflowY: 'auto' }}>
          {opError && <Alert severity="error">{opError}</Alert>}
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Tipo</Typography>
            <TextField select value={opForm.recipient_type} onChange={e => setOpForm({ ...opForm, recipient_type: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }}>
              <MenuItem value="individual">Pessoa Física</MenuItem><MenuItem value="company">Pessoa Jurídica</MenuItem><MenuItem value="association">Associação</MenuItem>
            </TextField></Box>
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Território</Typography>
            <TextField select value={opForm.territory_id} onChange={e => setOpForm({ ...opForm, territory_id: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }}>
              {territories.map(t => <MenuItem key={t.id} value={t.id}>{t.name} ({t.level})</MenuItem>)}
            </TextField></Box>
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Nome de exibição</Typography>
            <TextField value={opForm.display_name} onChange={e => setOpForm({ ...opForm, display_name: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
          {opForm.recipient_type === 'individual' && <>
            <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Nome completo</Typography><TextField value={opForm.full_name} onChange={e => setOpForm({ ...opForm, full_name: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
            <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>CPF</Typography><TextField value={opForm.document_cpf} onChange={e => setOpForm({ ...opForm, document_cpf: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
          </>}
          {(opForm.recipient_type === 'company' || opForm.recipient_type === 'association') && <>
            <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>{opForm.recipient_type === 'company' ? 'Razão Social' : 'Nome da Associação'}</Typography><TextField value={opForm.company_name} onChange={e => setOpForm({ ...opForm, company_name: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
            <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>CNPJ</Typography><TextField value={opForm.document_cnpj} onChange={e => setOpForm({ ...opForm, document_cnpj: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
            <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Responsável legal</Typography><TextField value={opForm.legal_representative_name} onChange={e => setOpForm({ ...opForm, legal_representative_name: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
            <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>CPF do responsável</Typography><TextField value={opForm.legal_representative_cpf} onChange={e => setOpForm({ ...opForm, legal_representative_cpf: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
          </>}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ flex: 1 }}><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Pix</Typography><TextField value={opForm.pix_key} onChange={e => setOpForm({ ...opForm, pix_key: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
            <Box sx={{ width: 140 }}><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Tipo Pix</Typography><TextField select value={opForm.pix_key_type} onChange={e => setOpForm({ ...opForm, pix_key_type: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }}>
              <MenuItem value="cpf">CPF</MenuItem><MenuItem value="cnpj">CNPJ</MenuItem><MenuItem value="email">Email</MenuItem><MenuItem value="phone">Telefone</MenuItem><MenuItem value="random">Aleatória</MenuItem>
            </TextField></Box>
          </Box>
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Usuário de acesso autorizado (gestor operacional)</Typography>
            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mb: 1, fontSize: '0.7rem' }}>Este usuário acessa o painel em modo leitura. O gestor/operador territorial é o perfil responsável por recebimentos, contrato e repasses do KAVIAR.</Typography>
            {opForm.territory_id && !loadingAdmins && territoryAdmins.length === 0 && !createAccess && (
              <Alert severity="warning" sx={{ mb: 1 }}>Nenhum acesso vinculado a este território. Crie um abaixo.</Alert>
            )}
            {!createAccess && (
              <>
                {loadingAdmins ? <CircularProgress size={20} sx={{ color: '#B8942E' }} /> : (
                  <TextField select value={opForm.admin_id} onChange={e => setOpForm({ ...opForm, admin_id: e.target.value })} fullWidth size="small" disabled={!opForm.territory_id || territoryAdmins.length === 0} InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }}>
                    {territoryAdmins.map(a => <MenuItem key={a.id} value={a.id}>{a.name} — {a.email} ({a.role})</MenuItem>)}
                  </TextField>
                )}
                <Button size="small" onClick={() => { setCreateAccess(true); setAccessForm({ name: '', email: '', password: '' }); }} disabled={!opForm.territory_id} sx={{ mt: 1, color: '#C8A84E', textTransform: 'none' }}>+ Criar acesso do operador</Button>
              </>
            )}
            {createAccess && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 1.5, border: '1px solid rgba(184,148,46,0.3)', borderRadius: 1, mt: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#C8A84E', fontWeight: 600 }}>Criar acesso do operador</Typography>
                <TextField size="small" placeholder="Nome" value={accessForm.name} onChange={e => setAccessForm({ ...accessForm, name: e.target.value })} InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} />
                <TextField size="small" placeholder="E-mail" value={accessForm.email} onChange={e => setAccessForm({ ...accessForm, email: e.target.value })} InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} />
                <TextField size="small" placeholder="Senha provisória (min 6)" type="password" value={accessForm.password} onChange={e => setAccessForm({ ...accessForm, password: e.target.value })} InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" variant="contained" disabled={accessSaving || !accessForm.name || !accessForm.email || accessForm.password.length < 6} onClick={handleCreateAccess} sx={{ bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}>{accessSaving ? 'Criando...' : 'Criar'}</Button>
                  <Button size="small" onClick={() => setCreateAccess(false)} sx={{ color: '#9CA3AF' }}>Cancelar</Button>
                </Box>
              </Box>
            )}</Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpOpen(false)} sx={{ color: '#9CA3AF' }}>Cancelar</Button>
          <Button onClick={handleCreateOperator} disabled={opSaving || !opForm.display_name || !opForm.territory_id || !opForm.admin_id} variant="contained" sx={{ bgcolor: '#B8942E', '&:hover': { bgcolor: '#9A7B24' } }}>{opSaving ? 'Salvando...' : 'Cadastrar'}</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Calcular Repasse */}
      <Dialog open={calcOpen} onClose={() => setCalcOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: '#1A1A24', color: '#E5E7EB' } }}>
        <DialogTitle sx={{ color: '#C8A84E', fontWeight: 700 }}>Calcular Repasse</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {calcError && <Alert severity="error">{calcError}</Alert>}
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Território</Typography>
            <TextField select value={calcForm.territory_id} onChange={e => setCalcForm({ ...calcForm, territory_id: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }}>
              {territories.map(t => <MenuItem key={t.id} value={t.id}>{t.name} ({t.level})</MenuItem>)}
            </TextField></Box>
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Mês (YYYY-MM)</Typography>
            <TextField value={calcForm.reference_month} onChange={e => setCalcForm({ ...calcForm, reference_month: e.target.value })} fullWidth size="small" placeholder="2026-05" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCalcOpen(false)} sx={{ color: '#9CA3AF' }}>Cancelar</Button>
          <Button onClick={handleCalculate} disabled={calcSaving || !calcForm.territory_id || !calcForm.reference_month} variant="contained" sx={{ bgcolor: '#B8942E' }}>{calcSaving ? 'Calculando...' : 'Calcular'}</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Registrar Pagamento */}
      <Dialog open={payOpen} onClose={() => setPayOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1A1A24', color: '#E5E7EB' } }}>
        <DialogTitle sx={{ color: '#C8A84E', fontWeight: 700 }}>Registrar Pagamento Manual</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {payTarget && <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, border: '1px solid rgba(184,148,46,0.2)' }}>
            <Typography variant="body2" sx={{ color: '#C8A84E' }}>Valor aprovado: R$ {Number(payTarget.approved_amount || payTarget.calculated_amount).toFixed(2)}</Typography>
            <Typography variant="body2" sx={{ color: '#9CA3AF' }}>Gestor/Operador: {payTarget.operator?.display_name}</Typography>
            <Typography variant="body2" sx={{ color: '#9CA3AF', fontFamily: 'monospace' }}>Pix: {payTarget.operator?.pix_key || 'Não informado'}</Typography>
            {payTarget.fiscal_document_required && <Alert severity="warning" sx={{ mt: 1 }}>⚠️ Este repasse exige documento fiscal (NFS-e recomendada para PJ)</Alert>}
          </Box>}
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Método</Typography>
            <TextField select value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }}>
              <MenuItem value="pix">Pix</MenuItem><MenuItem value="transfer">Transferência</MenuItem><MenuItem value="other">Outro</MenuItem>
            </TextField></Box>
          <Box><Typography variant="caption" sx={{ color: '#F87171', display: 'block', mb: 0.5 }}>Referência do pagamento *</Typography>
            <TextField value={payForm.payment_ref} onChange={e => setPayForm({ ...payForm, payment_ref: e.target.value })} fullWidth size="small" placeholder="ID da transação Pix / comprovante" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>URL comprovante (opcional)</Typography>
            <TextField value={payForm.receipt_url} onChange={e => setPayForm({ ...payForm, receipt_url: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>📎 Anexar comprovante (PDF/imagem, até 5MB)</Typography>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" id="receipt-file" style={{ display: 'none' }} onChange={e => setPayForm({ ...payForm, _file: e.target.files?.[0] || null })} />
            <Button size="small" variant="outlined" onClick={() => document.getElementById('receipt-file')?.click()} sx={{ color: '#C8A84E', borderColor: 'rgba(184,148,46,0.3)', textTransform: 'none' }}>{payForm._file ? `📎 ${payForm._file.name}` : 'Selecionar arquivo'}</Button>
            {payForm._file && <Button size="small" onClick={() => setPayForm({ ...payForm, _file: null })} sx={{ color: '#EF4444', ml: 1, textTransform: 'none' }}>Remover</Button>}
          </Box>
          {payTarget?.fiscal_document_required && <>
            <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Documento fiscal (URL/ref)</Typography>
              <TextField value={payForm.fiscal_document_url} onChange={e => setPayForm({ ...payForm, fiscal_document_url: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
            <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Nº documento fiscal</Typography>
              <TextField value={payForm.fiscal_document_ref} onChange={e => setPayForm({ ...payForm, fiscal_document_ref: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
          </>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPayOpen(false)} sx={{ color: '#9CA3AF' }}>Cancelar</Button>
          <Button onClick={handlePay} disabled={paySaving || !payForm.payment_ref} variant="contained" sx={{ bgcolor: '#059669' }}>{paySaving ? 'Registrando...' : 'Confirmar Pagamento'}</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Verificação com Checklist */}
      <Dialog open={verifyOpen} onClose={() => setVerifyOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1A1A24', color: '#E5E7EB' } }}>
        <DialogTitle sx={{ color: '#C8A84E', fontWeight: 700 }}>Verificação do Gestor/Operador Territorial</DialogTitle>
        <DialogContent sx={{ mt: 1 }}>
          {verifyTarget && <Box sx={{ p: 2, mb: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, border: '1px solid rgba(184,148,46,0.2)' }}>
            <Typography variant="body2" sx={{ color: '#C8A84E' }}>{verifyTarget.display_name}</Typography>
            <Typography variant="body2" sx={{ color: '#9CA3AF' }}>{RECIPIENT_LABELS[verifyTarget.recipient_type]} — {verifyTarget.territory?.name}</Typography>
          </Box>}
          <Typography variant="body2" sx={{ color: '#9CA3AF', mb: 2 }}>Confirme cada item antes de verificar:</Typography>
          {[
            'Conferi a identidade do operador.',
            'Conferi CPF/CNPJ e responsável legal, quando aplicável.',
            'Conferi que o Pix pertence ao operador cadastrado.',
            'Conferi que este operador está vinculado ao território correto.',
            'O operador aceitou o Termo de Responsabilidade do Operador Territorial.',
            'O operador aceitou as regras de confidencialidade e uso correto de dados do KAVIAR.',
            'O operador entende que repasse depende de aprovação manual da matriz/SUPER_ADMIN.',
            'Para PJ/Associação, contrato/termo está assinado ou registrado.',
          ].map((label, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1, cursor: 'pointer' }} onClick={() => { const c = [...verifyChecks]; c[i] = !c[i]; setVerifyChecks(c); }}>
              <input type="checkbox" checked={verifyChecks[i]} readOnly style={{ marginTop: 3, accentColor: '#B8942E' }} />
              <Typography variant="body2" sx={{ color: verifyChecks[i] ? '#E5E7EB' : '#6B7280' }}>{label}</Typography>
            </Box>
          ))}
          <Alert severity="info" sx={{ mt: 2, bgcolor: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}>Este é um registro interno de aceite/conferência feito pelo SUPER_ADMIN. Não substitui assinatura digital formal, contrato jurídico ou orientação contábil.</Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setVerifyOpen(false)} sx={{ color: '#9CA3AF' }}>Cancelar</Button>
          <Button onClick={() => verifyTarget.document_status === 'verified' ? handleRegularizeTerms(verifyTarget.id) : handleVerify(verifyTarget.id)} disabled={!verifyChecks.every(Boolean)} variant="contained" sx={{ bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}>{verifyTarget?.document_status === 'verified' ? 'Confirmar Regularização' : 'Confirmar Verificação'}</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Detalhes do Operador */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1A1A24', color: '#E5E7EB' } }}>
        <DialogTitle sx={{ color: '#C8A84E', fontWeight: 700 }}>Detalhes do Gestor/Operador Territorial</DialogTitle>
        <DialogContent>
          {detailLoading ? <CircularProgress size={24} sx={{ color: '#B8942E' }} /> : detailTarget && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Nome</Typography><Typography>{detailTarget.display_name}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Tipo</Typography><Typography>{RECIPIENT_LABELS[detailTarget.recipient_type]}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Território</Typography><Typography>{detailTarget.territory?.name}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Acesso autorizado</Typography><Typography>{detailTarget.admin?.name} — {detailTarget.admin?.email}</Typography></Box>
              <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mt: 0.5, fontSize: '0.7rem' }}>O operador financeiro/contratual é o responsável por recebimentos, contrato e repasses. O acesso autorizado apenas permite entrada no painel conforme permissão concedida.</Typography>
              {detailTarget.full_name && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Nome completo</Typography><Typography>{detailTarget.full_name}</Typography></Box>}
              {detailTarget.document_cpf && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>CPF</Typography><Typography sx={{ fontFamily: 'monospace' }}>{detailTarget.document_cpf}</Typography></Box>}
              {detailTarget.company_name && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>{detailTarget.recipient_type === 'company' ? 'Razão Social' : 'Associação'}</Typography><Typography>{detailTarget.company_name}</Typography></Box>}
              {detailTarget.document_cnpj && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>CNPJ</Typography><Typography sx={{ fontFamily: 'monospace' }}>{detailTarget.document_cnpj}</Typography></Box>}
              {detailTarget.legal_representative_name && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Responsável legal</Typography><Typography>{detailTarget.legal_representative_name}</Typography></Box>}
              {detailTarget.legal_representative_cpf && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>CPF responsável</Typography><Typography sx={{ fontFamily: 'monospace' }}>{detailTarget.legal_representative_cpf}</Typography></Box>}
              <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Pix</Typography><Typography sx={{ fontFamily: 'monospace' }}>{detailTarget.pix_key || '—'} ({detailTarget.pix_key_type || '—'})</Typography></Box>
              {detailTarget.bank_name && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Banco</Typography><Typography>{detailTarget.bank_name}</Typography></Box>}
              <Box sx={{ display: 'flex', gap: 3 }}>
                <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Doc</Typography><Chip label={detailTarget.document_status} size="small" sx={{ color: STATUS_COLORS[detailTarget.document_status], bgcolor: `${STATUS_COLORS[detailTarget.document_status]}15` }} /></Box>
                <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Contrato</Typography><Chip label={detailTarget.contract_status} size="small" /></Box>
                <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Status</Typography><Chip label={detailTarget.is_active ? 'Ativo' : 'Inativo'} size="small" color={detailTarget.is_active ? 'success' : 'default'} /></Box>
              </Box>
              {detailTarget.verified_at && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Verificado em</Typography><Typography variant="body2">{formatDate(detailTarget.verified_at, { showTime: true })}</Typography></Box>}
              <Typography variant="subtitle2" sx={{ color: '#C8A84E', mt: 2, mb: 1 }}>Termos e Contrato</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1, border: '1px solid rgba(184,148,46,0.15)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: '#9CA3AF' }}>Termo de Responsabilidade</Typography><Typography variant="body2" sx={{ color: detailTarget.responsibility_terms_accepted_at ? '#059669' : '#DC2626' }}>{detailTarget.responsibility_terms_accepted_at ? formatDate(detailTarget.responsibility_terms_accepted_at, { showTime: true }) : 'Pendente'}</Typography></Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: '#9CA3AF' }}>Confidencialidade/LGPD</Typography><Typography variant="body2" sx={{ color: detailTarget.confidentiality_terms_accepted_at ? '#059669' : '#DC2626' }}>{detailTarget.confidentiality_terms_accepted_at ? formatDate(detailTarget.confidentiality_terms_accepted_at, { showTime: true }) : 'Pendente'}</Typography></Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: '#9CA3AF' }}>Versão dos termos</Typography><Typography variant="body2">{detailTarget.terms_version || '—'}</Typography></Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: '#9CA3AF' }}>Contrato</Typography><Typography variant="body2" sx={{ color: detailTarget.contract_status === 'signed' ? '#059669' : '#6B7280' }}>{detailTarget.contract_status}{detailTarget.contract_signed_at ? ` (${formatDate(detailTarget.contract_signed_at)})` : ''}</Typography></Box>
                {detailTarget.contract_url && <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Typography variant="body2" sx={{ color: '#9CA3AF' }}>URL contrato</Typography><Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><Button size="small" onClick={() => window.open(detailTarget.contract_url, '_blank')} sx={{ color: '#2563EB', textTransform: 'none', fontSize: '0.8rem' }}>Abrir</Button><Button size="small" onClick={() => { navigator.clipboard.writeText(detailTarget.contract_url); setFeedback({ open: true, severity: 'success', message: 'Link copiado.' }); }} sx={{ color: '#6B7280', textTransform: 'none', fontSize: '0.8rem' }}>Copiar</Button></Box></Box>}
              </Box>
              <Alert severity="info" sx={{ mt: 2, bgcolor: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}>Este aceite interno não substitui contrato jurídico formal nem orientação contábil.</Alert>
              {detailTarget.notes && <Box><Typography variant="caption" sx={{ color: '#6B7280' }}>Notas</Typography><Typography variant="body2">{detailTarget.notes}</Typography></Box>}
            </Box>
          )}

          {/* Dados para contrato */}
          <ContractDataDiagnostic operatorId={detailTarget?.id} token={token} headers={headers} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setContractTarget(detailTarget); setContractForm({ contract_url: detailTarget?.contract_url || '', contract_signed_at: detailTarget?.contract_signed_at ? detailTarget.contract_signed_at.slice(0, 10) : '', contract_status: detailTarget?.contract_status || 'pending', notes: '' }); setContractOpen(true); }} sx={{ color: '#C8A84E' }}>Registrar Contrato</Button>
          <Button onClick={() => setDetailOpen(false)} sx={{ color: '#9CA3AF' }}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Registrar Contrato */}
      <Dialog open={contractOpen} onClose={() => setContractOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#1A1A24', color: '#E5E7EB' } }}>
        <DialogTitle sx={{ color: '#C8A84E', fontWeight: 700 }}>Gestão de Contrato</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {contractTarget?.relationship_type === 'territorial_manager' ? (
            <Alert severity="info" sx={{ bgcolor: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}>
              Gestor Territorial usa exclusivamente o Contrato de Parceria Operacional Territorial v1.2. Gere a minuta canônica no diagnóstico do perfil, aguarde o envio assinado e aprove/rejeite pela fila de contratos. Upload direto, dispensa e marcação manual como assinado não são permitidos.
            </Alert>
          ) : (
            <>
          {/* Seção 1: Disponibilizar modelo */}
          <Box sx={{ p: 1.5, border: '1px solid rgba(59,130,246,0.3)', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ color: '#3B82F6', fontWeight: 700, display: 'block', mb: 1 }}>Disponibilizar modelo de contrato</Typography>
            <input type="file" accept="application/pdf" id="template-upload-input" style={{ display: 'none' }} onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.type !== 'application/pdf') { setFeedback({ open: true, severity: 'error', message: 'Apenas PDF é permitido.' }); return; }
              if (file.size > 10 * 1024 * 1024) { setFeedback({ open: true, severity: 'error', message: 'Arquivo excede 10 MB.' }); return; }
              setContractSaving(true);
              try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${contractTarget.id}/contract-template`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
                const d = await res.json();
                if (d.success) { setFeedback({ open: true, severity: 'success', message: 'Modelo disponibilizado com sucesso.' }); fetchAll(); }
                else setFeedback({ open: true, severity: 'error', message: d.error || 'Erro no upload do modelo.' });
              } catch { setFeedback({ open: true, severity: 'error', message: 'Erro de conexão.' }); }
              setContractSaving(false);
              e.target.value = '';
            }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button variant="outlined" size="small" disabled={contractSaving} onClick={() => document.getElementById('template-upload-input')?.click()} sx={{ borderColor: '#3B82F6', color: '#3B82F6' }}>
                {contractSaving ? 'Enviando...' : 'Enviar modelo PDF'}
              </Button>
              {contractTarget?.contract_template_url && <Chip label="Modelo disponível" size="small" sx={{ bgcolor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }} />}
            </Box>
            {contractTarget?.contract_template_url && (
              <Button size="small" sx={{ color: '#3B82F6', textTransform: 'none', mt: 0.5 }} onClick={async () => {
                try { const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${contractTarget.id}/contract-template-url`, { headers }); const d = await res.json(); if (d.success && d.data?.url) window.open(d.data.url, '_blank'); else alert('Modelo não disponível.'); } catch { alert('Erro ao abrir modelo.'); }
              }}>📄 Abrir modelo atual</Button>
            )}
            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mt: 0.5, fontSize: 10 }}>O modelo será disponibilizado para o(a) gestor(a) baixar e assinar.</Typography>
          </Box>

          {/* Seção 2: Contrato recebido por canal externo */}
          <Box sx={{ p: 1.5, border: '1px solid rgba(184,148,46,0.3)', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ color: '#C8A84E', fontWeight: 700, display: 'block', mb: 1 }}>Registrar contrato recebido por canal externo</Typography>
            <input type="file" accept="application/pdf" id="contract-upload-input" style={{ display: 'none' }} onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.type !== 'application/pdf') { setFeedback({ open: true, severity: 'error', message: 'Apenas PDF é permitido.' }); return; }
              if (file.size > 10 * 1024 * 1024) { setFeedback({ open: true, severity: 'error', message: 'Arquivo excede 10 MB.' }); return; }
              setContractSaving(true);
              try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${contractTarget.id}/contract`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
                const d = await res.json();
                if (d.success) { setFeedback({ open: true, severity: 'success', message: 'Contrato anexado com sucesso.' }); fetchAll(); }
                else setFeedback({ open: true, severity: 'error', message: d.error || 'Erro no upload.' });
              } catch { setFeedback({ open: true, severity: 'error', message: 'Erro de conexão.' }); }
              setContractSaving(false);
              e.target.value = '';
            }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button variant="outlined" size="small" disabled={contractSaving} onClick={() => document.getElementById('contract-upload-input')?.click()} sx={{ borderColor: '#C8A84E', color: '#C8A84E' }}>
                {contractSaving ? 'Enviando...' : 'Anexar PDF externo'}
              </Button>
              {contractTarget?.contract_url && <Chip label="Contrato anexado" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#059669' }} />}
            </Box>
            {contractTarget?.contract_url && (
              <Button size="small" sx={{ color: '#C8A84E', textTransform: 'none', mt: 0.5 }} onClick={async () => {
                try { const res = await fetch(`${API_BASE_URL}/api/admin/territorial-payouts/operators/${contractTarget.id}/contract-url`, { headers }); const d = await res.json(); if (d.success && d.data?.url) window.open(d.data.url, '_blank'); else alert('Contrato não disponível.'); } catch { alert('Erro ao abrir contrato.'); }
              }}>📄 Abrir contrato recebido (gestor(a))</Button>
            )}
            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mt: 0.5, fontSize: 10 }}>Para contratos recebidos via WhatsApp, e-mail ou outro canal.</Typography>
          </Box>
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Status do contrato</Typography>
            <TextField select value={contractForm.contract_status} onChange={e => setContractForm({ ...contractForm, contract_status: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }}>
              <MenuItem value="signed">Assinado</MenuItem><MenuItem value="pending">Pendente</MenuItem><MenuItem value="not_required">Não necessário</MenuItem>
            </TextField></Box>
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Data de assinatura</Typography>
            <TextField type="date" value={contractForm.contract_signed_at} onChange={e => setContractForm({ ...contractForm, contract_signed_at: e.target.value })} fullWidth size="small" InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
          <Box><Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 0.5 }}>Observações (opcional)</Typography>
            <TextField value={contractForm.notes} onChange={e => setContractForm({ ...contractForm, notes: e.target.value })} fullWidth size="small" multiline rows={2} InputProps={{ sx: { bgcolor: 'rgba(255,255,255,0.05)', color: '#E5E7EB', '& fieldset': { borderColor: 'rgba(184,148,46,0.3)' } } }} /></Box>
          <Alert severity="info" sx={{ bgcolor: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}>Registro interno. Não substitui contrato jurídico formal nem orientação contábil.</Alert>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setContractOpen(false)} sx={{ color: '#9CA3AF' }}>Cancelar</Button>
          <Button onClick={handleSaveContract} disabled={contractSaving || contractTarget?.relationship_type === 'territorial_manager'} variant="contained" sx={{ bgcolor: '#B8942E', '&:hover': { bgcolor: '#9A7B24' } }}>{contractTarget?.relationship_type === 'territorial_manager' ? 'Use o fluxo v1.2' : contractSaving ? 'Salvando...' : 'Salvar Contrato'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
