import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Chip, Skeleton, Button } from '@mui/material';
import { Assignment, Warning, Error as ErrorIcon, Info, Business, ArrowForward, CheckCircle } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';
import accountantApi from '../../services/accountantApi';

const PRIORITY_STYLES = {
  URGENT: { label: 'Urgente', color: '#EF4444', bg: '#EF444415', icon: ErrorIcon },
  HIGH: { label: 'Alta', color: '#F59E0B', bg: '#F59E0B15', icon: Warning },
  MEDIUM: { label: 'Média', color: '#3B82F6', bg: '#3B82F615', icon: Info },
  LOW: { label: 'Baixa', color: '#6B7280', bg: '#6B728015', icon: Info },
};

export default function AccountantPendenciasPage() {
  const navigate = useNavigate();
  const [pendencias, setPendencias] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    accountantApi.get('/api/accountant/portal/pendencias')
      .then(r => setPendencias(r.data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const urgentCount = pendencias.filter(p => p.priority === 'URGENT').length;
  const highCount = pendencias.filter(p => p.priority === 'HIGH').length;

  return (
    <AccountantPortalLayout>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>Pendências</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, mt: 0.5 }}>
          {pendencias.length > 0
            ? `${pendencias.length} pendência${pendencias.length > 1 ? 's' : ''} encontrada${pendencias.length > 1 ? 's' : ''}${urgentCount > 0 ? ` • ${urgentCount} urgente${urgentCount > 1 ? 's' : ''}` : ''}`
            : 'O sistema verifica automaticamente certificados, procurações e documentos'}
        </Typography>
      </Box>

      {loading ? (
        [1,2,3,4].map(i => <Skeleton key={i} variant="rectangular" height={70} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', mb: 1.5 }} />)
      ) : pendencias.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CheckCircle sx={{ fontSize: 64, color: '#22C55E', mb: 2, opacity: 0.6 }} />
          <Typography sx={{ color: '#22C55E', fontSize: 18, fontWeight: 600 }}>Tudo em dia!</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, mt: 1 }}>
            Nenhuma pendência encontrada. Todas as empresas estão com documentação regular.
          </Typography>
        </Box>
      ) : (
        pendencias.map(p => {
          const style = PRIORITY_STYLES[p.priority] || PRIORITY_STYLES.LOW;
          const Icon = style.icon;
          return (
            <Card key={p.id} sx={{ mb: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${style.color}30`, borderRadius: 2, cursor: p.action_path ? 'pointer' : 'default', transition: 'all 0.15s', '&:hover': p.action_path ? { bgcolor: 'rgba(255,255,255,0.05)', borderColor: `${style.color}50` } : {} }}
              onClick={() => p.action_path && navigate(p.action_path)}
            >
              <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Icon sx={{ color: style.color, fontSize: 22 }} />
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                      <Typography sx={{ color: '#fff', fontWeight: 500, fontSize: 14 }}>{p.title}</Typography>
                      <Chip label={style.label} size="small" sx={{ bgcolor: style.bg, color: style.color, fontSize: 10, height: 20 }} />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{p.description}</Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                        <Business sx={{ fontSize: 11, mr: 0.3, verticalAlign: 'middle' }} />{p.entity_name}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ color: style.color, fontSize: 12, fontWeight: 500 }}>{p.action}</Typography>
                    {p.days_until_expiry !== null && p.days_until_expiry !== undefined && (
                      <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                        {p.days_until_expiry < 0 ? `${Math.abs(p.days_until_expiry)}d atrás` : `${p.days_until_expiry}d restantes`}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          );
        })
      )}
    </AccountantPortalLayout>
  );
}
