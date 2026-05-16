import axios from 'axios';
import toast from 'react-hot-toast';

const AUTH_TOKEN_STORAGE_KEY = 'moban_auth_token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || '未知错误';
    toast.error(`请求失败: ${message}`);
    return Promise.reject(error);
  }
);

export default api;
export { AUTH_TOKEN_STORAGE_KEY };
