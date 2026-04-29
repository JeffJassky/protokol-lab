<script setup>
// Agendash is mounted server-side at /admin/agendash with the same admin
// auth gate as the rest of /api/admin. Iframed here so the unified admin
// shell still wraps it.
</script>

<template>
  <div class="embed-frame">
    <iframe
      src="/admin/agendash/"
      title="Agenda jobs (Agendash)"
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
