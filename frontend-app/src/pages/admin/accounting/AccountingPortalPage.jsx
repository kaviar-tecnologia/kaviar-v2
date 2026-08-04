import { useState } from 'react';
import { Box, Container, Tab, Tabs, Typography } from '@mui/material';
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
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1A1A1A' }}>
          Portal do Contador — Administração
        </Typography>
        <Typography sx={{ color: '#6B7280', fontSize: 13, mt: 0.5 }}>
          Empresas, escritórios, contadores e vínculos contábeis.
        </Typography>
      </Box>

      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{ mb: 3, borderBottom: '1px solid #E5E7EB' }}
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
    </Container>
  );
}
