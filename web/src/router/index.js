import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('@/layouts/AppShell.vue'),
    children: [
      { path: '',           redirect: '/dashboard' },
      { path: 'dashboard',  name: 'dashboard',  component: () => import('@/views/Dashboard.vue'),   meta: { title: '工作台总览' } },
      { path: 'ai',         name: 'ai',         component: () => import('@/views/AIGenerate.vue'),  meta: { title: 'AI 图案生成' } },
      { path: 'scenes',     name: 'scenes',     component: () => import('@/views/Scenes.vue'),      meta: { title: '场景图库' } },
      { path: 'effects',    name: 'effects',    component: () => import('@/views/Effects.vue'),     meta: { title: '效果图合成' } },
      { path: 'styles',     name: 'styles',     component: () => import('@/views/Styles.vue'),      meta: { title: '风格模板' } },
      { path: 'categories', name: 'categories', component: () => import('@/views/Categories.vue'),  meta: { title: '产品分类' } },
      { path: 'numbering',  name: 'numbering',  component: () => import('@/views/Numbering.vue'),   meta: { title: '编号管理' } },
      { path: 'platforms',  name: 'platforms',  component: () => import('@/views/Platforms.vue'),   meta: { title: '电商套图' } },
      { path: 'ads',        name: 'ads',        component: () => import('@/views/Ads.vue'),         meta: { title: '广告素材' } },
      { path: 'video',      name: 'video',      component: () => import('@/views/Video.vue'),       meta: { title: '视频合成工作台' } },
      { path: 'downloads',  name: 'downloads',  redirect: '/history', meta: { title: '批量下载' } },
      { path: 'history',    name: 'history',    component: () => import('@/views/History.vue'),     meta: { title: '历史记录' } },
      { path: 'users',      name: 'users',      component: () => import('@/views/Users.vue'),       meta: { title: '权限设置' } },
    ],
  },
]

const router = createRouter({ history: createWebHistory(), routes })

router.onError((err) => {
  const msg = err?.message || String(err)
  if (
    msg.includes('Failed to fetch dynamically imported module')
    || msg.includes('Importing a module script failed')
    || msg.includes('error loading dynamically imported module')
  ) {
    window.location.assign(window.location.href)
  }
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  if (!to.meta.public && !token) return { name: 'login', query: { r: to.fullPath } }
  if (to.name === 'login' && token) return { name: 'dashboard' }
  return true
})

export default router
