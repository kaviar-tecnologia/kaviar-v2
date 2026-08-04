import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom';
import { TextField, Button, Alert, Link, CircularProgress } from '@mui/material';
import AccountantPublicLayout from '../../components/accountant/AccountantPublicLayout';
import { useAccountantAuth } from '../../auth/AccountantAuthContext';
import { sanitizeAccountantReturnTo } from '../../utils/sanitizeReturnTo';

export default function AccountantLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const errorRef = useRef(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAccountantAuth();

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError('');

    try {
      await login(email, password);
      const returnTo = sanitizeAccountantReturnTo(searchParams.get('returnTo'));
      navigate(returnTo, { replace: true });
    } catch (err) {
      const status = err.response?.status;
      if (status === 423) {
        setError('Conta temporariamente bloqueada. Tente novamente mais tarde.');
      } else {
        setError('Email ou senha inválidos.');
      }
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  return (
    <AccountantPublicLayout title="Entrar">
      <form onSubmit={handleSubmit} aria-labelledby="login-title" noValidate>
        {error && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            ref={errorRef}
            tabIndex={-1}
            role="alert"
          >
            {error}
          </Alert>
        )}
        <TextField
          id="login-email"
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
        <TextField
          id="login-password"
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          required
          margin="normal"
          inputProps={{ 'aria-label': 'Senha' }}
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={loading}
          sx={{ mt: 2, mb: 2 }}
        >
          {loading ? <CircularProgress size={24} /> : 'Entrar'}
        </Button>
        <Link
          component={RouterLink}
          to="/contador/esqueci-senha"
          variant="body2"
          underline="hover"
        >
          Esqueci minha senha
        </Link>
      </form>
    </AccountantPublicLayout>
  );
}
