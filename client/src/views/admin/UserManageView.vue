<template>
  <div>
    <div class="admin-header">
      <h2 class="admin-title">用户管理</h2>
      <el-button type="primary" @click="openDialog()">+ 新增用户</el-button>
    </div>

    <el-table :data="users" v-loading="loading" style="width: 100%;">
      <el-table-column prop="username" label="用户名" width="200" />
      <el-table-column label="角色" width="140">
        <template #default="{ row }">
          <el-tag :type="roleTagType(row.role)" size="small" round>
            {{ roleLabel(row.role) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="模块权限" min-width="200">
        <template #default="{ row }">
          <template v-if="row.role === 'operator'">
            <el-tag v-for="p in row.permissions" :key="p" size="small" class="perm-tag">
              {{ moduleLabel(p) }}
            </el-tag>
            <span v-if="!row.permissions || row.permissions.length === 0" style="color: #aeaeb2; font-size: 12px;">
              无权限
            </span>
          </template>
          <span v-else style="color: #86868b; font-size: 12px;">全部</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          {{ new Date(row.created_at).toLocaleDateString('zh-CN') }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280">
        <template #default="{ row }">
          <template v-if="canManage(row)">
            <el-button text type="primary" size="small" @click="openDialog(row)">编辑</el-button>
            <el-button text type="primary" size="small" @click="openResetPwd(row)">重置密码</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
          <el-button
            v-if="auth.isSuperAdmin && row.id !== auth.user?.id && row.role !== 'super_admin'"
            text type="warning" size="small"
            @click="openTransfer(row)"
          >
            移交主管理员
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑用户' : '新增用户'" width="460px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="用户名">
          <el-input v-model="form.username" :disabled="!!editingId" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="密码" v-if="!editingId">
          <el-input v-model="form.password" type="password" placeholder="初始密码（至少6位）" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%;">
            <el-option v-if="auth.isSuperAdmin" label="管理员" value="admin" />
            <el-option label="运营" value="operator" />
          </el-select>
        </el-form-item>
        <el-form-item label="模块权限" v-if="form.role === 'operator'">
          <el-checkbox-group v-model="form.permissions">
            <el-checkbox label="gallery">产品图库</el-checkbox>
            <el-checkbox label="products">产品管理</el-checkbox>
            <el-checkbox label="series">系列管理</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码对话框 -->
    <el-dialog v-model="resetPwdVisible" title="重置密码" width="380px">
      <p style="margin-bottom: 12px;">重置 <strong>{{ resetUser?.username }}</strong> 的密码</p>
      <el-input v-model="newPassword" type="password" placeholder="输入新密码（至少6位）" show-password />
      <template #footer>
        <el-button @click="resetPwdVisible = false">取消</el-button>
        <el-button type="primary" @click="handleResetPwd" :loading="resetting">确认重置</el-button>
      </template>
    </el-dialog>

    <!-- 移交主管理员对话框 -->
    <el-dialog v-model="transferVisible" title="移交主管理员" width="400px">
      <p style="margin-bottom: 12px;">
        确定将主管理员权限移交给 <strong>{{ transferTarget?.username }}</strong>？
      </p>
      <p style="margin-bottom: 12px; color: #e53e3e; font-size: 13px;">
        移交后您将变为管理员，此操作不可撤销。
      </p>
      <el-input v-model="transferPassword" type="password" placeholder="输入您的密码确认" show-password />
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="warning" @click="handleTransfer" :loading="transferring">确认移交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../../stores/auth';
import { getUsers, createUser, updateUser, resetPassword, deleteUser, transferSuperAdmin } from '../../api/users';

const auth = useAuthStore();

const users = ref([]);
const loading = ref(false);

const dialogVisible = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = ref({ username: '', password: '', role: 'operator', permissions: [] });

const resetPwdVisible = ref(false);
const resetUser = ref(null);
const newPassword = ref('');
const resetting = ref(false);

const transferVisible = ref(false);
const transferTarget = ref(null);
const transferPassword = ref('');
const transferring = ref(false);

function roleLabel(role) {
  const map = { super_admin: '主管理员', admin: '管理员', operator: '运营' };
  return map[role] || role;
}

function roleTagType(role) {
  const map = { super_admin: 'danger', admin: '', operator: 'info' };
  return map[role] || 'info';
}

function moduleLabel(mod) {
  const map = { gallery: '产品图库', products: '产品管理', series: '系列管理' };
  return map[mod] || mod;
}

function canManage(row) {
  if (row.id === auth.user?.id) return false;
  if (row.role === 'super_admin') return false;
  if (auth.user?.role === 'admin' && row.role !== 'operator') return false;
  return true;
}

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
    form.value = {
      username: row.username,
      password: '',
      role: row.role,
      permissions: row.permissions ? [...row.permissions] : [],
    };
  } else {
    editingId.value = null;
    form.value = { username: '', password: '', role: 'operator', permissions: [] };
  }
  dialogVisible.value = true;
}

async function handleSave() {
  saving.value = true;
  try {
    if (editingId.value) {
      await updateUser(editingId.value, { role: form.value.role, permissions: form.value.permissions });
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

function openTransfer(row) {
  transferTarget.value = row;
  transferPassword.value = '';
  transferVisible.value = true;
}

async function handleTransfer() {
  if (!transferPassword.value) return ElMessage.warning('请输入密码');
  transferring.value = true;
  try {
    await transferSuperAdmin(transferTarget.value.id, transferPassword.value);
    ElMessage.success('主管理员已移交，请重新登录');
    transferVisible.value = false;
    auth.logout();
    window.location.href = '/login';
  } catch (err) {
    // error handled by interceptor
  } finally {
    transferring.value = false;
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

.perm-tag {
  margin-right: 4px;
}
</style>
