<template>
  <div class="page">
    <div class="head">
      <el-button @click="loadAll">刷新</el-button>
    </div>

    <el-alert type="info" :closable="false" show-icon class="tip"
              title="在线生成真实生活场景或数码白底场景图；每条记录下方保存生成指令，便于复现与迭代。" />

    <div class="layout">
      <div class="panel narrow">
        <div class="sec-title">分类</div>
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
        <div class="sec-title">生成 / 上传（当前分类 ID：{{ selectedCatId ?? '未选择' }}）</div>

        <div class="gen-bar">
          <el-select v-model="gen.provider" class="w320" placeholder="生图模型">
            <el-option v-for="p in providers" :key="p" :label="providerLabel(p)" :value="p" />
          </el-select>
          <el-radio-group v-model="gen.mode" size="small">
            <el-radio-button label="lifestyle" value="lifestyle">真实生活场景</el-radio-button>
            <el-radio-button label="studio_white" value="studio_white">数码白底商品棚拍</el-radio-button>
          </el-radio-group>
          <el-input v-model="gen.prompt" type="textarea" :rows="3" maxlength="1200" show-word-limit placeholder="精确描述场景光线、空间、国家风格、陈列道具…" />
          <div class="presets">
            <span class="plabel">参考指令（点击填入）：</span>
            <el-tag v-for="(p, idx) in presets" :key="idx" class="ptag" @click="gen.prompt = p">{{ p.slice(0, 18) }}…</el-tag>
          </div>
          <el-radio-group v-model="gen.count" size="small">
            <el-radio-button v-for="n in [1,2,3,4,5,6,7,8,9,10]" :key="n" :label="n" :value="n" />
          </el-radio-group>
          <el-button type="primary" :loading="gen.loading" :disabled="!selectedCatId || !gen.prompt.trim()" @click="runGenerate">
            AI 生成场景（{{ gen.count }} 张）
          </el-button>
        </div>

        <el-divider />
        <div class="sec-title">上传到当前分类</div>
        <el-upload drag accept="image/*" :auto-upload="false" :limit="3" multiple :on-change="onUploadChange">
          <el-icon class="up-icon"><UploadFilled /></el-icon>
          <div>选择本地喜欢的场景图上传入库</div>
        </el-upload>
        <el-button size="small" class="mt8" :disabled="!selectedCatId || !uploadFiles.length" @click="doUpload">上传选中文件</el-button>

        <el-divider />
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
              <div class="ptype">
                <el-tag size="small" :type="img.source_kind === 'ai' ? 'success' : 'info'">{{ img.source_kind === 'ai' ? 'AI' : '上传' }}</el-tag>
              </div>
              <div class="txt" :title="img.prompt_used || img.title || ''">{{ img.prompt_used || img.title || '—' }}</div>
              <div class="acts">
                <el-button type="primary" link size="small" @click="dl(img)">下载</el-button>
                <el-button type="danger" link size="small" @click="rm(img)">删除</el-button>
              </div>
            </div>
          </div>
        </div>
        <el-empty v-else description="请选择左侧分类并加载或生成场景图" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { defaultProviderIfGeminiAvailable, sortProvidersGeminiFirst } from '@/utils/aiProviders'

const tree = ref([])
const images = ref([])
const selectedCatId = ref(null)
const presets = ref([])
const uploadFiles = ref([])
const providers = ref([])
const ENABLED_PROVIDERS = ['gemini', 'siliconflow', 'wanxiang']

const gen = reactive({
  provider: 'gemini',
  mode: 'lifestyle',
  prompt: '',
  count: 1,
  loading: false,
})

function providerLabel(p) {
  const map = { gemini: 'Gemini', siliconflow: 'SiliconFlow', wanxiang: '通义万相', mock: 'Mock' }
  return map[p] || p
}

function toStatic(p) {
  return p ? `/static/${p}` : ''
}

async function loadAll() {
  try {
    tree.value = await http.get('/scenes/tree')
  } catch {
    ElMessage.error('加载场景分类失败')
  }
  try {
    const r = await http.get('/scenes/prompt-presets')
    presets.value = r.presets || []
  } catch {
    /* ignore */
  }
  try {
    const r = await http.get('/ai/providers')
    const raw = (r.providers || []).filter((x) => ENABLED_PROVIDERS.includes(x))
    providers.value = sortProvidersGeminiFirst(raw)
    gen.provider = defaultProviderIfGeminiAvailable(providers.value)
  } catch {
    providers.value = ['gemini']
    gen.provider = 'gemini'
  }
}

async function onNodeClick(node) {
  selectedCatId.value = node.id
  try {
    const rows = await http.get(`/scenes/${node.id}/images`)
    images.value = [...rows].sort((a, b) => b.id - a.id)
  } catch {
    ElMessage.error('加载场景图片失败')
  }
}

async function runGenerate() {
  if (!selectedCatId.value) return ElMessage.warning('请先选择分类')
  gen.loading = true
  try {
    for (let i = 0; i < gen.count; i++) {
      await http.post(`/scenes/${selectedCatId.value}/generate`, {
        prompt: gen.prompt.trim(),
        mode: gen.mode,
        provider: gen.provider,
      })
    }
    ElMessage.success(`生成完成（${gen.count} 张）`)
    const rows = await http.get(`/scenes/${selectedCatId.value}/images`)
    images.value = [...rows].sort((a, b) => b.id - a.id)
  } finally {
    gen.loading = false
  }
}

function onUploadChange(file, fileList) {
  uploadFiles.value = fileList.map((f) => f.raw).filter(Boolean)
}

async function doUpload() {
  if (!selectedCatId.value || !uploadFiles.value.length) return
  for (const raw of uploadFiles.value) {
    const fd = new FormData()
    fd.append('file', raw)
    await http.post(`/scenes/${selectedCatId.value}/images`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  }
  uploadFiles.value = []
  ElMessage.success('上传完成')
  const rows = await http.get(`/scenes/${selectedCatId.value}/images`)
  images.value = [...rows].sort((a, b) => b.id - a.id)
}

async function dl(img) {
  const url = toStatic(img.file_path)
  const resp = await fetch(url)
  const blob = await resp.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `scene_${img.id}.png`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function rm(img) {
  try {
    await ElMessageBox.confirm('删除该场景图？', '确认', { type: 'warning' })
  } catch {
    return
  }
  await http.delete(`/scenes/images/${img.id}`)
  ElMessage.success('已删除')
  if (selectedCatId.value) {
    const rows = await http.get(`/scenes/${selectedCatId.value}/images`)
    images.value = [...rows].sort((a, b) => b.id - a.id)
  }
}

loadAll()
</script>

<style scoped>
.page { display: grid; gap: 14px; }
.head { display: flex; align-items: center; justify-content: space-between; }
.tip { margin-bottom: 0; }
.layout { display: grid; grid-template-columns: 280px 1fr; gap: 14px; }
@media (max-width: 960px) {
  .layout { grid-template-columns: 1fr; }
}
.panel { background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 12px; min-height: 200px; }
.panel.wide { min-height: 520px; }
.sec-title { font-weight: 600; margin-bottom: 10px; font-size: 14px; }
.gen-bar { display: grid; gap: 10px; max-width: 820px; }
.w320 { width: 320px; max-width: 100%; }
.presets { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.plabel { font-size: 12px; color: #909399; margin-right: 4px; }
.ptag { cursor: pointer; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.up-icon { font-size: 28px; color: #909399; }
.mt8 { margin-top: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 12px; }
.card { border: 1px solid #ebeef5; border-radius: 10px; overflow: hidden; background: #fafafa; }
.thumb { width: 100%; aspect-ratio: 1/1; display: block; }
.cap { padding: 8px 10px 10px; font-size: 12px; display: grid; gap: 6px; }
.txt { color: #303133; line-height: 1.45; max-height: 3.1em; overflow: hidden; }
.acts { display: flex; gap: 8px; justify-content: flex-end; }
</style>
