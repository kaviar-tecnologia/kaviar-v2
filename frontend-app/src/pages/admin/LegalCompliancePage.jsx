import { useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Button, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import Markdown from 'react-markdown';

import termosPassageiro from '../../../../docs/termos-uso-passageiro-kaviar-v1.md?raw';
import termosMotorista from '../../../../docs/termos-uso-motorista-kaviar-v1.md?raw';
import politicaPrivacidade from '../../../../docs/politica-privacidade-kaviar-v1.md?raw';
import regrasCancelamento from '../../../../docs/regras-cancelamento-kaviar-v1.md?raw';
import regrasPagamento from '../../../../docs/regras-pagamento-creditos-kaviar-v1.md?raw';
import avisoIntermediacao from '../../../../docs/aviso-plataforma-intermediacao-kaviar.md?raw';
import termoOperador from '../../../../docs/termo-operador-territorial-kaviar-v1.md?raw';
import conformidade from '../../../../docs/conformidade-juridica-operacional-kaviar.md?raw';
import apresentacao from '../../../../docs/apresentacao-institucional-kaviar.md?raw';
import checklistCidade from '../../../../docs/frentes/checklist-abertura-cidade.md?raw';
import politicaRelacionamento from '../../../../docs/politica-relacionamento-institucional-kaviar.md?raw';
import smtrRio from '../../../../docs/regulatorio/rio-de-janeiro-smtr-credenciamento.md?raw';
import contratoGestor from '../../../../docs/contrato-gestor-territorial-v1.md?raw';
import contratoComercio from '../../../../docs/contrato-comercio-parceiro-local-v1.md?raw';
import contratoHotel from '../../../../docs/contrato-hotel-pousada-parceira-kaviar-v1.md?raw';
import contratoPet from '../../../../docs/contrato-parceiro-kaviar-pet-v1.md?raw';

const DOCUMENTS = [
  { name: 'Termos de Uso — Passageiro', version: 'v1.0', date: 'Maio/2026', status: 'Minuta interna', note: 'Cobre responsabilidades, limitações, operação territorial e privacidade.', content: termosPassageiro },
  { name: 'Termos de Uso — Motorista', version: 'v1.0', date: 'Maio/2026', status: 'Minuta interna', note: 'Relação sem vínculo, requisitos, remuneração por créditos, LGPD.', content: termosMotorista },
  { name: 'Política de Privacidade', version: 'v1.0', date: 'Maio/2026', status: 'Minuta interna', note: 'LGPD, dados coletados, finalidade, direitos do titular.', content: politicaPrivacidade },
  { name: 'Regras de Cancelamento', version: 'v1.0', date: 'Maio/2026', status: 'Minuta interna', note: 'Cancelamento por passageiro/motorista, penalidades, reembolso.', content: regrasCancelamento },
  { name: 'Regras de Pagamento, Créditos e Compensações', version: 'v1.0', date: 'Maio/2026', status: 'Minuta interna', note: 'Modelo de créditos, taxa, repasse territorial, ausência de garantias.', content: regrasPagamento },
  { name: 'Aviso de Plataforma de Intermediação', version: 'v1.0', date: 'Maio/2026', status: 'Minuta interna', note: 'Declaração formal: não é concessão, transporte coletivo ou cooperativa.', content: avisoIntermediacao },
  { name: 'Termo do Operador Territorial', version: 'v1.0', date: 'Maio/2026', status: 'Minuta interna', note: 'Responsabilidade, confidencialidade, LGPD, repasse manual.', content: termoOperador },
  { name: 'Conformidade Jurídica e Operacional', version: 'v1.0', date: 'Maio/2026', status: 'Referência', note: 'Consolidação de status, riscos e recomendações.', content: conformidade },
  { name: 'Apresentação Institucional', version: 'v1.0', date: 'Maio/2026', status: 'Minuta interna', note: 'Para prefeitura, associação, órgão público ou liderança local.', content: apresentacao },
  { name: 'Checklist Abertura de Cidade', version: 'v1.0', date: 'Maio/2026', status: 'Operacional', note: 'Passos obrigatórios antes de iniciar operação em nova cidade.', content: checklistCidade },
  { name: 'Política de Relacionamento Institucional', version: 'v1.0', date: 'Maio/2026', status: 'Operacional', note: 'Limites, canais, anticorrupção e postura perante órgão público.', content: politicaRelacionamento },
  { name: 'SMTR Rio — Credenciamento', version: 'v1.0', date: 'Maio/2026', status: 'Diagnóstico', note: 'Decreto 48.612/2021, credenciamento, 1,5% viário, pendências.', content: smtrRio },
  { name: 'Contrato — Gestor Territorial', version: 'v1.0', date: 'Jun/2026', status: 'Aprovado', note: 'Contrato jurídico operacional entre KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA e Gestor Territorial da Plataforma KAVIAR.', content: contratoGestor },
  { name: 'Contrato — Comércio Parceiro Local', version: 'v1.0', date: 'Jun/2026', status: 'Minuta interna', note: 'Contrato de parceria comercial entre KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA e comércio parceiro local.', content: contratoComercio },
  { name: 'Contrato — Hotel/Pousada Parceira KAVIAR', version: 'v1.0', date: 'Jun/2026', status: 'Minuta interna', note: 'Contrato de parceria operacional e comercial para atendimento de hóspedes, transfers, passeios e combos turísticos pela Plataforma KAVIAR.', content: contratoHotel },
  { name: 'Contrato — Parceiro KAVIAR Pet', version: 'v1.0', date: 'Jun/2026', status: 'Minuta interna', note: 'Contrato de parceria para serviços, atendimento, transporte e benefícios relacionados ao ecossistema KAVIAR Pet.', content: contratoPet },
];

export default function LegalCompliancePage() {
  const [viewDoc, setViewDoc] = useState(null);

  return (
    <Box>
      <Typography variant="h5" sx={{ color: '#C8A84E', fontWeight: 800, mb: 1 }}>📋 Conformidade Jurídica e Operacional</Typography>
      <Alert severity="warning" sx={{ mb: 3, bgcolor: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)' }}>
        Estes documentos são minutas operacionais internas e não substituem revisão jurídica formal.
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
            {DOCUMENTS.map((doc, i) => (
              <TableRow key={i}>
                <TableCell sx={{ fontWeight: 600 }}>{doc.name}</TableCell>
                <TableCell><Chip label={doc.version} size="small" sx={{ bgcolor: 'rgba(184,148,46,0.1)', color: '#B8942E' }} /></TableCell>
                <TableCell>{doc.date}</TableCell>
                <TableCell><Chip label={doc.status} size="small" sx={{ bgcolor: 'rgba(217,119,6,0.1)', color: '#D97706' }} /></TableCell>
                <TableCell sx={{ fontSize: '0.8rem', color: '#6B7280', maxWidth: 240 }}>{doc.note}</TableCell>
                <TableCell><Button size="small" onClick={() => setViewDoc(doc)} sx={{ color: '#2563EB', textTransform: 'none' }}>Visualizar</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Alert severity="info" sx={{ mt: 3, bgcolor: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}>
        Para revisão jurídica formal, consulte advogado especializado em direito digital e mobilidade urbana.
      </Alert>

      <Dialog open={!!viewDoc} onClose={() => setViewDoc(null)} maxWidth="md" fullWidth PaperProps={{ sx: { maxHeight: '90vh' } }}>
        {viewDoc && <>
          <DialogTitle sx={{ fontWeight: 700 }}>{viewDoc.name} <Chip label={viewDoc.version} size="small" sx={{ ml: 1 }} /></DialogTitle>
          <DialogContent dividers id="legal-doc-content" sx={{ '& h1': { fontSize: '1.4rem', mt: 2 }, '& h2': { fontSize: '1.1rem', mt: 2, mb: 1 }, '& h3': { fontSize: '1rem', mt: 1.5 }, '& p': { mb: 1 }, '& li': { mb: 0.3 }, '& table': { width: '100%', borderCollapse: 'collapse', mb: 2 }, '& th, & td': { border: '1px solid #ddd', padding: '6px 10px', fontSize: '0.85rem' }, '& th': { bgcolor: '#f5f5f5' } }}>
            <Markdown>{viewDoc.content}</Markdown>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => window.print()} sx={{ color: '#6B7280' }}>Imprimir</Button>
            <Button onClick={() => setViewDoc(null)}>Fechar</Button>
          </DialogActions>
        </>}
      </Dialog>

      <style>{`@media print { body * { visibility: hidden; } #legal-doc-content, #legal-doc-content * { visibility: visible; } #legal-doc-content { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; } }`}</style>
    </Box>
  );
}
