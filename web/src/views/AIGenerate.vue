<template>
  <div class="ai-page">
    <div class="layout">
      <!-- LEFT: settings -->
      <div class="card panel">
        <div class="panel-title"><el-icon class="ico"><MagicStick /></el-icon> 生成设置</div>
        <p class="lead muted">
          此处生成的<strong>素材图案</strong>面向<strong>印刷生产文件</strong>（非效果图）；导出后可入库用于实拍合成或其它物料流程。
        </p>

        <el-form label-position="top" :model="form">
          <el-form-item label="生图模型">
            <el-select v-model="form.provider" size="large" class="w-full" :key="orderedProviders.join(',')">
              <el-option v-for="p in orderedProviders" :key="p" :label="providerLabel(p)" :value="p" />
            </el-select>
            <div class="hint">
              文生图与参考图生图均从此处选择。支持 <code>gpt_image</code> / <code>gemini</code> / <code>siliconflow</code> / <code>wanxiang</code>。
            </div>
          </el-form-item>

          <el-form-item label="图案描述">
            <el-input
              v-model="form.prompt" type="textarea" :rows="4" maxlength="800" show-word-limit
              placeholder="描述您想要的图案，例如：蓝色海洋波浪纹理、金色几何菱形图案、粉色樱花花瓣…"
            />
          </el-form-item>

          <el-form-item label="参考素材（可选）">
            <el-upload
              class="upload" drag :auto-upload="false" :show-file-list="true"
              :on-change="onPickFile" :limit="1" :on-exceed="onExceed"
              accept="image/*"
            >
              <el-icon class="up-ico"><UploadFilled /></el-icon>
              <div class="up-text">上传参考素材 — 无描述时 AI 直接复刻风格，有描述时按比例混合</div>
            </el-upload>
          </el-form-item>

          <el-form-item label="设计风格">
            <el-select v-model="form.style" size="large" class="w-full" placeholder="不限风格" clearable>
              <el-option v-for="s in styles" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </el-form-item>

          <el-form-item label="产品类目（二级类目）">
            <el-select v-model="form.category" size="large" class="w-full" placeholder="请选择子类目" clearable filterable>
              <el-option v-for="c in categories" :key="c.id" :label="c._label" :value="c.id" />
            </el-select>
            <div class="hint">请在「产品分类」中先维护一级 / 二级类目。</div>
          </el-form-item>

          <el-form-item label="目标市场">
            <el-select v-model="form.market" size="large" class="w-full">
              <el-option label="全球通用" value="global" />
              <el-option label="欧美" value="us-eu" />
              <el-option label="东南亚" value="sea" />
              <el-option label="中东" value="me" />
              <el-option label="南美" value="latam" />
            </el-select>
          </el-form-item>

          <el-form-item label="产品尺寸">
            <el-radio-group v-model="form.sizePreset" size="large">
              <el-radio-button label="1024x1024" value="1024x1024" />
              <el-radio-button label="1024x1536" value="1024x1536" />
              <el-radio-button label="1536x1024" value="1536x1024" />
            </el-radio-group>
          </el-form-item>

          <el-form-item label="生成数量">
            <el-radio-group v-model="form.count" size="large">
              <el-radio-button v-for="n in [1,2,3,4,5]" :key="n" :label="n" :value="n" />
            </el-radio-group>
            <div class="hint">{{ form.count }} 张</div>
          </el-form-item>

          <el-button type="primary" size="large" class="submit" :loading="generating" @click="onGenerate" :icon="MagicStick">
            开始生成
          </el-button>
        </el-form>
      </div>

      <!-- RIGHT: results -->
      <div class="card result">
        <div class="panel-title">生成结果</div>

        <div v-if="generating" class="state">
          <el-icon class="loading-ico"><Loading /></el-icon>
          <div class="muted">AI 正在创作中，约 {{ etaText }}…</div>
        </div>

        <div v-else-if="latest.length" class="grid">
          <div v-for="t in latest" :key="t.id" class="result-card">
            <el-image
              v-if="t.result_path"
              :src="imgUrl(t)"
              :preview-src-list="latestPreviewList"
              :initial-index="latestPreviewList.indexOf(imgUrl(t))"
              :preview-teleported="true"
              fit="cover"
              class="img"
            />
            <div v-else class="placeholder">
              <el-icon><Picture /></el-icon>
              <span>{{ t.status === 'failed' ? '失败' : '处理中…' }}</span>
            </div>
            <div class="result-meta">
              <div class="meta-row">
                <span class="num">#{{ t.id }} · {{ t.provider }}</span>
                <div class="acts">
                  <el-button v-if="t.result_path" type="primary" link size="small"
                             :icon="Download" @click="downloadImage(t)">下载</el-button>
                  <el-button type="danger" link size="small"
                             :icon="Delete" @click="removeTask(t, true)">删除素材</el-button>
                </div>
              </div>
              <div class="detail-lines">
                <div class="dl"><span class="k">描述</span><span class="v" :title="t.prompt || '—'">{{ t.prompt || '—' }}</span></div>
                <div class="dl"><span class="k">风格</span><span class="v">{{ t.style_name || '—' }}</span></div>
                <div class="dl"><span class="k">类目</span><span class="v">{{ t.category_name || '—' }}</span></div>
              </div>
              <div v-if="t.error_message" class="err">{{ t.error_message }}</div>
            </div>
          </div>
        </div>

        <div v-else class="empty">
          <div class="ill"><el-icon class="big"><MagicStick /></el-icon></div>
          <h3>输入描述并点击生成</h3>
          <p>AI 将为您创建装饰图案</p>
          <small>支持上传参考素材，AI 将分析并生成风格相似的新图案</small>
        </div>

        <el-divider v-if="history.length">历史</el-divider>
        <div v-if="history.length" class="history">
          <div v-for="t in history" :key="t.id" class="history-item">
            <el-image
              v-if="t.result_path"
              :src="imgUrl(t)"
              :preview-src-list="historyPreviewList"
              :initial-index="historyPreviewList.indexOf(imgUrl(t))"
              :preview-teleported="true"
              fit="cover"
              class="thumb"
            />
            <div v-else class="placeholder small"><el-icon><Picture /></el-icon></div>
            <div class="info">
              <div class="title-row">
                <span class="title">#{{ t.id }} · {{ t.task_type }}</span>
                <div class="acts">
                  <el-button v-if="t.result_path" type="primary" link size="small"
                             :icon="Download" @click="downloadImage(t)">下载</el-button>
                  <el-button type="danger" link size="small"
                             :icon="Delete" @click="removeTask(t, false)">删除</el-button>
                </div>
              </div>
              <div class="prompt" :title="t.prompt || ''">{{ t.prompt || '—' }}</div>
              <div class="hist-extra">
                <span>风格：{{ t.style_name || '—' }}</span>
                <span>类目：{{ t.category_name || '—' }}</span>
              </div>
              <div class="sub">{{ t.provider }} · <el-tag size="small" :type="statusTag(t.status)">{{ t.status }}</el-tag></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { MagicStick, UploadFilled, Picture, Loading, Download, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as aiApi from '@/api/ai'
import * as metaApi from '@/api/meta'
import { defaultProviderIfGeminiAvailable, sortProvidersGeminiFirst } from '@/utils/aiProviders'

const providers = ref([])
const orderedProviders = computed(() => sortProvidersGeminiFirst(providers.value))
const ENABLED_PROVIDERS = ['gemini', 'gpt_image', 'siliconflow', 'wanxiang']
const styles = ref([])
const categories = ref([])
const generating = ref(false)
const latest = ref([])
const history = ref([])
const refFile = ref(null)

const form = reactive({
  provider: 'gemini',
  prompt: '',
  style: null,
  category: null,
  market: 'global',
  sizePreset: '1024x1024',
  count: 1,
})

const etaText = computed(() => form.provider === 'mock' ? '1 秒' : '20–60 秒')

function providerLabel(p) {
  const map = {
    mock: 'Mock（离线占位）',
    gpt_image: 'gpt-image-2',
    stable_diffusion: 'Stable Diffusion',
    midjourney: 'Midjourney',
    gemini: 'Gemini',
    siliconflow: 'SiliconFlow',
    wanxiang: '通义万相',
  }
  return map[p] || p
}
function statusTag(s) { return ({ done: 'success', failed: 'danger', processing: 'warning' })[s] || 'info' }

// ---- Image URL + preview lists + download ----
function imgUrl(t) { return t.result_path ? `/static/${t.result_path}` : '' }
const latestPreviewList  = computed(() => latest.value.filter(t => t.result_path).map(imgUrl))
const historyPreviewList = computed(() => history.value.filter(t => t.result_path).map(imgUrl))

function flattenSecondaryCategories(nodes, acc = []) {
  for (const n of nodes || []) {
    if (n.parent_id != null)
      acc.push({ ...n, _label: (n.code ? `[${n.code}] ` : '') + n.name })
    if (n.children?.length)
      flattenSecondaryCategories(n.children, acc)
  }
  return acc
}

async function removeTask(t, _fromLatest) {
  try {
    await ElMessageBox.confirm(
      '删除后服务器上的素材文件将移除，且不再出现在列表中。确认删除该印刷素材任务吗？',
      '删除素材',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await aiApi.deleteTask(t.id)
    ElMessage.success('已删除')
    latest.value = latest.value.filter((x) => x.id !== t.id)
    await refreshHistory()
  } catch {
    /* interceptor */
  }
}

async function downloadImage(t) {
  const url = imgUrl(t)
  if (!url) return
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const ext = (t.result_path.split('.').pop() || 'png').toLowerCase()
    a.download = `decorai_task_${t.id}.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  } catch (e) {
    ElMessage.error('下载失败：' + e.message)
  }
}

function onPickFile(file) { refFile.value = file.raw }
function onExceed() { ElMessage.warning('一次仅上传一张参考图') }

async function loadAll() {
  try {
    const p = await aiApi.listProviders()
    const filtered = (p.providers || []).filter((x) => ENABLED_PROVIDERS.includes(x))
    providers.value = filtered
    form.provider = defaultProviderIfGeminiAvailable(sortProvidersGeminiFirst(filtered))
  } catch {}
  try { styles.value = await metaApi.listStyles() } catch {}
  try {
    const tree = await metaApi.listCategoryTree()
    categories.value = flattenSecondaryCategories(tree)
  } catch {}
  await refreshHistory()
}

async function refreshHistory() {
  try {
    const all = await aiApi.listTasks()
    history.value = [...all].sort((a, b) => b.id - a.id).slice(0, 30)
  } catch {}
}

async function onGenerate() {
  if (!form.prompt.trim() && !refFile.value) {
    ElMessage.warning('请输入描述或上传参考图')
    return
  }
  generating.value = true
  latest.value = []
  const [w, h] = form.sizePreset.split('x').map(Number)
  try {
    const tasks = []
    for (let i = 0; i < form.count; i++) {
      let task
      if (refFile.value) {
        const fd = new FormData()
        fd.append('file', refFile.value)
        fd.append('prompt', form.prompt || '')
        if (form.style) fd.append('style_id', form.style)
        if (form.category) fd.append('category_id', form.category)
        fd.append('provider', form.provider)
        fd.append('width', w); fd.append('height', h)
        task = await aiApi.img2img(fd)
      } else {
        task = await aiApi.text2img({
          prompt: form.prompt, provider: form.provider,
          style_id: form.style, category_id: form.category,
          width: w, height: h,
        })
      }
      tasks.push(task)
    }
    // poll until each task is done/failed
    const results = await Promise.all(tasks.map(pollTask))
    latest.value = [...results].sort((a, b) => b.id - a.id)
    ElMessage.success(`生成完成（${results.filter(r => r.status === 'done').length} 成功）`)
    await refreshHistory()
  } catch (e) {
    // http interceptor already shows message
  } finally {
    generating.value = false
  }
}

async function pollTask(t) {
  const start = Date.now()
  let cur = t
  while (cur.status === 'pending' || cur.status === 'processing') {
    if (Date.now() - start > 180000) break
    await new Promise(r => setTimeout(r, 1200))
    try { cur = await aiApi.getTask(cur.id) } catch { break }
  }
  return cur
}

onMounted(loadAll)
</script>

<style lang="scss" scoped>
.ai-page { display: flex; flex-direction: column; }
.layout { display: grid; grid-template-columns: 420px 1fr; gap: 20px; align-items: start; }
@media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } }

.card {
  background: var(--bg-card); border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg); padding: 20px 22px; box-shadow: var(--shadow-card);
}
.panel-title { display: flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 14px;
  .ico { color: var(--brand-500); } }
.lead.muted { font-size: 12px; color: var(--text-tertiary); line-height: 1.55; margin: -6px 0 14px; }
.w-full { width: 100%; }
.hint { font-size: 12px; color: var(--text-tertiary); margin-top: 4px;
  code { background: var(--bg-page); padding: 1px 5px; border-radius: 3px; color: var(--brand-500); } }

.upload { width: 100%; }
.up-ico { font-size: 32px; color: var(--text-tertiary); }
.up-text { font-size: 12px; color: var(--text-tertiary); padding: 6px 14px 14px; }

.submit { width: 100%; margin-top: 6px; height: 46px; font-weight: 600; }

.result { min-height: 520px; display: flex; flex-direction: column; }

.state { display: flex; flex-direction: column; align-items: center; padding: 80px 0; gap: 14px;
  .loading-ico { font-size: 38px; color: var(--brand-500); animation: spin 1s linear infinite; }
  .muted { color: var(--text-tertiary); font-size: 13px; } }
@keyframes spin { to { transform: rotate(360deg); } }

.empty { display: flex; flex-direction: column; align-items: center; padding: 80px 0; color: var(--text-tertiary);
  .ill { width: 84px; height: 84px; border-radius: 50%; background: var(--bg-page); display: grid; place-items: center; margin-bottom: 18px; }
  .big { font-size: 38px; color: var(--brand-300); }
  h3 { margin: 0 0 6px; color: var(--text-primary); font-weight: 600; font-size: 17px; }
  p  { margin: 0; font-size: 13px; }
  small { display: block; margin-top: 14px; font-size: 12px; max-width: 320px; text-align: center; line-height: 1.6; } }

.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.result-card { border: 1px solid var(--border-soft); border-radius: var(--radius-md); overflow: hidden; background: var(--bg-elevated);
  .img { width: 100%; aspect-ratio: 1/1; display: block; cursor: zoom-in; }
  :deep(.img .el-image__inner) { width: 100%; height: 100%; object-fit: cover; }
  .placeholder { aspect-ratio: 1/1; display: grid; place-items: center; gap: 8px; color: var(--text-tertiary); font-size: 13px; }
  .result-meta { padding: 10px 12px; font-size: 12px; color: var(--text-tertiary);
    .meta-row { display: flex; align-items: center; justify-content: space-between; gap: 8px;
      .acts { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; } }
    .num { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .detail-lines { margin-top: 8px; display: grid; gap: 4px; font-size: 11px; line-height: 1.35;
      .dl { display: grid; grid-template-columns: 34px 1fr; gap: 6px; align-items: start;
        .k { color: var(--text-tertiary); flex-shrink: 0; }
        .v { color: var(--text-secondary); word-break: break-word; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; } }
    }
    .err { color: var(--el-color-danger); margin-top: 4px; word-break: break-all; } } }

.history { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); margin-top: 4px; }
.history-item { display: flex; gap: 10px; padding: 10px; border: 1px solid var(--border-soft); border-radius: var(--radius-sm);
  .thumb, .placeholder { width: 56px; height: 56px; border-radius: 6px; flex-shrink: 0; cursor: zoom-in; }
  :deep(.thumb .el-image__inner) { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; }
  .placeholder.small { background: var(--bg-page); display: grid; place-items: center; color: var(--text-tertiary); cursor: default; }
  .info { min-width: 0; flex: 1; }
  .title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    .acts { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; } }
  .title { font-size: 12px; color: var(--text-tertiary); }
  .prompt { font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hist-extra { font-size: 11px; color: var(--text-secondary); margin-top: 4px; display: flex; flex-direction: column; gap: 2px; line-height: 1.35; }
  .sub { font-size: 11px; color: var(--text-tertiary); margin-top: 4px; display: flex; gap: 6px; align-items: center; } }
</style>
