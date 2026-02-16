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
    me: () => api.get('/auth/me'),
};

export const filesAPI = {
    list: (parentId = null) => {
        const params = {};
        if (parentId !== null) params.parent_id = parentId;
        return api.get('/files/', { params });
    },
    listPaginated: (parentId = null, limit = 50, offset = 0) => {
        const params = { limit, offset };
        if (parentId !== null) params.parent_id = parentId;
        return api.get('/files/', { params });
    },
    upload: async (formData, onProgress) => {
        const file = formData.get('file');
        const parentId = formData.get('parent_id');

        // Step 1: Get presigned upload URL from backend
        const { data: urlData } = await api.post('/files/upload-url', {
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            parent_id: parentId || null,
        });

        // Step 2: Upload file directly to S3 using presigned URL
        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', urlData.upload_url);
            xhr.setRequestHeader('Content-Type', urlData.content_type);
            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        onProgress({ loaded: e.loaded, total: e.total });
                    }
                };
            }
            xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`S3 upload failed: ${xhr.status}`));
            xhr.onerror = () => reject(new Error('S3 upload network error'));
            xhr.send(file);
        });

        // Step 3: Register the file in the database
        return api.post('/files/register', {
            filename: urlData.filename,
            s3_key: urlData.s3_key,
            size: file.size,
            content_type: urlData.content_type,
            parent_id: parentId || null,
        });
    },
    download: (fileId) => api.get(`/files/download/${fileId}`),
    createFolder: (name, parentId = null) =>
        api.post('/files/folder', { name, parent_id: parentId }),
    delete: (fileId) => api.delete(`/files/${fileId}`),
    rename: (fileId, name) => api.patch(`/files/${fileId}`, { name }),
    editorConfig: (fileId) => api.get(`/files/editor-config/${fileId}`),
    tree: () => api.get('/files/tree'),
    folderPreview: (folderId) => api.get(`/files/folder-preview/${folderId}`),
    search: (query, { parentId = null, includeTrashed = false, limit = 25, offset = 0 } = {}) => {
        const params = { q: query, include_trashed: includeTrashed, limit, offset };
        if (parentId !== null) params.parent_id = parentId;
        return api.get('/files/search', { params });
    },
    createDocument: (name, docType, parentId = null) =>
        api.post('/files/create-document', { name, doc_type: docType, parent_id: parentId }),
    extractZip: (fileId) => api.post(`/files/extract/${fileId}`),
    storage: () => api.get('/files/storage'),
    getContent: (fileId) => api.get(`/files/content/${fileId}`),
    saveContent: (fileId, content) => api.put(`/files/content/${fileId}`, { content }),
    trash: () => api.get('/files/trash'),
    trashPaginated: (limit = 50, offset = 0) => api.get('/files/trash', { params: { limit, offset } }),
    restoreFromTrash: (fileId) => api.post(`/files/trash/restore/${fileId}`),
    emptyTrash: () => api.delete('/files/trash/empty'),
};

export const sharesAPI = {
    create: (fileId, data) => api.post(`/shares/${fileId}`, data),
    list: (fileId) => api.get(`/shares/${fileId}`),
    revoke: (shareId) => api.delete(`/shares/${shareId}`),
    // Public endpoints (no auth) — use raw axios
    publicInfo: (token) => axios.get(`${API_URL}/shares/public/${token}`),
    publicDownload: (token) => axios.get(`${API_URL}/shares/public/${token}/download`),
    publicEditorConfig: (token) => axios.get(`${API_URL}/shares/public/${token}/editor-config`),
    publicContent: (token) => axios.get(`${API_URL}/shares/public/${token}/content`),
};

export default api;


export const adminAPI = {
    users: () => api.get('/admin/users'),
    updateUserStorage: (userId, storageLimit) => api.patch(`/admin/users/${userId}/storage`, { storage_limit: storageLimit }),
    updateAdminProfile: (payload) => api.patch('/admin/settings/profile', payload),
    updateAdminPassword: (payload) => api.patch('/admin/settings/password', payload),
};
