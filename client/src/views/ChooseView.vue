<template>
  <div class="choose-bg">
    <div class="choose-container">
      <img src="@/assets/logo.png" alt="Atlantic Stars" class="choose-logo" />
      <h1 class="choose-title">Welcome, {{ auth.user?.displayName }}</h1>
      <p class="choose-subtitle">请选择要进入的板块</p>

      <div class="choose-grid">
        <article
          class="card card-gallery"
          :class="{ locked: !hasGallery }"
          @click="enter('gallery')"
        >
          <h3 class="card-title">AS 产品库</h3>
        </article>

        <article
          class="card card-ai"
          :class="{ locked: !hasAsAi }"
          @click="enter('as_ai')"
        >
          <h3 class="card-title">AS-AI</h3>
        </article>
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
  height: 140px;
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

@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&display=swap');

.choose-grid {
  display: flex;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
}

.card {
  position: relative;
  padding: 22px 44px;
  border-radius: 999px;
  cursor: pointer;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 220px;
  transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1),
              box-shadow 0.5s ease,
              letter-spacing 0.5s ease;
  font-family: 'Fraunces', Georgia, serif;
}

.card-gallery {
  background: linear-gradient(135deg, #2d4a3e 0%, #0f2520 100%);
  color: #f5efdc;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.card-ai {
  background: linear-gradient(135deg, #6b2322 0%, #2a0808 100%);
  color: #fff5e1;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.card:not(.locked):hover { transform: translateY(-3px); }
.card-gallery:not(.locked):hover { box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4); }
.card-ai:not(.locked):hover { box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); }

.card-title {
  font-size: 22px;
  font-weight: 500;
  letter-spacing: 0.02em;
  margin: 0;
  transition: letter-spacing 0.5s ease;
}
.card:not(.locked):hover .card-title { letter-spacing: 0.1em; }

.card.locked {
  cursor: not-allowed;
  filter: grayscale(0.55) brightness(0.85);
  opacity: 0.55;
}

@media (max-width: 640px) {
  .choose-grid { flex-direction: column; align-items: center; }
  .card { width: 100%; max-width: 280px; }
}
</style>
