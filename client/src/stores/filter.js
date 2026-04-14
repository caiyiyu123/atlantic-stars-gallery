import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useFilterStore = defineStore('filter', () => {
  const year = ref(null);
  const season = ref(null);
  const category = ref(null);
  const seriesId = ref(null);
  const keyword = ref('');

  function reset() {
    year.value = null;
    season.value = null;
    category.value = null;
    seriesId.value = null;
    keyword.value = '';
  }

  return { year, season, category, seriesId, keyword, reset };
});
