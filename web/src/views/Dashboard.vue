<template>
  <div class="dashboard">
    <!-- Greeting + CTA -->
    <div class="header-row">
      <div>
        <h2 class="greet">{{ greeting }}, {{ user.profile?.username || '创作者' }} 👋</h2>
        <p class="muted">欢迎回到 DecorAI 设计平台，今天想创作什么？</p>
      </div>
      <el-button type="primary" size="large" :icon="Plus" @click="$router.push('/ai')">开始创作</el-button>
    </div>

    <!-- Stats -->
    <div class="stats">
      <StatCard v-for="s in stats" :key="s.key" v-bind="s" />
    </div>

    <!-- Quick entries -->
    <div class="section-title">快捷入口</div>
    <div class="quick-grid">
      <QuickEntry v-for="q in quicks" :key="q.to" v-bind="q" @click="$router.push(q.to)" />
    </div>

    <!-- Recent -->
    <div class="recent-grid">
      <div class="card recent">
        <div class="card-head">
          <div><el-icon class="ico"><MagicStick /></el-icon> 最近生成的图案</div>
          <router-link to="/ai" class="link">查看全部 →</router-link>
        </div>
        <div v-if="recentTasks.length" class="recent-list">
          <div v-for="t in recentTasks" :key="t.id" class="recent-item">
            <img v-if="t.result_path" :src="`/static/${t.result_path}`" />
            <div v-else class="placeholder"><el-icon><Picture /></el-icon></div>
            <div class="meta">
              <div class="prompt">{{ t.prompt || '未命名' }}</div>
              <div class="sub">#{{ t.id }} · {{ t.provider }} · {{ t.status }}</div>
            </div>
          </div>
        </div>
        <div v-else class="empty">
          <el-icon class="big"><MagicStick /></el-icon>
          <div>还没有生成过图案</div>
          <el-button @click="$router.push('/ai')">去生成</el-button>
        </div>
      </div>

      <div class="card recent">
        <div class="card-head">
          <div><el-icon class="ico"><Connection /></el-icon> 最近效果图</div>
          <router-link to="/effects" class="link">查看全部 →</router-link>
        </div>
        <div class="empty">
          <el-icon class="big"><Connection /></el-icon>
          <div>还没有合成过效果图</div>
          <el-button @click="$router.push('/effects')">去合成</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Plus, MagicStick, Picture, Connection, VideoCamera, CircleCheck } from '@element-plus/icons-vue'
import StatCard from '@/components/StatCard.vue'
import QuickEntry from '@/components/QuickEntry.vue'
import { useUserStore } from '@/stores/user'
import * as aiApi from '@/api/ai'

const user = useUserStore()
const recentTasks = ref([])

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const stats = computed(() => [
  { key: 'imgs',   label: '已生成图案', value: recentTasks.value.filter(t => t.task_type === 'text2img').length, icon: MagicStick, tone: 'violet' },
  { key: 'fx',     label: '效果图合成', value: 0, icon: Connection, tone: 'blue' },
  { key: 'video',  label: '产品视频',   value: 0, icon: VideoCamera, tone: 'orange' },
  { key: 'doing',  label: '进行中任务', value: recentTasks.value.filter(t => t.status === 'processing' || t.status === 'pending').length, icon: CircleCheck, tone: 'green' },
])

const quicks = [
  { to: '/ai',        title: 'AI 图案生成',       desc: '输入描述或上传参考素材，一键生成高品质图案', icon: MagicStick, tone: 'violet', tag: '核心功能' },
  { to: '/scenes',    title: '场景图库',         desc: '浏览产品场景模板，支持按品类筛选',           icon: Picture,    tone: 'blue' },
  { to: '/effects',   title: '效果图合成',       desc: '将图案贴合到产品场景，生成专业效果图',       icon: Connection, tone: 'green',  tag: '推荐' },
  { to: '/video',     title: '视频合成工作台',   desc: '基于效果图快速生成产品展示视频',             icon: VideoCamera, tone: 'orange' },
]

onMounted(async () => {
  try { recentTasks.value = await aiApi.listTasks() } catch {}
})
</script>

<style lang="scss" scoped>
.dashboard { display: flex; flex-direction: column; gap: 22px; }
.header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.greet { margin: 0; font-size: 24px; font-weight: 700; color: var(--text-primary); }
.muted { margin: 6px 0 0; color: var(--text-tertiary); font-size: 14px; }

.stats {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.section-title { font-size: 13px; color: var(--text-tertiary); margin: 6px 0; }
.quick-grid {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.recent-grid {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  margin-top: 6px;
}

.card {
  background: var(--bg-card); border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg); padding: 18px 20px;
  box-shadow: var(--shadow-card);
}
.card-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 14px;
  .ico { color: var(--brand-500); margin-right: 6px; }
  .link { font-size: 12px; color: var(--text-tertiary); font-weight: normal; }
  .link:hover { color: var(--brand-500); }
}
.recent { min-height: 240px; }
.empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 40px 0; color: var(--text-tertiary); font-size: 13px;
  .big { font-size: 36px; opacity: .35; }
}
.recent-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.recent-item {
  border: 1px solid var(--border-soft); border-radius: var(--radius-sm); overflow: hidden;
  img { width: 100%; height: 110px; object-fit: cover; display: block; }
  .placeholder { height: 110px; display: grid; place-items: center; background: var(--bg-page); color: var(--text-tertiary); font-size: 24px; }
  .meta { padding: 8px 10px; }
  .prompt { font-size: 12px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
}
</style>
