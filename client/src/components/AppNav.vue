<template>
  <header class="app-nav">
    <div class="nav-logo-row">
      <router-link to="/" class="nav-logo">
        <img src="@/assets/logo.png" alt="Atlantic Stars" class="nav-logo-img" />
      </router-link>
    </div>
    <div class="nav-bar-row">
      <div class="nav-left">
        <router-link :to="isAiSection ? '/ai/hd-white' : '/'" class="nav-logo nav-logo-desktop">
          <img src="@/assets/logo.png" alt="Atlantic Stars" class="nav-logo-img" />
        </router-link>

        <!-- AS 产品库板块 -->
        <template v-if="!isAiSection">
          <router-link v-if="auth.hasModule('gallery')" to="/" class="nav-link nav-link-yellow" :class="{ active: route.name === 'ProductList' }">产品图库</router-link>
          <router-link v-if="auth.hasModule('products')" to="/admin/products" class="nav-link nav-link-orange" :class="{ active: route.name === 'ProductManage' }">产品管理</router-link>
          <router-link v-if="auth.hasModule('series')" to="/admin/series" class="nav-link nav-link-red" :class="{ active: route.name === 'SeriesManage' }">系列管理</router-link>
        </template>

        <!-- AS-AI 板块 -->
        <template v-else>
          <router-link to="/ai/hd-white" class="nav-link nav-link-yellow" :class="{ active: route.name === 'AiHdWhite' }">高清白底图</router-link>
          <span class="nav-link nav-link-orange nav-link-disabled" title="敬请期待">功能二</span>
          <span class="nav-link nav-link-red nav-link-disabled" title="敬请期待">功能三</span>
        </template>
      </div>
      <div class="nav-right">
        <div v-if="showSwitchButton" class="nav-switch-wrap">
          <router-link :to="switchTarget" class="nav-switch">{{ switchLabel }}</router-link>
        </div>
        <div class="nav-user-row">
          <span class="nav-username">{{ auth.user?.displayName }}</span>
          <div class="nav-avatar-wrapper" @click="showDropdown = !showDropdown" v-click-outside="() => showDropdown = false">
            <div class="nav-avatar">{{ auth.user?.displayName?.charAt(0) }}</div>
            <div v-if="showDropdown" class="nav-dropdown">
              <router-link v-if="auth.isAdmin" to="/admin/users" class="dropdown-item" @click="showDropdown = false">
                用户管理
              </router-link>
              <router-link v-if="auth.isSuperAdmin" to="/admin/api-keys" class="dropdown-item" @click="showDropdown = false">
                API Key 管理
              </router-link>
              <div class="dropdown-item dropdown-logout" @click="handleLogout">退出登录</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const showDropdown = ref(false);

const isAiSection = computed(() => route.path.startsWith('/ai'));

const switchTarget = computed(() => isAiSection.value ? '/' : '/ai/hd-white');
const switchLabel = computed(() => isAiSection.value ? '← 切换到 AS 产品库' : '切换到 AS-AI →');

const showSwitchButton = computed(() => {
  // 如果当前是 AI 板块，检查用户有无产品库任何模块权限
  // 如果当前是产品库板块，检查用户有无 as_ai 权限
  if (isAiSection.value) {
    return auth.hasModule('gallery') || auth.hasModule('products') || auth.hasModule('series') || auth.isAdmin;
  }
  return auth.hasModule('as_ai');
});

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

.nav-logo-row {
  display: none;
}

.nav-logo-desktop {
  display: flex;
  align-items: center;
  text-decoration: none;
}

.nav-bar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 12px;
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
    flex-direction: column;
    padding: 10px 14px;
  }

  .nav-logo-desktop {
    display: none;
  }

  .nav-logo-row {
    display: flex;
    justify-content: center;
    margin-bottom: 8px;
  }

  .nav-logo-row .nav-logo-img {
    height: 36px;
  }

  .nav-bar-row {
    width: 100%;
  }

  .nav-link {
    font-size: 13px;
    min-width: auto;
    padding: 6px 12px;
  }

  .nav-left {
    gap: 8px;
  }

  .nav-username {
    display: none;
  }

  .nav-avatar {
    width: 32px;
    height: 32px;
    font-size: 13px;
  }
}

.nav-switch-wrap {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}

.nav-switch {
  font-size: 12px;
  color: var(--color-text-secondary, #86868b);
  text-decoration: none;
  padding: 4px 12px;
  border: 1px solid var(--color-border, #e5e5e7);
  border-radius: 14px;
  background: #fff;
  transition: all 0.2s;
}

.nav-switch:hover {
  border-color: #CF2028;
  color: #CF2028;
}

.nav-user-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-link-disabled {
  opacity: 0.5;
  pointer-events: none;
  cursor: not-allowed;
}

.nav-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
}

@media (max-width: 768px) {
  .nav-switch-wrap { display: none; }
}
</style>
