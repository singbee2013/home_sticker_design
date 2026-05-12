<template>
  <div class="placeholder-card">
    <el-icon class="big"><component :is="icon" /></el-icon>
    <h3>{{ title }}</h3>
    <p>该模块已就绪，正在迭代精装版界面，敬请期待 ✨</p>
    <small>API 路径：<code>{{ api }}</code></small>
  </div>
</template>

<script setup>
defineProps({ title: String, api: String, icon: Object })
</script>

<style lang="scss" scoped>
.placeholder-card {
  background: var(--bg-card); border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg); padding: 64px 32px; text-align: center;
  box-shadow: var(--shadow-card);
  .big { font-size: 48px; color: var(--brand-300); margin-bottom: 18px; }
  h3 { margin: 0 0 8px; font-size: 18px; color: var(--text-primary); }
  p  { margin: 0 0 16px; color: var(--text-tertiary); font-size: 14px; }
  small { color: var(--text-tertiary); font-size: 12px;
    code { background: var(--bg-page); padding: 2px 8px; border-radius: 4px; color: var(--brand-500); } }
}
</style>
