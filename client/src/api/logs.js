import request from './request';
export const getUserLogs = (userId, page = 1, limit = 50) =>
  request.get(`/logs/${userId}`, { params: { page, limit } });
