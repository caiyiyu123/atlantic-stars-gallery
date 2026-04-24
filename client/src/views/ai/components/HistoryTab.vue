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
    </div>

    <div v-loading="loading" class="grid">
      <div v-for="job in list" :key="job.id" class="card" @click="preview(job)">
        <div class="img-wrap">
          <img v-if="job.status === 'success'" :src="toUrl(job.result_image_path)" />
          <div v-else class="fail-placeholder">
            <span>{{ job.status === 'failed' ? '❌ 失败' : job.status }}</span>
          </div>
        </div>
        <div class="card-info">
          <div class="model-name">{{ job.model_name }}</div>
          <div class="time">{{ formatTime(job.created_at) }}</div>
          <a v-if="job.status === 'success'" :href="toUrl(job.result_image_path)" target="_blank" download class="download" @click.stop>下载</a>
        </div>
      </div>
    </div>

    <div v-if="pagination.totalPages > 1" class="pagination">
      <el-pagination
        v-model:current-page="pagination.page"
        :page-size="pagination.limit"
        :total="pagination.total"
        layout="prev, pager, next"
        @current-change="onPageChange"
      />
    </div>

    <!-- 大图预览 -->
    <el-dialog v-model="previewVisible" width="80%">
      <div v-if="previewJob" class="preview-compare">
        <div class="compare-col">
          <div class="compare-label">原图</div>
          <img :src="toUrl(previewJob.original_image_path)" class="compare-img" />
        </div>
        <div class="compare-col">
          <div class="compare-label">结果</div>
          <img v-if="previewJob.result_image_path" :src="toUrl(previewJob.result_image_path)" class="compare-img" />
          <div v-else class="error-msg">{{ previewJob.error_message || '未生成结果' }}</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useAuthStore } from '../../../stores/auth';
import { getJobHistory, getJobUsers } from '../../../api/aiJobs';
import { getApiKeys } from '../../../api/apiKeys';

const auth = useAuthStore();
const BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:3000';

const list = ref([]);
const loading = ref(false);
const pagination = reactive({ page: 1, limit: 24, total: 0, totalPages: 0 });

const filter = reactive({ user_id: '', model_name: '', status: '', date_from: '', date_to: '' });
const dateRange = ref(null);

const userList = ref([]);
const modelList = ref([]);

const previewVisible = ref(false);
const previewJob = ref(null);

function toUrl(relPath) {
  return relPath.startsWith('http') ? relPath : `${BASE_URL}/${relPath}`;
}

function formatTime(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchList() {
  loading.value = true;
  try {
    const params = { page: pagination.page, limit: pagination.limit };
    if (filter.user_id) params.user_id = filter.user_id;
    if (filter.model_name) params.model_name = filter.model_name;
    if (filter.status) params.status = filter.status;
    if (filter.date_from) params.date_from = filter.date_from;
    if (filter.date_to) params.date_to = filter.date_to;
    const res = await getJobHistory(params);
    list.value = res.data;
    Object.assign(pagination, res.pagination);
  } finally { loading.value = false; }
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
  pagination.page = 1;
  fetchList();
}

function onPageChange(p) {
  pagination.page = p;
  fetchList();
}

function preview(job) {
  previewJob.value = job;
  previewVisible.value = true;
}

onMounted(async () => {
  // 拉 Key 列表做模型筛选
  try {
    const keys = await getApiKeys();
    modelList.value = [...new Set(keys.map(k => k.model_name))];
  } catch (e) { /* 非 super_admin 拿不到，忽略 */ }

  if (auth.isSuperAdmin) {
    try {
      userList.value = await getJobUsers();
    } catch (e) { /* ignore */ }
  }
  fetchList();
});
</script>

<style scoped>
.filter-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.card {
  background: #fff;
  border: 1px solid #e5e5e7;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
.img-wrap { aspect-ratio: 1; background: #f5f5f7; }
.img-wrap img { width: 100%; height: 100%; object-fit: contain; }
.fail-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #c9302c; }
.card-info { padding: 10px 12px; }
.model-name { font-size: 13px; font-weight: 500; color: #1d1d1f; }
.time { font-size: 12px; color: #86868b; margin: 4px 0; }
.download { font-size: 12px; color: #CF2028; text-decoration: none; }
.pagination { display: flex; justify-content: center; margin-top: 20px; }

.preview-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.compare-col { text-align: center; }
.compare-label { font-weight: 500; margin-bottom: 8px; }
.compare-img { max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px; }
.error-msg { color: #c9302c; padding: 20px; }
</style>
