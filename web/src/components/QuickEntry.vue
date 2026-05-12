<template>
  <div class="quick" @click="$emit('click')">
    <div class="head">
      <div class="icon-wrap" :class="`tone-${tone}`"><el-icon><component :is="icon" /></el-icon></div>
      <span v-if="tag" class="tag">{{ tag }}</span>
    </div>
    <div class="title">{{ title }}</div>
    <div class="desc">{{ desc }}</div>
  </div>
</template>

<script setup>
defineProps({
  title: String, desc: String, icon: Object, tag: String,
  tone: { type: String, default: 'violet' },
})
defineEmits(['click'])
</script>

<style lang="scss" scoped>
.quick {
  background: var(--bg-card); border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg); padding: 18px;
  cursor: pointer; box-shadow: var(--shadow-card);
  transition: transform .15s ease, box-shadow .15s ease, border-color .15s;
  display: flex; flex-direction: column; gap: 12px; min-height: 150px;
  &:hover { transform: translateY(-2px); border-color: var(--brand-300); }
}
.head { display: flex; align-items: center; justify-content: space-between; }
.icon-wrap {
  width: 42px; height: 42px; border-radius: 11px;
  display: grid; place-items: center; font-size: 22px;
  &.tone-violet { background: #F1ECFE; color: #7C5CF5; }
  &.tone-blue   { background: #E6F0FE; color: #2A7BF6; }
  &.tone-green  { background: #E5F5EE; color: #1F9D6E; }
  &.tone-orange { background: #FFF1E5; color: #F08A3C; }
}
html.dark .icon-wrap {
  &.tone-violet { background: rgba(124,92,245,.15); }
  &.tone-blue   { background: rgba(42,123,246,.15); }
  &.tone-green  { background: rgba(31,157,110,.18); }
  &.tone-orange { background: rgba(240,138,60,.15); }
}
.tag {
  font-size: 11px; padding: 3px 8px; border-radius: 99px;
  background: var(--bg-page); color: var(--text-secondary);
}
.title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-top: 4px; }
.desc { font-size: 12.5px; color: var(--text-tertiary); line-height: 1.55; }
</style>
