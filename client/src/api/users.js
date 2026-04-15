import request from './request';
export const getUsers = () => request.get('/users');
export const createUser = (data) => request.post('/users', data);
export const updateUser = (id, data) => request.put(`/users/${id}`, data);
export const resetPassword = (id, newPassword) => request.post(`/users/${id}/reset-password`, { newPassword });
export const deleteUser = (id) => request.delete(`/users/${id}`);
export const transferSuperAdmin = (targetUserId, password) => request.post('/users/transfer-super-admin', { targetUserId, password });
