<template>
  <div class="page">
    <el-alert type="info" :closable="false" title="主账号可审核子账号、分配模块权限，并查看登录/生成/删除审计记录。" />
    <div class="toolbar">
      <el-button @click="refreshAll">刷新</el-button>
    </div>
    <div class="panel">
      <h3>新建子账号（主账号直建）</h3>
      <div class="row">
        <el-input v-model="form.username" placeholder="真实姓名（作为登录账号）" class="w220" />
        <el-input v-model="form.password" placeholder="密码" show-password class="w220" />
        <el-input v-model="form.email" placeholder="真实邮箱（必填）" class="w260" />
        <el-input v-model="form.phone" placeholder="真实手机号（必填）" class="w220" />
        <el-button type="primary" :loading="creating" @click="createSubUser">创建子账号</el-button>
      </div>
    </div>

    <el-table :data="users" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="username" label="用户名" width="160" />
      <el-table-column prop="email" label="邮箱" min-width="180" />
      <el-table-column label="角色" width="110">
        <template #default="{ row }">{{ row.is_superadmin ? '主账号' : '子账号' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'warning'">{{ row.is_active ? '已启用' : '待审核/停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="190">
        <template #default="{ row }">{{ formatDateTimeBeijing(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button v-if="!row.is_superadmin && !row.is_active" size="small" type="primary" @click="approve(row.id)">审核通过</el-button>
          <el-button v-if="!row.is_superadmin && row.is_active" size="small" type="danger" @click="deactivate(row.id)">停用</el-button>
          <el-button v-if="!row.is_superadmin" size="small" @click="openPermDialog(row)">权限配置</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="panel">
      <h3>操作审计日志</h3>
      <div class="row">
        <el-select v-model="auditQuery.username" clearable placeholder="账号筛选" class="w220">
          <el-option v-for="u in users" :key="u.id" :label="u.username" :value="u.username" />
        </el-select>
        <el-button @click="loadAuditLogs">查询</el-button>
      </div>
      <el-table :data="auditLogs" border>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="时间" min-width="190">
          <template #default="{ row }">{{ formatDateTimeBeijing(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="username" label="账号" width="150" />
        <el-table-column prop="module" label="模块" width="120" />
        <el-table-column prop="action" label="动作" width="120" />
        <el-table-column prop="target" label="目标" min-width="180" />
        <el-table-column prop="detail" label="详情" min-width="220" />
      </el-table>
    </div>

    <el-dialog v-model="permDialogVisible" title="模块权限配置" width="620px">
      <div class="perm-grid">
        <el-checkbox
          v-for="it in permissionCatalog"
          :key="it.code"
          :model-value="selectedPermissions.includes(it.code)"
          @change="(checked) => togglePermission(it.code, checked)"
        >
          {{ it.label }}（{{ it.code }}）
        </el-checkbox>
      </div>
      <template #footer>
        <el-button @click="permDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPerms" @click="savePermissions">保存权限</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { formatDateTimeBeijing } from '@/utils/datetime'
import * as authApi from '@/api/auth'

const users = ref([])
const auditLogs = ref([])
const permissionCatalog = ref([])
const creating = ref(false)
const savingPerms = ref(false)
const permDialogVisible = ref(false)
const currentUserId = ref(null)
const selectedPermissions = ref([])
const auditQuery = ref({ username: '' })
const form = ref({ username: '', password: '', email: '', phone: '' })

async function loadUsers() {
  users.value = await authApi.listUsers()
}

async function loadPermissionCatalog() {
  permissionCatalog.value = await authApi.listPermissionCatalog()
}

async function loadAuditLogs() {
  auditLogs.value = await authApi.listAuditLogs({ username: auditQuery.value.username || undefined, limit: 200 })
}

async function refreshAll() {
  await Promise.all([loadUsers(), loadPermissionCatalog(), loadAuditLogs()])
}

async function createSubUser() {
  if (!form.value.username.trim() || !form.value.password.trim() || !form.value.email.trim() || !form.value.phone.trim()) {
    ElMessage.warning('请填写真实姓名、密码、邮箱和手机号')
    return
  }
  creating.value = true
  try {
    await authApi.register({
      username: form.value.username.trim(),
      password: form.value.password,
      email: form.value.email.trim(),
      phone: form.value.phone.trim(),
    })
    ElMessage.success('子账号已创建，默认待审核状态')
    form.value = { username: '', password: '', email: '', phone: '' }
    await refreshAll()
  } finally {
    creating.value = false
  }
}

async function approve(id) {
  await authApi.approveUser(id)
  ElMessage.success('已审核通过')
  await refreshAll()
}

async function deactivate(id) {
  await authApi.deactivateUser(id)
  ElMessage.success('已停用')
  await refreshAll()
}

async function openPermDialog(row) {
  currentUserId.value = row.id
  const res = await authApi.getUserPermissions(row.id)
  selectedPermissions.value = [...(res.permissions || [])]
  permDialogVisible.value = true
}

function togglePermission(code, checked) {
  if (checked && !selectedPermissions.value.includes(code)) selectedPermissions.value.push(code)
  if (!checked) selectedPermissions.value = selectedPermissions.value.filter((x) => x !== code)
}

async function savePermissions() {
  if (!currentUserId.value) return
  savingPerms.value = true
  try {
    await authApi.setUserPermissions(currentUserId.value, { permissions: selectedPermissions.value })
    ElMessage.success('权限保存成功')
    permDialogVisible.value = false
    await refreshAll()
  } finally {
    savingPerms.value = false
  }
}

refreshAll().catch(() => ElMessage.error('加载权限设置失败（仅主账号可访问）'))
</script>

<style scoped>
.page { display: grid; gap: 14px; }
.toolbar { display: flex; justify-content: flex-end; }
.panel { background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 12px; }
.panel h3 { margin: 0 0 10px; font-size: 14px; color: #303133; }
.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
.w220 { width: 220px; }
.w260 { width: 260px; }
.perm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 380px; overflow: auto; }
</style>
