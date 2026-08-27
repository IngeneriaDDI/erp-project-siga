import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Access token en memoria (no en localStorage, por seguridad).
let accessToken: string | null = null;
export const tokenStore = {
  get: () => accessToken,
  set: (t: string | null) => {
    accessToken = t;
  },
};

// Tenant activo (solo lo usa un SUPER_ADMIN para operar sobre un tenant).
let activeTenantId: string | null = null;
export const tenantStore = {
  get: () => activeTenantId,
  set: (id: string | null) => {
    activeTenantId = id;
  },
};

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // envía la cookie httpOnly del refresh token
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const tenantId = tenantStore.get();
  if (tenantId) config.headers['X-Tenant-Id'] = tenantId;
  return config;
});

// Refresca el access token usando la cookie (con axios "crudo" para no
// entrar en bucle con este mismo interceptor).
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
    const token: string = res.data.accessToken;
    tokenStore.set(token);
    return token;
  } catch {
    tokenStore.set(null);
    return null;
  }
}

let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthRoute = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

/** Extrae un mensaje de error legible de una respuesta del backend. */
export function getApiErrorMessage(error: unknown, fallback = 'Ocurrió un error'): string {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}
