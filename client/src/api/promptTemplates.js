import request from './request';

export const getPromptTemplates = () => request.get('/prompt-templates');
export const createPromptTemplate = (data) => request.post('/prompt-templates', data);
export const updatePromptTemplate = (id, data) => request.put(`/prompt-templates/${id}`, data);
export const deletePromptTemplate = (id) => request.delete(`/prompt-templates/${id}`);
export const setDefaultTemplate = (id) => request.post(`/prompt-templates/${id}/set-default`);
