import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import accountantApi, { setAccountantAccessToken, clearAccountantAccessToken } from '../services/accountantApi';

const AccountantAuthContext = createContext(null);

const STATUS = {
  BOOTSTRAPPING: 'BOOTSTRAPPING',
  ANONYMOUS: 'ANONYMOUS',
  AUTHENTICATED: 'AUTHENTICATED',
  REFRESHING: 'REFRESHING',
  FORBIDDEN: 'FORBIDDEN',
  LOCKED: 'LOCKED',
  ERROR: 'ERROR',
};

export function AccountantAuthProvider({ children }) {
  const [status, setStatus] = useState(STATUS.BOOTSTRAPPING);
  const [accountant, setAccountant] = useState(null);
  const [error, setError] = useState(null);
  const bootstrapDone = useRef(false);

  const clearSession = useCallback(() => {
    clearAccountantAccessToken();
    setAccountant(null);
    setStatus(STATUS.ANONYMOUS);
    setError(null);
  }, []);

  const bootstrapSession = useCallback(async () => {
    if (bootstrapDone.current) return;
    bootstrapDone.current = true;
    
    try {
      // Try to refresh using HttpOnly cookie
      const refreshRes = await accountantApi.post('/api/accountant/auth/refresh');
      const accessToken = refreshRes.data?.data?.accessToken;
      
      if (!accessToken) {
        clearSession();
        return;
      }
      
      setAccountantAccessToken(accessToken);
      
      // Get accountant data
      const meRes = await accountantApi.get('/api/accountant/auth/me');
      setAccountant(meRes.data?.data || null);
      setStatus(STATUS.AUTHENTICATED);
    } catch (err) {
      const errStatus = err.response?.status;
      if (errStatus === 403) {
        setStatus(STATUS.FORBIDDEN);
        setError('Acesso indisponível');
      } else if (errStatus === 423) {
        setStatus(STATUS.LOCKED);
        setError('Conta temporariamente bloqueada');
      } else {
        // 401 or network error — just anonymous
        clearSession();
      }
    }
  }, [clearSession]);

  useEffect(() => {
    bootstrapSession();
    
    // Listen for session expiry from interceptor
    const handleExpired = () => clearSession();
    window.addEventListener('accountant-session-expired', handleExpired);
    return () => window.removeEventListener('accountant-session-expired', handleExpired);
  }, [bootstrapSession, clearSession]);

  const login = useCallback(async (email, password) => {
    const res = await accountantApi.post('/api/accountant/auth/login', { email, password });
    const accessToken = res.data?.data?.accessToken;
    if (accessToken) {
      setAccountantAccessToken(accessToken);
      // Get accountant info
      const meRes = await accountantApi.get('/api/accountant/auth/me');
      setAccountant(meRes.data?.data || null);
      setStatus(STATUS.AUTHENTICATED);
    }
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await accountantApi.post('/api/accountant/auth/logout');
    } catch {
      // Even if backend fails, clear local state
    }
    clearSession();
  }, [clearSession]);

  const value = {
    status,
    accountant,
    error,
    isBootstrapping: status === STATUS.BOOTSTRAPPING,
    isAuthenticated: status === STATUS.AUTHENTICATED,
    isAnonymous: status === STATUS.ANONYMOUS,
    login,
    logout,
    clearSession,
  };

  return (
    <AccountantAuthContext.Provider value={value}>
      {children}
    </AccountantAuthContext.Provider>
  );
}

export function useAccountantAuth() {
  const context = useContext(AccountantAuthContext);
  if (!context) {
    throw new Error('useAccountantAuth must be used within AccountantAuthProvider');
  }
  return context;
}

export { STATUS as ACCOUNTANT_AUTH_STATUS };
