import request from './request';
export const getSeries = (params) => request.get('/series', { params });
export const createSeries = (data) => request.post('/series', data);
export const updateSeries = (id, data) => request.put(`/series/${id}`, data);
export const deleteSeries = (id) => request.delete(`/series/${id}`);
