import http from './http'

export const login    = (data) => http.post('/auth/login', data)
export const me       = ()     => http.get('/auth/me')
export const register = (data) => http.post('/auth/register', data)
export const listUsers     = () => http.get('/auth/users')
export const approveUser   = (id) => http.put(`/auth/users/${id}/approve`)
export const deactivateUser= (id) => http.put(`/auth/users/${id}/deactivate`)
export const listPermissionCatalog = () => http.get('/auth/permissions/catalog')
export const getUserPermissions = (id) => http.get(`/auth/users/${id}/permissions`)
export const setUserPermissions = (id, data) => http.put(`/auth/users/${id}/permissions`, data)
export const listAuditLogs = (params = {}) => http.get('/auth/audit-logs', { params })
