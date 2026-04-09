<script setup>
defineProps({
  food: { type: Object, required: true },
  showSource: { type: Boolean, default: false },
});

defineEmits(['select', 'favorite', 'unfavorite']);
</script>

<template>
  <div class="food-row" @click="$emit('select', food)">
    <div class="food-info">
      <span class="food-name">{{ food.name }}</span>
      <span v-if="food.brand" class="food-brand">{{ food.brand }}</span>
      <span class="food-meta">
        {{ food.servingSize || `${food.servingGrams}g` }}
        <span v-if="showSource && food.source" class="source-badge" :class="food.source">{{ food.source }}</span>
      </span>
    </div>
    <div class="food-macros">
      <span class="macro cal">{{ food.caloriesPer }} cal</span>
      <span class="macro">P {{ food.proteinPer }}g</span>
      <span class="macro">F {{ food.fatPer }}g</span>
      <span class="macro">C {{ food.carbsPer }}g</span>
    </div>
    <slot name="actions" />
  </div>
</template>

<style scoped>
.food-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  border-radius: 8px;
  margin: 0 -0.75rem;
  transition: background 0.1s;
}
.food-row:hover { background: var(--bg); }
.food-info {
  flex: 1;
  min-width: 0;
}
.food-name {
  display: block;
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.food-brand {
  display: block;
  font-size: 0.78rem;
  color: var(--text-secondary);
}
.food-meta {
  font-size: 0.72rem;
  color: #b0b0b0;
}
.source-badge {
  display: inline-block;
  border-radius: 4px;
  padding: 0.05rem 0.35rem;
  font-size: 0.65rem;
  font-weight: 500;
  margin-left: 0.3rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.source-badge.local {
  background: rgba(79, 70, 229, 0.1);
  color: var(--primary);
}
.source-badge.openfoodfacts {
  background: rgba(22, 163, 74, 0.1);
  color: var(--success);
}
.food-macros {
  display: flex;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
  white-space: nowrap;
}
.macro.cal { font-weight: 600; color: var(--text); }
</style>
