<template>
  <div class="page">
    <div class="head">
      <el-button @click="load">刷新候选</el-button>
      <el-button type="primary" :disabled="picked.length < 1" @click="downloadZip">打包下载（{{ picked.length }}）</el-button>
    </div>
    <el-tabs v-model="tab">
      <el-tab-pane label="素材图" name="material">
        <div class="grid">
          <div v-for="x in materials" :key="`m-${x.id}`" class="card" :class="{ on: picked.includes(x.result_path) }" @click="toggle(x.result_path)">
            <el-image :src="toStatic(x.result_path)" class="thumb" fit="cover" />
            <div class="cap">#{{ x.id }}</div>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="场景图" name="scene">
        <div class="grid">
          <div v-for="x in scenes" :key="`s-${x.id}`" class="card" :class="{ on: picked.includes(x.file_path) }" @click="toggle(x.file_path)">
            <el-image :src="toStatic(x.file_path)" class="thumb" fit="cover" />
            <div class="cap">#{{ x.id }}</div>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="效果图" name="effect">
        <div class="grid">
          <div v-for="x in effects" :key="`e-${x.id}`" class="card" :class="{ on: picked.includes(x.file_path) }" @click="toggle(x.file_path)">
            <el-image :src="toStatic(x.file_path)" class="thumb" fit="cover" />
            <div class="cap">#{{ x.id }}</div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'

const tab = ref('material')
const picked = ref([])
const materials = ref([])
const scenes = ref([])
const effects = ref([])

function toStatic(p) { return p ? `/static/${p}` : '' }
function toggle(p) {
  const idx = picked.value.indexOf(p)
  if (idx >= 0) picked.value.splice(idx, 1)
  else picked.value.push(p)
}

async function load() {
  const [m, s, e] = await Promise.all([
    http.get('/ai/tasks'),
    http.get('/scenes/recent-images', { params: { limit: 120 } }),
    http.get('/effects/recent-images', { params: { limit: 120 } }),
  ])
  materials.value = (m || []).filter((x) => x.result_path).slice(0, 120)
  scenes.value = (s.items || []).slice(0, 120)
  effects.value = (e.items || []).slice(0, 120)
}

async function downloadZip() {
  if (!picked.value.length) return
  const resp = await fetch('/api/download/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    body: JSON.stringify({ file_paths: picked.value }),
  })
  if (!resp.ok) return ElMessage.error('打包下载失败')
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `batch_${Date.now()}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

load().catch(() => ElMessage.error('加载下载候选失败'))
</script>
<style scoped>
.page { display: grid; gap: 12px; }
.head { display: flex; justify-content: flex-end; gap: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.card { border: 1px solid #ebeef5; border-radius: 8px; padding: 6px; cursor: pointer; }
.card.on { border-color: #409eff; box-shadow: 0 0 0 1px rgba(64, 158, 255, .2); }
.thumb { width: 100%; aspect-ratio: 1 / 1; display: block; border-radius: 4px; }
.cap { font-size: 12px; color: #606266; margin-top: 4px; }
</style>
