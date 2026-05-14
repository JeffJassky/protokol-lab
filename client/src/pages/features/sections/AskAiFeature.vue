<script setup>
const trail = [
  { icon: '⚙', text: 'Checking your food library',                 kind: 'call'   },
  { icon: '✓', text: 'Not in library yet',                          kind: 'result' },
  { icon: '⚙', text: 'Searching the web',                           kind: 'call'   },
  { icon: '✓', text: 'Found · 560 cal · 40g P · 31g F · 42g C',     kind: 'result' },
  { icon: '⚙', text: 'Saving as a custom food',                     kind: 'call'   },
  { icon: '✓', text: 'Logged to lunch',                             kind: 'result' },
];
</script>

<template>
  <section class="feat-section">
    <div class="wrap">
      <div class="feat-row">
        <div class="feat-text">
          <h2 class="feat-head">
            Tell the AI what you ate. <span class="accent">It does the typing.</span>
          </h2>
          <p class="feat-body">
            Or ask it why you're stalling. It reads your last month and writes
            back — with the actual numbers and a plain-English explanation.
          </p>
          <ul class="feat-bullets">
            <li><span><b>Log meals by chat</b> — "I had a Sweetgreen Kale Caesar" and it's done</span></li>
            <li><span><b>Snap a photo</b> — AI identifies each item and logs them separately</span></li>
            <li><span><b>Ask anything about your data</b> — answers cite the days they came from</span></li>
            <li><span><b>Threads stay separate</b> — keep "nausea this week" apart from "dose plan"</span></li>
          </ul>
        </div>
        <div class="feat-visual">
          <div class="feat-frame" style="padding: 18px">
            <div class="ai-msg ai-msg-user">
              <div class="ai-msg-tag">You</div>
              <div class="ai-msg-body">I just ate a Sweetgreen Kale Caesar at lunch.</div>
            </div>
            <div class="ai-msg ai-msg-ai">
              <div class="ai-msg-tag">Protokol</div>
              <ol class="ai-trail">
                <li v-for="(t, i) in trail" :key="i" class="ai-trail-item" :class="t.kind">
                  <span class="ai-trail-icon">{{ t.icon }}</span>
                  <span class="ai-trail-text">{{ t.text }}</span>
                </li>
              </ol>
              <div class="ai-msg-body">
                Logged. You're at <b>1,240 cal</b> for the day, 340 to go.
                Protein's at 92g — another shake before bed gets you to 180.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-msg {
  padding: 12px 14px; margin-bottom: 10px;
  border-left: 2px solid var(--text-tertiary);
  background: var(--bg);
}
.ai-msg:last-child { margin-bottom: 0; }
.ai-msg-ai { border-left-color: var(--primary); background: color-mix(in srgb, var(--primary) 4%, transparent); }
.ai-msg-tag {
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--text-tertiary); margin-bottom: 6px;
}
.ai-msg-ai .ai-msg-tag { color: var(--primary); }
.ai-msg-body { font-size: 13px; color: var(--text); line-height: 1.5; }
.ai-msg-body b { color: var(--text); }

.ai-trail {
  list-style: none; margin: 0 0 10px; padding: 8px 10px;
  border: 1px solid var(--border); background: var(--surface-alt);
}
.ai-trail-item {
  display: flex; gap: 8px; align-items: baseline;
  padding: 3px 0; font-family: var(--font-mono); font-size: 11px;
  color: var(--text-secondary);
}
.ai-trail-icon { width: 12px; flex-shrink: 0; color: var(--primary); }
.ai-trail-item.call .ai-trail-text { color: var(--text); }
</style>
