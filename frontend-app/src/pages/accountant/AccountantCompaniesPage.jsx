import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Grid, Chip, Skeleton, TextField, InputAdornment } from '@mui/material';
import { Business, Search, Domain, Store } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

function formatCnpj(cnpj) {
  if (!cnpj || cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

const entityTypeColors = {
  MATRIZ: { bg: 'rgba(212,175,55,0.15)', color: '#D4AF37' },
  FILIAL: { bg: 'rgba(99,102,241,0.15)', color: '#818CF8' },
};

const scopeColors = {
  COMPLETO: { bg: 'rgba(16,185,129,0.15)', color: '#10B981', label: 'Completo' },
  FISCAL: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B', label: 'Fiscal' },
  CONTABIL: { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6', label: 'Contábil' },
  FOLHA: { bg: 'rgba(168,85,247,0.15)', color: '#A855F7', label: 'Folha / DP' },
  SOCIETARIO: { bg: 'rgba(236,72,153,0.15)', color: '#EC4899', label: 'Societário' },
  FINANCEIRO: { bg: 'rgba(16,185,129,0.15)', color: '#10B981', label: 'Financeiro' },
  MUNICIPAL: { bg: 'rgba(14,165,233,0.15)', color: '#0EA5E9', label: 'Municipal' },
};

export default function AccountantCompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    accountantApi.get('/api/accountant/portal/companies')
      .then(res => setCompanies(res.data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = companies.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.razao_social?.toLowerCase().includes(q) ||
      c.nome_fantasia?.toLowerCase().includes(q) ||
      c.cnpj?.includes(q.replace(/[.\-\/]/g, ''))
    );
  });

  if (loading) return (
    <AccountantPortalLayout>
      <Box sx={{ mb: 3 }}>
        <Skeleton variant="rectangular" height={40} sx={{ bgcolor: '#1A1F2E', borderRadius: 2, mb: 2 }} />
      </Box>
      <Grid container spacing={2}>
        {[1, 2, 3, 4].map(i => (
          <Grid item xs={12} sm={6} md={4} key={i}>
            <Skeleton variant="rectangular" height={140} sx={{ bgcolor: '#1A1F2E', borderRadius: 2 }} />
          </Grid>
        ))}
      </Grid>
    </AccountantPortalLayout>
  );

  return (
    <AccountantPortalLayout>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, mb: 0.5 }}>
          Empresas
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          {companies.length} empresa{companies.length !== 1 ? 's' : ''} vinculada{companies.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Search */}
      {companies.length > 0 && (
        <TextField
          fullWidth
          size="small"
          placeholder="Buscar por razão social, fantasia ou CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
          sx={{
            mb: 3,
            '& .MuiOutlinedInput-root': {
              bgcolor: '#1A1F2E',
              color: '#fff',
              borderRadius: 2,
              '& fieldset': { borderColor: 'rgba(212,175,55,0.15)' },
              '&:hover fieldset': { borderColor: 'rgba(212,175,55,0.3)' },
              '&.Mui-focused fieldset': { borderColor: '#D4AF37' },
            },
            '& input::placeholder': { color: 'rgba(255,255,255,0.3)' },
          }}
        />
      )}

      {/* Empty state */}
      {companies.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Business sx={{ fontSize: 64, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>
            Nenhuma empresa vinculada
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, mt: 1 }}>
            Solicite ao administrador a vinculação de empresas ao seu perfil.
          </Typography>
        </Box>
      )}

      {/* Companies grid */}
      <Grid container spacing={2}>
        {filtered.map(company => {
          const typeStyle = entityTypeColors[company.entity_type] || entityTypeColors.MATRIZ;
          const scopeStyle = scopeColors[company.scope] || scopeColors.COMPLETO;

          return (
            <Grid item xs={12} sm={6} md={4} key={company.id}>
              <Card
                onClick={() => navigate(`/contador/empresas/${company.id}`)}
                sx={{
                  bgcolor: '#1A1F2E',
                  border: '1px solid rgba(212,175,55,0.12)',
                  borderRadius: 2,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: 'rgba(212,175,55,0.4)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  },
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  {/* Entity type icon + chips */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {company.entity_type === 'MATRIZ'
                        ? <Domain sx={{ color: typeStyle.color, fontSize: 20 }} />
                        : <Store sx={{ color: typeStyle.color, fontSize: 20 }} />
                      }
                      <Chip
                        label={company.entity_type}
                        size="small"
                        sx={{ bgcolor: typeStyle.bg, color: typeStyle.color, fontSize: 10, height: 20, fontWeight: 600 }}
                      />
                    </Box>
                    <Chip
                      label={scopeStyle.label}
                      size="small"
                      sx={{ bgcolor: scopeStyle.bg, color: scopeStyle.color, fontSize: 10, height: 20, fontWeight: 600 }}
                    />
                  </Box>

                  {/* Company name */}
                  <Typography sx={{ color: '#fff', fontSize: 14, fontWeight: 600, mb: 0.5, lineHeight: 1.3 }} noWrap>
                    {company.razao_social}
                  </Typography>
                  {company.nome_fantasia && (
                    <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, mb: 1 }} noWrap>
                      {company.nome_fantasia}
                    </Typography>
                  )}

                  {/* CNPJ */}
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace', mb: 1 }}>
                    {formatCnpj(company.cnpj)}
                  </Typography>

                  {/* UF */}
                  {company.uf && (
                    <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                      {company.municipio ? `${company.municipio} / ${company.uf}` : company.uf}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* No results from filter */}
      {companies.length > 0 && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            Nenhuma empresa encontrada para "{search}"
          </Typography>
        </Box>
      )}
    </AccountantPortalLayout>
  );
}
