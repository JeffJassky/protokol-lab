<script setup>
// Marketing admin is a separate Vue + Express subtree mounted at
// /admin/marketing on the same origin (server/src/app.js). Same cookies, same
// auth chain — iframe sandbox isn't needed and would block scripts.
</script>

<template>
  <div class="embed-frame">
    <iframe
      src="/admin/marketing/"
      title="Marketing admin"
      class="embed"
    ></iframe>
  </div>
</template>

<style scoped>
.embed-frame {
  flex: 1;
  display: flex;
  width: 100%;
  height: 100%;
}
.embed {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: var(--bg);
}
</style>
