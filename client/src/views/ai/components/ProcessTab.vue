<template>
  <div class="process-tab">
    <div class="top-layout">
      <!-- 左列：上传区 + 缩略图 -->
      <div class="left-col">
        <h3 class="section-title">上传图片</h3>
        <div
          class="uploader-box"
          :class="{ dragging: isDragging }"
          @dragenter.prevent="onDragEnter"
          @dragover.prevent
          @dragleave.prevent="onDragLeave"
          @drop.prevent="onDrop"
        >
          <input
            ref="fileInputRef"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            style="display: none;"
            @change="onFileInputChange"
          />
          <div class="upload-inner">
            <button type="button" class="upload-btn" @click="triggerFileInput">
              <el-icon><UploadFilled /></el-icon>
              <span>上传图片</span>
            </button>
            <div class="upload-hint">或拖拽图片到此处 / Ctrl+V 粘贴</div>
          </div>
        </div>

        <div v-if="fileList.length" class="thumb-grid">
          <div v-for="file in fileList" :key="file.uid" class="thumb">
            <img :src="thumbUrl(file)" class="thumb-img" />
            <button class="thumb-remove" @click="removeFile(file)" title="移除">×</button>
            <div class="thumb-name" :title="file.name">{{ file.name }}</div>
          </div>
        </div>
      </div>

      <!-- 右列：图片尺寸 + 模型配置 -->
      <div class="right-col">
        <h3 class="section-title">图片尺寸</h3>
        <el-select
          v-model="aspectRatio"
          placeholder="不指定（由 AI 决定）"
          clearable
          style="width: 220px; margin-bottom: 24px;"
        >
          <el-option label="1:1（正方形）" value="1:1" />
          <el-option label="4:3（横版）" value="4:3" />
          <el-option label="3:4（竖版）" value="3:4" />
        </el-select>

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
              <span class="model-id">{{ defaultKey.model_name }}</span>
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
            <a href="javascript:;" class="result-action" @click="downloadFile(job.result_image_path)">下载</a>
          </div>
          <div v-else-if="job.status === 'failed'" class="result-img-wrap failed">
            <div class="failed-icon">❌</div>
            <div class="result-model">{{ job.model_name }}</div>
            <div class="error-text" :title="job.error_message">{{ job.error_message }}</div>
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

    <!-- 大图预览（仅结果图） -->
    <el-dialog v-model="previewVisible" width="80%" :show-close="true">
      <div class="preview-single">
        <img v-if="previewJob" :src="toUrl(previewJob.result_image_path)" class="preview-img" />
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
const isDragging = ref(false);
const fileInputRef = ref(null);
const aspectRatio = ref('');
let dragDepth = 0;
const thumbCache = new Map(); // uid -> objectURL
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILES = 10;
const MAX_SIZE = 20 * 1024 * 1024;

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
    ElMessage.error('下载失败');
  }
}

function addRawFile(raw) {
  if (!ALLOWED_TYPES.includes(raw.type)) {
    ElMessage.warning(`不支持的格式：${raw.type || '未知'}`);
    return false;
  }
  if (raw.size > MAX_SIZE) {
    ElMessage.warning(`${raw.name || '图片'} 超过 20MB`);
    return false;
  }
  if (fileList.value.length >= MAX_FILES) {
    ElMessage.warning(`最多 ${MAX_FILES} 张`);
    return false;
  }
  const uid = Date.now() + Math.random();
  const ext = (raw.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const name = raw.name || `pasted-${Math.floor(uid)}.${ext}`;
  fileList.value.push({ uid, name, size: raw.size, raw, status: 'ready' });
  return true;
}

function removeFile(file) {
  releaseThumb(file.uid);
  fileList.value = fileList.value.filter(f => f.uid !== file.uid);
}

function triggerFileInput() {
  fileInputRef.value?.click();
}

function onFileInputChange(e) {
  const files = Array.from(e.target.files || []);
  for (const f of files) addRawFile(f);
  e.target.value = ''; // 允许再次选择同一文件
}

function onDragEnter() {
  dragDepth++;
  isDragging.value = true;
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) isDragging.value = false;
}

function onDrop(e) {
  dragDepth = 0;
  isDragging.value = false;
  const files = Array.from(e.dataTransfer?.files || []);
  for (const f of files) addRawFile(f);
}

function thumbUrl(file) {
  if (thumbCache.has(file.uid)) return thumbCache.get(file.uid);
  const raw = file.raw || file;
  if (raw instanceof Blob) {
    const url = URL.createObjectURL(raw);
    thumbCache.set(file.uid, url);
    return url;
  }
  return '';
}

function releaseThumb(uid) {
  const url = thumbCache.get(uid);
  if (url) {
    URL.revokeObjectURL(url);
    thumbCache.delete(uid);
  }
}

function handlePaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  const images = [];
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) images.push(f);
    }
  }
  if (images.length === 0) return;
  e.preventDefault();
  for (const raw of images) addRawFile(raw);
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
    formData.append('aspect_ratio', aspectRatio.value);
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
  window.addEventListener('paste', handlePaste);
});

onUnmounted(() => {
  stopPolling();
  window.removeEventListener('paste', handlePaste);
  for (const url of thumbCache.values()) URL.revokeObjectURL(url);
  thumbCache.clear();
});
</script>

<style scoped>
.process-tab { padding: 8px 0; }

.top-layout {
  display: grid;
  grid-template-columns: 440px 1fr;
  gap: 32px;
  margin-bottom: 24px;
}

@media (max-width: 900px) {
  .top-layout { grid-template-columns: 1fr; }
}

.left-col, .right-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.right-col { gap: 8px; }

.uploader-box {
  max-width: 420px;
  padding: 40px 20px;
  border: 2px dashed #c7c7cc;
  border-radius: 16px;
  background: #fafafa;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 20px;
}
.uploader-box.dragging {
  border-color: #409eff;
  background: #e6f2ff;
}

.upload-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 28px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}
.upload-btn:hover {
  background: #337ecc;
  transform: translateY(-1px);
}
.upload-btn .el-icon {
  font-size: 18px;
}
.upload-hint {
  color: #86868b;
  font-size: 14px;
}

.thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.thumb {
  position: relative;
  background: #f5f5f7;
  border: 1px solid #e5e5e7;
  border-radius: 10px;
  overflow: hidden;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
}
.thumb-img {
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
}
.thumb-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: #e53e3e;
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s;
}
.thumb-remove:hover { transform: scale(1.1); background: #c9302c; }
.thumb-name {
  font-size: 11px;
  color: #86868b;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.9);
  border-top: 1px solid #e5e5e7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.section-title { font-size: 16px; font-weight: 600; margin: 0 0 16px 0; }

.model-config { margin-bottom: 0; }
.model-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  width: 100%;
  box-sizing: border-box;
  background: #f5f5f7;
  border-radius: 8px;
  margin-bottom: 8px;
}
.default-row { background: #fff8e1; }
.model-label { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.model-name { font-weight: 500; }
.model-id {
  color: #86868b;
  font-size: 12px;
  font-family: ui-monospace, Menlo, Monaco, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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
.error-text {
  color: #c9302c;
  font-size: 12px;
  text-align: center;
  max-height: 4em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  word-break: break-word;
  padding: 0 8px;
}
.status-text { color: #86868b; font-size: 12px; }

.preview-single { display: flex; justify-content: center; align-items: center; }
.preview-img { max-width: 100%; max-height: 75vh; object-fit: contain; border-radius: 8px; }
</style>
