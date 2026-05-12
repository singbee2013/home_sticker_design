<template>
  <div class="page">
    <div class="toolbar">
      <div class="actions">
        <el-button type="primary" @click="openCreate">新增风格</el-button>
        <el-button @click="syncPresets" :loading="syncing">同步官方预设</el-button>
        <el-button @click="load">刷新</el-button>
      </div>
    </div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="tip"
      title="启用中的风格会出现在「AI 图案生成」的设计风格下拉里。删除为软删除，仅隐藏条目；历史生成记录仍可显示对应风格名称。"
    />
    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column prop="name_en" label="英文名" min-width="120" />
      <el-table-column prop="prompt_snippet" label="提示词片段" min-width="200" show-overflow-tooltip />
      <el-table-column prop="sort_order" label="排序" width="80" />
      <el-table-column label="启用" width="90">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="openEdit(row)">编辑</el-button>
          <el-button type="danger" link size="small" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg.visible" :title="dlg.editingId ? '编辑风格' : '新增风格'" width="520px" destroy-on-close @closed="resetForm">
      <el-form label-position="top" :model="form">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="200" show-word-limit placeholder="例如：北欧简约风" />
        </el-form-item>
        <el-form-item label="英文名（可选）">
          <el-input v-model="form.name_en" maxlength="200" placeholder="英文备注" />
        </el-form-item>
        <el-form-item label="提示词片段（注入 AI）">
          <el-input v-model="form.prompt_snippet" type="textarea" :rows="4" maxlength="2000" show-word-limit placeholder="英文描述更易被模型理解" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="9999" controls-position="right" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="dlg.saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as metaApi from '@/api/meta'

const rows = ref([])
const loading = ref(false)
const syncing = ref(false)
const dlg = reactive({ visible: false, editingId: null, saving: false })
const form = reactive({
  name: '',
  name_en: '',
  prompt_snippet: '',
  sort_order: 0,
  is_active: true,
})

async function load() {
  loading.value = true
  try {
    rows.value = await metaApi.listStyles({ include_inactive: true })
  } catch {
    ElMessage.error('加载风格模板失败')
  } finally {
    loading.value = false
  }
}

async function syncPresets() {
  syncing.value = true
  try {
    await metaApi.ensureStylePresets()
    ElMessage.success('已写入官方预设并隐藏旧版默认五条（若尚未执行过）')
    await load()
  } finally {
    syncing.value = false
  }
}

function resetForm() {
  dlg.editingId = null
  form.name = ''
  form.name_en = ''
  form.prompt_snippet = ''
  form.sort_order = 0
  form.is_active = true
}

function openCreate() {
  resetForm()
  dlg.visible = true
}

function openEdit(row) {
  dlg.editingId = row.id
  form.name = row.name || ''
  form.name_en = row.name_en || ''
  form.prompt_snippet = row.prompt_snippet || ''
  form.sort_order = row.sort_order ?? 0
  form.is_active = !!row.is_active
  dlg.visible = true
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写名称')
    return
  }
  dlg.saving = true
  try {
    if (dlg.editingId) {
      await metaApi.updateStyle(dlg.editingId, {
        name: form.name.trim(),
        name_en: form.name_en.trim() || null,
        prompt_snippet: form.prompt_snippet.trim() || null,
        sort_order: form.sort_order,
        is_active: form.is_active,
      })
      ElMessage.success('已保存')
    } else {
      await metaApi.createStyle({
        name: form.name.trim(),
        name_en: form.name_en.trim() || null,
        prompt_snippet: form.prompt_snippet.trim() || null,
        sort_order: form.sort_order,
        is_active: form.is_active,
      })
      ElMessage.success('已新增')
    }
    dlg.visible = false
    await load()
  } finally {
    dlg.saving = false
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除风格「${row.name}」？删除后将从下拉里隐藏。`, '确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await metaApi.deleteStyle(row.id)
    ElMessage.success('已删除')
    await load()
  } catch {
    /* interceptor */
  }
}

load()
</script>

<style scoped>
.page { display: grid; gap: 14px; }
.toolbar { display: flex; align-items: center; justify-content: flex-end; }
.actions { display: flex; gap: 8px; }
.tip { margin-bottom: 0; }
</style>
