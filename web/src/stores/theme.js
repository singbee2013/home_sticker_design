import { defineStore } from 'pinia'

const KEY = 'decorai-theme'

export const useThemeStore = defineStore('theme', {
  state: () => ({ dark: false }),
  actions: {
    applyInitial() {
      const saved = localStorage.getItem(KEY)
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      this.dark = saved ? saved === 'dark' : !!prefersDark
      this._apply()
    },
    toggle() {
      this.dark = !this.dark
      localStorage.setItem(KEY, this.dark ? 'dark' : 'light')
      this._apply()
    },
    _apply() {
      const html = document.documentElement
      if (this.dark) html.classList.add('dark')
      else html.classList.remove('dark')
    },
  },
})
