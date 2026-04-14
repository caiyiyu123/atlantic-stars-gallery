import request from './request';
export const getSeasons = () => request.get('/seasons');
export const createSeason = (data) => request.post('/seasons', data);
