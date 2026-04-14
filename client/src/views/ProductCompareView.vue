<template>
  <div>
    <el-button text @click="$router.back()" style="margin-bottom: 16px;">
      ← 返回
    </el-button>

    <h2 class="compare-title">产品对比</h2>

    <div class="compare-grid" :style="{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }" v-loading="loading">
      <div v-for="item in items" :key="item.id" class="compare-item">
        <div class="compare-img">
          <img
            v-if="item.images?.[0]"
            :src="item.images[0].original_url"
            :alt="item.sku"
          />
          <span v-else class="no-img">暂无图片</span>
        </div>
        <div class="compare-name">{{ item.sku }}</div>
        <div class="compare-series">{{ item.series_name }}</div>
        <div class="compare-specs">
          <div>{{ item.color_name }}</div>
          <div>{{ item.material || '-' }}</div>
          <div>{{ item.size_range || '-' }}</div>
          <div>{{ item.season_name }} · {{ categoryLabel(item.category) }}</div>
        </div>
      </div>
    </div>

    <div class="compare-empty" v-if="!loading && items.length === 0">
      请从产品列表选择 2~4 款产品进行对比
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { getProduct } from '../api/products';

const route = useRoute();
const items = ref([]);
const loading = ref(false);

const categoryLabels = { men: 'Men', women: 'Women', kids: 'Kids' };
const categoryLabel = (cat) => categoryLabels[cat] || cat;

async function fetchItems() {
  const idsStr = route.query.ids || sessionStorage.getItem('compareIds');
  if (!idsStr) return;

  let ids;
  try {
    ids = JSON.parse(idsStr);
  } catch {
    ids = idsStr.split(',').map(Number);
  }

  loading.value = true;
  try {
    const results = await Promise.all(ids.map(id => getProduct(id)));
    items.value = results;
  } catch (err) {
    // 错误已在拦截器中处理
  } finally {
    loading.value = false;
  }
}

onMounted(fetchItems);
</script>

<style scoped>
.compare-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 32px;
}

.compare-grid {
  display: grid;
  gap: 24px;
}

.compare-item {
  text-align: center;
}

.compare-img {
  width: 100%;
  aspect-ratio: 1;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.compare-img img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.no-img {
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.compare-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.compare-series {
  font-size: 14px;
  color: var(--color-primary);
  margin-bottom: 12px;
}

.compare-specs {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 2;
}

.compare-empty {
  text-align: center;
  padding: 80px 0;
  color: var(--color-text-tertiary);
}
</style>
