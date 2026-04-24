<template>
  <div>
    <div class="admin-header">
      <h2 class="admin-title">API Key 管理</h2>
      <el-button type="primary" @click="openDialog()">+ 新增 API Key</el-button>
    </div>

    <el-table :data="list" v-loading="loading" :fit="false" style="width: 100%;">
      <el-table-column label="服务商" width="100">
        <template #default="{ row }">
          <el-tag :type="providerTagType(row.provider)" size="small">
            {{ providerLabel(row.provider) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="model_name" label="模型名称" width="170" show-overflow-tooltip />
      <el-table-column label="API Key" width="170">
        <template #default="{ row }">
          <code class="key-mask">{{ row.api_key_masked }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" width="160" show-overflow-tooltip />
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="row.is_active"
            @change="(v) => toggleActive(row, v)"
          />
        </template>
      </el-table-column>
      <el-table-column label="用量" width="70" align="center">
        <template #default="{ row }">
          <span>{{ row.call_count || 0 }}</span>
        </template>
      </el-table-column>
      <el-table-column label="最后测试" width="160">
        <template #default="{ row }">
          <div v-if="row.last_tested_at">
            <el-tag :type="row.last_test_status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.last_test_status === 'success' ? '成功' : '失败' }}
            </el-tag>
            <div class="muted">{{ formatTime(row.last_tested_at) }}</div>
          </div>
          <span v-else class="muted">未测试</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" align="center" fixed="right" class-name="action-col">
        <template #default="{ row }">
          <el-button text type="success" @click="handleTest(row)" :loading="testingId === row.id">测试</el-button>
          <el-button text type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button text type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑 API Key' : '新增 API Key'" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="服务商">
          <el-select v-model="form.provider" style="width: 100%;">
            <el-option label="Google Gemini" value="gemini" />
            <el-option label="OpenAI" value="openai" />
            <el-option label="Anthropic Claude" value="claude" />
          </el-select>
        </el-form-item>
        <el-form-item label="模型名称">
          <el-input v-model="form.model_name" :placeholder="modelPlaceholder" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="form.api_key"
            type="password"
            show-password
            :placeholder="editingId ? '留空表示不修改' : '输入完整的 API Key'"
          />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="给这个 Key 起个名字，如「Nano Banana 2」" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 测试结果对话框 -->
    <el-dialog v-model="testResultVisible" title="测试结果" width="500px">
      <div v-if="testResult">
        <el-alert
          :type="testResult.ok ? 'success' : 'error'"
          :title="testResult.ok ? '连接成功' : '连接失败'"
          :closable="false"
          show-icon
        />
        <div class="test-content">
          <template v-if="testResult.ok">
            <div class="test-label">AI 回复：</div>
            <div class="test-reply">{{ testResult.reply }}</div>
          </template>
          <template v-else>
            <div class="test-label">错误信息：</div>
            <div class="test-error">{{ testResult.error }}</div>
          </template>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="testResultVisible = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getApiKeys, createApiKey, updateApiKey, deleteApiKey, testApiKey } from '../../api/apiKeys';

const list = ref([]);
const loading = ref(false);

const dialogVisible = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = ref({ provider: 'gemini', model_name: '', api_key: '', name: '' });

const testingId = ref(null);
const testResultVisible = ref(false);
const testResult = ref(null);

const modelPlaceholder = computed(() => {
  const map = {
    gemini: '如：gemini-2.5-flash',
    openai: '如：gpt-4o-mini',
    claude: '如：claude-sonnet-4-5',
  };
  return map[form.value.provider] || '';
});

function providerLabel(p) {
  const map = { gemini: 'Gemini', openai: 'OpenAI', claude: 'Claude' };
  return map[p] || p;
}

function providerTagType(p) {
  const map = { gemini: 'warning', openai: 'success', claude: 'info' };
  return map[p] || '';
}

function formatTime(t) {
  if (!t) return '';
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchList() {
  loading.value = true;
  try {
    list.value = await getApiKeys();
  } finally {
    loading.value = false;
  }
}

function openDialog(row = null) {
  if (row) {
    editingId.value = row.id;
    form.value = {
      provider: row.provider,
      model_name: row.model_name,
      api_key: '',
      name: row.name || '',
    };
  } else {
    editingId.value = null;
    form.value = { provider: 'gemini', model_name: '', api_key: '', name: '' };
  }
  dialogVisible.value = true;
}

async function handleSave() {
  if (!form.value.provider || !form.value.model_name) {
    return ElMessage.warning('请填写服务商和模型名称');
  }
  if (!editingId.value && !form.value.api_key) {
    return ElMessage.warning('请输入 API Key');
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateApiKey(editingId.value, form.value);
      ElMessage.success('更新成功');
    } else {
      await createApiKey(form.value);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    fetchList();
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确定删除 ${providerLabel(row.provider)} / ${row.model_name}？`, '确认删除', { type: 'warning' });
  await deleteApiKey(row.id);
  ElMessage.success('删除成功');
  fetchList();
}

async function toggleActive(row, newVal) {
  await updateApiKey(row.id, { is_active: newVal });
  row.is_active = newVal;
  ElMessage.success(newVal ? '已启用' : '已禁用');
}

async function handleTest(row) {
  testingId.value = row.id;
  try {
    const res = await testApiKey(row.id);
    testResult.value = { ok: true, reply: res.reply };
    testResultVisible.value = true;
    fetchList();
  } catch (err) {
    const data = err.response?.data || {};
    testResult.value = { ok: false, error: data.error || data.message || err.message };
    testResultVisible.value = true;
    fetchList();
  } finally {
    testingId.value = null;
  }
}

onMounted(fetchList);
</script>

<style scoped>
.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.admin-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.key-mask {
  font-family: ui-monospace, Menlo, Monaco, monospace;
  font-size: 13px;
  background: #f5f5f7;
  padding: 2px 8px;
  border-radius: 4px;
}

.muted {
  color: #86868b;
  font-size: 12px;
  margin-top: 2px;
}

.test-content {
  margin-top: 16px;
}

.test-label {
  font-size: 13px;
  color: #86868b;
  margin-bottom: 6px;
}

.test-reply {
  padding: 12px;
  background: #f5f5f7;
  border-radius: 8px;
  line-height: 1.6;
  font-size: 14px;
}

.test-error {
  padding: 12px;
  background: #fef3f2;
  border-radius: 8px;
  color: #c9302c;
  font-size: 13px;
  word-break: break-all;
}

:deep(.action-col .cell) {
  white-space: nowrap;
}
</style>
