<template>
  <div
    class="product-card"
    @click="$emit('view', product.id)"
  >
    <div class="card-checkbox" v-if="selectable" @click.stop>
      <el-checkbox
        :model-value="selected"
        @change="$emit('select', product.id)"
      />
    </div>
    <div class="card-img">
      <img
        v-if="product.cover_image"
        :src="product.cover_image"
        :alt="product.sku"
        loading="lazy"
      />
      <span v-else class="card-img-placeholder">暂无图片</span>
    </div>
    <div class="card-info">
      <div class="card-top-row">
        <span class="card-sku">{{ product.sku }}</span>
        <span class="card-color" v-if="product.color_name">{{ product.color_name }}</span>
      </div>
      <div class="card-tags">
        <span class="tag tag-season">{{ product.season_name }}</span>
        <span class="tag tag-series">{{ product.series_name }}</span>
        <span class="tag tag-category">{{ categoryLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  product: { type: Object, required: true },
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
});

defineEmits(['select', 'view']);

const categoryLabels = { men: 'Men', women: 'Women', kids: 'Kids' };
const categoryLabel = computed(() => categoryLabels[props.product.category] || props.product.category);
</script>

<style scoped>
.product-card {
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  position: relative;
}

.product-card:hover {
  transform: scale(1.02);
  box-shadow: var(--shadow-lg);
}

.card-checkbox {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
  background: rgba(255,255,255,0.9);
  border-radius: 6px;
  padding: 2px 4px;
}

.card-img {
  width: 100%;
  aspect-ratio: 4 / 3;
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-img-placeholder {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.card-info {
  padding: 10px 12px;
}

.card-top-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.card-sku {
  font-size: 13px;
  font-weight: 700;
  color: #1d1d1f;
  letter-spacing: -0.01em;
}

.card-color {
  font-size: 12px;
  color: #86868b;
  flex-shrink: 0;
}

.card-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag {
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 10px;
  font-weight: 500;
}

.tag-season {
  background: #CF2028;
  color: #fff;
}

.tag-series {
  background: #EE7624;
  color: #fff;
}

.tag-category {
  background: #F5D726;
  color: #1d1d1f;
}
</style>
