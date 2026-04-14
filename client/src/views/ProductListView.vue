<template>
  <div>
    <FilterBar @change="fetchProducts(1)" />

    <div class="list-toolbar" v-if="selectedIds.length > 0">
      <span class="selected-count">已选 {{ selectedIds.length }} 款</span>
<el-button size="small" @click="handleBatchDownload" :loading="downloading">
        批量下载
      </el-button>
      <el-button size="small" text @click="selectedIds = []">取消选择</el-button>
    </div>

    <div class="product-grid" v-loading="loading">
      <ProductCard
        v-for="p in products"
        :key="p.id"
        :product="p"
        :selectable="selectMode"
        :selected="selectedIds.includes(p.id)"
        @select="toggleSelect"
        @view="openDetail"
      />
    </div>

    <div class="list-empty" v-if="!loading && products.length === 0">
      暂无产品数据
    </div>

    <div class="list-pagination" v-if="pagination.totalPages > 1">
      <el-pagination
        v-model:current-page="pagination.page"
        :page-size="pagination.limit"
        :total="pagination.total"
        layout="prev, pager, next"
        @current-change="fetchProducts"
      />
    </div>

    <!-- 产品详情弹窗 -->
    <div class="detail-overlay" v-if="detailVisible" @click.self="detailVisible = false">
      <div class="detail-modal" v-loading="detailLoading">
        <button class="detail-close" @click="detailVisible = false">&times;</button>
        <div class="detail-layout" v-if="detailProduct">
          <div class="detail-images">
            <div class="main-image" @click="openViewer(detailCurrentImage?.original_url)">
              <img v-if="detailCurrentImage" :src="detailCurrentImage.original_url" :alt="detailProduct.sku" />
              <span v-else class="no-image">暂无图片</span>
            </div>
            <div class="thumb-list" v-if="detailProduct.images?.length > 0">
              <div
                v-for="(img, i) in detailProduct.images"
                :key="img.id"
                class="thumb-item"
                :class="{ active: detailIndex === i }"
                @click="detailIndex = i"
              >
                <img :src="img.thumbnail_url" :alt="`图${i + 1}`" />
              </div>
            </div>
          </div>
          <div class="detail-info">
            <h1 class="detail-sku">{{ detailProduct.sku }}</h1>
            <div class="detail-series">{{ detailProduct.series_name }} 系列</div>
            <div class="detail-specs">
              <div class="spec-row">
                <span class="spec-label">颜色</span>
                <span class="spec-value">{{ detailProduct.color_name }}</span>
              </div>
              <div class="spec-row" v-if="detailProduct.material">
                <span class="spec-label">材质</span>
                <span class="spec-value">{{ detailProduct.material }}</span>
              </div>
              <div class="spec-row" v-if="detailProduct.size_range">
                <span class="spec-label">尺码</span>
                <span class="spec-value">{{ detailProduct.size_range }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">季度</span>
                <span class="spec-value">{{ detailProduct.season_name }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">类别</span>
                <span class="spec-value">{{ detailCategoryLabel }}</span>
              </div>
              <div class="spec-row last">
                <span class="spec-label">图片</span>
                <span class="spec-value">{{ detailProduct.images?.length || 0 }} 张</span>
              </div>
            </div>
            <div class="detail-actions">
              <el-button type="primary" @click="handleDetailDownload" :loading="detailDownloading">
                下载全部图片
              </el-button>
            </div>
          </div>
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
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import FilterBar from '../components/FilterBar.vue';
import ProductCard from '../components/ProductCard.vue';
import ImageViewer from '../components/ImageViewer.vue';
import { getProducts, getProduct } from '../api/products';
import { downloadImages } from '../api/images';
import { useFilterStore } from '../stores/filter';

const filter = useFilterStore();

const products = ref([]);
const loading = ref(false);
const selectMode = ref(false);
const selectedIds = ref([]);
const downloading = ref(false);
const pagination = reactive({ page: 1, limit: 20, total: 0, totalPages: 0 });

// 弹窗详情
const detailVisible = ref(false);
const detailLoading = ref(false);
const detailProduct = ref(null);
const detailIndex = ref(0);
const detailDownloading = ref(false);
const viewerVisible = ref(false);
const viewerSrc = ref('');

const detailCurrentImage = computed(() => detailProduct.value?.images?.[detailIndex.value]);
const categoryLabels = { men: 'Men', women: 'Women', kids: 'Kids' };
const detailCategoryLabel = computed(() => categoryLabels[detailProduct.value?.category] || '');

async function openDetail(id) {
  detailVisible.value = true;
  detailLoading.value = true;
  detailIndex.value = 0;
  try {
    detailProduct.value = await getProduct(id);
  } catch (err) {}
  finally { detailLoading.value = false; }
}

function openViewer(url) {
  if (!url) return;
  viewerSrc.value = url;
  viewerVisible.value = true;
}

async function handleDetailDownload() {
  detailDownloading.value = true;
  try {
    const blob = await downloadImages([detailProduct.value.id]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detailProduct.value.sku}-images.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {}
  finally { detailDownloading.value = false; }
}

async function fetchProducts(page = 1) {
  loading.value = true;
  try {
    const res = await getProducts({
      page,
      limit: pagination.limit,
      year: filter.year || undefined,
      season: filter.season || undefined,
      category: filter.category || undefined,
      series_id: filter.seriesId || undefined,
      keyword: filter.keyword || undefined,
    });
    products.value = res.data;
    Object.assign(pagination, res.pagination);
  } catch (err) {
    // 错误已在拦截器中处理
  } finally {
    loading.value = false;
  }
}

function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
  } else {
    if (selectedIds.value.length >= 4) {
      return ElMessage.warning('最多选择 4 款产品');
    }
    selectedIds.value.push(id);
  }
}

async function handleBatchDownload() {
  downloading.value = true;
  try {
    const blob = await downloadImages(selectedIds.value);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atlantic-stars-images.zip';
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('下载已开始');
  } catch (err) {
    // 错误已在拦截器中处理
  } finally {
    downloading.value = false;
  }
}

onMounted(() => fetchProducts());
</script>

<style scoped>
.product-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  min-height: 200px;
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}

.selected-count {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.list-empty {
  text-align: center;
  padding: 80px 0;
  color: var(--color-text-tertiary);
  font-size: 15px;
}

.list-pagination {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}

/* 产品详情弹窗 */
.detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-modal {
  background: #fff;
  border-radius: 16px;
  width: 92%;
  max-width: 1100px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 36px;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.detail-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  font-size: 28px;
  color: #86868b;
  cursor: pointer;
  line-height: 1;
  z-index: 1;
}

.detail-close:hover {
  color: #1d1d1f;
}

.detail-layout {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 36px;
  align-items: start;
}

.main-image {
  width: 100%;
  aspect-ratio: 1;
  background: var(--color-bg-tertiary, #f5f5f7);
  border-radius: 12px;
  border: 1px solid var(--color-border, #e8e8ed);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-in;
  margin-bottom: 12px;
}

.main-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.no-image {
  color: #aeaeb2;
  font-size: 14px;
}

.thumb-list {
  display: flex;
  gap: 8px;
}

.thumb-item {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  background: var(--color-bg-tertiary, #f5f5f7);
}

.thumb-item.active {
  border-color: var(--color-primary, #CF2028);
}

.thumb-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-sku {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 4px;
}

.detail-series {
  font-size: 16px;
  color: var(--color-primary, #CF2028);
  font-weight: 500;
  margin-bottom: 24px;
}

.spec-row {
  display: flex;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border-light, #f0f0f0);
  font-size: 14px;
}

.spec-row.last {
  border-bottom: none;
}

.spec-label {
  width: 70px;
  color: #86868b;
  flex-shrink: 0;
}

.detail-actions {
  display: flex;
  gap: 12px;
  margin-top: 28px;
}

.detail-actions .el-button {
  border-radius: 20px !important;
}

@media (max-width: 900px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .detail-layout {
    grid-template-columns: 1fr;
  }
  .detail-modal {
    width: 95%;
    padding: 20px;
  }
}
</style>
