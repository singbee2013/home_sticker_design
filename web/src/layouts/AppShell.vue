<template>
  <div class="shell">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ collapsed }">
      <div class="brand">
        <div class="brand-logo">
          <svg viewBox="0 0 32 32" width="22" height="22"><rect width="32" height="32" rx="7" fill="#0F5F4C"/><path d="M9 22 L16 8 L23 22 Z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><circle cx="16" cy="18" r="2.5" fill="#3FE0B5"/></svg>
        </div>
        <span class="brand-name" v-show="!collapsed">DecorAI</span>
        <el-button text class="collapse-btn" @click="collapsed = !collapsed" :icon="collapsed ? Expand : Fold" />
      </div>

      <nav class="nav">
        <template v-for="grp in filteredGroups" :key="grp.title">
          <div class="nav-group" v-show="!collapsed">{{ grp.title }}</div>
          <router-link
            v-for="it in grp.items"
            :key="it.to"
            :to="it.to"
            class="nav-item"
            active-class="active"
          >
            <el-icon class="nav-icon"><component :is="it.icon" /></el-icon>
            <span class="nav-label" v-show="!collapsed">{{ it.label }}</span>
          </router-link>
        </template>
      </nav>

      <div class="sidebar-footer" v-show="!collapsed">
        <div class="user-card">
          <div class="avatar">{{ user.initials }}</div>
          <div class="info">
            <div class="name">{{ user.profile?.username || '—' }}</div>
            <div class="email">{{ user.profile?.email || 'kwijfnb@163.com' }}</div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <main class="main">
      <header class="topbar">
        <div class="topbar-title">
          <h1 class="page-heading">
            <span class="title-main">{{ pageTitle }}</span>
            <template v-if="pageSubtitle">
              <span class="title-sep" aria-hidden="true">·</span>
              <span class="title-sub">{{ pageSubtitle }}</span>
            </template>
          </h1>
        </div>
        <div class="topbar-actions">
          <el-button text :icon="theme.dark ? Sunny : Moon" @click="theme.toggle()" circle />
          <el-dropdown trigger="click" @command="onUserCmd">
            <div class="avatar-mini">{{ user.initials }}</div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item>{{ user.profile?.username }}</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <section class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Histogram, MagicStick, Picture, Connection, Brush, Files, Tickets,
  ShoppingCart, Promotion, VideoCamera, User, Moon, Sunny,
  Fold, Expand, Collection,
} from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useThemeStore } from '@/stores/theme'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const theme = useThemeStore()

const collapsed = ref(false)

const groups = [
  { title: '工作台', items: [
    { to: '/dashboard', label: '工作台总览', icon: Histogram },
  ]},
  { title: '创作', items: [
    { to: '/ai',         label: 'AI 图案生成', icon: MagicStick },
    { to: '/scenes',     label: '场景图库',     icon: Picture },
    { to: '/effects',    label: '效果图合成',   icon: Connection },
    { to: '/platforms', label: '电商套图',         icon: ShoppingCart },
    { to: '/history', label: '历史记录', icon: Collection },
  ]},
  { title: '素材', items: [
    { to: '/styles',     label: '风格模板',     icon: Brush },
    { to: '/categories', label: '产品分类',     icon: Files },
    { to: '/numbering',  label: '编号管理',     icon: Tickets },
    { to: '/ads',       label: '广告素材',         icon: Promotion },
    { to: '/video',     label: '视频合成',   icon: VideoCamera },
  ]},
  { title: '管理', items: [
    { to: '/users', label: '权限设置', icon: User },
  ]},
]

const routePermissions = {
  '/ai': 'ai.generate',
  '/scenes': 'scenes.manage',
  '/effects': 'effects.manage',
  '/platforms': 'suites.manage',
  '/history': 'history.view',
  '/ads': 'ads.manage',
  '/video': 'video.manage',
  '/users': 'users.manage',
}

const filteredGroups = computed(() =>
  groups
    .map((grp) => ({
      ...grp,
      items: grp.items.filter((it) => {
        const perm = routePermissions[it.to]
        return !perm || user.hasPermission(perm)
      }),
    }))
    .filter((grp) => grp.items.length > 0),
)

const subtitleMap = {
  dashboard: () => greetingSubtitle.value,
  ai:        '输入描述或上传参考素材，AI 为您生成高品质无缝循环装饰纹样，支持多尺寸规格和自动产品编号',
  scenes:    '产品场景模板，支持按品类筛选',
  effects:   '将图案贴合到产品场景，生成专业效果图',
  styles:    '15+ 全球热销视觉风格，可自由扩展',
  categories:'4 大一级分类，支持无限二级扩展',
  numbering: '工厂编号规则与衍生编号自动关联',
  platforms: 'Amazon / Temu / SHEIN / TikTok Shop / 1688 / 阿里国际站 全平台套图',
  ads:       'Facebook / Instagram / TikTok / 独立站 广告封面',
  video:     '基于效果图快速生成 10–15 秒产品展示视频',
  downloads: '批量下载已整合到历史记录模块',
  history:   '按模块统一查看历史输出：素材图、场景图、效果图、电商套图',
  users:     '账号、角色、审核与权限分配',
}

const greetingSubtitle = computed(() => `欢迎回到 DecorAI 设计平台，今天想创作什么?`)

const pageTitle = computed(() => route.meta.title || 'DecorAI')
const pageSubtitle = computed(() => {
  const v = subtitleMap[route.name]
  return typeof v === 'function' ? v() : v
})

function onUserCmd(cmd) {
  if (cmd === 'logout') {
    user.logout()
    router.replace('/login')
  }
}

onMounted(async () => {
  if (user.token && !user.profile) {
    try { await user.fetchMe() } catch {}
  }
})
</script>

<style lang="scss" scoped>
.shell { display: flex; height: 100vh; background: var(--bg-page); }

.sidebar {
  width: 232px;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  transition: width .2s ease;
  &.collapsed { width: 64px; }
}
.brand {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 18px; height: 60px;
  position: relative;
  .brand-logo { width: 28px; height: 28px; display: grid; place-items: center; }
  .brand-name { font-weight: 700; font-size: 17px; color: var(--text-primary); letter-spacing: .5px; }
  .collapse-btn { position: absolute; right: 6px; opacity: .5; }
}
.nav { flex: 1; overflow-y: auto; padding: 4px 10px 16px; }
.nav-group {
  font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 1px;
  padding: 14px 10px 6px;
}
.nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 12px; margin: 2px 0;
  border-radius: var(--radius-sm);
  color: var(--text-secondary); font-size: 14px;
  cursor: pointer;
  transition: background .15s, color .15s;
  &:hover { background: var(--brand-50); color: var(--brand-500); }
  &.active { background: var(--brand-500); color: #fff;
    .nav-icon { color: #fff; } }
}
html.dark .nav-item:hover { background: rgba(63,224,181,0.08); color: var(--brand-accent); }
.nav-icon { font-size: 17px; }

.sidebar-footer { padding: 12px; border-top: 1px solid var(--border-soft); }
.user-card {
  display: flex; align-items: center; gap: 10px;
  padding: 8px; border-radius: var(--radius-sm);
}
.avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--brand-500); color: #fff;
  display: grid; place-items: center; font-weight: 600; font-size: 13px;
}
.info .name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.info .email { font-size: 11px; color: var(--text-tertiary); }

.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar {
  min-height: 56px; padding: 10px 32px;
  display: flex; align-items: center; justify-content: space-between;
  background: transparent;
}
.topbar-title {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; min-width: 0;
}
.page-heading {
  margin: 0; max-width: 100%;
  font-size: 18px; font-weight: 700; color: var(--text-primary); letter-spacing: -.2px;
  display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 8px;
  line-height: 1.35;
}
.title-main { font-weight: 700; }
.title-sep { color: var(--text-tertiary); font-weight: 400; user-select: none; }
.title-sub { font-size: 13px; color: var(--text-tertiary); font-weight: 400; line-height: 1.35; max-width: min(720px, 100%); }
.topbar-actions { display: flex; align-items: center; gap: 12px; }
.avatar-mini {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--brand-500); color: #fff;
  display: grid; place-items: center; font-weight: 600; cursor: pointer;
}
.content { flex: 1; overflow-y: auto; padding: 4px 32px 32px; }

.fade-enter-active, .fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
