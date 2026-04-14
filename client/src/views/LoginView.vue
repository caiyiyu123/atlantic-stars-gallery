<template>
  <div class="login-page">
    <div class="login-card">
      <img src="@/assets/logo.png" alt="Atlantic Stars" class="login-logo-img" />
      <p class="login-subtitle">产品图片库</p>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        @submit.prevent="handleLogin"
        class="login-form"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="用户名"
            size="large"
            :prefix-icon="User"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          :loading="loading"
          class="login-btn"
          @click="handleLogin"
        >
          登录
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { User, Lock } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { login } from '../api/auth';

const router = useRouter();
const auth = useAuthStore();
const formRef = ref(null);
const loading = ref(false);

const form = reactive({
  username: '',
  password: '',
});

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function handleLogin() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    const res = await login(form);
    auth.setAuth(res.token, res.user);
    ElMessage.success(`欢迎回来，${res.user.displayName}`);
    router.push('/');
  } catch (err) {
    // 错误已在拦截器中处理
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
}

.login-card {
  width: 400px;
  padding: 48px 40px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  text-align: center;
}

.login-logo-img {
  height: 60px;
  width: auto;
  margin: 0 auto 16px;
  display: block;
}

.login-subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 32px;
}

.login-form {
  text-align: left;
}

.login-btn {
  width: 100%;
  margin-top: 8px;
  border-radius: var(--radius-md) !important;
  font-size: 16px;
  height: 44px;
}
</style>
