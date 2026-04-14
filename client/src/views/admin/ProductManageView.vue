<template>
  <div>
    <div class="admin-header">
      <h2 class="admin-title">产品管理</h2>
      <el-button type="primary" @click="openDialog()">+ 新增产品</el-button>
    </div>

    <div class="admin-filter">
      <el-select v-model="filterSeason" placeholder="选择季度" clearable style="width: 160px;" @change="fetchList">
        <el-option v-for="s in seasons" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-input v-model="filterKeyword" placeholder="搜索款号..." clearable style="width: 200px;" @input="debouncedFetch" />
    </div>

    <el-table :data="products" v-loading="loading" style="width: 100%;">
      <el-table-column prop="sku" label="款号" width="180" />
      <el-table-column prop="color_name" label="颜色" width="150" />
      <el-table-column prop="series_name" label="系列" width="130" />
      <el-table-column prop="season_name" label="季度" width="110" />
      <el-table-column prop="image_count" label="图片" width="80" align="center" />
      <el-table-column label="操作" width="260">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="openDialog(row)">编辑</el-button>
          <el-button text type="primary" size="small" @click="openUpload(row)">上传图片</el-button>
          <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="admin-pagination">
      <el-pagination
        v-model:current-page="page"
        :page-size="20"
        :total="total"
        layout="prev, pager, next"
        @current-change="fetchList"
      />
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑产品' : '新增产品'" width="480px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="季度">
          <el-select v-model="form.season_id" placeholder="选择季度" style="width: 100%;" @change="onSeasonChange">
            <el-option v-for="s in seasons" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类别">
          <el-select v-model="form.category" placeholder="选择类别" style="width: 100%;" @change="onCategoryChange">
            <el-option label="Men" value="men" />
            <el-option label="Women" value="women" />
            <el-option label="Kids" value="kids" />
          </el-select>
        </el-form-item>
        <el-form-item label="系列">
          <el-select v-model="form.series_id" placeholder="选择系列" style="width: 100%;">
            <el-option v-for="s in filteredSeries" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="款号">
          <el-input v-model="form.sku" placeholder="如 AS-ANT-2401" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-input v-model="form.color_name" placeholder="如 Nero / Bianco" />
        </el-form-item>
        <el-form-item label="材质">
          <el-input v-model="form.material" placeholder="如 Mesh + Suede" />
        </el-form-item>
        <el-form-item label="尺码">
          <el-input v-model="form.size_range" placeholder="如 39-45" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="uploadVisible" :title="`上传图片 — ${uploadProduct?.sku}`" width="560px">
      <el-upload
        drag
        multiple
        :auto-upload="false"
        :file-list="fileList"
        accept="image/jpeg,image/png,image/webp"
        :on-change="onFileChange"
        list-type="picture"
      >
        <div class="upload-area">
          <div class="upload-icon">↑</div>
          <div>拖拽图片到此处，或点击选择文件</div>
          <div class="upload-hint">支持 JPG / PNG / WebP，单文件最大 20MB</div>
        </div>
      </el-upload>
      <template #footer>
        <el-button @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" @click="handleUpload" :loading="uploading" :disabled="fileList.length === 0">
          上传 {{ fileList.length }} 张
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getProducts, createProduct, updateProduct, deleteProduct } from '../../api/products';
import { getSeasons } from '../../api/seasons';
import { getSeries } from '../../api/series';
import { getUploadToken, registerImage } from '../../api/images';
import COS from 'cos-js-sdk-v5';

const products = ref([]);
const seasons = ref([]);
const seriesList = ref([]);
const loading = ref(false);
const page = ref(1);
const total = ref(0);
const filterSeason = ref(null);
const filterKeyword = ref('');

const dialogVisible = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = ref({ season_id: null, category: null, series_id: null, sku: '', color_name: '', material: '', size_range: '' });

const uploadVisible = ref(false);
const uploadProduct = ref(null);
const fileList = ref([]);
const uploading = ref(false);

const filteredSeries = computed(() => {
  return seriesList.value.filter(s =>
    (!form.value.season_id || s.season_id === form.value.season_id) &&
    (!form.value.category || s.category === form.value.category)
  );
});

async function fetchList(p = 1) {
  loading.value = true;
  page.value = p;
  try {
    const params = { page: p, limit: 20 };
    if (filterSeason.value) {
      const season = seasons.value.find(s => s.id === filterSeason.value);
      if (season) { params.year = season.year; params.season = season.season; }
    }
    if (filterKeyword.value) params.keyword = filterKeyword.value;

    const res = await getProducts(params);
    products.value = res.data;
    total.value = res.pagination.total;
  } finally {
    loading.value = false;
  }
}

async function fetchSeasons() {
  seasons.value = await getSeasons();
}

async function fetchSeries() {
  seriesList.value = await getSeries({});
}

function openDialog(row = null) {
  if (row) {
    editingId.value = row.id;
    form.value = { series_id: row.series_id, sku: row.sku, color_name: row.color_name, material: row.material, size_range: row.size_range, season_id: null, category: null };
  } else {
    editingId.value = null;
    form.value = { season_id: null, category: null, series_id: null, sku: '', color_name: '', material: '', size_range: '' };
  }
  dialogVisible.value = true;
}

async function handleSave() {
  saving.value = true;
  try {
    const data = { series_id: form.value.series_id, sku: form.value.sku, color_name: form.value.color_name, material: form.value.material, size_range: form.value.size_range };
    if (editingId.value) {
      await updateProduct(editingId.value, data);
      ElMessage.success('更新成功');
    } else {
      await createProduct(data);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    fetchList(page.value);
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确定删除 ${row.sku}？该操作不可撤销。`, '确认删除', { type: 'warning' });
  await deleteProduct(row.id);
  ElMessage.success('删除成功');
  fetchList(page.value);
}

function openUpload(row) {
  uploadProduct.value = row;
  fileList.value = [];
  uploadVisible.value = true;
}

function onFileChange(file, files) {
  fileList.value = files;
}

async function handleUpload() {
  uploading.value = true;
  try {
    const product = uploadProduct.value;
    const prefix = `products/${product.sku}/`;
    const cred = await getUploadToken(prefix);

    const cos = new COS({
      getAuthorization: (options, callback) => {
        callback({
          TmpSecretId: cred.credentials.tmpSecretId,
          TmpSecretKey: cred.credentials.tmpSecretKey,
          SecurityToken: cred.credentials.sessionToken,
          StartTime: cred.startTime,
          ExpiredTime: cred.expiredTime,
        });
      },
    });

    for (const file of fileList.value) {
      const ext = file.name.split('.').pop();
      const key = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await new Promise((resolve, reject) => {
        cos.putObject({
          Bucket: cred.bucket,
          Region: cred.region,
          Key: key,
          Body: file.raw,
        }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      await registerImage({
        product_id: product.id,
        cos_key: key,
        file_size: file.raw.size,
      });
    }

    ElMessage.success(`${fileList.value.length} 张图片上传成功`);
    uploadVisible.value = false;
    fetchList(page.value);
  } catch (err) {
    ElMessage.error('上传失败: ' + (err.message || '未知错误'));
  } finally {
    uploading.value = false;
  }
}

function onSeasonChange() { form.value.series_id = null; }
function onCategoryChange() { form.value.series_id = null; }

let debounceTimer = null;
function debouncedFetch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => fetchList(1), 300);
}

onMounted(() => {
  fetchList();
  fetchSeasons();
  fetchSeries();
});
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

.admin-filter {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.admin-pagination {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.upload-area {
  padding: 20px;
  text-align: center;
  color: var(--color-text-tertiary);
}

.upload-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.upload-hint {
  font-size: 12px;
  margin-top: 4px;
  color: var(--color-text-tertiary);
}
</style>
