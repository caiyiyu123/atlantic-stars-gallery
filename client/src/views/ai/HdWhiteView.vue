<template>
  <div class="hd-white">
    <div class="admin-header">
      <h2 class="admin-title">高清白底图</h2>
    </div>

    <el-tabs v-model="activeTab" class="hd-tabs">
      <el-tab-pane label="处理图片" name="process">
        <ProcessTab v-if="activeTab === 'process'" />
      </el-tab-pane>
      <el-tab-pane label="历史记录" name="history">
        <HistoryTab v-if="activeTab === 'history'" />
      </el-tab-pane>
      <el-tab-pane v-if="auth.isSuperAdmin" label="Prompt 模板" name="templates">
        <PromptTemplateTab v-if="activeTab === 'templates'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import ProcessTab from './components/ProcessTab.vue';
import HistoryTab from './components/HistoryTab.vue';
import PromptTemplateTab from './components/PromptTemplateTab.vue';

const auth = useAuthStore();
const activeTab = ref('process');
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
.hd-tabs :deep(.el-tabs__item) {
  font-size: 16px;
  font-weight: 500;
}
</style>
