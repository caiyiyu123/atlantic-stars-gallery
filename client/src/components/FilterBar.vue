<template>
  <div class="filter-bar">
    <!-- 左：季度选择 -->
    <div class="filter-section filter-section-season">
      <div class="section-label">季度</div>
      <div class="chip-list chip-list-season">
        <button
          v-for="s in visibleSeasons"
          :key="s.id"
          class="filter-chip chip-season"
          :class="{ active: filter.year === s.year && filter.season === s.season }"
          @click="toggleSeason(s)"
        >
          {{ s.name }}
        </button>
        <button v-if="seasons.length > seasonDefaultShow && !seasonExpanded" class="filter-chip chip-expand" @click="seasonExpanded = true">
          展开 ({{ seasons.length - seasonDefaultShow }})
        </button>
        <button v-if="seasonExpanded" class="filter-chip chip-expand" @click="seasonExpanded = false">
          收起
        </button>
      </div>
    </div>

    <!-- 中：系列选择 -->
    <div class="filter-section">
      <div class="section-label">系列</div>
      <div class="chip-list">
        <template v-if="availableSeries.length > 0">
          <button
            v-for="s in visibleSeries"
            :key="s.id"
            class="filter-chip chip-series"
            :class="{ active: filter.seriesId === s.id }"
            @click="toggleSeries(s)"
          >
            {{ s.name }}
          </button>
          <button v-if="availableSeries.length > seriesDefaultShow && !seriesExpanded" class="filter-chip chip-expand" @click="seriesExpanded = true">
            展开 ({{ availableSeries.length - seriesDefaultShow }})
          </button>
          <button v-if="seriesExpanded" class="filter-chip chip-expand" @click="seriesExpanded = false">
            收起
          </button>
        </template>
        <span v-else class="chip-empty">暂无系列</span>
      </div>
    </div>

    <!-- 右：类别 + 搜索 -->
    <div class="filter-section filter-section-right">
      <div class="section-label">类别</div>
      <div class="chip-list">
        <button
          v-for="c in categories"
          :key="c.value"
          class="filter-chip chip-category"
          :class="{ active: filter.category === c.value }"
          @click="toggleCategory(c.value)"
        >
          {{ c.label }}
        </button>
      </div>
      <el-input
        v-model="filter.keyword"
        placeholder="搜索款号、颜色..."
        class="filter-search"
        clearable
        :prefix-icon="Search"
        @input="debouncedEmit"
        style="margin-top: 8px;"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { useFilterStore } from '../stores/filter';
import { getSeasons } from '../api/seasons';
import { getSeries } from '../api/series';

const emit = defineEmits(['change']);
const filter = useFilterStore();

const seasons = ref([]);
const seriesList = ref([]);
const seasonExpanded = ref(false);
const seriesExpanded = ref(false);
const seasonDefaultShow = 8;
const seriesDefaultShow = 10;

const categories = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'kids', label: 'Kids' },
];

const visibleSeasons = computed(() => {
  return seasonExpanded.value ? seasons.value : seasons.value.slice(0, seasonDefaultShow);
});

const availableSeries = computed(() => {
  if (!filter.year && !filter.season) return seriesList.value;
  return seriesList.value.filter(s => {
    const season = seasons.value.find(se => se.id === s.season_id);
    if (!season) return false;
    return season.year === filter.year && season.season === filter.season;
  });
});

const visibleSeries = computed(() => {
  return seriesExpanded.value ? availableSeries.value : availableSeries.value.slice(0, seriesDefaultShow);
});

function toggleSeason(s) {
  if (filter.year === s.year && filter.season === s.season) {
    filter.year = null;
    filter.season = null;
  } else {
    filter.year = s.year;
    filter.season = s.season;
  }
  filter.seriesId = null;
  seriesExpanded.value = false;
  emit('change');
}

function toggleSeries(s) {
  filter.seriesId = filter.seriesId === s.id ? null : s.id;
  emit('change');
}

function toggleCategory(value) {
  filter.category = filter.category === value ? null : value;
  emit('change');
}

let debounceTimer = null;
function debouncedEmit() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => emit('change'), 300);
}

onMounted(async () => {
  seasons.value = await getSeasons();
  seriesList.value = await getSeries({});
});
</script>

<style scoped>
.filter-bar {
  display: flex;
  gap: 0;
  margin-bottom: 28px;
  padding: 16px 0;
  background: var(--color-bg-secondary, #fff);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}

.filter-section {
  flex: 1;
  min-width: 0;
  padding: 0 20px;
}

.filter-section:nth-child(2) {
  flex: 1.5;
}

.filter-section + .filter-section {
  border-left: 1px solid var(--color-border, #e8e8ed);
}

.filter-section-right {
  flex: 1;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: #86868b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}

.chip-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.chip-list-season {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-list-season .chip-season {
  width: calc(25% - 5px);
  box-sizing: border-box;
  text-align: center;
}

.chip-list-season .chip-expand {
  width: 100%;
  text-align: center;
}

.filter-chip {
  padding: 5px 12px;
  border-radius: 16px;
  background: #f5f5f7;
  border: 1px solid #e8e8ed;
  font-size: 13px;
  color: #1d1d1f;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  white-space: nowrap;
  text-align: center;
}

.filter-chip:hover {
  background: #ececee;
}

.filter-chip.active.chip-season {
  background: #CF2028;
  border-color: #CF2028;
  color: #fff;
}

.filter-chip.active.chip-series {
  background: #EE7624;
  border-color: #EE7624;
  color: #fff;
}

.filter-chip.active.chip-category {
  background: #F5D726;
  border-color: #F5D726;
  color: #1d1d1f;
}

.chip-expand {
  color: #86868b;
  font-size: 12px;
  border-style: dashed;
}

.chip-empty {
  font-size: 12px;
  color: #aeaeb2;
}

.filter-search :deep(.el-input__wrapper) {
  border-radius: 16px;
}

@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
    gap: 0;
    padding: 12px 0;
  }

  .filter-section {
    padding: 10px 14px;
  }

  .filter-section + .filter-section {
    border-left: none;
    border-top: 1px solid var(--color-border, #e8e8ed);
  }

  .filter-section:nth-child(2) {
    flex: 1;
  }

  .chip-list-season .chip-season {
    width: calc(33.33% - 4px);
  }
}
</style>
