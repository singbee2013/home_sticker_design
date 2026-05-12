<template>
  <div class="page">
    <div class="toolbar">
      <div class="actions">
        <el-button type="primary" @click="openCreate(null)">新增一级类目</el-button>
        <el-button @click="load">刷新</el-button>
      </div>
    </div>
    <el-alert type="info" :closable="false" show-icon class="tip"
              title="支持一级 / 二级类目树：可先建一级，再在树上右键或直接选中节点新增二级。" />

    <div class="panel">
      <el-tree
        ref="treeRef"
        :data="tree"
        node-key="id"
        default-expand-all
        highlight-current
        :props="{ label: 'name', children: 'children' }"
        @node-click="selectNode"
      >
        <template #default="{ node, data }">
          <div class="node-row">
            <span class="nm">{{ node.label }}</span>
            <span v-if="data.code" class="code">{{ data.code }}</span>
            <span class="spacer" />
            <el-button link type="primary" size="small" @click.stop="openCreate(data.id)">添加子类</el-button>
            <el-button link type="primary" size="small" @click.stop="openEdit(data)">编辑</el-button>
            <el-button link type="danger" size="small" @click.stop="removeCat(data)">删除</el-button>
          </div>
        </template>
      </el-tree>
    </div>

    <el-dialog v-model="dlg.visible" :title="dlg.editId ? '编辑类目' : '新增类目'" width="480px" destroy-on-close>
      <el-form label-position="top" :model="form">
        <el-form-item v-if="form.parent_id !== undefined && dlg.mode !== 'edit'" label="父类目 ID">
          <el-input :model-value="String(form.parent_id ?? '')" disabled />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="编码（建议字母数字）">
          <el-input v-model="form.code" maxlength="50" placeholder="如 wallpaper_cn_sub01（编号规则也会用到）" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="9999" />
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

const tree = ref([])
const treeRef = ref(null)
const dlg = reactive({ visible: false, saving: false, editId: null, mode: 'create' })
const form = reactive({
  name: '',
  code: '',
  description: '',
  sort_order: 0,
  parent_id: null,
})

async function load() {
  try {
    tree.value = await metaApi.listCategoryTree()
  } catch {
    ElMessage.error('加载分类失败')
  }
}

function selectNode() {
  /* highlight only */
}

function openCreate(parentId) {
  dlg.mode = 'create'
  dlg.editId = null
  form.name = ''
  form.code = ''
  form.description = ''
  form.sort_order = 0
  form.parent_id = parentId
  dlg.visible = true
}

function openEdit(row) {
  dlg.mode = 'edit'
  dlg.editId = row.id
  form.name = row.name || ''
  form.code = row.code || ''
  form.description = row.description || ''
  form.sort_order = row.sort_order ?? 0
  form.parent_id = row.parent_id ?? null
  dlg.visible = true
}

async function save() {
  if (!form.name.trim()) return ElMessage.warning('请填写名称')
  dlg.saving = true
  try {
    if (dlg.editId) {
      await metaApi.updateCategory(dlg.editId, {
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        sort_order: form.sort_order,
      })
      ElMessage.success('已保存')
    } else {
      await metaApi.createCategory({
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        parent_id: form.parent_id,
        sort_order: form.sort_order,
      })
      ElMessage.success('已新增')
    }
    dlg.visible = false
    await load()
  } finally {
    dlg.saving = false
  }
}

async function removeCat(row) {
  try {
    await ElMessageBox.confirm(`删除类目「${row.name}」？（软删除）`, '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await metaApi.deleteCategory(row.id)
    ElMessage.success('已删除')
    await load()
  } catch {
    /* http interceptor */
  }
}

load()
</script>

<style scoped>
.page { display: grid; gap: 14px; }
.toolbar { display: flex; align-items: center; justify-content: flex-end; }
.actions { display: flex; gap: 8px; }
.tip { margin-bottom: 0; }
.panel { background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 12px 8px; min-height: 360px; }
.node-row { display: flex; align-items: center; gap: 8px; padding-right: 8px; flex: 1; min-width: 0; }
.nm { font-weight: 500; }
.code { font-size: 11px; color: #909399; background: #f4f4f5; padding: 1px 6px; border-radius: 4px; }
.spacer { flex: 1; }
</style>
