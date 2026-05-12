<template>
  <div class="page">
    <div class="toolbar">
      <div class="actions">
        <el-button type="primary" @click="openRuleDialog(false)">新增规则</el-button>
        <el-button @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert type="info" :closable="false" show-icon class="tip"
              title="规则请绑定到「二级类目」（产品分类中带父级的子节点）。生成编号时按二级类目递增。" />

    <div class="ops">
      <el-select v-model="genCatId" placeholder="选择二级类目生成编号" filterable clearable class="sel">
        <el-option v-for="c in leafCategories" :key="c.id" :label="c._label" :value="c.id" />
      </el-select>
      <el-button type="primary" @click="generateByLeaf">生成编号</el-button>
      <span class="result" v-if="generated">{{ generated }}</span>
    </div>

    <el-table :data="rules" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="category_name" label="二级类目" min-width="140" />
      <el-table-column prop="category_code" label="编码键" width="120" />
      <el-table-column prop="prefix" label="前缀" width="100" />
      <el-table-column prop="padding" label="位数" width="70" />
      <el-table-column prop="current_seq" label="当前序号" width="90" />
      <el-table-column prop="description" label="备注" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openRuleDialog(true, row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="deleteRule(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="ruleDlg.visible" :title="ruleDlg.editId ? '编辑编号规则' : '新增编号规则'" width="520px">
      <el-form label-position="top" :model="ruleForm">
        <el-form-item label="绑定二级类目" required>
          <el-select v-model="ruleForm.category_id" filterable placeholder="必选" class="w-full">
            <el-option v-for="c in leafCategories" :key="c.id" :label="c._label" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="前缀" required>
          <el-input v-model="ruleForm.prefix" maxlength="50" placeholder="如 STK" />
        </el-form-item>
        <el-form-item label="序号位数">
          <el-input-number v-model="ruleForm.padding" :min="2" :max="8" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="ruleForm.description" maxlength="300" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="ruleDlg.saving" @click="saveRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import * as metaApi from '@/api/meta'

const rules = ref([])
const catTree = ref([])
const generated = ref('')
const genCatId = ref(null)

const ruleDlg = reactive({ visible: false, saving: false, editId: null })
const ruleForm = reactive({
  category_id: null,
  prefix: '',
  padding: 3,
  description: '',
})

function flattenLeaves(nodes, acc = []) {
  for (const n of nodes || []) {
    if (n.parent_id != null)
      acc.push({
        ...n,
        _label: `${n.name}${n.code ? ' · ' + n.code : ''}`,
      })
    if (n.children?.length)
      flattenLeaves(n.children, acc)
  }
  return acc
}

const leafCategories = computed(() => flattenLeaves(catTree.value))

async function load() {
  try {
    rules.value = await http.get('/numbering/rules')
  } catch {
    ElMessage.error('加载编号规则失败')
  }
  try {
    catTree.value = await metaApi.listCategoryTree()
  } catch {
    ElMessage.error('加载类目失败')
  }
}

async function generateByLeaf() {
  if (!genCatId.value) return ElMessage.warning('请选择二级类目')
  try {
    const r = await http.post(`/numbering/generate/by-category/${genCatId.value}`)
    generated.value = r.base_number || ''
    ElMessage.success('生成成功')
    await load()
  } catch {
    /* interceptor */
  }
}

function openRuleDialog(edit, row = null) {
  ruleDlg.editId = edit ? row.id : null
  if (edit && row) {
    ruleForm.category_id = row.category_id
    ruleForm.prefix = row.prefix
    ruleForm.padding = row.padding
    ruleForm.description = row.description || ''
  } else {
    ruleForm.category_id = null
    ruleForm.prefix = ''
    ruleForm.padding = 3
    ruleForm.description = ''
  }
  ruleDlg.visible = true
}

async function saveRule() {
  if (!ruleForm.category_id && !ruleDlg.editId) return ElMessage.warning('请选择二级类目')
  if (!ruleForm.prefix.trim()) return ElMessage.warning('请填写前缀')
  ruleDlg.saving = true
  try {
    if (ruleDlg.editId) {
      await http.put(`/numbering/rules/${ruleDlg.editId}`, {
        prefix: ruleForm.prefix.trim(),
        padding: ruleForm.padding,
        description: ruleForm.description.trim() || null,
        category_id: ruleForm.category_id,
      })
      ElMessage.success('已保存')
    } else {
      await http.post('/numbering/rules', {
        category_id: ruleForm.category_id,
        prefix: ruleForm.prefix.trim(),
        padding: ruleForm.padding,
        description: ruleForm.description.trim() || null,
      })
      ElMessage.success('已新增')
    }
    ruleDlg.visible = false
    await load()
  } finally {
    ruleDlg.saving = false
  }
}

async function deleteRule(row) {
  try {
    await ElMessageBox.confirm('删除该编号规则？（不影响历史任务记录）', '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await http.delete(`/numbering/rules/${row.id}`)
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
.ops { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.sel { min-width: 280px; flex: 1; max-width: 420px; }
.result { color: #409eff; font-weight: 600; word-break: break-all; }
.w-full { width: 100%; }
</style>
