<template>
  <div
    class="product-card"
    @click="$router.push(`/product/${product.id}`)"
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
      <div class="card-sku">{{ product.sku }}</div>
      <div class="card-color">{{ product.color_name }}</div>
      <div class="card-meta">
        {{ product.series_name }} · {{ product.season_name }} · {{ categoryLabel }}
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

defineEmits(['select']);

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
  aspect-ratio: 1;
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
  padding: 14px 16px;
}

.card-sku {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin-bottom: 4px;
}

.card-color {
  font-size: 12px;
  color: #6e6e73;
}

.card-meta {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: 6px;
}
</style>
