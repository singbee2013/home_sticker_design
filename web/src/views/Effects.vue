<template>
  <div class="page">
    <div class="head">
      <el-button @click="loadAll">刷新</el-button>
    </div>

    <el-alert type="info" :closable="false" show-icon class="tip"
              title="选择一张「印刷素材」图案 + 1～10 张场景图：系统将尝试把素材贴合到墙面 / 地面 / 窗户等合理表面（Gemini 双图合成）。结果保存在效果图分类中。" />

    <div class="panel compose">
      <div class="row">
        <div class="lbl">素材图（印刷文件）</div>
        <el-upload accept="image/*" :auto-upload="false" :limit="1" :on-change="(f) => (matFile = f.raw)">
          <el-button size="small">选择素材图</el-button>
          <span class="fn">{{ matFile?.name || '未选择' }}</span>
        </el-upload>
      </div>
      <div class="row">
        <div class="lbl">输出到效果图分类</div>
        <el-select v-model="effectCatId" filterable placeholder="选择分类" class="w320">
          <el-option v-for="c in flatEffectCats" :key="c.id" :label="c._label" :value="c.id" />
        </el-select>
      </div>
      <div class="row">
        <div class="lbl">生图模型</div>
        <el-select v-model="provider" placeholder="选择模型" class="w320">
          <el-option v-for="p in providers" :key="p" :label="providerLabel(p)" :value="p" />
        </el-select>
      </div>
      <div class="row">
        <div class="lbl">贴合提示（可选）</div>
        <el-input v-model="placementHint" placeholder="例：贴在客厅主沙发背后的墙面中央，略微俯视" class="wfull" />
      </div>
      <div class="row">
        <div class="lbl">成品尺寸(cm)</div>
        <el-input-number v-model="productWidthCm" :min="1" :max="2000" :step="1" controls-position="right" />
        <span class="muted tiny">×</span>
        <el-input-number v-model="productHeightCm" :min="1" :max="2000" :step="1" controls-position="right" />
        <span class="muted tiny">宽 × 高</span>
      </div>
      <div class="row">
        <div class="lbl">花型单元(cm)</div>
        <el-input-number v-model="tileWidthCm" :min="0.1" :max="2000" :step="0.1" controls-position="right" />
        <span class="muted tiny">×</span>
        <el-input-number v-model="tileHeightCm" :min="0.1" :max="2000" :step="0.1" controls-position="right" />
        <span class="muted tiny">宽 × 高</span>
      </div>
      <div class="row">
        <div class="lbl">目标表面类型</div>
        <el-select v-model="targetSurfaceType" class="w320">
          <el-option label="墙面（默认）" value="wall" />
          <el-option label="地面" value="floor" />
          <el-option label="窗面/玻璃" value="window" />
          <el-option label="厨房挡板" value="backsplash" />
          <el-option label="自动判断" value="auto" />
        </el-select>
      </div>
      <div class="row">
        <div class="lbl">按原尺寸平铺</div>
        <el-switch v-model="keepPatternScale" />
        <span class="muted tiny">开启后尽量按原始花型比例平铺，避免单张素材被过度拉伸放大</span>
      </div>
      <div class="row">
        <div class="lbl">铺满目标区域</div>
        <el-switch v-model="fillTargetSurface" />
        <span class="muted tiny">开启后会要求铺满整块墙面/地面，不再只贴一片</span>
      </div>
      <div class="row">
        <div class="lbl">场景图（最多 10 张）</div>
        <el-select v-model="sceneCategoryId" filterable placeholder="先选择场景二级品类" class="w320">
          <el-option v-for="c in sceneCategoryOptions" :key="c.id" :label="c._label" :value="c.id" />
        </el-select>
        <el-button size="small" @click="loadScenePicker">加载候选场景</el-button>
        <span class="muted tiny">按所选二级品类加载对应场景图</span>
      </div>
      <div v-if="scenePick.length" class="picker">
        <div
          v-for="s in scenePick"
          :key="s.id"
          class="pick-cell pick-box"
          :class="{ selected: pickedSceneIds.includes(s.id) }"
          @click="toggleScenePick(s.id)"
        >
          <el-image :src="toStatic(s.file_path)" class="pv" fit="cover" />
          <span class="sn">#{{ s.id }} · {{ s.category_name || '' }}</span>
        </div>
      </div>
      <el-button type="primary" :loading="busy"
                 :disabled="!matFile || !effectCatId || pickedSceneIds.length < 1 || pickedSceneIds.length > 10"
                 @click="runComposite">
        开始合成（{{ pickedSceneIds.length }} 张场景）
      </el-button>
    </div>

    <div class="layout">
      <div class="panel narrow">
        <div class="sec-title">效果图分类</div>
        <el-tree
          :data="tree"
          node-key="id"
          :props="{ label: 'name', children: 'children' }"
          highlight-current
          default-expand-all
          @node-click="onNodeClick"
        />
      </div>
      <div class="panel wide">
        <div class="sec-title">当前分类输出</div>
        <div v-if="images.length" class="grid">
          <div v-for="img in images" :key="img.id" class="card">
            <el-image
              :src="toStatic(img.file_path)"
              :preview-src-list="images.map((i) => toStatic(i.file_path))"
              :initial-index="images.findIndex((x) => x.id === img.id)"
              fit="cover"
              class="thumb"
            />
            <div class="cap">
              <div class="txt" :title="img.prompt_used || img.title">{{ img.prompt_used || img.title || '—' }}</div>
              <div class="acts">
                <el-button type="primary" link size="small" @click="dl(img)">下载</el-button>
                <el-button type="danger" link size="small" @click="rm(img)">删除</el-button>
              </div>
            </div>
          </div>
        </div>
        <el-empty v-else description="请选择左侧分类查看合成结果" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { defaultProviderIfGeminiAvailable, sortProvidersGeminiFirst } from '@/utils/aiProviders'

const tree = ref([])
const images = ref([])
const selectedEffectCatId = ref(null)
const flatEffectCats = ref([])
const sceneCategoryTree = ref([])
const sceneCategoryOptions = ref([])
const sceneCategoryId = ref(null)
const scenePick = ref([])
const ENABLED_PROVIDERS = ['gemini', 'siliconflow', 'wanxiang']
const pickedSceneIds = ref([])
const matFile = ref(null)
const effectCatId = ref(null)
const placementHint = ref('')
const productWidthCm = ref(null)
const productHeightCm = ref(null)
const tileWidthCm = ref(null)
const tileHeightCm = ref(null)
const targetSurfaceType = ref('wall')
const keepPatternScale = ref(true)
const fillTargetSurface = ref(true)
const providers = ref([])
const provider = ref('gemini')
const busy = ref(false)

function providerLabel(p) {
  const map = { gemini: 'Gemini', siliconflow: 'SiliconFlow', wanxiang: '通义万相', mock: 'Mock' }
  return map[p] || p
}

function flattenCats(nodes, prefix = '', acc = []) {
  for (const n of nodes || []) {
    const label = prefix ? `${prefix} / ${n.name}` : n.name
    acc.push({ ...n, _label: label })
    if (n.children?.length)
      flattenCats(n.children, label, acc)
  }
  return acc
}

function flattenSceneSecondary(nodes, prefix = '', acc = []) {
  for (const n of nodes || []) {
    const label = prefix ? `${prefix} / ${n.name}` : n.name
    if (n.parent_id != null)
      acc.push({ ...n, _label: label })
    if (n.children?.length)
      flattenSceneSecondary(n.children, label, acc)
  }
  return acc
}

function findFirstNamedId(nodes, name) {
  for (const n of nodes || []) {
    if (n.name === name) return n.id
    const id = findFirstNamedId(n.children, name)
    if (id) return id
  }
  return null
}

function toStatic(p) {
  return p ? `/static/${p}` : ''
}

async function loadAll() {
  try {
    tree.value = await http.get('/effects/tree')
    flatEffectCats.value = flattenCats(tree.value)
    const def = findFirstNamedId(tree.value, '合成效果图')
    if (!effectCatId.value && def)
      effectCatId.value = def
  } catch {
    ElMessage.error('加载效果分类失败')
  }
  try {
    sceneCategoryTree.value = await http.get('/scenes/tree')
    sceneCategoryOptions.value = flattenSceneSecondary(sceneCategoryTree.value)
    if (!sceneCategoryId.value && sceneCategoryOptions.value.length)
      sceneCategoryId.value = sceneCategoryOptions.value[0].id
  } catch {
    ElMessage.error('加载场景分类失败')
  }
  try {
    const r = await http.get('/ai/providers')
    const raw = (r.providers || []).filter((x) => ENABLED_PROVIDERS.includes(x))
    providers.value = sortProvidersGeminiFirst(raw)
    provider.value = defaultProviderIfGeminiAvailable(providers.value)
  } catch {
    providers.value = ['gemini']
    provider.value = 'gemini'
  }
}

async function loadScenePicker() {
  if (!sceneCategoryId.value) {
    ElMessage.warning('请先选择场景二级品类')
    return
  }
  try {
    const rows = await http.get(`/scenes/${sceneCategoryId.value}/images`)
    scenePick.value = [...(rows || [])].sort((a, b) => b.id - a.id)
    pickedSceneIds.value = []
    ElMessage.success(`已加载 ${scenePick.value.length} 张候选场景`)
  } catch {
    ElMessage.error('加载场景候选失败')
  }
}

function toggleScenePick(id) {
  const has = pickedSceneIds.value.includes(id)
  if (has) {
    pickedSceneIds.value = pickedSceneIds.value.filter((x) => x !== id)
    return
  }
  if (pickedSceneIds.value.length >= 10) {
    ElMessage.warning('最多选择 10 张场景图')
    return
  }
  pickedSceneIds.value = [...pickedSceneIds.value, id]
}

async function onNodeClick(node) {
  selectedEffectCatId.value = node.id
  try {
    const rows = await http.get(`/effects/${node.id}/images`)
    images.value = [...rows].sort((a, b) => b.id - a.id)
  } catch {
    ElMessage.error('加载效果图失败')
  }
}

async function runComposite() {
  busy.value = true
  try {
    const fd = new FormData()
    fd.append('file', matFile.value)
    fd.append('effect_category_id', String(effectCatId.value))
    fd.append('scene_ids', pickedSceneIds.value.join(','))
    fd.append('placement_hint', placementHint.value || '')
    if (productWidthCm.value) fd.append('product_width_cm', String(productWidthCm.value))
    if (productHeightCm.value) fd.append('product_height_cm', String(productHeightCm.value))
    if (tileWidthCm.value) fd.append('tile_width_cm', String(tileWidthCm.value))
    if (tileHeightCm.value) fd.append('tile_height_cm', String(tileHeightCm.value))
    fd.append('target_surface_type', targetSurfaceType.value || 'wall')
    fd.append('keep_pattern_scale', keepPatternScale.value ? 'true' : 'false')
    fd.append('fill_target_surface', fillTargetSurface.value ? 'true' : 'false')
    fd.append('provider', provider.value || '')
    await http.post('/effects/composite', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    ElMessage.success('合成完成')
    const rows = await http.get(`/effects/${effectCatId.value}/images`)
    images.value = [...rows].sort((a, b) => b.id - a.id)
  } finally {
    busy.value = false
  }
}

async function dl(img) {
  const url = toStatic(img.file_path)
  const resp = await fetch(url)
  const blob = await resp.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `effect_${img.id}.png`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function rm(img) {
  try {
    await ElMessageBox.confirm('删除该效果图？', '确认', { type: 'warning' })
  } catch {
    return
  }
  await http.delete(`/effects/images/${img.id}`)
  ElMessage.success('已删除')
  if (selectedEffectCatId.value) {
    const rows = await http.get(`/effects/${selectedEffectCatId.value}/images`)
    images.value = [...rows].sort((a, b) => b.id - a.id)
  }
}

loadAll()
</script>

<style scoped>
.page { display: grid; gap: 14px; }
.head { display: flex; align-items: center; justify-content: space-between; }
.tip { margin-bottom: 0; }
.compose { background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 14px; display: grid; gap: 12px; }
.row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.lbl { width: 140px; font-size: 13px; color: #606266; flex-shrink: 0; }
.fn { margin-left: 10px; font-size: 12px; color: #909399; }
.w320 { min-width: 260px; flex: 1; max-width: 420px; }
.wfull { flex: 1; min-width: 200px; }
.muted.tiny { font-size: 12px; color: #909399; }
.picker { max-height: 320px; overflow: auto; border: 1px dashed #dcdfe6; border-radius: 8px; padding: 10px; }
.picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.pick-cell { margin: 0; cursor: pointer; }
.pick-box { width: 100%; border: 1px solid #ebeef5; border-radius: 8px; padding: 6px; margin-right: 0; transition: all .15s ease; }
.pick-box.selected { border-color: #409eff; box-shadow: 0 0 0 1px rgba(64,158,255,.25); background: rgba(64,158,255,.04); }
.pv { width: 100%; height: 104px; border-radius: 4px; display: block; margin: 0 0 6px; }
.sn { display: block; font-size: 11px; color: #909399; line-height: 1.35; }
.layout { display: grid; grid-template-columns: 260px 1fr; gap: 14px; }
@media (max-width: 960px) {
  .layout { grid-template-columns: 1fr; }
}
.panel { background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 12px; min-height: 240px; }
.sec-title { font-weight: 600; margin-bottom: 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.card { border: 1px solid #ebeef5; border-radius: 10px; overflow: hidden; }
.thumb { width: 100%; aspect-ratio: 1/1; }
.cap { padding: 8px 10px; font-size: 12px; display: grid; gap: 6px; }
.txt { line-height: 1.4; max-height: 3em; overflow: hidden; color: #303133; }
.acts { display: flex; justify-content: flex-end; gap: 8px; }
</style>
