<template>
  <div class="page">
    <div class="toolbar"><el-button @click="load">刷新</el-button></div>
    <div class="gen-panel">
      <el-input v-model="form.title" placeholder="视频标题（可选）" class="w240" />
      <el-input-number v-model="form.duration" :min="3" :max="60" />
      <span class="muted">秒</span>
      <el-button type="primary" :loading="creating" :disabled="picked.length < 1" @click="createTask">创建视频任务</el-button>
    </div>
    <el-alert type="info" :closable="false" title="先在下方候选图里勾选 2-12 张图片，再创建视频任务。" />
    <div class="picker">
      <div v-for="img in candidates" :key="`${img.kind}-${img.id}`" class="pick-card" :class="{ on: picked.includes(img.file_path) }" @click="togglePick(img.file_path)">
        <el-image :src="toStatic(img.file_path)" class="thumb" fit="cover" />
        <div class="cap">{{ img.kind }} #{{ img.id }}</div>
      </div>
    </div>
    <el-table :data="rows" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="title" label="标题" />
      <el-table-column prop="duration" label="时长" width="90" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column label="结果">
        <template #default="{ row }">
          <a v-if="row.result_path" :href="toStatic(row.result_path)" target="_blank">打开视频</a>
          <span v-else>{{ row.error_message || '—' }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
const rows = ref([])
const candidates = ref([])
const picked = ref([])
const creating = ref(false)
const form = ref({ title: '', duration: 10, width: 1080, height: 1920 })
function toStatic(p) { return p ? `/static/${p}` : '' }
function togglePick(p) {
  const idx = picked.value.indexOf(p)
  if (idx >= 0) picked.value.splice(idx, 1)
  else if (picked.value.length < 12) picked.value.push(p)
}
async function load() {
  try { rows.value = await http.get('/video/') } catch { ElMessage.error('加载视频任务失败') }
  try {
    const [materials, scenes, effects] = await Promise.all([
      http.get('/ai/tasks'),
      http.get('/scenes/recent-images', { params: { limit: 30 } }),
      http.get('/effects/recent-images', { params: { limit: 30 } }),
    ])
    const ms = (materials || []).filter((x) => x.result_path).slice(0, 20).map((x) => ({ id: x.id, file_path: x.result_path, kind: '素材' }))
    const ss = ((scenes?.items) || []).slice(0, 20).map((x) => ({ id: x.id, file_path: x.file_path, kind: '场景' }))
    const es = ((effects?.items) || []).slice(0, 20).map((x) => ({ id: x.id, file_path: x.file_path, kind: '效果' }))
    candidates.value = [...ms, ...ss, ...es]
  } catch {
    ElMessage.error('加载候选图失败')
  }
}
async function createTask() {
  if (picked.value.length < 1) return ElMessage.warning('请至少选择 1 张图')
  creating.value = true
  try {
    await http.post('/video/', {
      title: form.value.title || null,
      image_paths: picked.value,
      duration: form.value.duration,
      width: form.value.width,
      height: form.value.height,
    })
    ElMessage.success('视频任务已创建')
    picked.value = []
    await load()
  } finally {
    creating.value = false
  }
}
load()
</script>

<style scoped>
.page { display: grid; gap: 14px; }
.toolbar { display: flex; justify-content: flex-end; align-items: center; }
.gen-panel { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.pick-card { border: 1px solid #ebeef5; border-radius: 8px; padding: 6px; cursor: pointer; background: #fff; }
.pick-card.on { border-color: #409eff; box-shadow: 0 0 0 1px rgba(64, 158, 255, .2); }
.thumb { width: 100%; height: 90px; border-radius: 4px; display: block; }
.cap { font-size: 12px; color: #606266; margin-top: 4px; }
.w240 { width: 240px; }
.muted { color: #909399; font-size: 12px; }
</style>
