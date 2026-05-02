<script setup>
import EmojiPickerButton from './EmojiPickerButton.vue';

defineProps({
  food: { type: Object, required: true },
  // showSource / isFavorite / isRecent are accepted for backward compatibility
  // with existing call sites, but tags have been removed entirely from the
  // row UI. The flags are no longer rendered.
  showSource: { type: Boolean, default: false },
  editableEmoji: { type: Boolean, default: false },
  isFavorite: { type: Boolean, default: false },
  isRecent: { type: Boolean, default: false },
});

defineEmits(['select', 'favorite', 'unfavorite', 'update-emoji']);
</script>

<template>
  <div class="food-row" @click="$emit('select', food)">
    <div v-if="editableEmoji" class="row-emoji-slot" @click.stop>
      <EmojiPickerButton
        :model-value="food.emoji || ''"
        size="lg"
        borderless
        @update:model-value="$emit('update-emoji', food, $event)"
      />
    </div>
    <span v-else-if="food.emoji" class="row-emoji">{{ food.emoji }}</span>
    <div class="food-info">
      <span class="food-name">
        <span v-if="food.brand && food.source !== 'meal'">{{ food.brand }}&nbsp;</span>{{ food.name }}<span v-if="food.source === 'meal' && food.itemCount != null" class="meal-count"> ({{ food.itemCount }} item{{ food.itemCount === 1 ? '' : 's' }})</span>
      </span>
      <span class="food-meta">
        <template v-if="food.servingSize">{{ food.servingSize }}</template>
        <template v-else-if="food.servingAmount && food.servingUnit">{{ Math.round(food.servingAmount) }}{{ food.servingUnit }}</template>
        <template v-else>—</template>
        <span v-if="food.servingKnown === false" class="serving-warn" title="No serving size — set portion before logging">⚠</span>
      </span>
    </div>
    <div class="food-macros">
      <span class="macro cal">{{ Math.round(food.perServing?.calories || 0) }} kcal</span>
      <span class="macro macro-p">{{ Math.round(food.perServing?.protein || 0) }}p</span>
      <span class="macro macro-f">{{ Math.round(food.perServing?.fat || 0) }}f</span>
      <span class="macro macro-c">{{ Math.round(food.perServing?.carbs || 0) }}c</span>
    </div>
    <button class="row-add-btn" type="button" aria-label="Add" @click.stop="$emit('select', food)">+</button>
    <slot name="actions" />
  </div>
</template>

<style scoped>
.food-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  border-radius: var(--radius-small);
  margin: 0 calc(var(--space-3) * -1);
  transition: background var(--transition-fast);
}
.food-row:hover { background: var(--bg); }
.row-emoji {
  font-size: 1.85rem;
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
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-s);
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meal-count {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-weight: var(--font-weight-light);
  margin-left: var(--space-1);
}
.food-meta {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.serving-warn {
  margin-left: var(--space-1);
  color: var(--warning, #c87a00);
  font-size: 0.85em;
}
.food-macros {
  display: flex;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.macro.cal { font-weight: var(--font-weight-bold); color: var(--text); }
.macro.macro-p { color: var(--color-protein); }
.macro.macro-f { color: var(--color-fat); }
.macro.macro-c { color: var(--color-carbs); }
.row-add-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--primary);
  font-size: 2rem;
  font-weight: var(--font-weight-bold);
  line-height: 1;
  cursor: pointer;
  transition: color var(--transition-fast);
}
.row-add-btn:hover { color: var(--primary-strong, var(--primary)); }
</style>
