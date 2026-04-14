<template>
  <header class="app-nav">
    <div class="nav-left">
      <router-link to="/" class="nav-logo">
        <img src="@/assets/logo.png" alt="Atlantic Stars" class="nav-logo-img" />
      </router-link>
      <router-link to="/" class="nav-link nav-link-yellow" :class="{ active: route.name === 'ProductList' }">
        产品图库
      </router-link>
      <router-link v-if="auth.isAdmin" to="/admin/products" class="nav-link nav-link-orange" :class="{ active: route.name === 'ProductManage' }">
        产品管理
      </router-link>
      <router-link v-if="auth.isAdmin" to="/admin/series" class="nav-link nav-link-red" :class="{ active: route.name === 'SeriesManage' }">
        系列管理
      </router-link>
    </div>
    <div class="nav-right">
      <span class="nav-username">{{ auth.user?.displayName }}</span>
      <div class="nav-avatar-wrapper" @click="showDropdown = !showDropdown" v-click-outside="() => showDropdown = false">
        <div class="nav-avatar">
          {{ auth.user?.displayName?.charAt(0) }}
        </div>
        <div v-if="showDropdown" class="nav-dropdown">
          <router-link v-if="auth.isAdmin" to="/admin/users" class="dropdown-item" @click="showDropdown = false">
            用户管理
          </router-link>
          <div class="dropdown-item dropdown-logout" @click="handleLogout">
            退出登录
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const showDropdown = ref(false);

const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => {
      if (!el.contains(e.target)) binding.value();
    };
    document.addEventListener('click', el._clickOutside);
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside);
  },
};

function handleLogout() {
  showDropdown.value = false;
  auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.app-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
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
  gap: 24px;
}

.nav-logo {
  display: flex;
  align-items: center;
  text-decoration: none;
}

.nav-logo-img {
  height: 56px;
  width: auto;
}

.nav-link {
  font-size: 16px;
  color: #fff;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 100px;
  padding: 8px 20px;
  box-sizing: border-box;
  border-radius: 20px;
  font-weight: 500;
  transition: opacity 0.2s;
}

.nav-link-yellow {
  background: #F5D726;
}

.nav-link-orange {
  background: #EE7624;
}

.nav-link-red {
  background: #CF2028;
}

.nav-link.active {
  opacity: 0.9;
}

.nav-link:hover {
  opacity: 0.85;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-username {
  font-size: 15px;
  color: var(--color-text-secondary);
}

.nav-avatar-wrapper {
  position: relative;
}

.nav-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5e5ce6, #bf5af2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: transform 0.2s;
}

.nav-avatar:hover {
  transform: scale(1.1);
}

.nav-dropdown {
  position: absolute;
  top: 44px;
  right: 0;
  min-width: 140px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 6px;
  z-index: 200;
}

.dropdown-item {
  display: block;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--color-text);
  text-decoration: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.dropdown-item:hover {
  background: var(--color-bg-tertiary, #f5f5f7);
}

.dropdown-logout {
  color: #e53e3e;
}

@media (max-width: 768px) {
  .app-nav {
    flex-wrap: wrap;
    padding: 10px 14px;
    gap: 10px;
  }

  .nav-left {
    gap: 8px;
    flex-wrap: wrap;
  }

  .nav-logo-img {
    height: 36px;
  }

  .nav-link {
    font-size: 13px;
    min-width: auto;
    padding: 6px 12px;
  }

  .nav-username {
    display: none;
  }
}
</style>
