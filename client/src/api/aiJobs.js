import request from './request';

export const submitAiJobs = (formData) => request.post('/ai-jobs', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const getBatchStatus = (batchId) => request.get(`/ai-jobs/batch/${batchId}`);
export const getJobHistory = (params) => request.get('/ai-jobs/history', { params });
export const retryJob = (id) => request.post(`/ai-jobs/${id}/retry`);
export const deleteJob = (id) => request.delete(`/ai-jobs/${id}`);
export const deleteBatch = (batchId) => request.delete(`/ai-jobs/batch/${batchId}`);
export const getJobUsers = () => request.get('/ai-jobs/users');
