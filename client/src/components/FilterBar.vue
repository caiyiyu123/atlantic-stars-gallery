<template>
  <div class="filter-bar">
    <button
      v-for="y in years"
      :key="y"
      class="filter-chip"
      :class="{ active: filter.year === y }"
      @click="toggleFilter('year', y)"
    >
      {{ y }}
    </button>

    <span class="filter-divider" />

    <button
      v-for="s in ['FW', 'SS']"
      :key="s"
      class="filter-chip"
      :class="{ active: filter.season === s }"
      @click="toggleFilter('season', s)"
    >
      {{ s }}
    </button>

    <span class="filter-divider" />

    <button
      v-for="c in categories"
      :key="c.value"
      class="filter-chip"
      :class="{ active: filter.category === c.value }"
      @click="toggleFilter('category', c.value)"
    >
      {{ c.label }}
    </button>

    <el-input
      v-model="filter.keyword"
      placeholder="搜索款号、颜色、系列..."
      class="filter-search"
      clearable
      :prefix-icon="Search"
      @input="debouncedEmit"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { useFilterStore } from '../stores/filter';

const emit = defineEmits(['change']);
const filter = useFilterStore();

const currentYear = new Date().getFullYear();
const years = computed(() => {
  const arr = [];
  for (let y = currentYear; y >= currentYear - 9; y--) {
    arr.push(y);
  }
  return arr;
});

const categories = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'kids', label: 'Kids' },
];

function toggleFilter(key, value) {
  filter[key] = filter[key] === value ? null : value;
  emit('change');
}

let debounceTimer = null;
function debouncedEmit() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => emit('change'), 300);
}
</script>

<style scoped>
.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 28px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-chip {
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  font-size: 13px;
  color: #6e6e73;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.filter-chip:hover {
  background: #ececee;
}

.filter-chip.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.filter-divider {
  width: 1px;
  height: 24px;
  background: var(--color-border);
  margin: 0 4px;
}

.filter-search {
  margin-left: auto;
  width: 240px;
}

.filter-search :deep(.el-input__wrapper) {
  border-radius: var(--radius-pill);
}
</style>
