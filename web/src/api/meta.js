import http from './http'
/** Root categories only — use listCategoryTree for admin / secondary UI */
export const listCategories = () => http.get('/categories/')
export const listCategoryTree = () => http.get('/categories/tree')
export const createCategory = (data) => http.post('/categories/', data)
export const updateCategory = (id, data) => http.put(`/categories/${id}`, data)
export const deleteCategory = (id) => http.delete(`/categories/${id}`)
/** @param {{ include_inactive?: boolean }} [params] */
export const listStyles = (params = {}) => http.get('/styles/', { params })
export const createStyle = (data) => http.post('/styles/', data)
export const updateStyle = (id, data) => http.put(`/styles/${id}`, data)
export const deleteStyle = (id) => http.delete(`/styles/${id}`)
/** Merge canonical presets + retire legacy bootstrap styles (one-time per data volume). */
export const ensureStylePresets = () => http.post('/styles/ensure-presets')
export const listScenes     = () => http.get('/scenes/tree')
export const listEffects    = () => http.get('/effects/tree')
export const listNumberingRules = () => http.get('/numbering/rules')
export const listPlatforms  = () => http.get('/platform-suite/platforms')
