<template>
  <div class="page">
    <div class="toolbar">
      <el-button @click="load">刷新</el-button>
    </div>
    <div class="gen-panel">
      <el-upload accept="image/*" :auto-upload="false" :limit="1" :on-change="onPick">
        <el-button type="primary">上传产品图</el-button>
      </el-upload>
      <el-select v-model="form.channel_code" class="w240">
        <el-option v-for="(v, k) in channels" :key="k" :label="(v.name || k) + ' (' + k + ')'" :value="k" />
      </el-select>
      <el-input v-model="form.material_number" placeholder="物料编号（可选）" class="w240" />
      <el-button type="primary" :loading="generating" :disabled="!fileRaw" @click="runGenerate">生成广告素材</el-button>
    </div>
    <div class="chips">
      <el-tag v-for="(v, k) in channels" :key="k">{{ k }} · {{ v.name || v.label || '-' }}</el-tag>
    </div>
    <el-table :data="rows" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="channel_code" label="渠道" width="120" />
      <el-table-column prop="size_name" label="尺寸" width="120" />
      <el-table-column prop="material_number" label="素材编号" width="140" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column label="预览">
        <template #default="{ row }">
          <el-image v-if="row.file_path" :src="toStatic(row.file_path)" style="width:56px;height:56px;border-radius:6px" />
          <span v-else>—</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
const channels = ref({})
const rows = ref([])
const fileRaw = ref(null)
const generating = ref(false)
const form = ref({
  channel_code: 'xiaohongshu',
  material_number: '',
})
function toStatic(p) { return p ? `/static/${p}` : '' }
function onPick(file) { fileRaw.value = file.raw }
async function load() {
  try { channels.value = await http.get('/ad-material/channels') } catch { ElMessage.error('加载广告渠道失败') }
  if (!form.value.channel_code) form.value.channel_code = Object.keys(channels.value || {})[0] || 'xiaohongshu'
  try { rows.value = await http.get('/ad-material/') } catch { ElMessage.error('加载广告素材记录失败') }
}
async function runGenerate() {
  if (!fileRaw.value) return ElMessage.warning('请先上传产品图')
  generating.value = true
  try {
    const fd = new FormData()
    fd.append('file', fileRaw.value)
    fd.append('channel_code', form.value.channel_code)
    if (form.value.material_number) fd.append('material_number', form.value.material_number)
    await http.post('/ad-material/generate', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    ElMessage.success('广告素材已开始生成')
    await load()
  } finally {
    generating.value = false
  }
}
load()
</script>

<style scoped>
.page { display: grid; gap: 14px; }
.toolbar { display: flex; justify-content: flex-end; align-items: center; }
.gen-panel { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.w240 { width: 240px; }
</style>
