<template>
  <div class="page">
    <div class="head">
      <el-button @click="load">刷新列表</el-button>
    </div>

    <el-alert type="info" :closable="false" show-icon class="tip"
              title="上传产品白底图并填写卖点文案 / 尺寸信息：系统将异步调用 Gemini（若已配置密钥）生成高点击率主图、多张转化率辅图、尺码图解与细节特写；输出分辨率会自动缩放至所选平台的像素规格。" />

    <div class="panel gen-panel">
      <div class="core-title">核心参数</div>
      <div class="row upload-row">
        <el-upload drag accept="image/*" :auto-upload="false" :limit="1" :on-change="onPick" class="upload-box">
          <el-icon class="up-icon"><UploadFilled /></el-icon>
          <div>拖拽产品白底图到此（必填）</div>
        </el-upload>
        <div v-if="uploadPreviewUrl" class="upload-preview">
          <div class="muted">已上传白底图预览</div>
          <el-image :src="uploadPreviewUrl" fit="cover" class="upload-preview-img" />
          <el-upload accept="image/*" :auto-upload="false" :limit="1" :show-file-list="false" :on-change="onPick">
            <el-button size="small">替换图片</el-button>
          </el-upload>
        </div>
      </div>
      <div class="row pair-row">
        <div class="pair-item">
          <div class="pair-label">表面纹理参考图</div>
          <el-upload accept="image/*" :auto-upload="false" :limit="1" :on-change="onPickTexture">
            <el-button>上传表面纹理参考图（可选）</el-button>
          </el-upload>
        </div>
        <div class="pair-item">
          <div class="pair-label">表面纹理说明</div>
          <el-input v-model="form.surface_texture_note" placeholder="可选，如：哑光、浮雕、磨砂" class="fld compact-fld" />
        </div>
      </div>
      <div class="row pair-row">
        <div class="pair-item">
          <div class="pair-label">平台</div>
          <el-select v-model="form.platform_code" placeholder="平台" class="fld compact-fld">
            <el-option v-for="(v, k) in platforms" :key="k" :label="(v.name || k) + ' (' + k + ')'" :value="k" />
          </el-select>
        </div>
        <div class="pair-item">
          <div class="pair-label">效果场景二级类目方向</div>
          <el-select v-model="form.scene_category_id" filterable clearable placeholder="可选" class="fld compact-fld">
            <el-option v-for="c in sceneCategoryOptions" :key="c.id" :label="c._label" :value="c.id" />
          </el-select>
        </div>
      </div>
      <div class="muted">仅用于约束电商图视觉方向，系统会自主选择最佳构图，不会固定套用单一场景图。</div>
      <div class="row pair-row">
        <div class="pair-item">
          <div class="pair-label">生图模型</div>
          <el-select v-model="form.provider" placeholder="生图模型" class="fld compact-fld">
            <el-option v-for="p in providers" :key="p" :label="providerLabel(p)" :value="p" />
          </el-select>
        </div>
        <div class="pair-item">
          <div class="pair-label">生成策略</div>
          <el-radio-group v-model="form.generation_mode">
            <el-radio-button label="conservative">保守</el-radio-button>
            <el-radio-button label="balanced">平衡</el-radio-button>
            <el-radio-button label="aggressive">激进</el-radio-button>
          </el-radio-group>
        </div>
      </div>
      <el-input v-model="form.product_description" type="textarea" :rows="4" maxlength="2000" show-word-limit
                 placeholder="产品卖点 / 材质工艺 / 使用场景等，用于 AI 构图指令" class="fld block" />
      <div class="row">
        <div class="lbl">产品规格(cm)</div>
        <el-input-number v-model="form.spec_width_cm" :min="0.1" :max="2000" :step="0.1" />
        <span class="muted">×</span>
        <el-input-number v-model="form.spec_height_cm" :min="0.1" :max="2000" :step="0.1" />
        <span class="muted">宽 × 高</span>
        <div class="lbl compact">产品厚度(mm)</div>
        <el-input-number v-model="form.thickness_mm" :min="0" :max="200" :step="0.1" />
        <span class="muted">会自动写入尺寸图说明（cm + inch）</span>
      </div>
      <div class="count-card">
        <div class="count-title">数量配置</div>
        <div class="row">
          <div class="lbl">输出张数</div>
          <el-radio-group v-model="form.output_count">
            <el-radio-button v-for="n in [6,7,8,9,10,11,12]" :key="n" :label="n" :value="n" />
          </el-radio-group>
        </div>
        <div class="row">
          <div class="lbl">主图数量</div>
          <el-input-number v-model="form.main_image_count" :min="1" :max="4" />
          <span class="muted">详情图数量</span>
          <el-input-number v-model="form.detail_image_count" :min="0" :max="11" />
          <span class="muted">自动计算：{{ computedTotalCount }} / {{ form.output_count }}</span>
        </div>
        <div v-if="computedTotalCount > form.output_count" class="count-warn">
          主图数量 + 详情图数量超过输出张数，请调整后再提交。
        </div>
      </div>
      <div class="row">
        <div class="lbl">强制尺寸贴附（实验）</div>
        <el-switch v-model="form.strict_attach_mode" />
        <span class="muted">强化无缝平铺、大面积覆盖、保留原场景装饰</span>
      </div>
      <el-collapse v-model="advancedPanel">
        <el-collapse-item title="高级参数（可选）" name="advanced">
      <div class="row">
        <div class="lbl">精确贴附模式</div>
        <el-switch v-model="form.precise_attach_enabled" />
        <span class="muted">按真实尺寸比例约束图案，减少放大失真</span>
      </div>
      <div class="row" v-if="form.precise_attach_enabled">
        <div class="lbl">按原尺寸平铺</div>
        <el-switch v-model="form.keep_pattern_scale" />
        <span class="muted">开启后优先平铺，不拉伸单个花回</span>
      </div>
      <div class="row" v-if="form.precise_attach_enabled">
        <div class="lbl">图案缩放</div>
        <el-slider v-model="form.pattern_scale_percent" :min="25" :max="100" :step="5" style="max-width: 320px;" />
        <span class="muted">{{ form.pattern_scale_percent }}%</span>
      </div>
      <div class="row" v-if="form.precise_attach_enabled">
        <div class="lbl">成品尺寸(cm)</div>
        <el-input-number v-model="form.product_width_cm" :min="1" :max="2000" />
        <span class="muted">×</span>
        <el-input-number v-model="form.product_height_cm" :min="1" :max="2000" />
      </div>
      <div class="row" v-if="form.precise_attach_enabled">
        <div class="lbl">花型单元(cm)</div>
        <el-input-number v-model="form.tile_width_cm" :min="0.1" :max="2000" :step="0.1" />
        <span class="muted">×</span>
        <el-input-number v-model="form.tile_height_cm" :min="0.1" :max="2000" :step="0.1" />
      </div>
      <div class="row" v-if="form.precise_attach_enabled">
        <div class="lbl">目标区域(cm)</div>
        <el-input-number v-model="form.target_surface_width_cm" :min="1" :max="5000" />
        <span class="muted">×</span>
        <el-input-number v-model="form.target_surface_height_cm" :min="1" :max="5000" />
      </div>
        </el-collapse-item>
      </el-collapse>
      <el-button type="primary" :loading="submitting" :disabled="!fileRaw" @click="submitSuite">
        提交生成任务
      </el-button>
      <div v-if="jobId" class="job muted">
        任务 ID {{ jobId }} · {{ jobStatus }}
        <span v-if="jobErr" class="err">{{ jobErr }}</span>
      </div>
      <el-alert
        v-if="acceptanceSummary"
        :type="acceptanceSummary.ok ? 'success' : 'warning'"
        :closable="false"
        show-icon
        :title="acceptanceSummary.text"
      />
    </div>

    <div class="chips">
      <el-tag v-for="(v, k) in platforms" :key="k">{{ v.name || v.code || k }}</el-tag>
    </div>

    <el-table :data="suites" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="platform_code" label="平台" width="110" />
      <el-table-column label="文字描述" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.product_description || row.title || '—' }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column label="生成时间" width="168">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="错误" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.error_message || '—' }}</template>
      </el-table-column>
      <el-table-column label="张数" width="70">
        <template #default="{ row }">{{ row.images?.length || 0 }}</template>
      </el-table-column>
      <el-table-column label="预览" width="220">
        <template #default="{ row }">
          <div class="mini-row">
            <el-image
              v-for="im in (row.images || []).slice(0, 4)"
              :key="im.id"
              :src="'/static/' + im.file_path"
              class="mini"
              fit="cover"
              :title="im.image_type"
              @click="openPreview(row, im.id)"
            />
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="previewVisible" title="预览图" width="760px">
      <div class="preview-wrap">
        <el-button class="nav-btn left" :disabled="previewList.length <= 1" @click="prevPreview">‹</el-button>
        <img v-if="previewSrc" :src="previewSrc" class="preview-img" />
        <el-button class="nav-btn right" :disabled="previewList.length <= 1" @click="nextPreview">›</el-button>
      </div>
      <div class="preview-index" v-if="previewList.length > 1">{{ previewIndex + 1 }} / {{ previewList.length }}</div>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { defaultProviderIfGeminiAvailable, sortProvidersGeminiFirst } from '@/utils/aiProviders'
import { formatDateTimeBeijing } from '@/utils/datetime'

const platforms = ref({})
const suites = ref([])
const providers = ref([])
const sceneCategoryOptions = ref([])
const ENABLED_PROVIDERS = ['gemini', 'siliconflow', 'wanxiang']
const fileRaw = ref(null)
const textureRaw = ref(null)
const submitting = ref(false)
const jobId = ref(null)
const jobStatus = ref('')
const jobErr = ref('')
const uploadPreviewUrl = ref('')
const previewVisible = ref(false)
const previewSrc = ref('')
const previewList = ref([])
const previewIndex = ref(0)
const advancedPanel = ref([])
const acceptanceSummary = ref(null)

const form = reactive({
  platform_code: 'amazon',
  product_description: '',
  spec_width_cm: null,
  spec_height_cm: null,
  thickness_mm: null,
  surface_texture_note: '',
  provider: 'gemini',
  generation_mode: 'balanced',
  strict_attach_mode: true,
  output_count: 10,
  main_image_count: 1,
  detail_image_count: 9,
  scene_category_id: null,
  precise_attach_enabled: true,
  keep_pattern_scale: true,
  pattern_scale_percent: 100,
  product_width_cm: null,
  product_height_cm: null,
  tile_width_cm: null,
  tile_height_cm: null,
  target_surface_width_cm: null,
  target_surface_height_cm: null,
})

const computedTotalCount = computed(() => Number(form.main_image_count || 0) + Number(form.detail_image_count || 0))

watch(
  () => [form.output_count, form.main_image_count],
  () => {
    const output = Number(form.output_count || 0)
    if (output <= 0) return
    if (form.main_image_count > output) form.main_image_count = output
    if (form.main_image_count < 1) form.main_image_count = 1
    const maxDetail = Math.max(0, output - Number(form.main_image_count || 1))
    if (Number(form.detail_image_count || 0) > maxDetail) form.detail_image_count = maxDetail
    if (Number(form.detail_image_count || 0) < 0) form.detail_image_count = 0
  },
  { immediate: true },
)

function providerLabel(p) {
  const map = { gemini: 'Gemini', siliconflow: 'SiliconFlow', wanxiang: '通义万相', mock: 'Mock' }
  return map[p] || p
}

function formatTime(v) {
  return formatDateTimeBeijing(v)
}

function flattenSceneSecondary(nodes, acc = []) {
  for (const n of nodes || []) {
    if (n.parent_id != null) acc.push({ ...n, _label: n.name })
    if (n.children?.length) flattenSceneSecondary(n.children, acc)
  }
  return acc
}

function openPreview(row, imageId) {
  const list = (row.images || []).map((x) => ({ id: x.id, src: `/static/${x.file_path}` }))
  previewList.value = list
  const idx = Math.max(0, list.findIndex((x) => x.id === imageId))
  previewIndex.value = idx
  previewSrc.value = list[idx]?.src || ''
  previewVisible.value = true
}

function prevPreview() {
  if (previewList.value.length <= 1) return
  previewIndex.value = (previewIndex.value - 1 + previewList.value.length) % previewList.value.length
  previewSrc.value = previewList.value[previewIndex.value].src
}

function nextPreview() {
  if (previewList.value.length <= 1) return
  previewIndex.value = (previewIndex.value + 1) % previewList.value.length
  previewSrc.value = previewList.value[previewIndex.value].src
}

function onPick(file) {
  fileRaw.value = file.raw
  uploadPreviewUrl.value = file.raw ? URL.createObjectURL(file.raw) : ''
}

function buildAcceptanceSummary(suite) {
  const images = suite?.images || []
  const main = images.filter((x) => x.image_type === 'main').length
  const detail = images.filter((x) => x.image_type === 'detail').length
  const total = images.length
  const wantMain = Number(form.main_image_count || 1)
  const wantDetail = Number(form.detail_image_count || 0)
  const ok = main === wantMain && detail === wantDetail
  return {
    ok,
    text: `验收结果：主图 ${main}/${wantMain}，详情图 ${detail}/${wantDetail}，总数 ${total}${ok ? '（通过）' : '（数量不一致，请重试）'}`,
  }
}

function onPickTexture(file) {
  textureRaw.value = file.raw
}

async function load() {
  try {
    platforms.value = await http.get('/platform-suite/platforms')
  } catch {
    ElMessage.error('加载平台失败')
  }
  try {
    const rows = await http.get('/platform-suite/')
    suites.value = [...rows].sort((a, b) => b.id - a.id)
  } catch {
    ElMessage.error('加载套图记录失败')
  }
  try {
    const tree = await http.get('/scenes/tree')
    sceneCategoryOptions.value = flattenSceneSecondary(tree)
  } catch {}
  try {
    const r = await http.get('/ai/providers')
    const raw = (r.providers || []).filter((x) => ENABLED_PROVIDERS.includes(x))
    providers.value = sortProvidersGeminiFirst(raw)
    form.provider = defaultProviderIfGeminiAvailable(providers.value)
  } catch {
    providers.value = ['gemini']
    form.provider = 'gemini'
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function submitSuite() {
  if (!fileRaw.value) return ElMessage.warning('请先上传白底图')
  if (computedTotalCount.value > (form.output_count || 0))
    return ElMessage.warning('主图数量 + 详情图数量不能超过输出张数')
  submitting.value = true
  jobErr.value = ''
  acceptanceSummary.value = null
  jobStatus.value = '提交中…'
  try {
    const fd = new FormData()
    fd.append('file', fileRaw.value)
    if (textureRaw.value) fd.append('texture_file', textureRaw.value)
    fd.append('platform_code', form.platform_code)
    const enrichedDesc = [form.product_description, form.surface_texture_note ? `Surface texture: ${form.surface_texture_note}` : ''].filter(Boolean).join(' | ')
    const thicknessInch = form.thickness_mm ? (Number(form.thickness_mm) / 25.4).toFixed(3) : null
    const specInchW = form.spec_width_cm ? (Number(form.spec_width_cm) / 2.54).toFixed(2) : null
    const specInchH = form.spec_height_cm ? (Number(form.spec_height_cm) / 2.54).toFixed(2) : null
    const enrichedDims = [
      (form.spec_width_cm && form.spec_height_cm)
        ? `Product size: ${form.spec_width_cm} cm x ${form.spec_height_cm} cm (${specInchW} inch x ${specInchH} inch)`
        : '',
      form.thickness_mm ? `Thickness: ${form.thickness_mm} mm (${thicknessInch} inch)` : '',
      'All size labels in charts must include both cm and inch.',
    ].filter(Boolean).join(' | ')
    if (enrichedDesc) fd.append('product_description', enrichedDesc)
    if (enrichedDims) fd.append('dimensions_spec', enrichedDims)
    if (form.provider) fd.append('provider', form.provider)
    if (form.output_count) fd.append('output_count', String(form.output_count))
    fd.append('main_image_count', String(form.main_image_count || 1))
    fd.append('detail_image_count', String(form.detail_image_count || 0))
    fd.append('generation_mode', form.generation_mode || 'balanced')
    fd.append('strict_attach_mode', form.strict_attach_mode ? 'true' : 'false')
    if (form.scene_category_id) fd.append('scene_category_id', String(form.scene_category_id))
    fd.append('precise_attach_enabled', form.precise_attach_enabled ? 'true' : 'false')
    fd.append('keep_pattern_scale', form.keep_pattern_scale ? 'true' : 'false')
    fd.append('pattern_scale_percent', String(form.pattern_scale_percent || 100))
    const productW = form.product_width_cm || form.spec_width_cm
    const productH = form.product_height_cm || form.spec_height_cm
    const tileW = form.tile_width_cm || form.spec_width_cm
    const tileH = form.tile_height_cm || form.spec_width_cm
    if (productW) fd.append('product_width_cm', String(productW))
    if (productH) fd.append('product_height_cm', String(productH))
    if (tileW) fd.append('tile_width_cm', String(tileW))
    if (tileH) fd.append('tile_height_cm', String(tileH))
    const targetW = form.target_surface_width_cm || (form.strict_attach_mode ? 250 : null)
    const targetH = form.target_surface_height_cm || (form.strict_attach_mode ? 250 : null)
    if (targetW) fd.append('target_surface_width_cm', String(targetW))
    if (targetH) fd.append('target_surface_height_cm', String(targetH))
    const suite = await http.post('/platform-suite/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    jobId.value = suite.id
    jobStatus.value = suite.status || 'pending'
    ElMessage.success('任务已排队，生成需要数十秒至数分钟')
    let finalSuite = null
    for (let i = 0; i < 120; i++) {
      await sleep(2000)
      const s = await http.get(`/platform-suite/${suite.id}`)
      jobStatus.value = s.status
      if (s.error_message) jobErr.value = s.error_message
      if (s.status === 'done' || s.status === 'failed') {
        finalSuite = s
        break
      }
    }
    if (finalSuite?.status === 'done') acceptanceSummary.value = buildAcceptanceSummary(finalSuite)
    await load()
  } catch {
    jobStatus.value = '失败'
  } finally {
    submitting.value = false
  }
}

load()
</script>

<style scoped>
.page { display: grid; gap: 14px; }
.head { display: flex; align-items: center; justify-content: space-between; }
.tip { margin-bottom: 0; }
.gen-panel { background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 14px; display: grid; gap: 10px; }
.core-title { font-weight: 600; color: #303133; margin-bottom: 2px; }
.count-card { border: 1px solid #ebeef5; border-radius: 8px; padding: 10px; display: grid; gap: 8px; }
.count-title { font-size: 13px; font-weight: 600; color: #303133; }
.count-warn { font-size: 12px; color: #e6a23c; }
.row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; width: 100%; }
.upload-row { align-items: flex-start; }
.pair-row { gap: 14px; align-items: flex-start; }
.pair-item { flex: 1; min-width: 300px; display: grid; gap: 6px; }
.pair-label { font-size: 12px; color: #606266; }
.lbl { font-size: 13px; color: #606266; flex-shrink: 0; min-width: 88px; }
.lbl.compact { min-width: auto; margin-left: 8px; }
.muted { font-size: 12px; color: #909399; }
.up-icon { font-size: 28px; color: #909399; }
.upload-preview { display: grid; gap: 6px; }
.upload-preview-img { width: 72px; height: 72px; border-radius: 8px; border: 1px solid #ebeef5; }
.upload-box :deep(.el-upload-dragger) { width: 230px; min-height: 100px; padding: 10px 12px; }
.fld { width: 100%; max-width: 560px; }
.compact-fld { max-width: 100%; }
.fld.block { max-width: 100%; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.job { font-size: 13px; }
.job .err { color: var(--el-color-danger); margin-left: 8px; }
.mini-row { display: flex; gap: 4px; flex-wrap: wrap; }
.mini { width: 44px; height: 44px; border-radius: 4px; overflow: hidden; }
.preview-wrap { position: relative; background: #fff; display: flex; justify-content: center; align-items: center; min-height: 360px; }
.preview-img { max-width: 100%; max-height: 72vh; object-fit: contain; background: #fff; }
.nav-btn { position: absolute; z-index: 2; width: 34px; height: 34px; border-radius: 50%; }
.nav-btn.left { left: 10px; }
.nav-btn.right { right: 10px; }
.preview-index { text-align: center; color: #909399; font-size: 12px; margin-top: 8px; }
</style>
