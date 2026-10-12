import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'yj_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

const api = axios.create({ baseURL: `${API_BASE}/api` });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && getToken() && !err.config.url.includes('/auth/login')) {
      setToken(null);
      if (window.location.pathname.startsWith('/admin')) window.location.href = '/login?expired=1';
    }
    return Promise.reject(err);
  }
);

export const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong';

/** Upload a file, returns its public URL */
export async function uploadFile(file, folder = 'general') {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post(`/upload?folder=${folder}`, fd);
  return data.url;
}

/** Opens a generated PDF (invoice, letter...) in a new tab */
export function openPdf(type, id, download = false) {
  const url = `${API_BASE}/api/documents/${type}/${id}/pdf?token=${getToken()}${download ? '&download=1' : ''}`;
  window.open(url, '_blank');
}

export default api;
