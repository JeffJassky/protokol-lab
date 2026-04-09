<script setup>
import MacroBar from './MacroBar.vue';

defineProps({
  summary: { type: Object, required: true },
});
</script>

<template>
  <div v-if="summary" class="daily-summary">
    <MacroBar label="Calories" :current="summary.totalCalories" :target="summary.targets?.calories || 0" color="#4f46e5" unit=" kcal" />
    <MacroBar label="Protein" :current="summary.totalProtein" :target="summary.targets?.proteinGrams || 0" color="#16a34a" unit="g" />
    <MacroBar label="Fat" :current="summary.totalFat" :target="summary.targets?.fatGrams || 0" color="#f59e0b" unit="g" />
    <MacroBar label="Carbs" :current="summary.totalCarbs" :target="summary.targets?.carbsGrams || 0" color="#ef4444" unit="g" />
  </div>
</template>

<style scoped>
.daily-summary {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.85rem 1rem;
}
</style>
