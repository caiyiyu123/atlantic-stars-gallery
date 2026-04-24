<template>
  <div class="template-tab">
    <div class="header-row">
      <el-button type="primary" @click="openDialog()">+ 新增模板</el-button>
    </div>

    <el-table :data="list" v-loading="loading" style="width: 100%;">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="full-prompt">{{ row.content }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column label="Prompt 内容" min-width="300">
        <template #default="{ row }">
          <div class="prompt-preview">{{ row.content.slice(0, 80) }}{{ row.content.length > 80 ? '...' : '' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="默认" width="120" align="center">
        <template #default="{ row }">
          <span v-if="row.is_default" class="default-tag">默认模板</span>
          <span v-else class="set-default-link" @click="handleSetDefault(row)">设为默认</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" align="center">
        <template #default="{ row }">
          <el-button text type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button text type="danger" :disabled="row.is_default" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑模板' : '新增模板'" width="600px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="如：白底主图 / 透明背景" />
        </el-form-item>
        <el-form-item label="Prompt">
          <el-input v-model="form.content" type="textarea" :rows="10" placeholder="给 AI 的指令..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getPromptTemplates, createPromptTemplate,
  updatePromptTemplate, deletePromptTemplate, setDefaultTemplate,
} from '../../../api/promptTemplates';

const list = ref([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = ref({ name: '', content: '' });

async function fetchList() {
  loading.value = true;
  try { list.value = await getPromptTemplates(); } finally { loading.value = false; }
}

function openDialog(row = null) {
  if (row) {
    editingId.value = row.id;
    form.value = { name: row.name, content: row.content };
  } else {
    editingId.value = null;
    form.value = { name: '', content: '' };
  }
  dialogVisible.value = true;
}

async function handleSave() {
  if (!form.value.name || !form.value.content) {
    return ElMessage.warning('请填写名称和内容');
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updatePromptTemplate(editingId.value, form.value);
      ElMessage.success('更新成功');
    } else {
      await createPromptTemplate(form.value);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    fetchList();
  } finally { saving.value = false; }
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确定删除模板「${row.name}」？`, '确认', { type: 'warning' });
  await deletePromptTemplate(row.id);
  ElMessage.success('删除成功');
  fetchList();
}

async function handleSetDefault(row) {
  await setDefaultTemplate(row.id);
  ElMessage.success('已设为默认');
  fetchList();
}

onMounted(fetchList);
</script>

<style scoped>
.header-row { display: flex; justify-content: flex-end; margin-bottom: 16px; }
.prompt-preview { color: #86868b; font-size: 13px; line-height: 1.5; }

.full-prompt {
  padding: 16px 24px;
  background: #fafafa;
  border-radius: 8px;
  color: #1d1d1f;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
}

.default-tag {
  display: inline-block;
  padding: 3px 10px;
  background: #fff8e1;
  color: #d48806;
  border: 1px solid #ffd666;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.set-default-link {
  color: #e53e3e;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
}
.set-default-link:hover {
  color: #c9302c;
  text-decoration: underline;
}
</style>
