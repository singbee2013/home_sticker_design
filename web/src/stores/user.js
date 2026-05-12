import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    profile: null,
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    displayName: (s) => s.profile?.username || '访客',
    initials: (s) => (s.profile?.username || '?').slice(0, 1).toUpperCase(),
    permissions: (s) => s.profile?.permissions || [],
  },
  actions: {
    async login(username, password) {
      const data = await authApi.login({ username, password })
      this.token = data.access_token
      localStorage.setItem('token', this.token)
      await this.fetchMe()
    },
    async fetchMe() {
      this.profile = await authApi.me()
    },
    logout() {
      this.token = ''
      this.profile = null
      localStorage.removeItem('token')
    },
    hasPermission(code) {
      if (!this.profile) return false
      if (this.profile.is_superadmin) return true
      return (this.profile.permissions || []).includes(code)
    },
  },
})
