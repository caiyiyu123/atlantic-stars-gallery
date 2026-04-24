<template>
  <div class="history-tab">
    <div class="filter-row">
      <el-select v-if="auth.isSuperAdmin" v-model="filter.user_id" placeholder="所有用户" clearable style="width: 160px;" @change="refetch">
        <el-option v-for="u in userList" :key="u.id" :label="u.username" :value="u.id" />
      </el-select>
      <el-select v-model="filter.model_name" placeholder="所有模型" clearable style="width: 200px;" @change="refetch">
        <el-option v-for="m in modelList" :key="m" :label="m" :value="m" />
      </el-select>
      <el-select v-model="filter.status" placeholder="所有状态" clearable style="width: 120px;" @change="refetch">
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
        <el-option label="进行中" value="processing" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        @change="onDateChange"
      />
      <el-button @click="refetch">刷新</el-button>
    </div>

    <div v-loading="loading">
      <div v-if="!loading && batches.length === 0" class="empty">暂无记录</div>

      <el-collapse v-model="expandedBatches" class="batch-list">
        <el-collapse-item
          v-for="batch in batches"
          :key="batch.batch_id"
          :name="batch.batch_id"
        >
          <template #title>
            <div class="batch-title">
              <div class="batch-main">
                <span class="batch-time">{{ formatTime(batch.created_at) }}</span>
                <span class="batch-summary">
                  {{ batch.jobs.length }} 张结果
                  <el-tag v-if="batch.successCount" type="success" size="small" class="tag-inline">✓ {{ batch.successCount }}</el-tag>
                  <el-tag v-if="batch.failedCount" type="danger" size="small" class="tag-inline">✗ {{ batch.failedCount }}</el-tag>
                  <el-tag v-if="batch.processingCount" type="warning" size="small" class="tag-inline">⏳ {{ batch.processingCount }}</el-tag>
                </span>
              </div>
              <div class="batch-models">
                <span v-if="batch.promptTemplateName" class="prompt-badge" :title="`Prompt 模板：${batch.promptTemplateName}`">
                  {{ batch.promptTemplateName }}
                </span>
                <span v-for="m in batch.modelNames" :key="m" class="model-badge">{{ m }}</span>
                <button class="batch-delete" @click.stop="handleDeleteBatch(batch)" title="删除整个批次">删除</button>
              </div>
            </div>
          </template>

          <div v-if="expandedBatches.includes(batch.batch_id)" class="batch-grid">
            <!-- 原图（每张去重后作为第一批卡片） -->
            <div
              v-for="(orig, idx) in batch.originalImages"
              :key="`orig-${batch.batch_id}-${idx}`"
              class="card card-original"
              @click="previewImage(orig)"
            >
              <div class="img-wrap">
                <img :src="toUrl(orig)" loading="lazy" decoding="async" />
                <span class="badge-original">原图</span>
              </div>
              <div class="card-info">
                <div class="model-name">原图</div>
                <a href="javascript:;" class="download" @click.stop="downloadFile(orig)">下载</a>
              </div>
            </div>

            <!-- 结果图 -->
            <div v-for="job in batch.jobs" :key="job.id" class="card" @click="previewJobImage(job)">
              <div class="img-wrap">
                <img
                  v-if="job.status === 'success'"
                  :src="toUrl(job.result_image_path)"
                  loading="lazy"
                  decoding="async"
                />
                <div v-else class="fail-placeholder">
                  <span>{{ job.status === 'failed' ? '❌ 失败' : (job.status === 'processing' ? '⏳ 处理中' : job.status) }}</span>
                </div>
              </div>
              <div class="card-info">
                <div class="model-name" :title="job.model_name">{{ job.api_key_name || job.model_name }}</div>
                <a v-if="job.status === 'success'" href="javascript:;" class="download" @click.stop="downloadFile(job.result_image_path)">下载</a>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <div v-if="hasMore" class="load-more">
      <el-button @click="loadMore" :loading="loading">加载更多</el-button>
    </div>

    <!-- 大图预览（单图） -->
    <el-dialog v-model="previewVisible" width="80%">
      <div class="preview-single">
        <img v-if="previewUrl" :src="previewUrl" class="preview-img" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../../../stores/auth';
import { getJobHistory, getJobUsers, deleteBatch } from '../../../api/aiJobs';
import { getApiKeys } from '../../../api/apiKeys';

const auth = useAuthStore();
const rawJobs = ref([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = 100;
const totalPages = ref(1);

const filter = reactive({ user_id: '', model_name: '', status: '', date_from: '', date_to: '' });
const dateRange = ref(null);

const userList = ref([]);
const modelList = ref([]);

const previewVisible = ref(false);
const previewUrl = ref('');

const expandedBatches = ref([]); // 展开的 batch_id 列表

const batches = computed(() => {
  const map = new Map();
  for (const job of rawJobs.value) {
    if (!map.has(job.batch_id)) {
      map.set(job.batch_id, {
        batch_id: job.batch_id,
        created_at: job.created_at,
        jobs: [],
        modelNames: new Set(),
        originalImages: new Set(),
      });
    }
    const b = map.get(job.batch_id);
    b.jobs.push(job);
    b.modelNames.add(job.api_key_name || job.model_name);
    if (job.original_image_path) b.originalImages.add(job.original_image_path);
    if (job.prompt_template_name && !b.promptTemplateName) {
      b.promptTemplateName = job.prompt_template_name;
    }
    if (new Date(job.created_at) < new Date(b.created_at)) {
      b.created_at = job.created_at;
    }
  }
  const arr = [...map.values()].map(b => {
    const successCount = b.jobs.filter(j => j.status === 'success').length;
    const failedCount = b.jobs.filter(j => j.status === 'failed').length;
    const processingCount = b.jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;
    return {
      ...b,
      modelNames: [...b.modelNames],
      originalImages: [...b.originalImages],
      successCount,
      failedCount,
      processingCount,
    };
  });
  arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return arr;
});

const hasMore = computed(() => currentPage.value < totalPages.value);

function toUrl(relPath) {
  if (!relPath) return '';
  if (relPath.startsWith('http')) return relPath;
  return relPath.startsWith('/') ? relPath : `/${relPath}`;
}

async function downloadFile(relPath) {
  try {
    const res = await fetch(toUrl(relPath));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = relPath.split('/').pop() || 'image.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch (e) {
    // 失败静默，因为全局 axios 拦截器不处理这种直接 fetch
    console.error('下载失败:', e);
  }
}

function formatTime(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchList(reset = false) {
  loading.value = true;
  try {
    if (reset) {
      currentPage.value = 1;
      rawJobs.value = [];
      expandedBatches.value = [];
    }
    const params = { page: currentPage.value, limit: pageSize };
    if (filter.user_id) params.user_id = filter.user_id;
    if (filter.model_name) params.model_name = filter.model_name;
    if (filter.status) params.status = filter.status;
    if (filter.date_from) params.date_from = filter.date_from;
    if (filter.date_to) params.date_to = filter.date_to;
    const res = await getJobHistory(params);
    rawJobs.value = reset ? res.data : [...rawJobs.value, ...res.data];
    totalPages.value = res.pagination.totalPages;
    // 默认展开第一个批次
    if (reset && batches.value.length > 0) {
      expandedBatches.value = [batches.value[0].batch_id];
    }
  } finally { loading.value = false; }
}

function loadMore() {
  currentPage.value++;
  fetchList(false);
}

function onDateChange(val) {
  if (val && val.length === 2) {
    filter.date_from = val[0];
    filter.date_to = val[1];
  } else {
    filter.date_from = '';
    filter.date_to = '';
  }
  refetch();
}

function refetch() {
  fetchList(true);
}

function previewImage(path) {
  if (!path) return;
  previewUrl.value = toUrl(path);
  previewVisible.value = true;
}

function previewJobImage(job) {
  if (job.status !== 'success') return;
  previewImage(job.result_image_path);
}

async function handleDeleteBatch(batch) {
  try {
    await ElMessageBox.confirm(
      `确定删除这个批次？将同时删除 ${batch.jobs.length} 张结果图和对应的原图，此操作不可恢复。`,
      '确认删除',
      { type: 'warning' }
    );
  } catch (e) { return; }
  try {
    await deleteBatch(batch.batch_id);
    ElMessage.success('批次已删除');
    rawJobs.value = rawJobs.value.filter(j => j.batch_id !== batch.batch_id);
    expandedBatches.value = expandedBatches.value.filter(id => id !== batch.batch_id);
  } catch (e) { /* 错误由拦截器提示 */ }
}

onMounted(async () => {
  try {
    const keys = await getApiKeys();
    modelList.value = [...new Set(keys.map(k => k.model_name))];
  } catch (e) { /* 非 super_admin 拿不到，忽略 */ }

  if (auth.isSuperAdmin) {
    try {
      userList.value = await getJobUsers();
    } catch (e) { /* ignore */ }
  }
  fetchList(true);
});
</script>

<style scoped>
.filter-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }

.empty { text-align: center; color: #86868b; padding: 60px 0; font-size: 14px; }

.batch-list :deep(.el-collapse-item__header) {
  height: auto;
  padding: 12px 0;
}

.batch-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding-right: 8px;
}
.batch-main { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
.batch-time { font-weight: 600; color: #1d1d1f; white-space: nowrap; }
.batch-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #86868b;
  font-size: 13px;
}
.tag-inline { margin-left: 4px; }
.batch-models {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.model-badge {
  font-size: 12px;
  color: #86868b;
  background: #f5f5f7;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.prompt-badge {
  font-size: 12px;
  color: #8a6a08;
  background: #fff8e1;
  padding: 2px 10px;
  border-radius: 10px;
  white-space: nowrap;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.batch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 8px 0 16px;
}

.card {
  background: #fff;
  border: 1px solid #e5e5e7;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); }
.img-wrap { aspect-ratio: 1; background: #f5f5f7; }
.img-wrap img { width: 100%; height: 100%; object-fit: contain; }

.batch-delete {
  border: 1px solid rgba(229, 62, 62, 0.4);
  background: transparent;
  color: #e53e3e;
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 12px;
  cursor: pointer;
  margin-left: 8px;
  transition: all 0.2s;
}
.batch-delete:hover {
  background: #e53e3e;
  color: #fff;
  border-color: #e53e3e;
}
.fail-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #c9302c; font-size: 13px; }
.card-info { padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; }
.model-name { font-size: 12px; color: #86868b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }
.download { font-size: 12px; color: #CF2028; text-decoration: none; font-weight: 500; }

.load-more { display: flex; justify-content: center; margin-top: 20px; }

.card-original { border-color: #ffd666; background: #fff8e1; }
.img-wrap { position: relative; }
.badge-original {
  position: absolute;
  top: 6px;
  left: 6px;
  background: #ffc53d;
  color: #1d1d1f;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.preview-single { display: flex; justify-content: center; align-items: center; }
.preview-img { max-width: 100%; max-height: 75vh; object-fit: contain; border-radius: 8px; }
</style>
