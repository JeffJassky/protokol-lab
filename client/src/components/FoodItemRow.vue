<script setup>
import EmojiPickerButton from './EmojiPickerButton.vue';

defineProps({
  food: { type: Object, required: true },
  showSource: { type: Boolean, default: false },
  editableEmoji: { type: Boolean, default: false },
});

defineEmits(['select', 'favorite', 'unfavorite', 'update-emoji']);
</script>

<template>
  <div class="food-row" @click="$emit('select', food)">
    <div v-if="editableEmoji" class="row-emoji-slot" @click.stop>
      <EmojiPickerButton
        :model-value="food.emoji || ''"
        size="sm"
        @update:model-value="$emit('update-emoji', food, $event)"
      />
    </div>
    <span v-else-if="food.emoji" class="row-emoji">{{ food.emoji }}</span>
    <div class="food-info">
      <span class="food-name">
        <span v-if="food.source === 'meal'" class="meal-tag">[MEAL]</span>
        {{ food.name }}
        <span v-if="food.source === 'meal' && food.itemCount != null" class="meal-count">
          ({{ food.itemCount }} item{{ food.itemCount === 1 ? '' : 's' }})
        </span>
      </span>
      <span v-if="food.brand && food.source !== 'meal'" class="food-brand">{{ food.brand }}</span>
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
.row-emoji {
  font-size: 1.25rem;
  line-height: 1;
  flex-shrink: 0;
}
.row-emoji-slot { flex-shrink: 0; display: flex; align-items: center; }
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
.meal-tag {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.05em;
  color: var(--palette-blue-600);
  background: rgba(37, 99, 235, 0.12);
  border-radius: 3px;
  padding: 0.05rem 0.35rem;
  margin-right: 0.3rem;
  vertical-align: 2px;
}
.meal-count {
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-weight: 400;
  margin-left: 0.2rem;
}
.food-brand {
  display: block;
  font-size: 0.78rem;
  color: var(--text-secondary);
}
.food-meta {
  font-size: 0.72rem;
  color: var(--text-tertiary);
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
  background: var(--primary-soft);
  color: var(--primary);
}
.source-badge.openfoodfacts {
  background: rgba(22, 163, 74, 0.12);
  color: var(--success);
}
.source-badge.meal {
  background: rgba(37, 99, 235, 0.12);
  color: var(--palette-blue-600);
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
