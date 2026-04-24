<template>
  <div class="choose-bg">
    <div class="choose-container">
      <img src="@/assets/logo.png" alt="Atlantic Stars" class="choose-logo" />
      <h1 class="choose-title">Welcome, {{ auth.user?.displayName }}</h1>
      <p class="choose-subtitle">请选择要进入的板块</p>

      <div class="choose-grid">
        <div
          class="choose-card"
          :class="{ disabled: !hasGallery }"
          @click="enter('gallery')"
        >
          <div class="choose-icon">📦</div>
          <div class="choose-card-title">AS 产品库</div>
          <div class="choose-card-desc">查看和管理产品图片、系列、用户</div>
          <div class="choose-card-cta">
            {{ hasGallery ? '进入 →' : '暂无权限' }}
          </div>
        </div>

        <div
          class="choose-card"
          :class="{ disabled: !hasAsAi }"
          @click="enter('as_ai')"
        >
          <div class="choose-icon">🤖</div>
          <div class="choose-card-title">AS-AI</div>
          <div class="choose-card-desc">AI 高清白底图（更多功能开发中）</div>
          <div class="choose-card-cta">
            {{ hasAsAi ? '进入 →' : '暂无权限' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

const hasGallery = computed(() =>
  auth.hasModule('gallery') || auth.hasModule('products') || auth.hasModule('series') || auth.isAdmin
);
const hasAsAi = computed(() => auth.hasModule('as_ai'));

function enter(section) {
  if (section === 'gallery' && hasGallery.value) {
    router.push('/');
  } else if (section === 'as_ai' && hasAsAi.value) {
    router.push('/ai/hd-white');
  }
}
</script>

<style scoped>
.choose-bg {
  min-height: 100vh;
  background: linear-gradient(135deg, #CF2028, #EE7624, #F5D726);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.choose-container {
  max-width: 900px;
  width: 100%;
  text-align: center;
}

.choose-logo {
  height: 80px;
  margin-bottom: 24px;
}

.choose-title {
  color: #fff;
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

.choose-subtitle {
  color: rgba(255, 255, 255, 0.85);
  font-size: 16px;
  margin: 0 0 40px 0;
}

.choose-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 640px) {
  .choose-grid { grid-template-columns: 1fr; }
}

.choose-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 40px 32px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.choose-card:not(.disabled):hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
}

.choose-card.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.choose-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.choose-card-title {
  font-size: 22px;
  font-weight: 700;
  color: #1d1d1f;
  margin-bottom: 8px;
}

.choose-card-desc {
  font-size: 14px;
  color: #86868b;
  margin-bottom: 24px;
  min-height: 40px;
}

.choose-card-cta {
  font-size: 15px;
  font-weight: 600;
  color: #CF2028;
}

.choose-card.disabled .choose-card-cta {
  color: #86868b;
}
</style>
