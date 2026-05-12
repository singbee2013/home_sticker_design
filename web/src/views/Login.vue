<template>
  <div class="login-page">
    <div class="bg-orb orb1" />
    <div class="bg-orb orb2" />

    <div class="login-card">
      <div class="brand">
        <svg viewBox="0 0 32 32" width="34" height="34"><rect width="32" height="32" rx="7" fill="#0F5F4C"/><path d="M9 22 L16 8 L23 22 Z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><circle cx="16" cy="18" r="2.5" fill="#3FE0B5"/></svg>
        <div>
          <div class="brand-name">DecorAI</div>
          <div class="brand-tag">AI 图案与电商素材生成平台</div>
        </div>
      </div>

      <h2>{{ isRegister ? '实名注册账号' : '欢迎回来 👋' }}</h2>
      <p class="hint">{{ isRegister ? '注册后需主账号审核通过才能登录' : '登录账号，继续创作高品质装饰图案' }}</p>

      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" @keyup.enter="onSubmit">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" size="large" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="邮箱" v-if="isRegister">
          <el-input v-model="form.email" size="large" placeholder="必填：真实邮箱" />
        </el-form-item>
        <el-form-item label="手机号" v-if="isRegister">
          <el-input v-model="form.phone" size="large" placeholder="必填：真实手机号" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password size="large" placeholder="请输入密码" />
        </el-form-item>
        <el-button type="primary" size="large" class="submit" :loading="loading" @click="onSubmit">{{ isRegister ? '提交注册' : '登录' }}</el-button>
      </el-form>

      <div class="switch-mode">
        <el-link type="primary" @click="isRegister = !isRegister">{{ isRegister ? '返回登录' : '没有账号？去注册' }}</el-link>
      </div>
      <div class="footer-tip">默认主账号 <code>admin</code> / <code>admin123</code></div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import * as authApi from '@/api/auth'

const user = useUserStore()
const router = useRouter()
const route = useRoute()

const formRef = ref()
const loading = ref(false)
const isRegister = ref(false)
const form = reactive({ username: 'singbee2013@gmail.com', password: 'xielichan18', email: '', phone: '' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function onSubmit() {
  await formRef.value.validate().catch(() => null)
  if (!form.username || !form.password) return
  loading.value = true
  try {
    if (isRegister.value) {
      if (!form.email.trim() || !form.phone.trim()) {
        ElMessage.warning('注册必须填写真实邮箱和手机号')
        return
      }
      await authApi.register({
        username: form.username,
        password: form.password,
        email: form.email.trim(),
        phone: form.phone.trim(),
      })
      ElMessage.success('注册成功，等待主账号审核')
      isRegister.value = false
    } else {
      await user.login(form.username, form.password)
      ElMessage.success('登录成功')
      router.replace(route.query.r || '/dashboard')
    }
  } catch {} finally { loading.value = false }
}
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #F5F7F6 0%, #E8F6F1 100%);
  display: grid; place-items: center;
  position: relative; overflow: hidden;
}
html.dark .login-page { background: linear-gradient(135deg, #0E1513 0%, #0B2A23 100%); }
.bg-orb {
  position: absolute; border-radius: 50%; filter: blur(70px); opacity: .35;
  &.orb1 { width: 360px; height: 360px; background: var(--brand-accent); top: -80px; right: -60px; }
  &.orb2 { width: 420px; height: 420px; background: var(--brand-500); bottom: -120px; left: -120px; opacity: .25; }
}
.login-card {
  position: relative; z-index: 1;
  width: 420px; max-width: 92vw;
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 36px 36px 28px;
  box-shadow: 0 8px 40px rgba(15,95,76,0.10);
}
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.brand-name { font-size: 18px; font-weight: 700; color: var(--text-primary); }
.brand-tag { font-size: 12px; color: var(--text-tertiary); }
h2 { margin: 8px 0 4px; font-size: 24px; color: var(--text-primary); }
.hint { margin: 0 0 22px; color: var(--text-tertiary); font-size: 13px; }
.submit { width: 100%; margin-top: 6px; height: 44px; font-weight: 600; }
.switch-mode { margin-top: 10px; text-align: center; }
.footer-tip { margin-top: 18px; text-align: center; color: var(--text-tertiary); font-size: 12px;
  code { background: var(--bg-page); padding: 1px 6px; border-radius: 4px; color: var(--brand-500); }
}
</style>
