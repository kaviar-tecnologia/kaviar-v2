import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Chip, Card, CardContent, Skeleton, Divider,
  Table, TableBody, TableRow, TableCell, TableHead, IconButton, Tooltip, Alert,
} from '@mui/material';
import {
  ArrowBack, CloudUpload, CloudDownload, Description, Warning,
  CheckCircle, Cancel, Schedule, Block, Info,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';
import DocumentUploadDialog from '../../components/accountant/DocumentUploadDialog';

const STATUS_LABELS = {
  DRAFT: { label: 'Rascunho', color: '#6B7280' },
  SENT: { label: 'Enviado', color: '#3B82F6' },
  UNDER_REVIEW: { label: 'Em Análise', color: '#F59E0B' },
  APPROVED: { label: 'Aprovado', color: '#10B981' },
  ACTIVE: { label: 'Ativo', color: '#22C55E' },
  REJECTED: { label: 'Rejeitado', color: '#EF4444' },
  REPLACED: { label: 'Substituído', color: '#6B7280' },
  REVOKED: { label: 'Revogado', color: '#DC2626' },
};

const TEMPORAL_LABELS = {
  NO_EXPIRY: { label: 'Sem Validade', color: '#6B7280' },
  VALID: { label: 'Válido', color: '#22C55E' },
  EXPIRING_SOON: { label: 'Vencendo em breve', color: '#F59E0B' },
  EXPIRED: { label: 'Vencido', color: '#EF4444' },
};

const SCAN_LABELS = {
  NOT_SCANNED: { label: 'Não verificado', color: '#6B7280' },
  PENDING: { label: 'Verificando...', color: '#F59E0B' },
  CLEAN: { label: 'Seguro', color: '#22C55E' },
  INFECTED: { label: 'Infectado', color: '#EF4444' },
  FAILED: { label: 'Verificação falhou', color: '#F97316' },
};

export default function AccountantDocumentDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [downloading, setDownloading] = useState(null);

  const fetchDocument = () => {
    setLoading(true);
    accountantApi.get(`/api/accountant/portal/documents/${id}`)
      .then(res => { setDoc(res.data?.data); setError(null); })
      .catch(err => setError(err.response?.data?.error || 'Erro ao carregar documento'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDocument(); }, [id]);

  const handleDownload = async (fileId) => {
    setDownloading(fileId);
    try {
      const res = await accountantApi.get(`/api/accountant/portal/documents/${id}/files/${fileId}/download`);
      const { download_url } = res.data?.data || {};
      if (download_url) {
        window.open(download_url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao gerar link de download');
    } finally {
      setDownloading(null);
    }
  };

  const handleSend = async () => {
    try {
      await accountantApi.patch(`/api/accountant/portal/documents/${id}`, { status: 'SENT' });
      fetchDocument();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao enviar documento');
    }
  };

  if (loading) {
    return (
      <AccountantPortalLayout>
        <Box sx={{ p: 3 }}>
          <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} />
        </Box>
      </AccountantPortalLayout>
    );
  }

  if (error) {
    return (
      <AccountantPortalLayout>
        <Box sx={{ p: 3, textAlign: 'center', py: 8 }}>
          <Warning sx={{ fontSize: 48, color: '#F59E0B', mb: 2 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>{error}</Typography>
          <Button onClick={() => navigate('/contador/documentos')} sx={{ mt: 2, color: '#D4AF37' }}>
            Voltar
          </Button>
        </Box>
      </AccountantPortalLayout>
    );
  }

  const statusInfo = STATUS_LABELS[doc.status] || { label: doc.status, color: '#6B7280' };
  const temporalInfo = TEMPORAL_LABELS[doc.temporal_status] || { label: '', color: '#6B7280' };
  const canUpload = doc.status === 'DRAFT' || doc.status === 'REJECTED';
  const canSend = doc.status === 'DRAFT' && doc.files?.length > 0;

  return (
    <AccountantPortalLayout>
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <IconButton onClick={() => navigate('/contador/documentos')} sx={{ color: 'rgba(255,255,255,0.5)' }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>
              {doc.document_type?.name || 'Documento'}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              {doc.legal_entity?.razao_social} • {doc.legal_entity?.cnpj}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {canUpload && (
              <Button
                variant="outlined"
                startIcon={<CloudUpload />}
                onClick={() => setUploadOpen(true)}
                sx={{ borderColor: '#D4AF37', color: '#D4AF37', textTransform: 'none', '&:hover': { borderColor: '#B8960C' } }}
              >
                Upload
              </Button>
            )}
            {canSend && (
              <Button
                variant="contained"
                onClick={handleSend}
                sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}
              >
                Enviar para Revisão
              </Button>
            )}
          </Box>
        </Box>

        {/* Status + Metadata */}
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
              <Chip label={statusInfo.label} sx={{ bgcolor: `${statusInfo.color}20`, color: statusInfo.color }} />
              {doc.temporal_status && doc.temporal_status !== 'NO_EXPIRY' && (
                <Chip label={temporalInfo.label} sx={{ bgcolor: `${temporalInfo.color}20`, color: temporalInfo.color }} />
              )}
              {doc.document_type?.category && (
                <Chip label={doc.document_type.category} variant="outlined" size="small"
                  sx={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)' }} />
              )}
            </Box>

            <Grid2 items={[
              { label: 'Referência', value: doc.reference_number || '—' },
              { label: 'Emitido em', value: doc.issued_at ? new Date(doc.issued_at).toLocaleDateString('pt-BR') : '—' },
              { label: 'Válido a partir de', value: doc.valid_from ? new Date(doc.valid_from).toLocaleDateString('pt-BR') : '—' },
              { label: 'Vencimento', value: doc.expires_at ? new Date(doc.expires_at).toLocaleDateString('pt-BR') : 'Sem validade' },
            ]} />

            {doc.notes && (
              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1 }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, mb: 0.5 }}>Observações</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{doc.notes}</Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Current File */}
        {doc.current_file && (
          <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, mb: 3 }}>
            <CardContent>
              <Typography sx={{ color: '#D4AF37', fontSize: 13, fontWeight: 600, mb: 1.5 }}>
                Arquivo Atual (v{doc.current_file.version_number})
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography sx={{ color: '#fff', fontSize: 14 }}>{doc.current_file.original_filename}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    {(doc.current_file.size_bytes / 1024).toFixed(0)} KB • {doc.current_file.mime_type}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {doc.current_file.scan_status === 'INFECTED' ? (
                    <Chip icon={<Block />} label="Bloqueado" size="small" sx={{ bgcolor: '#EF444420', color: '#EF4444' }} />
                  ) : (
                    <Tooltip title="Baixar arquivo">
                      <IconButton
                        onClick={() => handleDownload(doc.current_file.id)}
                        disabled={downloading === doc.current_file.id}
                        sx={{ color: '#D4AF37' }}
                      >
                        <CloudDownload />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Version History */}
        {doc.files?.length > 0 && (
          <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <CardContent>
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, mb: 1.5 }}>
                Histórico de Versões ({doc.files.length})
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Versão</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Arquivo</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Tamanho</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Verificação</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>Data</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }} align="right">Ação</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {doc.files.map(file => {
                    const scanInfo = SCAN_LABELS[file.scan_status] || { label: file.scan_status, color: '#6B7280' };
                    const isInfected = file.scan_status === 'INFECTED';
                    return (
                      <TableRow key={file.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.05)' }}>v{file.version_number}</TableCell>
                        <TableCell sx={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.05)', fontSize: 13 }}>
                          {file.original_filename}
                        </TableCell>
                        <TableCell sx={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.05)', fontSize: 12 }}>
                          {(file.size_bytes / 1024).toFixed(0)} KB
                        </TableCell>
                        <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                          <Chip label={scanInfo.label} size="small" sx={{ bgcolor: `${scanInfo.color}15`, color: scanInfo.color, fontSize: 11, height: 20 }} />
                        </TableCell>
                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.05)', fontSize: 12 }}>
                          {new Date(file.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell align="right" sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                          {isInfected ? (
                            <Tooltip title="Download bloqueado: infectado"><Block sx={{ fontSize: 18, color: '#EF4444' }} /></Tooltip>
                          ) : (
                            <Tooltip title="Baixar">
                              <IconButton size="small" onClick={() => handleDownload(file.id)} disabled={downloading === file.id} sx={{ color: '#D4AF37' }}>
                                <CloudDownload fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* No files yet */}
        {(!doc.files || doc.files.length === 0) && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <CloudUpload sx={{ fontSize: 48, color: 'rgba(255,255,255,0.15)', mb: 1 }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
              Nenhum arquivo anexado
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, mt: 0.5 }}>
              Faça upload do primeiro arquivo para este documento.
            </Typography>
            {canUpload && (
              <Button
                startIcon={<CloudUpload />}
                onClick={() => setUploadOpen(true)}
                sx={{ mt: 2, color: '#D4AF37', textTransform: 'none' }}
              >
                Fazer Upload
              </Button>
            )}
          </Box>
        )}
      </Box>

      {/* Upload Dialog */}
      <DocumentUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        documentId={id}
        onSuccess={() => { setUploadOpen(false); fetchDocument(); }}
      />
    </AccountantPortalLayout>
  );
}

function Grid2({ items }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2 }}>
      {items.map(({ label, value }) => (
        <Box key={label}>
          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, mb: 0.3 }}>{label}</Typography>
          <Typography sx={{ color: '#fff', fontSize: 14 }}>{value}</Typography>
        </Box>
      ))}
    </Box>
  );
}
