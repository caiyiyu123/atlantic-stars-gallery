import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '');
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'));

  const isLoggedIn = computed(() => !!token.value);
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin');
  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'super_admin');
  const isOperator = computed(() => user.value?.role === 'operator');

  function hasModule(module) {
    if (!user.value) return false;
    if (user.value.role === 'super_admin' || user.value.role === 'admin') return true;
    return user.value.permissions?.includes(module) || false;
  }

  function setAuth(tokenVal, userVal) {
    token.value = tokenVal;
    user.value = userVal;
    localStorage.setItem('token', tokenVal);
    localStorage.setItem('user', JSON.stringify(userVal));
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  return { token, user, isLoggedIn, isSuperAdmin, isAdmin, isOperator, hasModule, setAuth, logout };
});
