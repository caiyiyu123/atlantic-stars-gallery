<template>
  <div v-loading="loading">
    <el-button text @click="$router.back()" style="margin-bottom: 16px;">
      ← 返回
    </el-button>

    <div class="detail-layout" v-if="product">
      <div class="detail-images">
        <div class="main-image" @click="openViewer(currentImage?.original_url)">
          <img v-if="currentImage" :src="currentImage.original_url" :alt="product.sku" />
          <span v-else class="no-image">暂无图片</span>
        </div>
        <div class="thumb-list" v-if="product.images?.length > 0">
          <div
            v-for="(img, i) in product.images"
            :key="img.id"
            class="thumb-item"
            :class="{ active: currentIndex === i }"
            @click="currentIndex = i"
          >
            <img :src="img.thumbnail_url" :alt="`图${i + 1}`" />
          </div>
        </div>
      </div>

      <div class="detail-info">
        <h1 class="detail-sku">{{ product.sku }}</h1>
        <div class="detail-series">{{ product.series_name }} 系列</div>

        <div class="detail-specs">
          <div class="spec-row">
            <span class="spec-label">颜色</span>
            <span class="spec-value">{{ product.color_name }}</span>
          </div>
          <div class="spec-row" v-if="product.material">
            <span class="spec-label">材质</span>
            <span class="spec-value">{{ product.material }}</span>
          </div>
          <div class="spec-row" v-if="product.size_range">
            <span class="spec-label">尺码</span>
            <span class="spec-value">{{ product.size_range }}</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">季度</span>
            <span class="spec-value">{{ product.season_name }}</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">类别</span>
            <span class="spec-value">{{ categoryLabel }}</span>
          </div>
          <div class="spec-row last">
            <span class="spec-label">图片</span>
            <span class="spec-value">{{ product.images?.length || 0 }} 张</span>
          </div>
        </div>

        <div class="detail-actions">
          <el-button type="primary" @click="handleDownload" :loading="downloading">
            下载全部图片
          </el-button>
        </div>
      </div>
    </div>

    <ImageViewer
      :visible="viewerVisible"
      :src="viewerSrc"
      @close="viewerVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import ImageViewer from '../components/ImageViewer.vue';
import { getProduct } from '../api/products';
import { downloadImages } from '../api/images';

const route = useRoute();
const router = useRouter();

const product = ref(null);
const loading = ref(false);
const currentIndex = ref(0);
const downloading = ref(false);
const viewerVisible = ref(false);
const viewerSrc = ref('');

const currentImage = computed(() => product.value?.images?.[currentIndex.value]);

const categoryLabels = { men: 'Men', women: 'Women', kids: 'Kids' };
const categoryLabel = computed(() => categoryLabels[product.value?.category] || '');

async function fetchProduct() {
  loading.value = true;
  try {
    product.value = await getProduct(route.params.id);
  } catch (err) {
    // 错误已在拦截器中处理
  } finally {
    loading.value = false;
  }
}

function openViewer(url) {
  if (!url) return;
  viewerSrc.value = url;
  viewerVisible.value = true;
}

async function handleDownload() {
  downloading.value = true;
  try {
    const blob = await downloadImages([product.value.id]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${product.value.sku}-images.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    // 错误已在拦截器中处理
  } finally {
    downloading.value = false;
  }
}

onMounted(fetchProduct);
</script>

<style scoped>
.detail-layout {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 48px;
  align-items: start;
}

.main-image {
  width: 100%;
  aspect-ratio: 1;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-in;
  margin-bottom: 14px;
}

.main-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.no-image {
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.thumb-list {
  display: flex;
  gap: 10px;
}

.thumb-item {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  background: var(--color-bg-tertiary);
}

.thumb-item.active {
  border-color: var(--color-primary);
}

.thumb-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-sku {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}

.detail-series {
  font-size: 17px;
  color: var(--color-primary);
  font-weight: 500;
  margin-bottom: 28px;
}

.spec-row {
  display: flex;
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border-light);
  font-size: 14px;
}

.spec-row.last {
  border-bottom: none;
}

.spec-label {
  width: 80px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.detail-actions {
  display: flex;
  gap: 12px;
  margin-top: 36px;
}

.detail-actions .el-button {
  border-radius: var(--radius-pill) !important;
}
</style>
