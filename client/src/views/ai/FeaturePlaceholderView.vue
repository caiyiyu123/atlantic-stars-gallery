<template>
  <div class="placeholder">
    <div class="placeholder-icon">🚧</div>
    <h2>{{ featureName }}</h2>
    <p>功能开发中，敬请期待</p>
  </div>
</template>

<script setup>
defineProps({
  featureName: { type: String, default: '功能' },
});
</script>

<style scoped>
.placeholder {
  text-align: center;
  padding: 80px 20px;
  color: #86868b;
}
.placeholder-icon { font-size: 64px; margin-bottom: 16px; }
.placeholder h2 { font-size: 24px; color: #1d1d1f; margin-bottom: 8px; }
</style>
