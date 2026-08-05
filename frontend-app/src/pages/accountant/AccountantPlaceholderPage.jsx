import { Typography, Box } from '@mui/material';
import AccountantPortalLayout from '../../components/accountant/AccountantPortalLayout';

export default function AccountantPlaceholderPage({ title }) {
  return (
    <AccountantPortalLayout>
      <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, mb: 2 }}>{title}</Typography>
      <Box sx={{ bgcolor: '#1A1F2E', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 2, p: 4, textAlign: 'center' }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>Esta funcionalidade será implementada nas próximas frentes.</Typography>
      </Box>
    </AccountantPortalLayout>
  );
}
