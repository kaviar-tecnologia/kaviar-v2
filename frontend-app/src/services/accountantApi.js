import axios from 'axios';
import { API_BASE_URL } from '../config/api';

const accountantApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true, // Send HttpOnly cookie
  headers: { 'Content-Type': 'application/json' },
});

// Token is injected by the auth provider (never from storage)
let accessTokenRef = null;

export function setAccountantAccessToken(token) {
  accessTokenRef = token;
}

export function clearAccountantAccessToken() {
  accessTokenRef = null;
}

// Auth routes that should NOT trigger refresh on 401
const NO_RETRY_PATHS = ['/api/accountant/auth/login', '/api/accountant/auth/activate', '/api/accountant/auth/refresh', '/api/accountant/auth/forgot-password', '/api/accountant/auth/reset-password'];

// Request interceptor: add bearer token
accountantApi.interceptors.request.use((config) => {
  if (accessTokenRef) {
    config.headers.Authorization = `Bearer ${accessTokenRef}`;
  }
  return config;
});

// Response interceptor: handle 401 with refresh
let refreshPromise = null;

accountantApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const url = originalRequest?.url || '';
    
    // Don't retry auth routes or already-retried requests
    if (status === 401 && !originalRequest._retry && !NO_RETRY_PATHS.some(p => url.includes(p))) {
      originalRequest._retry = true;
      
      try {
        // Use shared refresh promise (only one refresh at a time)
        if (!refreshPromise) {
          refreshPromise = accountantApi.post('/api/accountant/auth/refresh').finally(() => {
            refreshPromise = null;
          });
        }
        
        const refreshResult = await refreshPromise;
        const newToken = refreshResult.data?.data?.accessToken;
        
        if (newToken) {
          setAccountantAccessToken(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return accountantApi(originalRequest);
        }
      } catch (refreshError) {
        clearAccountantAccessToken();
        // Dispatch custom event for auth provider to handle
        window.dispatchEvent(new CustomEvent('accountant-session-expired'));
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export default accountantApi;
