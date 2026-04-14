<template>
  <header class="app-nav">
    <div class="nav-left">
      <router-link to="/" class="nav-logo">★ Atlantic Stars</router-link>
      <router-link to="/" class="nav-link" :class="{ active: route.name === 'ProductList' }">
        产品库
      </router-link>
      <template v-if="auth.isAdmin">
        <router-link to="/admin/products" class="nav-link" :class="{ active: route.name === 'ProductManage' }">
          产品管理
        </router-link>
        <router-link to="/admin/users" class="nav-link" :class="{ active: route.name === 'UserManage' }">
          用户管理
        </router-link>
      </template>
    </div>
    <div class="nav-right">
      <span class="nav-username">{{ auth.user?.displayName }}</span>
      <div class="nav-avatar" @click="handleLogout">
        {{ auth.user?.displayName?.charAt(0) }}
      </div>
    </div>
  </header>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { ElMessageBox } from 'element-plus';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定退出登录？', '提示', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    });
    auth.logout();
    router.push('/login');
  } catch {
    // 取消
  }
}
</script>

<style scoped>
.app-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: rgba(251, 251, 253, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  margin-bottom: 24px;
  position: sticky;
  top: 16px;
  z-index: 100;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.nav-logo {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-text);
  text-decoration: none;
}

.nav-link {
  font-size: 13px;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: color 0.2s;
}

.nav-link.active {
  color: var(--color-text);
  font-weight: 500;
}

.nav-link:hover {
  color: var(--color-text);
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-username {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.nav-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5e5ce6, #bf5af2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: transform 0.2s;
}

.nav-avatar:hover {
  transform: scale(1.1);
}
</style>
