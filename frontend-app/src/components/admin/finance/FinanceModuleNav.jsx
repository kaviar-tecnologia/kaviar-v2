import { Box, Button, Paper, Typography } from '@mui/material';
import {
  AccountBalanceWallet,
  AccountTree,
  Assessment,
  Gavel,
  Paid,
  Payments,
  ReceiptLong,
  RequestQuote,
  Savings,
} from '@mui/icons-material';
import { Link as RouterLink, useLocation } from 'react-router-dom';

const ITEMS = [
  { label: 'Visão geral', path: '/admin/financeiro/visao-geral', icon: <Assessment fontSize="small" /> },
  { label: 'Lançamentos', path: '/admin/financeiro/lancamentos', icon: <ReceiptLong fontSize="small" /> },
  { label: 'Contas a receber', path: '/admin/financeiro/contas-a-receber', icon: <RequestQuote fontSize="small" /> },
  { label: 'Contas a pagar', path: '/admin/financeiro/contas-a-pagar', icon: <Payments fontSize="small" /> },
  { label: 'Tesouraria', path: '/admin/financeiro/tesouraria', icon: <Savings fontSize="small" /> },
  { label: 'Pagamentos', path: '/admin/financeiro/pagamentos', icon: <Paid fontSize="small" /> },
  { label: 'Estrutura', path: '/admin/financeiro', icon: <AccountTree fontSize="small" />, exact: true },
  { label: 'Políticas', path: '/admin/financeiro/politicas', icon: <Gavel fontSize="small" /> },
  { label: 'Contador', path: '/admin/financeiro/contador', icon: <AccountBalanceWallet fontSize="small" /> },
];

export default function FinanceModuleNav({ compact = false }) {
  const location = useLocation();

  const isActive = (item) => (
    item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
  );

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 3,
        p: compact ? 1 : 1.5,
        border: '1px solid #DCE6F2',
        borderRadius: 2.5,
        bgcolor: '#FFFFFF',
      }}
    >
      {!compact && (
        <Box sx={{ px: 0.5, pb: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Financeiro KAVIAR
          </Typography>
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Button
              key={item.path}
              component={RouterLink}
              to={item.path}
              size="small"
              startIcon={item.icon}
              aria-current={active ? 'page' : undefined}
              sx={{
                textTransform: 'none',
                fontWeight: active ? 800 : 600,
                color: active ? '#FFFFFF' : '#334155',
                bgcolor: active ? '#1D4ED8' : '#F8FAFC',
                border: `1px solid ${active ? '#1D4ED8' : '#E2E8F0'}`,
                '&:hover': {
                  bgcolor: active ? '#1E40AF' : '#EFF6FF',
                  borderColor: '#93C5FD',
                },
              }}
            >
              {item.label}
            </Button>
          );
        })}
      </Box>
    </Paper>
  );
}
