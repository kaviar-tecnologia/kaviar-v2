import React, { useState, useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { TextField, Button, Alert, Link, CircularProgress } from '@mui/material';
import AccountantPublicLayout from '../../components/accountant/AccountantPublicLayout';
import accountantApi from '../../services/accountantApi';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);

    try {
      await accountantApi.post('/api/accountant/auth/forgot-password', { email });
    } catch {
      // Always show generic message regardless of result
    } finally {
      setSent(true);
      setLoading(false);
      submitting.current = false;
    }
  };

  if (sent) {
    return (
      <AccountantPublicLayout title="Verifique seu email">
        <Alert severity="success" sx={{ mb: 2 }}>
          Se o email existir em nossa base, enviaremos instruções para redefinir sua senha.
        </Alert>
        <Link
          component={RouterLink}
          to="/contador/login"
          variant="body2"
          underline="hover"
        >
          Voltar ao login
        </Link>
      </AccountantPublicLayout>
    );
  }

  return (
    <AccountantPublicLayout title="Esqueci minha senha">
      <form onSubmit={handleSubmit} aria-labelledby="forgot-title" noValidate>
        <TextField
          id="forgot-email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          required
          margin="normal"
          inputProps={{ 'aria-label': 'Email' }}
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={loading}
          sx={{ mt: 2, mb: 2 }}
        >
          {loading ? <CircularProgress size={24} /> : 'Enviar instruções'}
        </Button>
        <Link
          component={RouterLink}
          to="/contador/login"
          variant="body2"
          underline="hover"
        >
          Voltar ao login
        </Link>
      </form>
    </AccountantPublicLayout>
  );
}
