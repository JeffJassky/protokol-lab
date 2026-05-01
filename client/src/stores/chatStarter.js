// Cross-component lever for "open the chat drawer with this question already
// teed up." Used by Insights → Explain so a user can go from a finding card
// straight into a conversation about it.
//
// Flow: any component calls `chatStarter.start(prompt)` → `isOpen` flips
// true (AppLayout opens the drawer) → `pendingPrompt` is set →
// ChatDrawer reads it on the next mount/watcher tick and sends it as the
// first message in a fresh thread, then calls `consumePrompt()` so the
// same string isn't sent again on subsequent opens.
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useChatStarterStore = defineStore('chatStarter', () => {
  const isOpen = ref(false);
  const pendingPrompt = ref('');

  function start(prompt) {
    pendingPrompt.value = String(prompt || '').trim();
    isOpen.value = true;
  }

  function consumePrompt() {
    const p = pendingPrompt.value;
    pendingPrompt.value = '';
    return p;
  }

  function close() {
    isOpen.value = false;
  }

  return { isOpen, pendingPrompt, start, consumePrompt, close };
});
