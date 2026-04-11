import axios from 'axios';

// Use VITE_API_URL from .env file or default to localhost:8000
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL: API_URL,
    timeout: 15000,
});

// Note: Authorization header is now set by AuthContext when the OIDC token changes,
// rather than reading from localStorage on every request.

export default api;
