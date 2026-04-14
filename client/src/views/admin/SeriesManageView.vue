<template>
  <div>
    <h2 class="page-title">系列管理</h2>

    <el-tabs v-model="activeTab" class="catalog-tabs">
      <el-tab-pane label="季度管理" name="season">
        <div class="add-row">
          <el-input-number v-model="seasonForm.year" :min="2020" :max="2040" style="width: 140px;" />
          <el-select v-model="seasonForm.season" placeholder="季节" style="width: 140px;">
            <el-option label="SS (春夏)" value="SS" />
            <el-option label="FW (秋冬)" value="FW" />
          </el-select>
          <el-button type="primary" @click="handleCreateSeason" :loading="savingSeason">添加</el-button>
        </div>
        <el-table :data="seasons" size="small">
          <el-table-column prop="year" label="年份" width="100" />
          <el-table-column prop="season" label="季节" width="100" />
          <el-table-column prop="name" label="名称" />
          <el-table-column label="操作" width="80">
            <template #default="{ row }">
              <el-button text type="danger" size="small" @click="handleDeleteSeason(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="系列管理" name="series">
        <div class="add-row">
          <el-select v-model="seriesForm.season_id" placeholder="选择季度" style="width: 140px;">
            <el-option v-for="s in seasons" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
          <el-select v-model="seriesForm.category" placeholder="类别" style="width: 110px;">
            <el-option label="Men" value="men" />
            <el-option label="Women" value="women" />
            <el-option label="Kids" value="kids" />
          </el-select>
          <el-input v-model="seriesForm.name" placeholder="系列名" style="width: 160px;" />
          <el-button type="primary" @click="handleCreateSeries" :loading="savingSeries">添加</el-button>
        </div>
        <div class="series-tree">
          <el-collapse v-model="expandedSeasons">
            <el-collapse-item v-for="seasonGroup in seriesTreeData" :key="seasonGroup.name" :title="seasonGroup.name" :name="seasonGroup.name">
              <el-collapse v-model="expandedCategories">
                <el-collapse-item v-for="catGroup in seasonGroup.categories" :key="seasonGroup.name + '-' + catGroup.label" :title="catGroup.label" :name="seasonGroup.name + '-' + catGroup.label">
                  <div v-for="item in catGroup.items" :key="item.id" class="series-item">
                    <span>{{ item.name }}</span>
                    <el-button text type="danger" size="small" @click="handleDeleteSeries(item)">删除</el-button>
                  </div>
                  <div v-if="catGroup.items.length === 0" class="series-empty">暂无系列</div>
                </el-collapse-item>
              </el-collapse>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getSeasons, createSeason, deleteSeason } from '../../api/seasons';
import { getSeries, createSeries, deleteSeries } from '../../api/series';

const seasons = ref([]);
const seriesList = ref([]);
const activeTab = ref('season');
const expandedSeasons = ref([]);
const expandedCategories = ref([]);

const savingSeason = ref(false);
const seasonForm = ref({ year: new Date().getFullYear(), season: 'SS' });

const savingSeries = ref(false);
const seriesForm = ref({ season_id: null, category: null, name: '' });

const categoryOrder = ['men', 'women', 'kids'];
const categoryLabels = { men: 'Men', women: 'Women', kids: 'Kids' };

const seriesTreeData = computed(() => {
  const grouped = {};
  for (const s of seriesList.value) {
    const key = s.season_name;
    if (!grouped[key]) grouped[key] = { name: key, categories: {} };
    if (!grouped[key].categories[s.category]) grouped[key].categories[s.category] = [];
    grouped[key].categories[s.category].push(s);
  }
  return Object.values(grouped).map(g => ({
    name: g.name,
    categories: categoryOrder.map(cat => ({
      key: cat,
      label: categoryLabels[cat],
      items: g.categories[cat] || [],
    })),
  }));
});

async function fetchSeasons() {
  seasons.value = await getSeasons();
}

async function fetchSeries() {
  seriesList.value = await getSeries({});
}

async function handleCreateSeason() {
  if (!seasonForm.value.year || !seasonForm.value.season) {
    return ElMessage.warning('请填写年份和季节');
  }
  savingSeason.value = true;
  try {
    await createSeason(seasonForm.value);
    ElMessage.success('季度创建成功');
    seasonForm.value = { year: new Date().getFullYear(), season: 'SS' };
    fetchSeasons();
  } catch (err) {
    ElMessage.error(err.message || '创建失败');
  } finally {
    savingSeason.value = false;
  }
}

async function handleDeleteSeason(row) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.name}」？其下所有系列、产品和图片将被一并删除！`, '确认删除', { type: 'warning' });
    await deleteSeason(row.id);
    ElMessage.success('删除成功');
    fetchSeasons();
    fetchSeries();
  } catch { /* 取消 */ }
}

async function handleCreateSeries() {
  if (!seriesForm.value.season_id || !seriesForm.value.category || !seriesForm.value.name) {
    return ElMessage.warning('请填写季度、类别和系列名');
  }
  savingSeries.value = true;
  try {
    await createSeries(seriesForm.value);
    ElMessage.success('系列创建成功');
    seriesForm.value = { season_id: null, category: null, name: '' };
    fetchSeries();
  } catch (err) {
    ElMessage.error(err.message || '创建失败');
  } finally {
    savingSeries.value = false;
  }
}

async function handleDeleteSeries(row) {
  try {
    await ElMessageBox.confirm(`确定删除系列「${row.name}」？其下所有产品和图片将被一并删除！`, '确认删除', { type: 'warning' });
    await deleteSeries(row.id);
    ElMessage.success('删除成功');
    fetchSeries();
  } catch { /* 取消 */ }
}

onMounted(() => {
  fetchSeasons();
  fetchSeries();
});
</script>

<style scoped>
.page-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 24px;
}

.add-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.series-tree :deep(.el-collapse-item__header) {
  font-size: 17px;
  font-weight: 700;
}

.series-tree :deep(.el-collapse-item .el-collapse-item .el-collapse-item__header) {
  font-size: 14px;
  font-weight: 600;
}

.series-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.series-item:last-child {
  border-bottom: none;
}

.series-empty {
  padding: 8px 12px;
  color: #999;
  font-size: 13px;
}
</style>
