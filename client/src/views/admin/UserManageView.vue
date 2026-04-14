<template>
  <div>
    <div class="admin-header">
      <h2 class="admin-title">用户管理</h2>
      <el-button type="primary" @click="openDialog()">+ 新增用户</el-button>
    </div>

    <el-table :data="users" v-loading="loading" style="width: 100%;">
      <el-table-column prop="username" label="用户名" width="200" />
      <el-table-column label="角色" width="120">
        <template #default="{ row }">
          <el-tag :type="row.role === 'admin' ? '' : 'success'" size="small" round>
            {{ row.role === 'admin' ? '管理员' : '普通用户' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          {{ new Date(row.created_at).toLocaleDateString('zh-CN') }}
        </template>
      </el-table-column>
      <el-table-column label="操作">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="openDialog(row)">编辑</el-button>
          <el-button text type="primary" size="small" @click="openResetPwd(row)">重置密码</el-button>
          <el-button text type="danger" size="small" @click="handleDelete(row)" v-if="row.id !== auth.user?.id">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑用户' : '新增用户'" width="420px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="form.username" :disabled="!!editingId" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="密码" v-if="!editingId">
          <el-input v-model="form.password" type="password" placeholder="初始密码" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%;">
            <el-option label="管理员" value="admin" />
            <el-option label="普通用户" value="viewer" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetPwdVisible" title="重置密码" width="380px">
      <p style="margin-bottom: 12px;">重置 <strong>{{ resetUser?.username }}</strong> 的密码</p>
      <el-input v-model="newPassword" type="password" placeholder="输入新密码" show-password />
      <template #footer>
        <el-button @click="resetPwdVisible = false">取消</el-button>
        <el-button type="primary" @click="handleResetPwd" :loading="resetting">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../../stores/auth';
import { getUsers, createUser, updateUser, resetPassword, deleteUser } from '../../api/users';

const auth = useAuthStore();

const users = ref([]);
const loading = ref(false);

const dialogVisible = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = ref({ username: '', password: '', role: 'viewer' });

const resetPwdVisible = ref(false);
const resetUser = ref(null);
const newPassword = ref('');
const resetting = ref(false);

async function fetchUsers() {
  loading.value = true;
  try {
    users.value = await getUsers();
  } finally {
    loading.value = false;
  }
}

function openDialog(row = null) {
  if (row) {
    editingId.value = row.id;
    form.value = { username: row.username, password: '', role: row.role };
  } else {
    editingId.value = null;
    form.value = { username: '', password: '', role: 'viewer' };
  }
  dialogVisible.value = true;
}

async function handleSave() {
  saving.value = true;
  try {
    if (editingId.value) {
      await updateUser(editingId.value, { role: form.value.role });
      ElMessage.success('更新成功');
    } else {
      await createUser(form.value);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    fetchUsers();
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确定删除用户 ${row.username}？`, '确认删除', { type: 'warning' });
  await deleteUser(row.id);
  ElMessage.success('删除成功');
  fetchUsers();
}

function openResetPwd(row) {
  resetUser.value = row;
  newPassword.value = '';
  resetPwdVisible.value = true;
}

async function handleResetPwd() {
  if (!newPassword.value) return ElMessage.warning('请输入新密码');
  resetting.value = true;
  try {
    await resetPassword(resetUser.value.id, newPassword.value);
    ElMessage.success('密码重置成功');
    resetPwdVisible.value = false;
  } finally {
    resetting.value = false;
  }
}

onMounted(fetchUsers);
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
</style>
