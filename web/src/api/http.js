import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

const http = axios.create({
  baseURL: '/api',
  timeout: 300000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (resp) => resp.data,
  (err) => {
    if (err.config?.skipErrorHandler) return Promise.reject(err)
    const status = err.response?.status
    const detail = err.response?.data?.detail || err.message
    if (status === 401) {
      localStorage.removeItem('token')
      ElMessage.error('登录已过期，请重新登录')
      router.replace('/login')
    } else {
      ElMessage.error(typeof detail === 'string' ? detail : JSON.stringify(detail))
    }
    return Promise.reject(err)
  },
)

export default http
