import request from './request';

export const getApiKeys = () => request.get('/api-keys');
export const createApiKey = (data) => request.post('/api-keys', data);
export const updateApiKey = (id, data) => request.put(`/api-keys/${id}`, data);
export const deleteApiKey = (id) => request.delete(`/api-keys/${id}`);
export const testApiKey = (id) => request.post(`/api-keys/${id}/test`);
