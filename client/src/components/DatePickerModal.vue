<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, required: true },
  title: { type: String, default: 'Select dates' },
  confirmLabel: { type: String, default: 'Confirm' },
  initialMonth: { type: String, default: null }, // 'YYYY-MM'
});

const emit = defineEmits(['confirm', 'close']);

// Today at midnight in local time, used to seed the initial view.
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYM(ymString) {
  const [y, m] = ymString.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

// Current month being displayed.
const viewDate = ref(props.initialMonth ? parseYM(props.initialMonth) : new Date(today().getFullYear(), today().getMonth(), 1));
// Set of YYYY-MM-DD strings that are selected.
const selected = ref(new Set());
// Last-clicked date used as the anchor for shift-click range selection.
const anchor = ref(null);

// Reset whenever the modal is (re)opened so stale selections don't leak.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      selected.value = new Set();
      anchor.value = null;
      viewDate.value = props.initialMonth
        ? parseYM(props.initialMonth)
        : new Date(today().getFullYear(), today().getMonth(), 1);
    }
  },
);

const monthLabel = computed(() =>
  viewDate.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
);

// Build a 6x7 grid of Date objects for the current month, padding with
// previous/next month days so rows are always full weeks. Weeks start Sunday.
const calendarCells = computed(() => {
  const firstOfMonth = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth(), 1);
  const startDayOfWeek = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - startDayOfWeek);

  const cells = [];
  const cursor = new Date(gridStart);
  for (let i = 0; i < 42; i += 1) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
});

function isCurrentMonth(d) {
  return d.getMonth() === viewDate.value.getMonth();
}
function isSelected(d) {
  return selected.value.has(formatYMD(d));
}
function isToday(d) {
  const t = today();
  return d.getTime() === t.getTime();
}

function prevMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() - 1, 1);
}
function nextMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + 1, 1);
}

function toggleDate(d, event) {
  const ymd = formatYMD(d);
  const next = new Set(selected.value);

  if (event.shiftKey && anchor.value) {
    // Range select from anchor to clicked date (inclusive, regardless of order).
    const a = new Date(anchor.value);
    const b = new Date(d);
    const start = a < b ? a : b;
    const end = a < b ? b : a;
    const cursor = new Date(start);
    while (cursor <= end) {
      next.add(formatYMD(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (next.has(ymd)) {
    next.delete(ymd);
  } else {
    next.add(ymd);
    anchor.value = new Date(d);
  }

  selected.value = next;
}

function clearAll() {
  selected.value = new Set();
  anchor.value = null;
}

function handleConfirm() {
  const sorted = [...selected.value].sort();
  emit('confirm', sorted);
}

const selectedCount = computed(() => selected.value.size);
const weekdayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="hint">
        Click to toggle. Shift+click a second date to select a range.
      </div>

      <div class="calendar-nav">
        <button class="nav-btn" @click="prevMonth">‹</button>
        <span class="month-label">{{ monthLabel }}</span>
        <button class="nav-btn" @click="nextMonth">›</button>
      </div>

      <div class="calendar-grid">
        <div v-for="wd in weekdayHeaders" :key="wd" class="weekday">{{ wd }}</div>
        <button
          v-for="(d, i) in calendarCells"
          :key="i"
          type="button"
          class="day-cell"
          :class="{
            'other-month': !isCurrentMonth(d),
            today: isToday(d),
            selected: isSelected(d),
          }"
          @click="toggleDate(d, $event)"
        >
          {{ d.getDate() }}
        </button>
      </div>

      <div class="modal-footer">
        <span class="count">{{ selectedCount }} date{{ selectedCount === 1 ? '' : 's' }} selected</span>
        <div class="footer-actions">
          <button v-if="selectedCount" class="btn-text" @click="clearAll">Clear</button>
          <button class="btn-secondary" @click="emit('close')">Cancel</button>
          <button class="btn-primary" :disabled="!selectedCount" @click="handleConfirm">
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-4);
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-large);
  padding: var(--space-5);
  width: 100%;
  max-width: 360px;
  box-shadow: var(--shadow-l);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-1);
}
.modal-header h3 { margin: 0; font-size: var(--font-size-m); }
.close-btn {
  background: none;
  border: none;
  font-size: var(--font-size-m);
  cursor: pointer;
  color: var(--text-secondary);
  padding: var(--space-1);
  border-radius: var(--radius-small);
}
.close-btn:hover { background: var(--bg); color: var(--text); }

.hint {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-bottom: var(--space-3);
}

.calendar-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
.nav-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  width: 28px;
  height: 28px;
  cursor: pointer;
  color: var(--text);
  font-size: var(--font-size-m);
  line-height: 1;
}
.nav-btn:hover { background: var(--bg); }
.month-label { font-weight: var(--font-weight-bold); font-size: var(--font-size-s); }

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.weekday {
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  padding: var(--space-1) 0;
}
.day-cell {
  background: var(--bg);
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  padding: var(--space-2) 0;
  cursor: pointer;
  font-size: var(--font-size-s);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  transition: background var(--transition-fast);
}
.day-cell:hover { background: var(--border); }
.day-cell.other-month { color: var(--text-disabled); background: transparent; }
.day-cell.today { border-color: var(--primary); font-weight: var(--font-weight-bold); }
.day-cell.selected {
  background: var(--primary);
  color: var(--text-on-primary);
  border-color: var(--primary);
}
.day-cell.selected.today { box-shadow: 0 0 0 2px var(--primary-ring); }

.modal-footer {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.count { font-size: var(--font-size-xs); color: var(--text-secondary); }
.footer-actions { display: flex; gap: var(--space-1); align-items: center; }
</style>
