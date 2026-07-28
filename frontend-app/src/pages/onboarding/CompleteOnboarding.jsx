import { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent
} from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle } from '@mui/icons-material';
import api from '../../api';

const steps = ['Dados Pessoais', 'Bairro e Comunidade', 'Finalização'];

export default function CompleteOnboarding() {
  const [activeStep, setActiveStep] = useState(0);
  const [userType, setUserType] = useState('passenger'); // passenger, driver, guide
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Pré-selecionar tipo baseado na URL
  useEffect(() => {
    const typeFromUrl = searchParams.get('type');
    if (typeFromUrl && ['passenger', 'driver', 'guide'].includes(typeFromUrl)) {
      setUserType(typeFromUrl);
    }
  }, [searchParams, navigate]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    document_cpf: '',
    vehicle_color: '',
    vehicle_model: '',
    vehicle_plate: '',
    neighborhoodId: '',
    communityId: '',
    // Driver specific
    pixKey: '',
    pixKeyType: 'CPF', // CPF, CNPJ, EMAIL, PHONE, RANDOM
    // Guide specific
    isBilingual: false,
    languages: [],
    alsoDriver: false,
    // Terms
    acceptedTerms: false
  });
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [filteredCommunities, setFilteredCommunities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [lgpdAccepted, setLgpdAccepted] = useState(false);

  useEffect(() => {
    loadNeighborhoods();
    loadCommunities();
  }, []);

  const loadNeighborhoods = async () => {
    try {
      const response = await api.get('/api/neighborhoods');
      if (response.data.success) {
        setNeighborhoods(response.data.data);
      }
    } catch (error) {
      console.error('Erro ao carregar bairros:', error);
    }
  };

  const loadCommunities = async () => {
    try {
      const response = { data: { success: true, data: [] } }; // gps-first: legacy public communities removed
      if (response.data.success) {
        setCommunities(response.data.data);
      }
    } catch (error) {
      console.error('Erro ao carregar comunidades:', error);
    }
  };


  // === CLEAN_FORM_VALUES (component scope) ===
  // Valores seguros para o JSX (evita null/undefined)
  const clean = {
    name: formData.name ?? '',
    email: formData.email ?? '',
    phone: formData.phone ?? '',
    password: formData.password ?? '',
    confirmPassword: formData.confirmPassword ?? '',
    document_cpf: formData.document_cpf ?? '',
    vehicle_color: formData.vehicle_color ?? '',
    vehicle_model: formData.vehicle_model ?? '',
    vehicle_plate: formData.vehicle_plate ?? '',
    neighborhoodId: formData.neighborhoodId ?? '',
    communityId: formData.communityId ?? '',
    pixKey: formData.pixKey ?? '',
    pixKeyType: formData.pixKeyType ?? 'CPF',
    isBilingual: !!formData.isBilingual,
    languages: formData.languages ?? [],
    alsoDriver: !!formData.alsoDriver,
    acceptedTerms: !!formData.acceptedTerms,
  };

  const handleNext = () => {
    if (activeStep === steps.length - 1) {
      handleSubmit();
    } else {
      setActiveStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    // Validação mínima por tipo (evita 500 no backend)
    if (userType === 'passenger') {
      if (!clean.name || !clean.email || !clean.phone || !clean.password) {
        setError('Preencha nome, email, telefone e senha.');
        setLoading(false);
        return;
      }
      if (!clean.neighborhoodId) {
        setError('Selecione um bairro.');
        setLoading(false);
        return;
      }
      if (clean.password.length < 6) {
        setError('Senha deve ter pelo menos 6 caracteres.');
        setLoading(false);
        return;
      }
      if (clean.password !== clean.confirmPassword) {
        setError('Senhas não coincidem.');
        setLoading(false);
        return;
      }
      if (!lgpdAccepted) {
        setError('Você deve aceitar os termos LGPD para continuar.');
        setLoading(false);
        return;
      }
    }

    if (userType === 'driver') {
      if (!clean.name || !clean.phone) {
        setError('Preencha nome e telefone.');
        setLoading(false);
        return;
      }
      if (!clean.document_cpf || clean.document_cpf.replace(/\D/g, '').length !== 11) {
        setError('CPF deve ter 11 dígitos.');
        setLoading(false);
        return;
      }
      if (!clean.vehicle_color) {
        setError('Cor do veículo é obrigatória.');
        setLoading(false);
        return;
      }
      if (!clean.neighborhoodId) {
        setError('Selecione um bairro.');
        setLoading(false);
        return;
      }
      if (!clean.acceptedTerms) {
        setError('Você deve aceitar os termos de uso.');
        setLoading(false);
        return;
      }
    }

    if (userType === 'guide') {
      if (!clean.name || !clean.phone || !clean.communityId) {
        setError('Preencha nome, telefone e comunidade.');
        setLoading(false);
        return;
      }
    }

    try {
      let userId;

      // 1. Criar usuário baseado no tipo
      if (userType === 'passenger') {
        const payload = {
          name: clean.name,
          email: clean.email,
          phone: clean.phone,
          password: clean.password,
          neighborhoodId: clean.neighborhoodId,
          communityId: clean.communityId || null, // Backend aceita UUID ou slug
          lgpdAccepted
        };
        console.log('[CADASTRO] Payload enviado:', payload);
        const response = await api.post('/api/passenger/onboarding', payload);
        userId = response.data.data.id;

        // Login automático após cadastro
        try {
          const loginResponse = await api.post('/api/auth/passenger/login', {
            email: clean.email,
            password: clean.password
          });
          
          if (loginResponse.data.success) {
            localStorage.setItem('kaviar_token', loginResponse.data.token);
            localStorage.setItem('kaviar_user', JSON.stringify(loginResponse.data.user));
            
            // Redirect para área do passageiro
            setTimeout(() => {
              navigate('/passageiro/home');
            }, 2000);
          }
        } catch (loginError) {
          console.error('Erro no login automático:', loginError);
        }
      } else if (userType === 'driver') {
        // CADASTRO INICIAL DO MOTORISTA (via /driver/onboarding - público)
        if (!clean.password || clean.password.length < 6) {
          setError('Senha deve ter pelo menos 6 caracteres.');
          setLoading(false);
          return;
        }
        if (clean.password !== clean.confirmPassword) {
          setError('Senhas não coincidem.');
          setLoading(false);
          return;
        }
        if (!clean.neighborhoodId) {
          setError('Bairro é obrigatório.');
          setLoading(false);
          return;
        }

        // 1. Criar motorista com senha (endpoint público)
        const registerResponse = await fetch(`${API_BASE_URL}/api/driver/onboarding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: clean.name,
            email: clean.email,
            phone: clean.phone,
            password: clean.password,
            document_cpf: clean.document_cpf.replace(/\D/g, ''),
            vehicle_color: clean.vehicle_color,
            vehicle_model: clean.vehicle_model || undefined,
            vehicle_plate: clean.vehicle_plate || undefined,
            accepted_terms: true,
            neighborhoodId: clean.neighborhoodId,
            communityId: clean.communityId || undefined,
          })
        });

        const registerData = await registerResponse.json();
        
        if (!registerData.success) {
          setError(registerData.error || 'Erro ao realizar cadastro');
          setLoading(false);
          return;
        }

        userId = registerData.data.id;

        // 2. Auto-login com token retornado
        if (registerData.token) {
          localStorage.setItem('kaviar_driver_token', registerData.token);
          localStorage.setItem('kaviar_driver_data', JSON.stringify(registerData.data));

          setCompleted(true);
          setTimeout(() => {
            navigate('/motorista/status');
          }, 2000);
        } else {
          // Fallback: fazer login manual
          try {
            const loginResponse = await api.post('/api/auth/driver/login', {
              email: clean.email,
              password: clean.password
            });

            const token = loginResponse.data.token;
            const user = loginResponse.data.user;
            
            localStorage.setItem('kaviar_driver_token', token);
            localStorage.setItem('kaviar_driver_data', JSON.stringify(user));

            setCompleted(true);
            setTimeout(() => {
              navigate('/motorista/status');
            }, 2000);
          } catch (loginError) {
            console.error('Erro no login automático:', loginError);
            setError(loginError.response?.data?.error || 'Erro ao fazer login');
            setLoading(false);
            return;
          }
        }
      } else if (userType === 'guide') {
        const response = await api.post('/api/governance/guide', {
          name: clean.name,
          email: clean.email,
          phone: clean.phone,
          communityId: clean.communityId,
          isBilingual: clean.isBilingual,
          languages: clean.languages,
          alsoDriver: clean.alsoDriver
        });
        userId = response.data.data.id;
      }

      setCompleted(true);
    } catch (error) {
      console.error('[CADASTRO] Erro:', error.response?.data || error);
      const apiError = error.response?.data;

      if (apiError?.issues && Array.isArray(apiError.issues)) {
        setError(apiError.issues.map(i => `${i.field}: ${i.message}`).join('\n'));
      } else if (Array.isArray(apiError?.error)) {
        setError(apiError.error.map(e => e.message).join('\n'));
      } else if (typeof apiError?.error === 'string') {
        setError(apiError.error);
      } else if (typeof apiError?.message === 'string') {
        setError(apiError.message);
      } else {
        setError('Erro ao finalizar cadastro. Verifique os dados informados.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (completed) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h4" gutterBottom>
              Cadastro Realizado!
            </Typography>
            <Typography variant="body1" sx={{ mb: 4 }}>
              {userType === 'passenger' 
                ? 'Redirecionando para sua área...' 
                : userType === 'driver'
                ? 'Redirecionando para sua área...'
                : 'Seu cadastro foi enviado para análise. Você receberá um email quando for aprovado.'
              }
            </Typography>
          </CardContent>
        </Card>
      </Container>
    );
  }

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth required>
              <InputLabel>Tipo de Usuário</InputLabel>
              <Select
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
              >
                <MenuItem value="passenger">Passageiro</MenuItem>
                <MenuItem value="driver">Motorista</MenuItem>
                <MenuItem value="guide">Guia Turístico</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Nome Completo"
              value={clean.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={clean.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
              fullWidth
              helperText="Email é obrigatório"
            />
            <TextField
              label="Telefone"
              value={clean.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              fullWidth
            />

            {/* Campos de senha para passageiro E motorista */}
            {(userType === 'passenger' || userType === 'driver') && (
              <>
                <TextField
                  label="Senha"
                  type="password"
                  value={clean.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                  fullWidth
                  helperText="Mínimo 6 caracteres"
                />
                <TextField
                  label="Confirmar Senha"
                  type="password"
                  value={clean.confirmPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  required
                  fullWidth
                />
              </>
            )}

            {/* Bairro obrigatório para passageiro */}
            {userType === 'passenger' && (
              <>
                <FormControl fullWidth required sx={{ mt: 2 }}>
                  <InputLabel>Bairro *</InputLabel>
                  <Select
                    value={clean.neighborhoodId}
                    onChange={(e) => setFormData(prev => ({ ...prev, neighborhoodId: e.target.value }))}
                    required
                  >
                    <MenuItem value="">Selecione um bairro</MenuItem>
                    {neighborhoods.map(neighborhood => (
                      <MenuItem key={neighborhood.id} value={neighborhood.id}>
                        {neighborhood.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label="Comunidade (Opcional)"
                  value={clean.communityId}
                  onChange={(e) => setFormData(prev => ({ ...prev, communityId: e.target.value }))}
                  fullWidth
                  placeholder="Digite o nome da comunidade"
                  helperText="Campo opcional - deixe em branco se não pertencer a nenhuma comunidade"
                  sx={{ mt: 2 }}
                />
              </>
            )}

            {/* Campos específicos para motorista */}
            {userType === 'driver' && (
              <>
                <TextField
                  label="CPF *"
                  value={clean.document_cpf}
                  onChange={(e) => setFormData(prev => ({ ...prev, document_cpf: e.target.value }))}
                  required
                  fullWidth
                  placeholder="000.000.000-00"
                  helperText="CPF é obrigatório"
                  sx={{ mt: 2 }}
                />

                <TextField
                  label="Cor do Veículo *"
                  value={clean.vehicle_color}
                  onChange={(e) => setFormData(prev => ({ ...prev, vehicle_color: e.target.value }))}
                  required
                  fullWidth
                  placeholder="Ex: Branco, Preto, Prata"
                  helperText="Cor do veículo é obrigatória"
                  sx={{ mt: 2 }}
                />

                <TextField
                  label="Modelo do Veículo (opcional)"
                  value={clean.vehicle_model}
                  onChange={(e) => setFormData(prev => ({ ...prev, vehicle_model: e.target.value }))}
                  fullWidth
                  placeholder="Ex: Gol, Uno, HB20"
                  sx={{ mt: 2 }}
                />

                <TextField
                  label="Placa do Veículo (opcional)"
                  value={clean.vehicle_plate}
                  onChange={(e) => setFormData(prev => ({ ...prev, vehicle_plate: e.target.value }))}
                  fullWidth
                  placeholder="Ex: ABC-1234"
                  sx={{ mt: 2 }}
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={clean.acceptedTerms}
                      onChange={(e) => setFormData(prev => ({ ...prev, acceptedTerms: e.target.checked }))}
                      required
                    />
                  }
                  label="Aceito os termos de uso e política de privacidade *"
                  sx={{ mt: 2 }}
                />

                <Typography variant="h6" sx={{ mt: 2 }}>Informações Adicionais</Typography>
                
                <Typography variant="body2" sx={{ mb: 1, mt: 2 }}>
                  Chave PIX para Recebimento
                </Typography>
                <FormControl fullWidth sx={{ mb: 1 }}>
                  <InputLabel>Tipo de Chave</InputLabel>
                  <Select
                    value={clean.pixKeyType}
                    onChange={(e) => setFormData(prev => ({ ...prev, pixKeyType: e.target.value }))}
                  >
                    <MenuItem value="CPF">CPF</MenuItem>
                    <MenuItem value="CNPJ">CNPJ</MenuItem>
                    <MenuItem value="EMAIL">E-mail</MenuItem>
                    <MenuItem value="PHONE">Telefone</MenuItem>
                    <MenuItem value="RANDOM">Chave Aleatória</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Chave PIX"
                  value={clean.pixKey}
                  onChange={(e) => setFormData(prev => ({ ...prev, pixKey: e.target.value }))}
                  fullWidth
                  helperText="* Apenas para visualização. Não será enviado nesta versão."
                />


              </>
            )}

            {/* Campos específicos para guia */}
            {userType === 'guide' && (
              <>
                <Typography variant="h6" sx={{ mt: 2 }}>Informações do Guia</Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={clean.isBilingual}
                      onChange={(e) => setFormData(prev => ({ ...prev, isBilingual: e.target.checked }))}
                    />
                  }
                  label="Sou bilíngue"
                />
                <TextField
                  label="Idiomas (separados por vírgula)"
                  value={clean.languages.join(', ')}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    languages: e.target.value.split(',').map(lang => lang.trim()) 
                  }))}
                  fullWidth
                  placeholder="Português, Inglês, Espanhol"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={clean.alsoDriver}
                      onChange={(e) => setFormData(prev => ({ ...prev, alsoDriver: e.target.checked }))}
                    />
                  }
                  label="Também atuo como motorista"
                />
              </>
            )}
          </Box>
        );
      case 1:
        return (
          <Box>
            {userType === 'driver' && (
              <>
                <FormControl fullWidth sx={{ mb: 2 }} required>
                  <InputLabel>Bairro *</InputLabel>
                  <Select
                    value={clean.neighborhoodId}
                    onChange={(e) => {
                      const neighborhoodId = e.target.value;
                      setFormData(prev => ({ ...prev, neighborhoodId, communityId: '' }));
                      setFilteredCommunities(communities);
                    }}
                    required
                  >
                    <MenuItem value="">Selecione um bairro</MenuItem>
                    {neighborhoods.map(neighborhood => (
                      <MenuItem key={neighborhood.id} value={neighborhood.id}>
                        {neighborhood.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel>Comunidade (Opcional)</InputLabel>
                  <Select
                    value={clean.communityId}
                    onChange={(e) => setFormData(prev => ({ ...prev, communityId: e.target.value }))}
                    disabled={!clean.neighborhoodId}
                  >
                    <MenuItem value="">Nenhuma</MenuItem>
                    {filteredCommunities.map(community => (
                      <MenuItem key={community.id} value={community.id}>
                        {community.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </>
            )}

            {userType === 'passenger' && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  Seus dados de bairro e comunidade já foram preenchidos no passo anterior.
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Clique em "Próximo" para revisar seus dados.
                </Typography>
              </Box>
            )}

            {userType === 'guide' && (
              <TextField
                label="Comunidade (Opcional)"
                value={clean.communityId}
                onChange={(e) => setFormData(prev => ({ ...prev, communityId: e.target.value }))}
                fullWidth
                placeholder="Digite o nome da comunidade"
                helperText="Campo opcional - deixe em branco se não pertencer a nenhuma comunidade"
              />
            )}
          </Box>
        );
      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom align="center">
              Revisão dos Dados
            </Typography>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Typography>Tipo: {userType === 'passenger' ? 'Passageiro' : userType === 'driver' ? 'Motorista' : 'Guia Turístico'}</Typography>
              <Typography>Nome: {clean.name}</Typography>
              {userType !== 'driver' && <Typography>Email: {clean.email}</Typography>}
              <Typography>Telefone: {clean.phone}</Typography>
              <Typography>Bairro: {neighborhoods.find(n => n.id === clean.neighborhoodId)?.name || 'Não selecionado'}</Typography>
              {clean.communityId && (
                <Typography>Comunidade: {clean.communityId}</Typography>
              )}
            </Box>

            {userType === 'passenger' && (
              <Box sx={{ mt: 4, p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="h6" gutterBottom>
                  Consentimento LGPD
                </Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  Para utilizar nossos serviços, precisamos do seu consentimento para processar seus dados pessoais conforme a Lei Geral de Proteção de Dados (LGPD).
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={lgpdAccepted}
                      onChange={(e) => setLgpdAccepted(e.target.checked)}
                      required
                    />
                  }
                  label="Aceito o tratamento dos meus dados pessoais conforme a LGPD"
                />
              </Box>
            )}

            {userType === 'driver' && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>
                Após finalizar, você será direcionado para enviar documentos e aceitar os termos.
              </Typography>
            )}
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom align="center">
          Cadastro KAVIAR
        </Typography>

        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map(label => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error.split('\n').map((msg, i) => (
              <div key={i}>• {msg}</div>
            ))}
          </Alert>
        )}

        {renderStepContent(activeStep)}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
          <Button
            disabled={activeStep === 0}
            onClick={handleBack}
          >
            Voltar
          </Button>
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={loading || (activeStep === steps.length - 1 && userType === 'passenger' && !lgpdAccepted)}
          >
            {activeStep === steps.length - 1 ? 'Finalizar' : 'Próximo'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
