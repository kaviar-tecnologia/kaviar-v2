import { useState } from 'react';
import { Box, Container, Paper, Tab, Tabs, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import EntitiesTab from './EntitiesTab';
import FirmsTab from './FirmsTab';
import AccountantsTab from './AccountantsTab';
import LinksTab from './LinksTab';

const TAB_KEYS = ['empresas', 'escritorios', 'contadores', 'vinculos'];

export default function AccountingPortalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'empresas';
  const initialTab = TAB_KEYS.indexOf(tabParam) >= 0 ? TAB_KEYS.indexOf(tabParam) : 0;
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (_, newValue) => {
    setActiveTab(newValue);
    setSearchParams({ tab: TAB_KEYS[newValue] });
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 2, mb: 4 }}>
      <Paper elevation={1} sx={{ p: 3, bgcolor: '#FFFFFF', borderRadius: 2 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>
            Portal do Contador — Administração
          </Typography>
          <Typography sx={{ color: '#4B5563', fontSize: 13, mt: 0.5 }}>
            Empresas, escritórios, contadores e vínculos contábeis.
          </Typography>
          <Typography sx={{ color: '#6B7280', fontSize: 12, mt: 1, fontStyle: 'italic' }}>
            Sequência: Cadastre uma Empresa → Escritório → Contador → Vínculo → Convide o contador.
          </Typography>
        </Box>

        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{ mb: 3, borderBottom: '1px solid #D1D5DB', '& .MuiTab-root': { color: '#4B5563', fontWeight: 500 }, '& .Mui-selected': { color: '#B8942E', fontWeight: 700 } }}
          TabIndicatorProps={{ sx: { bgcolor: '#B8942E' } }}
        >
        <Tab label="Empresas" />
        <Tab label="Escritórios" />
        <Tab label="Contadores" />
        <Tab label="Vínculos" />
      </Tabs>

      {activeTab === 0 && <EntitiesTab />}
      {activeTab === 1 && <FirmsTab />}
      {activeTab === 2 && <AccountantsTab />}
      {activeTab === 3 && <LinksTab />}
      </Paper>
    </Container>
  );
}
