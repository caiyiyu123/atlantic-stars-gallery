<template>
  <div>
    <FilterBar @change="fetchProducts(1)" />

    <div class="list-toolbar" v-if="selectedIds.length > 0">
      <span class="selected-count">已选 {{ selectedIds.length }} 款</span>
      <el-button type="primary" size="small" @click="goCompare" :disabled="selectedIds.length < 2">
        对比
      </el-button>
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

    <div class="list-footer">
      <el-button text size="small" @click="selectMode = !selectMode">
        {{ selectMode ? '退出选择' : '选择模式' }}
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import FilterBar from '../components/FilterBar.vue';
import ProductCard from '../components/ProductCard.vue';
import { getProducts } from '../api/products';
import { downloadImages } from '../api/images';
import { useFilterStore } from '../stores/filter';

const router = useRouter();
const filter = useFilterStore();

const products = ref([]);
const loading = ref(false);
const selectMode = ref(false);
const selectedIds = ref([]);
const downloading = ref(false);
const pagination = reactive({ page: 1, limit: 20, total: 0, totalPages: 0 });

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

function goCompare() {
  router.push({
    name: 'ProductCompare',
    query: { ids: selectedIds.value.join(',') },
  });
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

.list-footer {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

@media (max-width: 900px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
