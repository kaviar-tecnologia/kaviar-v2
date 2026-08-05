import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextField, Button, Alert, CircularProgress } from '@mui/material';
import AccountantPublicLayout from '../../components/accountant/AccountantPublicLayout';
import accountantApi from '../../services/accountantApi';

export default function ActivateAccountPage() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const tokenRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/token=([^&]+)/);
    if (match) {
      tokenRef.current = decodeURIComponent(match[1]);
    }
    // Remove fragment immediately
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;

    setError('');

    if (password.length < 15) {
      setError('A senha deve ter no mínimo 15 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }
    if (!tokenRef.current) {
      setError('Token de ativação inválido ou ausente.');
      return;
    }

    submitting.current = true;
    setLoading(true);

    try {
      await accountantApi.post('/api/accountant/auth/activate', {
        token: tokenRef.current,
        password,
        passwordConfirmation: confirmation,
      });
      setSuccess(true);
      tokenRef.current = null; // Discard only on success
      setTimeout(() => navigate('/contador/login', { replace: true }), 3000);
    } catch (err) {
      const msg = err.response?.data?.error;
      if (msg?.includes('expirado') || msg?.includes('expired')) {
        setError('Token expirado. Solicite um novo convite.');
        tokenRef.current = null;
      } else if (msg?.includes('usado') || msg?.includes('used') || msg?.includes('inválido') || msg?.includes('invalid')) {
        setError('Token inválido ou já utilizado.');
        tokenRef.current = null;
      } else if (msg?.includes('Senhas') || msg?.includes('mismatch')) {
        setError('As senhas não conferem.');
      } else if (msg?.includes('senha') || msg?.includes('password') || msg?.includes('15')) {
        setError(msg);
      } else {
        setError(msg || 'Não foi possível ativar a conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  if (success) {
    return (
      <AccountantPublicLayout title="Conta ativada">
        <Alert severity="success">
          Conta ativada com sucesso! Redirecionando para o login...
        </Alert>
      </AccountantPublicLayout>
    );
  }

  return (
    <AccountantPublicLayout title="Ativar conta">
      <form onSubmit={handleSubmit} aria-labelledby="activate-title" noValidate>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert">
            {error}
          </Alert>
        )}
        <TextField
          id="activate-password"
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          required
          margin="normal"
          helperText="Mínimo 15 caracteres"
          inputProps={{ 'aria-label': 'Nova senha', minLength: 15 }}
        />
        <TextField
          id="activate-confirm"
          label="Confirmar senha"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          fullWidth
          required
          margin="normal"
          inputProps={{ 'aria-label': 'Confirmar senha' }}
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={loading}
          sx={{ mt: 2 }}
        >
          {loading ? <CircularProgress size={24} /> : 'Ativar conta'}
        </Button>
      </form>
    </AccountantPublicLayout>
  );
}
