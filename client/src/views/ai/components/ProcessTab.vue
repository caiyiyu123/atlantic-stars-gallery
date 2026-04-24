<template>
  <div class="process-tab">
    <!-- 上传区 -->
    <el-upload
      class="uploader"
      drag
      multiple
      :auto-upload="false"
      :on-change="handleFileChange"
      :on-remove="handleFileRemove"
      :file-list="fileList"
      :limit="10"
      accept="image/jpeg,image/png,image/webp"
    >
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">拖拽图片到此，或<em>点击选择</em></div>
      <template #tip>
        <div class="upload-tip">支持 JPG/PNG/WEBP，单张 ≤ 20MB，一次最多 10 张</div>
      </template>
    </el-upload>

    <!-- 模型配置 -->
    <div class="model-config">
      <h3 class="section-title">模型配置</h3>
      <div v-if="!defaultKey" class="warning">
        <el-alert type="warning" :closable="false" title="未找到名称为 'Nano Banana 2' 的 API Key" show-icon>
          请先在 API Key 管理中添加并启用一个名称为 <strong>Nano Banana 2</strong> 的 Key
        </el-alert>
      </div>
      <div v-else>
        <div class="model-row default-row">
          <div class="model-label">
            <el-tag type="warning">默认</el-tag>
            <span class="model-name">{{ defaultKey.name }}</span>
          </div>
          <el-input-number v-model="defaultCount" :min="1" :max="10" size="default" />
        </div>

        <div v-for="(item, idx) in extraModels" :key="idx" class="model-row">
          <div class="model-label">
            <el-select v-model="item.api_key_id" placeholder="选择模型">
              <el-option
                v-for="key in availableExtraKeys(item.api_key_id)"
                :key="key.id"
                :label="`${key.name} (${key.model_name})`"
                :value="key.id"
              />
            </el-select>
          </div>
          <el-input-number v-model="item.count" :min="1" :max="10" size="default" />
          <el-button text type="danger" @click="removeModel(idx)">×</el-button>
        </div>

        <el-button type="primary" plain @click="addModel" :disabled="!canAddMore">+ 添加模型</el-button>
      </div>

      <div class="submit-row">
        <span class="total-tip">总任务数：{{ totalJobs }} / 50</span>
        <el-button
          type="primary"
          size="large"
          :disabled="!canSubmit"
          :loading="submitting"
          @click="handleSubmit"
        >
          开始处理
        </el-button>
      </div>
    </div>

    <!-- 进度 + 结果 -->
    <div v-if="currentBatch" class="progress-section">
      <h3 class="section-title">处理进度</h3>
      <el-progress :percentage="progressPercent" :status="allDone ? 'success' : ''" />
      <p class="progress-text">{{ doneCount }} / {{ currentBatch.jobs.length }} 完成{{ failedCount ? `（${failedCount} 失败）` : '' }}</p>

      <div class="result-grid">
        <div v-for="job in currentBatch.jobs" :key="job.id" class="result-card">
          <div v-if="job.status === 'success'" class="result-img-wrap">
            <img :src="toUrl(job.result_image_path)" class="result-img" @click="preview(job)" />
            <div class="result-model">{{ job.model_name }}</div>
            <a :href="toUrl(job.result_image_path)" download target="_blank" class="result-action">下载</a>
          </div>
          <div v-else-if="job.status === 'failed'" class="result-img-wrap failed">
            <div class="failed-icon">❌</div>
            <div class="result-model">{{ job.model_name }}</div>
            <div class="error-text" :title="job.error_message">{{ job.error_message.slice(0, 30) }}...</div>
            <el-button size="small" type="primary" @click="handleRetry(job.id)">重试</el-button>
          </div>
          <div v-else class="result-img-wrap processing">
            <el-icon class="is-loading"><loading /></el-icon>
            <div class="result-model">{{ job.model_name }}</div>
            <div class="status-text">{{ job.status === 'pending' ? '等待中' : '处理中...' }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 大图预览 -->
    <el-dialog v-model="previewVisible" width="80%" :show-close="true">
      <div class="preview-compare">
        <div class="compare-col">
          <div class="compare-label">原图</div>
          <img v-if="previewJob" :src="toUrl(previewJob.original_image_path)" class="compare-img" />
        </div>
        <div class="compare-col">
          <div class="compare-label">结果</div>
          <img v-if="previewJob" :src="toUrl(previewJob.result_image_path)" class="compare-img" />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { UploadFilled, Loading } from '@element-plus/icons-vue';
import { getApiKeys } from '../../../api/apiKeys';
import { submitAiJobs, getBatchStatus, retryJob } from '../../../api/aiJobs';

const fileList = ref([]);
const allKeys = ref([]);
const defaultCount = ref(1);
const extraModels = ref([]);
const submitting = ref(false);

const currentBatch = ref(null);
let pollTimer = null;

const previewVisible = ref(false);
const previewJob = ref(null);

const BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:3000';

const defaultKey = computed(() => allKeys.value.find(k => k.name === 'Nano Banana 2' && k.is_active));

const availableExtraKeys = (currentId) => {
  const usedIds = new Set([
    defaultKey.value?.id,
    ...extraModels.value.map(m => m.api_key_id),
  ].filter(Boolean));
  if (currentId) usedIds.delete(currentId);
  return allKeys.value.filter(k => k.is_active && !usedIds.has(k.id));
};

const canAddMore = computed(() => availableExtraKeys().length > 0);

const totalJobs = computed(() => {
  const modelCount = defaultCount.value + extraModels.value.reduce((s, m) => s + (m.count || 0), 0);
  return fileList.value.length * modelCount;
});

const canSubmit = computed(() =>
  defaultKey.value && fileList.value.length > 0 && totalJobs.value > 0 && totalJobs.value <= 50 && !submitting.value
);

const doneCount = computed(() =>
  currentBatch.value?.jobs.filter(j => j.status === 'success' || j.status === 'failed').length || 0
);
const failedCount = computed(() =>
  currentBatch.value?.jobs.filter(j => j.status === 'failed').length || 0
);
const progressPercent = computed(() => {
  if (!currentBatch.value) return 0;
  return Math.round((doneCount.value / currentBatch.value.jobs.length) * 100);
});
const allDone = computed(() =>
  currentBatch.value && doneCount.value === currentBatch.value.jobs.length
);

function toUrl(relPath) {
  return relPath.startsWith('http') ? relPath : `${BASE_URL}/${relPath}`;
}

function handleFileChange(file) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.warning(`${file.name} 超过 20MB`);
    fileList.value = fileList.value.filter(f => f.uid !== file.uid);
    return;
  }
  // fileList 由 el-upload 自动维护（通过 v-model 或 on-change）
}

function handleFileRemove(file) {
  fileList.value = fileList.value.filter(f => f.uid !== file.uid);
}

function addModel() {
  const avail = availableExtraKeys();
  if (avail.length === 0) return;
  extraModels.value.push({ api_key_id: avail[0].id, count: 1 });
}

function removeModel(idx) {
  extraModels.value.splice(idx, 1);
}

async function handleSubmit() {
  if (totalJobs.value > 50) {
    return ElMessage.warning(`总任务数 ${totalJobs.value} 超过上限 50`);
  }
  submitting.value = true;
  try {
    const formData = new FormData();
    for (const f of fileList.value) formData.append('files', f.raw);
    const models = [
      { api_key_id: defaultKey.value.id, count: defaultCount.value },
      ...extraModels.value.map(m => ({ api_key_id: m.api_key_id, count: m.count })),
    ];
    formData.append('models', JSON.stringify(models));
    const res = await submitAiJobs(formData);
    currentBatch.value = res;
    ElMessage.success(`已提交 ${res.jobs.length} 个任务`);
    startPolling(res.batch_id);
  } catch (err) {
    // 错误会由全局拦截器弹 message
  } finally {
    submitting.value = false;
  }
}

function startPolling(batchId) {
  stopPolling();
  pollTimer = setInterval(async () => {
    const res = await getBatchStatus(batchId);
    currentBatch.value = res;
    if (res.jobs.every(j => j.status === 'success' || j.status === 'failed')) {
      stopPolling();
    }
  }, 2000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function handleRetry(jobId) {
  await retryJob(jobId);
  ElMessage.success('已重新提交');
  if (currentBatch.value) startPolling(currentBatch.value.batch_id);
}

function preview(job) {
  previewJob.value = job;
  previewVisible.value = true;
}

onMounted(async () => {
  allKeys.value = await getApiKeys();
});

onUnmounted(stopPolling);
</script>

<style scoped>
.process-tab { padding: 8px 0; }
.uploader { margin-bottom: 32px; }
.upload-tip { color: #86868b; font-size: 12px; margin-top: 4px; }

.section-title { font-size: 16px; font-weight: 600; margin: 0 0 16px 0; }

.model-config { margin-bottom: 32px; }
.model-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background: #f5f5f7;
  border-radius: 8px;
  margin-bottom: 8px;
}
.default-row { background: #fff8e1; }
.model-label { flex: 1; display: flex; align-items: center; gap: 8px; }
.model-name { font-weight: 500; }

.submit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
}
.total-tip { color: #86868b; font-size: 13px; }

.warning { margin-bottom: 16px; }

.progress-section {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #e5e5e7;
}
.progress-text { text-align: center; color: #86868b; font-size: 13px; margin: 8px 0 20px; }

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.result-card { background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5e7; }
.result-img-wrap { padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.result-img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #f5f5f7; border-radius: 8px; cursor: pointer; }
.result-model { font-size: 12px; color: #86868b; }
.result-action { color: #CF2028; text-decoration: none; font-size: 13px; font-weight: 500; }
.failed, .processing { min-height: 200px; justify-content: center; }
.failed-icon { font-size: 36px; }
.error-text { color: #c9302c; font-size: 12px; text-align: center; }
.status-text { color: #86868b; font-size: 12px; }

.preview-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.compare-col { text-align: center; }
.compare-label { font-weight: 500; margin-bottom: 8px; }
.compare-img { max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px; }
</style>
