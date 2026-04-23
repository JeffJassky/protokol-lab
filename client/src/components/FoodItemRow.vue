<script setup>
import { computed } from 'vue';
import EmojiPickerButton from './EmojiPickerButton.vue';

const props = defineProps({
  food: { type: Object, required: true },
  showSource: { type: Boolean, default: false },
  editableEmoji: { type: Boolean, default: false },
  isFavorite: { type: Boolean, default: false },
  isRecent: { type: Boolean, default: false },
});

defineEmits(['select', 'favorite', 'unfavorite', 'update-emoji']);

// One pill per row. Priority: MEAL > FAV > RECENT > source (local/openfoodfacts).
const tag = computed(() => {
  if (props.food.source === 'meal') return { label: 'MEAL',   kind: 'meal'   };
  if (props.isFavorite)              return { label: 'FAV',    kind: 'fav'    };
  if (props.isRecent)                return { label: 'RECENT', kind: 'recent' };
  if (props.showSource && props.food.source) {
    return { label: props.food.source.toUpperCase(), kind: props.food.source };
  }
  return null;
});
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
        {{ food.servingSize || `${food.servingGrams}g` }}
      </span>
    </div>
    <div class="food-macros">
      <span class="macro cal">{{ food.caloriesPer }} kcal</span>
      <span class="macro macro-p">{{ food.proteinPer }}p</span>
      <span class="macro macro-f">{{ food.fatPer }}f</span>
      <span class="macro macro-c">{{ food.carbsPer }}c</span>
    </div>
    <span v-if="tag" class="row-tag" :class="`kind-${tag.kind}`">{{ tag.label }}</span>
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
/* Unified pill for MEAL / FAV / RECENT / LOCAL / OPENFOODFACTS tags.
   Bordered-uppercase style lifted from the marketing food row so a single
   visual language covers every "why am I seeing this food" state. */
.row-tag {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  padding: 0.1rem 0.4rem;
  border: 1px solid currentColor;
  border-radius: var(--radius-small);
  line-height: 1.2;
  color: var(--text-tertiary);
}
.row-tag.kind-meal,
.row-tag.kind-fav,
.row-tag.kind-recent,
.row-tag.kind-local,
.row-tag.kind-openfoodfacts { color: var(--text-tertiary); opacity: 0.7; }
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
