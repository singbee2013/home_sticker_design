<template>
  <div class="page">
    <div class="head">
      <el-button @click="clearSelected">清空已选（{{ selectedPaths.length }}）</el-button>
      <el-button type="primary" :disabled="selectedPaths.length < 1" @click="downloadSelected">打包下载已选</el-button>
      <el-button @click="loadAll">刷新</el-button>
    </div>

    <el-tabs v-model="tab" class="tabs">
      <el-tab-pane label="素材图" name="material">
        <div class="grid">
          <div v-for="t in materials" :key="`m-${t.id}`" class="card">
            <div class="check-wrap" v-if="t.result_path">
              <el-checkbox :model-value="selectedPaths.includes(t.result_path)" @change="() => toggleSelected(t.result_path)" />
            </div>
            <div v-if="t.result_path && !fileOk(t)" class="thumb thumb-missing">
              <div class="thumb-missing-inner">原图文件已丢失<br /><small>请重新生成</small></div>
            </div>
            <el-image
              v-else-if="t.result_path"
              :src="toStatic(t.result_path)"
              :preview-src-list="materials.filter(x => x.result_path && fileOk(x)).map(x => toStatic(x.result_path))"
              :initial-index="materials.filter(x => x.result_path && fileOk(x)).findIndex(x => x.id === t.id)"
              class="thumb"
              fit="cover"
            />
            <div class="cap">#{{ t.id }} · {{ t.provider }} · {{ t.status }}</div>
            <div class="desc">{{ t.prompt || '（无文字说明）' }}</div>
            <div class="ops" v-if="t.result_path">
              <el-button size="small" :disabled="!fileOk(t)" @click="downloadFile(toStatic(t.result_path), `material_${t.id}`)">下载原图</el-button>
              <el-button size="small" type="danger" @click="removeMaterial(t.id)">删除</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="场景图" name="scene">
        <div class="grid">
          <div v-for="t in scenes" :key="`s-${t.id}`" class="card">
            <div class="check-wrap">
              <el-checkbox :model-value="selectedPaths.includes(t.file_path)" @change="() => toggleSelected(t.file_path)" />
            </div>
            <div v-if="!fileOk(t)" class="thumb thumb-missing">
              <div class="thumb-missing-inner">原图文件已丢失<br /><small>请重新生成</small></div>
            </div>
            <el-image
              v-else
              :src="toStatic(t.file_path)"
              :preview-src-list="scenes.filter(fileOk).map(x => toStatic(x.file_path))"
              :initial-index="scenes.filter(fileOk).findIndex(x => x.id === t.id)"
              class="thumb"
              fit="cover"
            />
            <div class="cap">#{{ t.id }} · {{ t.category_name || '未分类' }}</div>
            <div class="desc">{{ t.prompt_used || t.title || '（无文字说明）' }}</div>
            <div class="ops">
              <el-button size="small" :disabled="!fileOk(t)" @click="downloadFile(toStatic(t.file_path), `scene_${t.id}`)">下载原图</el-button>
              <el-button size="small" type="danger" @click="removeScene(t.id)">删除</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="效果图" name="effect">
        <div class="grid">
          <div v-for="t in effects" :key="`e-${t.id}`" class="card">
            <div class="check-wrap">
              <el-checkbox :model-value="selectedPaths.includes(t.file_path)" @change="() => toggleSelected(t.file_path)" />
            </div>
            <div v-if="!fileOk(t)" class="thumb thumb-missing">
              <div class="thumb-missing-inner">原图文件已丢失<br /><small>请重新生成</small></div>
            </div>
            <el-image
              v-else
              :src="toStatic(t.file_path)"
              :preview-src-list="effects.filter(fileOk).map(x => toStatic(x.file_path))"
              :initial-index="effects.filter(fileOk).findIndex(x => x.id === t.id)"
              class="thumb"
              fit="cover"
            />
            <div class="cap">#{{ t.id }} · {{ t.category_name || '未分类' }}</div>
            <div class="desc">{{ t.prompt_used || t.title || '（无文字说明）' }}</div>
            <div class="ops">
              <el-button size="small" :disabled="!fileOk(t)" @click="downloadFile(toStatic(t.file_path), `effect_${t.id}`)">下载原图</el-button>
              <el-button size="small" type="danger" @click="removeEffect(t.id)">删除</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="电商套图" name="suite">
        <el-table :data="suites" border>
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="platform_code" label="平台" width="110" />
          <el-table-column prop="status" label="状态" width="100" />
          <el-table-column label="说明" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.product_description || row.title || '—' }}</template>
          </el-table-column>
          <el-table-column label="张数" width="70">
            <template #default="{ row }">{{ row.images?.length || 0 }}</template>
          </el-table-column>
          <el-table-column label="预览" min-width="240">
            <template #default="{ row }">
              <div class="suite-mini-row">
                <div v-for="im in (row.images || []).slice(0, 6)" :key="im.id" class="suite-mini-item">
                  <el-image
                    :src="toStatic(im.file_path)"
                    fit="cover"
                    class="suite-mini"
                    @click="openSuitePreview(row, im.id)"
                  />
                  <el-button size="small" type="danger" class="suite-del" @click.stop="removeSuiteImage(im.id)">删图</el-button>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="danger" @click="removeSuite(row.id)">删记录</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="suitePreviewVisible" title="套图预览" width="860px">
      <div class="suite-preview-wrap">
        <el-button class="nav-btn left" :disabled="suitePreviewList.length <= 1" @click="prevSuitePreview">‹</el-button>
        <img v-if="suitePreviewSrc" :src="suitePreviewSrc" class="suite-preview-img" />
        <el-button class="nav-btn right" :disabled="suitePreviewList.length <= 1" @click="nextSuitePreview">›</el-button>
      </div>
      <div class="preview-index" v-if="suitePreviewList.length > 1">{{ suitePreviewIndex + 1 }} / {{ suitePreviewList.length }}</div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'

const tab = ref('material')
const materials = ref([])
const scenes = ref([])
const effects = ref([])
const suites = ref([])
const selectedPaths = ref([])
const suitePreviewVisible = ref(false)
const suitePreviewList = ref([])
const suitePreviewIndex = ref(0)
const suitePreviewSrc = ref('')

function toStatic(p) {
  return p ? `/static/${p}` : ''
}

/** Backend sets file_exists; default true for older API responses. */
function fileOk(row) {
  if (row?.file_exists === false) return false
  const path = row?.result_path || row?.file_path
  return Boolean(path)
}

async function loadAll() {
  const tasks = [
    async () => {
      const rows = await http.get('/ai/tasks')
      materials.value = [...rows].sort((a, b) => b.id - a.id)
    },
    async () => {
      const r = await http.get('/scenes/recent-images', { params: { limit: 120 } })
      scenes.value = [...(r.items || [])].sort((a, b) => b.id - a.id)
    },
    async () => {
      const r = await http.get('/effects/recent-images', { params: { limit: 120 } })
      effects.value = [...(r.items || [])].sort((a, b) => b.id - a.id)
    },
    async () => {
      const rows = await http.get('/platform-suite/')
      suites.value = [...rows].sort((a, b) => b.id - a.id)
    },
  ]
  const labels = ['素材图', '场景图', '效果图', '电商套图']
  let ok = 0
  for (let i = 0; i < tasks.length; i++) {
    try {
      await tasks[i]()
      ok++
    } catch {
      ElMessage.error(`${labels[i]}记录加载失败（其余分区仍可单独刷新）`)
    }
  }
}

function toggleSelected(path) {
  const idx = selectedPaths.value.indexOf(path)
  if (idx >= 0) selectedPaths.value.splice(idx, 1)
  else selectedPaths.value.push(path)
}

function clearSelected() {
  selectedPaths.value = []
}

async function downloadSelected() {
  if (!selectedPaths.value.length) return
  const resp = await fetch('/api/download/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    body: JSON.stringify({ file_paths: selectedPaths.value }),
  })
  if (!resp.ok) return ElMessage.error('打包下载失败')
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `history_batch_${Date.now()}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function openSuitePreview(row, imageId) {
  const list = (row.images || []).map((x) => ({ id: x.id, src: toStatic(x.file_path) }))
  suitePreviewList.value = list
  const idx = Math.max(0, list.findIndex((x) => x.id === imageId))
  suitePreviewIndex.value = idx
  suitePreviewSrc.value = list[idx]?.src || ''
  suitePreviewVisible.value = true
}

function prevSuitePreview() {
  if (suitePreviewList.value.length <= 1) return
  suitePreviewIndex.value = (suitePreviewIndex.value - 1 + suitePreviewList.value.length) % suitePreviewList.value.length
  suitePreviewSrc.value = suitePreviewList.value[suitePreviewIndex.value].src
}

function nextSuitePreview() {
  if (suitePreviewList.value.length <= 1) return
  suitePreviewIndex.value = (suitePreviewIndex.value + 1) % suitePreviewList.value.length
  suitePreviewSrc.value = suitePreviewList.value[suitePreviewIndex.value].src
}

function downloadFile(url, namePrefix) {
  const a = document.createElement('a')
  a.href = url
  a.download = `${namePrefix}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function removeMaterial(id) {
  try {
    await ElMessageBox.confirm(`确认删除素材图 #${id}？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  await http.delete(`/ai/tasks/${id}`)
  ElMessage.success('已删除')
  await loadAll()
}

async function removeScene(id) {
  try {
    await ElMessageBox.confirm(`确认删除场景图 #${id}？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  await http.delete(`/scenes/images/${id}`)
  ElMessage.success('已删除')
  await loadAll()
}

async function removeEffect(id) {
  try {
    await ElMessageBox.confirm(`确认删除效果图 #${id}？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  await http.delete(`/effects/images/${id}`)
  ElMessage.success('已删除')
  await loadAll()
}

async function removeSuite(id) {
  try {
    await ElMessageBox.confirm(`确认删除电商套图记录 #${id}？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  await http.delete(`/platform-suite/${id}`)
  ElMessage.success('已删除')
  await loadAll()
}

async function removeSuiteImage(id) {
  try {
    await ElMessageBox.confirm(`确认删除套图图片 #${id}？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  await http.delete(`/platform-suite/images/${id}`)
  ElMessage.success('已删除')
  await loadAll()
}

loadAll()
</script>

<style scoped>
.page { display: grid; gap: 12px; }
.head { display: flex; justify-content: flex-end; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.card { position: relative; border: 1px solid #ebeef5; border-radius: 10px; overflow: hidden; background: #fff; }
.check-wrap { position: absolute; top: 6px; right: 6px; z-index: 2; background: rgba(255,255,255,.9); border-radius: 6px; padding: 2px 6px; }
.thumb { width: 100%; aspect-ratio: 1/1; display: block; }
.thumb-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border: 1px dashed #dcdfe6;
  color: #909399;
  font-size: 12px;
  text-align: center;
  line-height: 1.5;
}
.thumb-missing-inner small { color: #c0c4cc; }
.cap { padding: 8px; font-size: 12px; color: #606266; }
.desc { padding: 0 8px 8px; font-size: 12px; color: #909399; min-height: 34px; line-height: 1.4; }
.ops { display: flex; gap: 8px; padding: 0 8px 10px; }
.suite-mini-row { display: flex; gap: 6px; flex-wrap: wrap; }
.suite-mini-item { display: grid; gap: 4px; }
.suite-mini { width: 48px; height: 48px; border-radius: 4px; }
.suite-del { padding: 0 4px; }
.suite-preview-wrap { position: relative; background: #fff; display: flex; justify-content: center; align-items: center; min-height: 380px; }
.suite-preview-img { max-width: 100%; max-height: 72vh; object-fit: contain; background: #fff; }
.nav-btn { position: absolute; z-index: 2; width: 34px; height: 34px; border-radius: 50%; }
.nav-btn.left { left: 12px; }
.nav-btn.right { right: 12px; }
.preview-index { text-align: center; color: #909399; font-size: 12px; margin-top: 8px; }
</style>
