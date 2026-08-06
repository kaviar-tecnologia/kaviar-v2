import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Grid, Chip, Skeleton, Button, Divider } from '@mui/material';
import { ArrowBack, Business, CheckCircle, Cancel, Description, Warning, CalendarMonth, Lock } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

function formatCnpj(cnpj) {
  if (!cnpj || cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const entityTypeColors = {
  MATRIZ: { bg: 'rgba(212,175,55,0.15)', color: '#D4AF37' },
  FILIAL: { bg: 'rgba(99,102,241,0.15)', color: '#818CF8' },
};

const scopeLabels = {
  FULL: 'Acesso Completo',
  FISCAL: 'Fiscal',
  CONTABIL: 'Contábil',
  DEPARTAMENTO_PESSOAL: 'Departamento Pessoal',
};

const cardStyle = { bgcolor: '#1A1F2E', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 2 };

export default function AccountantCompanyDetailPage() {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { id } = useParams();

  useEffect(() => {
    accountantApi.get(`/api/accountant/portal/companies/${id}`)
      .then(res => setCompany(res.data?.data))
      .catch(err => setError(err.response?.data?.error || 'Erro ao carregar empresa'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <AccountantPortalLayout>
      <Skeleton variant="rectangular" height={40} sx={{ bgcolor: '#1A1F2E', borderRadius: 2, mb: 2 }} />
      <Skeleton variant="rectangular" height={200} sx={{ bgcolor: '#1A1F2E', borderRadius: 2, mb: 2 }} />
      <Skeleton variant="rectangular" height={150} sx={{ bgcolor: '#1A1F2E', borderRadius: 2 }} />
    </AccountantPortalLayout>
  );

  if (error) return (
    <AccountantPortalLayout>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate('/contador/empresas')}
        sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'none', mb: 3 }}
      >
        Voltar para empresas
      </Button>
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Warning sx={{ fontSize: 48, color: '#F59E0B', mb: 2 }} />
        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>{error}</Typography>
      </Box>
    </AccountantPortalLayout>
  );

  const typeStyle = entityTypeColors[company.entity_type] || entityTypeColors.MATRIZ;
  const permissions = company.access?.permissions || {};

  const permissionsList = [
    { key: 'can_view', label: 'Visualizar', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
    { key: 'can_upload', label: 'Upload', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
    { key: 'can_download', label: 'Download', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
    { key: 'can_request_correction', label: 'Solicitar correção', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
    { key: 'can_mark_processed', label: 'Marcar processado', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
    { key: 'can_close_period', label: 'Fechar competência', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
  ];

  return (
    <AccountantPortalLayout>
      {/* Back button */}
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate('/contador/empresas')}
        sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'none', mb: 3, '&:hover': { color: '#D4AF37' } }}
      >
        Voltar para empresas
      </Button>

      {/* Company header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Business sx={{ color: '#D4AF37', fontSize: 28 }} />
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700 }}>
            {company.razao_social}
          </Typography>
        </Box>
        {company.nome_fantasia && (
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, ml: 5.5 }}>
            {company.nome_fantasia}
          </Typography>
        )}
      </Box>

      <Grid container spacing={2}>
        {/* Identification card */}
        <Grid item xs={12} md={6}>
          <Card sx={cardStyle}>
            <CardContent>
              <Typography sx={{ color: '#D4AF37', fontWeight: 600, fontSize: 14, mb: 2 }}>
                Identificação
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CNPJ</Typography>
                  <Typography sx={{ color: '#fff', fontSize: 15, fontFamily: 'monospace' }}>{formatCnpj(company.cnpj)}</Typography>
                </Box>

                <Box>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</Typography>
                  <Chip
                    label={company.entity_type}
                    size="small"
                    sx={{ bgcolor: typeStyle.bg, color: typeStyle.color, fontSize: 11, height: 22, fontWeight: 600, mt: 0.5 }}
                  />
                </Box>

                {company.uf && (
                  <Box>
                    <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Localização</Typography>
                    <Typography sx={{ color: '#fff', fontSize: 14 }}>
                      {[company.municipio, company.uf].filter(Boolean).join(' / ')}
                    </Typography>
                  </Box>
                )}

                {company.endereco && (
                  <Box>
                    <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Endereço</Typography>
                    <Typography sx={{ color: '#fff', fontSize: 14 }}>{company.endereco}</Typography>
                  </Box>
                )}

                {company.codigo_interno && (
                  <Box>
                    <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Código interno</Typography>
                    <Typography sx={{ color: '#fff', fontSize: 14 }}>{company.codigo_interno}</Typography>
                  </Box>
                )}

                {company.parent && (
                  <Box>
                    <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matriz</Typography>
                    <Typography sx={{ color: '#fff', fontSize: 14 }}>{company.parent.razao_social}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace' }}>{formatCnpj(company.parent.cnpj)}</Typography>
                  </Box>
                )}

                <Box>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</Typography>
                  <Chip
                    icon={company.is_active ? <CheckCircle sx={{ fontSize: 14 }} /> : <Cancel sx={{ fontSize: 14 }} />}
                    label={company.is_active ? 'Ativa' : 'Inativa'}
                    size="small"
                    sx={{
                      bgcolor: company.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: company.is_active ? '#10B981' : '#EF4444',
                      fontSize: 11, height: 22, mt: 0.5,
                      '& .MuiChip-icon': { color: 'inherit' },
                    }}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Access info card */}
        <Grid item xs={12} md={6}>
          <Card sx={cardStyle}>
            <CardContent>
              <Typography sx={{ color: '#D4AF37', fontWeight: 600, fontSize: 14, mb: 2 }}>
                Acesso
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Escopo</Typography>
                  <Typography sx={{ color: '#fff', fontSize: 14, mt: 0.5 }}>
                    {scopeLabels[company.access?.scope] || company.access?.scope || '-'}
                  </Typography>
                </Box>

                <Box>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vigência</Typography>
                  <Typography sx={{ color: '#fff', fontSize: 14, mt: 0.5 }}>
                    {formatDate(company.access?.starts_at)} — {company.access?.ends_at ? formatDate(company.access.ends_at) : 'Indeterminado'}
                  </Typography>
                </Box>

                {company.access?.inherits_children && (
                  <Box>
                    <Chip
                      label="Herda acesso às filiais"
                      size="small"
                      sx={{ bgcolor: 'rgba(99,102,241,0.15)', color: '#818CF8', fontSize: 11, height: 22 }}
                    />
                  </Box>
                )}

                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 0.5 }} />

                <Box>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>Permissões</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                    {permissionsList.map(p => (
                      <Chip
                        key={p.key}
                        icon={permissions[p.key] ? <CheckCircle sx={{ fontSize: 12 }} /> : <Cancel sx={{ fontSize: 12 }} />}
                        label={p.label}
                        size="small"
                        sx={{
                          bgcolor: permissions[p.key] ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                          color: permissions[p.key] ? '#10B981' : 'rgba(255,255,255,0.3)',
                          fontSize: 11, height: 22,
                          '& .MuiChip-icon': { color: 'inherit' },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Saúde Fiscal placeholder */}
        <Grid item xs={12}>
          <Card sx={{ ...cardStyle, borderStyle: 'dashed' }}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Description sx={{ fontSize: 40, color: 'rgba(255,255,255,0.15)', mb: 1 }} />
              <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 500 }}>
                Saúde Fiscal
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, mt: 0.5 }}>
                Em breve: indicadores fiscais, alertas e pendências desta empresa.
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Action buttons */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<Description />}
              onClick={() => navigate(`/contador/documentos?legal_entity_id=${id}`)}
              sx={{ textTransform: 'none', color: '#D4AF37', borderColor: 'rgba(212,175,55,0.3)', '&:hover': { borderColor: '#D4AF37' } }}
            >
              Ver Documentos
            </Button>
            <Button
              variant="outlined"
              startIcon={<Warning />}
              onClick={() => navigate('/contador/pendencias')}
              sx={{ textTransform: 'none', color: '#D4AF37', borderColor: 'rgba(212,175,55,0.3)', '&:hover': { borderColor: '#D4AF37' } }}
            >
              Ver Pendências
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate(`/contador/empresas/${id}/corridas`)}
              sx={{ textTransform: 'none', color: '#D4AF37', borderColor: 'rgba(212,175,55,0.3)', '&:hover': { borderColor: '#D4AF37' } }}
            >
              Financeiro de Corridas
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate(`/contador/empresas/${id}/automacoes`)}
              sx={{ textTransform: 'none', color: '#D4AF37', borderColor: 'rgba(212,175,55,0.3)', '&:hover': { borderColor: '#D4AF37' } }}
            >
              Automações
            </Button>
          </Box>
        </Grid>
      </Grid>
    </AccountantPortalLayout>
  );
}
