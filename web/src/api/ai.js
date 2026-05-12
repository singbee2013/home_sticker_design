import http from './http'

export const listProviders = () => http.get('/ai/providers')
export const text2img      = (data) => http.post('/ai/text2img', data)
export const listTasks     = () => http.get('/ai/tasks')
export const getTask       = (id) => http.get(`/ai/tasks/${id}`)
export const deleteTask    = (id) => http.delete(`/ai/tasks/${id}`)
// img2img uses multipart upload
export const img2img = (formData) => http.post('/ai/img2img', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
})
