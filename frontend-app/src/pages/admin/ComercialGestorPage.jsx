import { useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Button, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import Markdown from 'react-markdown';

import proposta from '../../../../docs/comercial/gestor-fundador-bairro-proposta.md?raw';
import termo from '../../../../docs/comercial/termo-autorizacao-operacional-territorial-fundador.md?raw';
import faq from '../../../../docs/comercial/faq-gestor-fundador.md?raw';
import mensagensWhatsapp from '../../../../docs/comercial/mensagem-whatsapp-convite-gestor.md?raw';
import prospeccaoAssociacoes from '../../../../docs/comercial/prospeccao-associacoes-kaviar.md?raw';
import aditivoEquipe from '../../../../docs/comercial/aditivo-equipe-captadores-gestor.md?raw';
import termoMembro from '../../../../docs/comercial/termo-membro-equipe-gestor.md?raw';

const DOCUMENTS = [
  { name: 'Proposta Comercial — Gestor Territorial', version: 'v1.2', date: 'Set/2026', status: 'Informativo', note: 'Resumo comercial alinhado ao Contrato v1.2 e à Ativação Financeira.', content: proposta, superAdminOnly: false },
  { name: 'Termo de Pré-Ativação / Programa Piloto Territorial', version: 'v1.2-FUNDADOR', date: 'Set/2026', status: 'Pré-contratual', note: 'Piloto de até 90 dias. Não substitui o Contrato v1.2 e não cria participação econômica ou Ativação Financeira.', content: termo, superAdminOnly: false },
  { name: 'FAQ — Gestor Territorial', version: 'v1.2', date: 'Set/2026', status: 'Informativo', note: 'Perguntas frequentes alinhadas ao contrato definitivo por prazo indeterminado.', content: faq, superAdminOnly: false },
  { name: 'Mensagens WhatsApp — Convite Gestor', version: 'v1.2', date: 'Set/2026', status: 'Interno', note: 'Templates de prospecção com piloto pré-contratual e formalização v1.2.', content: mensagensWhatsapp, superAdminOnly: true },
  { name: 'Prospecção — Associações Parceiras', version: 'v2.1', date: 'Set/2026', status: 'Interno', note: 'Roteiro interno sem alegação de taxa obrigatória do Gestor Territorial.', content: prospeccaoAssociacoes, superAdminOnly: true },
  { name: 'Complemento — Equipe e Captadores do Gestor', version: 'v1.2', date: 'Set/2026', status: 'Complementar', note: 'Regras de equipe vinculadas ao Contrato de Parceria Operacional Territorial v1.2.', content: aditivoEquipe, superAdminOnly: false },
  { name: 'Termo — Membro da Equipe do Gestor', version: 'v1.0', date: 'Jun/2026', status: 'Aprovado', note: 'Termo de participação para captadores/consultores vinculados ao gestor.', content: termoMembro, superAdminOnly: false },
];

export default function ComercialGestorPage() {
  const [viewDoc, setViewDoc] = useState(null);
  const adminData = localStorage.getItem('kaviar_admin_data');
  const admin = adminData ? JSON.parse(adminData) : null;
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN';

  const visibleDocs = DOCUMENTS.filter(d => !d.superAdminOnly || isSuperAdmin);

  return (
    <Box>
      <Typography variant="h5" sx={{ color: '#C8A84E', fontWeight: 800, mb: 1 }}>📄 Plano Gestor Fundador de Bairro</Typography>
      <Alert severity="info" sx={{ mb: 3, bgcolor: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}>
        Materiais comerciais e operacionais de apoio. O único instrumento definitivo do Gestor Territorial é o Contrato de Parceria Operacional Territorial v1.2; o termo de piloto é pré-contratual e não cria Ativação Financeira.
      </Alert>
      <TableContainer component={Paper} sx={{ border: '1px solid #E8E5DE' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#FAFAF8' }}>
              <TableCell sx={{ fontWeight: 700 }}>Documento</TableCell>
              <TableCell>Versão</TableCell>
              <TableCell>Data</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Observação</TableCell>
              <TableCell>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleDocs.map((doc, i) => (
              <TableRow key={i}>
                <TableCell sx={{ fontWeight: 600 }}>{doc.name}</TableCell>
                <TableCell><Chip label={doc.version} size="small" sx={{ bgcolor: 'rgba(184,148,46,0.1)', color: '#B8942E' }} /></TableCell>
                <TableCell>{doc.date}</TableCell>
                <TableCell><Chip label={doc.status} size="small" sx={{ bgcolor: doc.status === 'Interno' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: doc.status === 'Interno' ? '#DC2626' : '#16A34A' }} /></TableCell>
                <TableCell sx={{ fontSize: '0.8rem', color: '#6B7280', maxWidth: 240 }}>{doc.note}</TableCell>
                <TableCell><Button size="small" onClick={() => setViewDoc(doc)} sx={{ color: '#2563EB', textTransform: 'none' }}>Visualizar</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!viewDoc} onClose={() => setViewDoc(null)} maxWidth="md" fullWidth PaperProps={{ sx: { maxHeight: '90vh' } }}>
        {viewDoc && <>
          <DialogTitle sx={{ fontWeight: 700 }}>{viewDoc.name} <Chip label={viewDoc.version} size="small" sx={{ ml: 1 }} /></DialogTitle>
          <DialogContent dividers id="comercial-doc-content" sx={{ '& h1': { fontSize: '1.4rem', mt: 2 }, '& h2': { fontSize: '1.1rem', mt: 2, mb: 1 }, '& h3': { fontSize: '1rem', mt: 1.5 }, '& p': { mb: 1 }, '& li': { mb: 0.3 }, '& table': { width: '100%', borderCollapse: 'collapse', mb: 2 }, '& th, & td': { border: '1px solid #ddd', padding: '6px 10px', fontSize: '0.85rem' }, '& th': { bgcolor: '#f5f5f5' } }}>
            <Markdown>{viewDoc.content}</Markdown>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => window.print()} sx={{ color: '#6B7280' }}>Imprimir</Button>
            <Button onClick={() => setViewDoc(null)}>Fechar</Button>
          </DialogActions>
        </>}
      </Dialog>

      <style>{`@media print { body * { visibility: hidden; } #comercial-doc-content, #comercial-doc-content * { visibility: visible; } #comercial-doc-content { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; } }`}</style>
    </Box>
  );
}
