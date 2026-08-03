import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
    console.error("CRITICAL ERROR: VITE_API_URL is missing from your .env file!");
}

export const BASE_URL = API_URL ? API_URL.replace('/api', '') : '';

const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-CSRF-TOKEN'
});

// Attach the correct token and archive headers to every request
api.interceptors.request.use(
    (config) => {
        let token = null;
        const url = config.url || '';
        const path = window.location.pathname || '';
        
        // Token logic
        if (url.includes('/admin')) {
            token = localStorage.getItem('adminToken');
        } else if (url.includes('/applicant')) {
            token = localStorage.getItem('studentToken');
        } else {
            if (path.includes('/admin') || path.includes('/dashboard')) {
                token = localStorage.getItem('adminToken');
            } else {
                token = localStorage.getItem('studentToken');
            }
        }

        if (token && token !== "undefined") {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // 🛑 NEW: Inject the archive year into the headers for the backend
        const archiveYear = sessionStorage.getItem("archiveViewYear");
        if (archiveYear) {
            config.headers['archiveviewyear'] = archiveYear;
        }

        return config;
    },
    (error) => Promise.reject(error)
);

let isAlertShown = false;

api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        const status = error.response?.status;
        const path = window.location.pathname;
        const isAdminArea = path.includes('admin') || path.includes('dashboard');

        // Log out on expired/invalid tokens and on forbidden admin sessions.
        if (status === 401 || (status === 403 && isAdminArea)) {
            console.warn("Session expired, unauthorized, or forbidden.");

            if (!isAlertShown) {
                isAlertShown = true;

                if (isAdminArea) {
                    localStorage.removeItem('adminToken');
                    window.location.href = '/admin_login';
                } else {
                    localStorage.removeItem('studentToken');
                    window.location.href = '/student_login';
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;
