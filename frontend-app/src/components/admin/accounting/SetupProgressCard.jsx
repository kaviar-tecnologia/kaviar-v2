import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, LinearProgress, Chip, Button } from '@mui/material';
import { CheckCircle, RadioButtonUnchecked, HourglassEmpty } from '@mui/icons-material';
import { getSetupProgress } from '../../../services/adminAccountingService';

const STEP_LABELS = [
  { key: 'entity', label: 'Empresa cadastrada', tab: 0 },
  { key: 'firm', label: 'Escritório cadastrado', tab: 1 },
  { key: 'accountant', label: 'Membro da equipe cadastrado', tab: 2 },
  { key: 'link', label: 'Vínculo criado', tab: 3 },
  { key: 'invite', label: 'Convite enviado', tab: 2 },
  { key: 'activation', label: 'Conta ativada', tab: null },
];

const NEXT_MESSAGES = {
  CREATE_ENTITY: { text: 'Cadastrar uma empresa', tab: 0, tabName: 'Empresas' },
  CREATE_FIRM: { text: 'Cadastrar um escritório', tab: 1, tabName: 'Escritórios' },
  CREATE_ACCOUNTANT: { text: 'Cadastrar um membro da equipe', tab: 2, tabName: 'Equipe' },
  CREATE_LINK: { text: 'Criar vínculo entre membro da equipe e empresa', tab: 3, tabName: 'Vínculos' },
  SEND_INVITE: { text: 'Enviar convite ao membro', tab: 2, tabName: 'Equipe' },
  AWAIT_ACTIVATION: { text: 'Aguardar ativação da conta pelo membro', tab: null, tabName: null },
  COMPLETE: { text: 'Configuração concluída!', tab: null, tabName: null },
};

export default function SetupProgressCard({ onNavigateTab }) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    getSetupProgress().then(res => setProgress(res.data)).catch(() => {});
  }, []);

  if (!progress) return null;
  if (progress.percentage === 100) return null; // Hide when complete

  const next = NEXT_MESSAGES[progress.nextStep] || NEXT_MESSAGES.COMPLETE;

  return (
    <Card variant="outlined" sx={{ mb: 3, borderColor: '#E5E7EB', bgcolor: '#FAFAFA' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>Progresso da configuração</Typography>
          <Chip label={`${progress.percentage}%`} size="small" sx={{ bgcolor: progress.percentage === 100 ? '#D1FAE5' : '#FEF3C7', color: progress.percentage === 100 ? '#065F46' : '#92400E', fontWeight: 600 }} />
        </Box>
        <LinearProgress variant="determinate" value={progress.percentage} sx={{ mb: 2, height: 6, borderRadius: 3, bgcolor: '#E5E7EB', '& .MuiLinearProgress-bar': { bgcolor: '#B8942E' } }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {STEP_LABELS.map(step => (
            <Box key={step.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {progress.steps[step.key] ? (
                <CheckCircle sx={{ fontSize: 16, color: '#059669' }} />
              ) : step.key === STEP_LABELS.find(s => !progress.steps[s.key])?.key ? (
                <HourglassEmpty sx={{ fontSize: 16, color: '#D97706' }} />
              ) : (
                <RadioButtonUnchecked sx={{ fontSize: 16, color: '#9CA3AF' }} />
              )}
              <Typography variant="caption" sx={{ color: progress.steps[step.key] ? '#374151' : '#6B7280' }}>{step.label}</Typography>
            </Box>
          ))}
        </Box>
        {progress.nextStep !== 'COMPLETE' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ color: '#4B5563' }}>Próximo passo: <strong>{next.text}</strong></Typography>
            {next.tab !== null && onNavigateTab && (
              <Button size="small" variant="outlined" sx={{ ml: 'auto', borderColor: '#B8942E', color: '#B8942E', '&:hover': { borderColor: '#92400E', bgcolor: 'rgba(184,148,46,0.04)' } }} onClick={() => onNavigateTab(next.tab)}>
                Ir para {next.tabName}
              </Button>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
