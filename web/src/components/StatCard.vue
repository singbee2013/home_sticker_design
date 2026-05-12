<template>
  <div class="stat-card">
    <div class="left">
      <div class="value">{{ value }}</div>
      <div class="label">{{ label }}</div>
    </div>
    <div class="icon-wrap" :class="`tone-${tone}`">
      <el-icon><component :is="icon" /></el-icon>
    </div>
  </div>
</template>

<script setup>
defineProps({
  label: String, value: [String, Number], icon: Object,
  tone: { type: String, default: 'green' }, // green | violet | blue | orange
})
</script>

<style lang="scss" scoped>
.stat-card {
  background: var(--bg-card); border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg); padding: 22px 22px;
  display: flex; align-items: center; justify-content: space-between;
  box-shadow: var(--shadow-card);
  transition: transform .15s ease, box-shadow .15s ease;
  &:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(15,95,76,.08); }
}
.value { font-size: 30px; font-weight: 700; color: var(--text-primary); line-height: 1; }
.label { margin-top: 8px; font-size: 13px; color: var(--text-tertiary); }
.icon-wrap {
  width: 44px; height: 44px; border-radius: 12px;
  display: grid; place-items: center; font-size: 22px;
  &.tone-violet { background: #F1ECFE; color: #7C5CF5; }
  &.tone-blue   { background: #E6F0FE; color: #2A7BF6; }
  &.tone-orange { background: #FFF1E5; color: #F08A3C; }
  &.tone-green  { background: #E5F5EE; color: #1F9D6E; }
}
html.dark .icon-wrap {
  &.tone-violet { background: rgba(124,92,245,.15); }
  &.tone-blue   { background: rgba(42,123,246,.15); }
  &.tone-orange { background: rgba(240,138,60,.15); }
  &.tone-green  { background: rgba(31,157,110,.18); }
}
</style>
