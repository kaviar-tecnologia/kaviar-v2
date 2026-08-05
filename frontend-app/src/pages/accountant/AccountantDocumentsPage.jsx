import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, TextField, InputAdornment, Select, MenuItem, FormControl,
  InputLabel, Card, CardContent, Chip, Skeleton, Grid, Button, IconButton, Tooltip,
} from '@mui/material';
import {
  Search, Description, FilterList, Add, Business, CloudUpload,
  CheckCircle, Schedule, Warning, Cancel, ArrowForward,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

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
  NO_EXPIRY: { label: 'Sem Validade', color: '#6B7280', icon: null },
  VALID: { label: 'Válido', color: '#22C55E', icon: CheckCircle },
  EXPIRING_SOON: { label: 'Vencendo', color: '#F59E0B', icon: Warning },
  EXPIRED: { label: 'Vencido', color: '#EF4444', icon: Cancel },
};

const CATEGORY_LABELS = {
  SOCIETARIO: 'Societário',
  FISCAL: 'Fiscal',
  TRABALHISTA: 'Trabalhista',
  CERTIFICADO: 'Certificado',
  PROCURACAO: 'Procuração',
  LICENCA: 'Licença',
  INSCRICAO: 'Inscrição',
  OUTRO: 'Outro',
};

export default function AccountantDocumentsPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({
    status: '',
    category: '',
    temporal_status: '',
    legal_entity_id: '',
  });
  const [companies, setCompanies] = useState([]);

  const fetchDocuments = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filters.status) params.set('status', filters.status);
      if (filters.category) params.set('category', filters.category);
      if (filters.temporal_status) params.set('temporal_status', filters.temporal_status);
      if (filters.legal_entity_id) params.set('legal_entity_id', filters.legal_entity_id);

      const res = await accountantApi.get(`/api/accountant/portal/documents?${params}`);
      setDocuments(res.data?.data || []);
      setPagination(res.data?.pagination || { page: 1, total: 0, totalPages: 0 });
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    accountantApi.get('/api/accountant/portal/companies')
      .then(res => setCompanies(res.data?.data || []))
      .catch(() => {});
  }, []);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  return (
    <AccountantPortalLayout>
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>
              Documentos
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, mt: 0.5 }}>
              {pagination.total > 0 ? `${pagination.total} documento${pagination.total > 1 ? 's' : ''}` : 'Gerencie documentos das empresas vinculadas'}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate('/contador/documentos/novo')}
            sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', '&:hover': { bgcolor: '#B8960C' }, textTransform: 'none', fontWeight: 600 }}
          >
            Novo Documento
          </Button>
        </Box>

        {/* Filters */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Empresa</InputLabel>
            <Select
              value={filters.legal_entity_id}
              onChange={e => handleFilterChange('legal_entity_id', e.target.value)}
              label="Empresa"
              sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
            >
              <MenuItem value="">Todas</MenuItem>
              {companies.map(c => (
                <MenuItem key={c.id} value={c.id}>{c.razao_social}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Status</InputLabel>
            <Select
              value={filters.status}
              onChange={e => handleFilterChange('status', e.target.value)}
              label="Status"
              sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
            >
              <MenuItem value="">Todos</MenuItem>
              {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Categoria</InputLabel>
            <Select
              value={filters.category}
              onChange={e => handleFilterChange('category', e.target.value)}
              label="Categoria"
              sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
            >
              <MenuItem value="">Todas</MenuItem>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Validade</InputLabel>
            <Select
              value={filters.temporal_status}
              onChange={e => handleFilterChange('temporal_status', e.target.value)}
              label="Validade"
              sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
            >
              <MenuItem value="">Todas</MenuItem>
              {Object.entries(TEMPORAL_LABELS).map(([key, { label }]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {hasActiveFilters && (
            <Button
              size="small"
              onClick={() => setFilters({ status: '', category: '', temporal_status: '', legal_entity_id: '' })}
              sx={{ color: '#D4AF37', textTransform: 'none' }}
            >
              Limpar filtros
            </Button>
          )}
        </Box>

        {/* Content */}
        {loading ? (
          <Grid container spacing={2}>
            {[1, 2, 3, 4].map(i => (
              <Grid item xs={12} key={i}>
                <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} />
              </Grid>
            ))}
          </Grid>
        ) : documents.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Description sx={{ fontSize: 64, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>
              {hasActiveFilters ? 'Nenhum documento encontrado com os filtros aplicados' : 'Nenhum documento cadastrado'}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, mt: 1 }}>
              {hasActiveFilters
                ? 'Tente alterar os filtros ou limpar a busca.'
                : 'Crie o primeiro documento clicando em "Novo Documento".'}
            </Typography>
          </Box>
        ) : (
          <>
            {documents.map(doc => (
              <DocumentCard key={doc.id} doc={doc} onClick={() => navigate(`/contador/documentos/${doc.id}`)} />
            ))}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, gap: 1 }}>
                <Button
                  size="small"
                  disabled={pagination.page <= 1}
                  onClick={() => fetchDocuments(pagination.page - 1)}
                  sx={{ color: '#D4AF37', textTransform: 'none' }}
                >
                  Anterior
                </Button>
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', alignSelf: 'center', fontSize: 13 }}>
                  {pagination.page} de {pagination.totalPages}
                </Typography>
                <Button
                  size="small"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchDocuments(pagination.page + 1)}
                  sx={{ color: '#D4AF37', textTransform: 'none' }}
                >
                  Próxima
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
    </AccountantPortalLayout>
  );
}

function DocumentCard({ doc, onClick }) {
  const statusInfo = STATUS_LABELS[doc.status] || { label: doc.status, color: '#6B7280' };
  const temporalInfo = TEMPORAL_LABELS[doc.temporal_status] || { label: '', color: '#6B7280' };

  return (
    <Card
      onClick={onClick}
      sx={{
        mb: 1.5,
        bgcolor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 2,
        cursor: 'pointer',
        transition: 'all 0.15s',
        '&:hover': { bgcolor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(212,175,55,0.3)' },
      }}
    >
      <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ color: '#fff', fontWeight: 500, fontSize: 15 }}>
                {doc.document_type?.name || 'Documento'}
              </Typography>
              <Chip
                label={statusInfo.label}
                size="small"
                sx={{ bgcolor: `${statusInfo.color}20`, color: statusInfo.color, fontSize: 11, height: 22 }}
              />
              {doc.temporal_status && doc.temporal_status !== 'NO_EXPIRY' && (
                <Chip
                  label={temporalInfo.label}
                  size="small"
                  sx={{ bgcolor: `${temporalInfo.color}20`, color: temporalInfo.color, fontSize: 11, height: 22 }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                <Business sx={{ fontSize: 12, mr: 0.3, verticalAlign: 'middle' }} />
                {doc.legal_entity?.razao_social || '—'}
              </Typography>
              {doc.document_type?.category && (
                <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                  {CATEGORY_LABELS[doc.document_type.category] || doc.document_type.category}
                </Typography>
              )}
              {doc.files_count > 0 && (
                <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                  {doc.files_count} versão{doc.files_count > 1 ? 'ões' : ''}
                </Typography>
              )}
            </Box>
          </Box>
          <ArrowForward sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 18 }} />
        </Box>
      </CardContent>
    </Card>
  );
}
