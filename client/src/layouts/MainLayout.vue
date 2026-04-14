<template>
  <div class="main-layout">
    <AppNav />
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import AppNav from '../components/AppNav.vue';
</script>

<style scoped>
.main-layout {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px;
  min-height: 100vh;
}

.main-content {
  min-height: calc(100vh - 100px);
}
</style>
