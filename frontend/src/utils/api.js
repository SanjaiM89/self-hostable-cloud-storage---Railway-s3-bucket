import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL: API_URL,
});

// Attach token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 - redirect to login
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export const authAPI = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
};

export const filesAPI = {
    list: (parentId = null) => {
        const params = {};
        if (parentId !== null) params.parent_id = parentId;
        return api.get('/files/', { params });
    },
    upload: (formData, onProgress) =>
        api.post('/files/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: onProgress,
        }),
    download: (fileId) => api.get(`/files/download/${fileId}`),
    createFolder: (name, parentId = null) =>
        api.post('/files/folder', { name, parent_id: parentId }),
    delete: (fileId) => api.delete(`/files/${fileId}`),
    rename: (fileId, name) => api.patch(`/files/${fileId}`, { name }),
    editorConfig: (fileId) => api.get(`/files/editor-config/${fileId}`),
    tree: () => api.get('/files/tree'),
    folderPreview: (folderId) => api.get(`/files/folder-preview/${folderId}`),
    createDocument: (name, docType, parentId = null) =>
        api.post('/files/create-document', { name, doc_type: docType, parent_id: parentId }),
    extractZip: (fileId) => api.post(`/files/extract/${fileId}`),
    storage: () => api.get('/files/storage'),
};

export const sharesAPI = {
    create: (fileId, data) => api.post(`/shares/${fileId}`, data),
    list: (fileId) => api.get(`/shares/${fileId}`),
    revoke: (shareId) => api.delete(`/shares/${shareId}`),
    // Public endpoints (no auth) — use raw axios
    publicInfo: (token) => axios.get(`${API_URL}/shares/public/${token}`),
    publicDownload: (token) => axios.get(`${API_URL}/shares/public/${token}/download`),
    publicEditorConfig: (token) => axios.get(`${API_URL}/shares/public/${token}/editor-config`),
};

export default api;
