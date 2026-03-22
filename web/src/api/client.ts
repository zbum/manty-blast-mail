import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

export default api;

// Auth
export const getAuthInfo = () => api.get('/auth/info');
export const login = (username: string, password: string) =>
  api.post('/auth/login', { username, password });
export const logout = () => api.post('/auth/logout');
export const getMe = () => api.get('/auth/me');
export const createUser = (username: string, password: string) =>
  api.post('/auth/users', { username, password });
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.put('/auth/password', { current_password: currentPassword, new_password: newPassword });
export const getUsers = () => api.get('/auth/users');
export const deleteUser = (userId: number) => api.delete(`/auth/users/${userId}`);
export const updateUserRole = (userId: number, role: string) =>
  api.put(`/auth/users/${userId}/role`, { role });

// Campaigns
export const getCampaigns = (page = 1) => api.get(`/campaigns?page=${page}`);
export const getCampaign = (id: number) => api.get(`/campaigns/${id}`);
export const createCampaign = (data: any) => api.post('/campaigns', data);
export const updateCampaign = (id: number, data: any) => api.put(`/campaigns/${id}`, data);
export const deleteCampaign = (id: number) => api.delete(`/campaigns/${id}`);

// Recipients
export const uploadRecipients = (id: number, file: File, encoding?: string) => {
  const formData = new FormData();
  formData.append('file', file);
  const params = encoding ? `?encoding=${encodeURIComponent(encoding)}` : '';
  return api.post(`/campaigns/${id}/recipients/upload${params}`, formData);
};
export const addRecipientsManual = (id: number, recipients: any[]) =>
  api.post(`/campaigns/${id}/recipients/manual`, { recipients });
export const getRecipients = (id: number, page = 1, search = '') =>
  api.get(`/campaigns/${id}/recipients?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ''}`);
export const deleteRecipients = (id: number) =>
  api.delete(`/campaigns/${id}/recipients`);
export const deleteRecipient = (campaignId: number, recipientId: number) =>
  api.delete(`/campaigns/${campaignId}/recipients/${recipientId}`);

// Preview
export const previewCampaign = (id: number) => api.post(`/campaigns/${id}/preview`);
export const previewSend = (id: number, email: string, name?: string, variables?: Record<string, string>) =>
  api.post(`/campaigns/${id}/preview/send`, { email, name, variables });

// Reset
export const resetCampaign = (id: number) => api.post(`/campaigns/${id}/reset`);

// Send control
export const startSend = (id: number) => api.post(`/campaigns/${id}/send/start`);
export const pauseSend = (id: number) => api.post(`/campaigns/${id}/send/pause`);
export const resumeSend = (id: number) => api.post(`/campaigns/${id}/send/resume`);
export const cancelSend = (id: number) => api.post(`/campaigns/${id}/send/cancel`);
export const scheduleSend = (id: number, scheduledAt: string) =>
  api.post(`/campaigns/${id}/send/schedule`, { scheduled_at: scheduledAt });
export const cancelSchedule = (id: number) =>
  api.post(`/campaigns/${id}/send/cancel-schedule`);
export const setRate = (id: number, rate: number) =>
  api.put(`/campaigns/${id}/send/rate`, { rate });

// Reports
export const getSendLogs = (id: number, page = 1) =>
  api.get(`/campaigns/${id}/logs?page=${page}`);
export const exportReport = (id: number) =>
  api.get(`/campaigns/${id}/report/export`, { responseType: 'blob' });
export const getDashboard = () => api.get('/dashboard');

// Audit logs
export const getAuditLogs = (page = 1, pageSize = 20) =>
  api.get(`/audit-logs?page=${page}&page_size=${pageSize}`);

// Search
export const globalSearch = (query: string) =>
  api.get(`/search?q=${encodeURIComponent(query)}`);

// Attachments
export const uploadAttachment = (campaignId: number, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/campaigns/${campaignId}/attachments`, formData);
};
export const getAttachments = (campaignId: number) =>
  api.get(`/campaigns/${campaignId}/attachments`);
export const deleteAttachment = (campaignId: number, attachmentId: number) =>
  api.delete(`/campaigns/${campaignId}/attachments/${attachmentId}`);
