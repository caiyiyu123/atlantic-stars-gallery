import request from './request';
export const getUploadToken = (prefix) => request.post('/images/upload-token', { prefix });
export const registerImage = (data) => request.post('/images', data);
export const uploadLocalImages = (product_id, files) => {
  const formData = new FormData();
  formData.append('product_id', product_id);
  files.forEach(f => formData.append('files', f.raw));
  return request.post('/images/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const updateImageSort = (orders) => request.put('/images/sort', { orders });
export const deleteImage = (id) => request.delete(`/images/${id}`);
export const downloadImages = (product_ids) => {
  return request.post('/images/download', { product_ids }, { responseType: 'blob' });
};
