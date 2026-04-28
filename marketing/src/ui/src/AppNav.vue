<script setup>
const sections = [
  {
    title: 'Influencers',
    icon: '🧑',
    links: [
      { to: '/contacts', label: 'Contacts' },
      { to: '/contact-lists', label: 'Lists' },
    ],
  },
  {
    title: 'Reddit Engagement',
    icon: '💬',
    links: [
      { to: '/reddit-engagement/feed', label: 'Feed' },
      { to: '/reddit-engagement/subreddits', label: 'Subreddits' },
    ],
  },
  {
    title: 'Suite',
    icon: '⚙️',
    links: [
      { to: '/usage', label: 'Usage' },
      { to: '/settings/prompts', label: 'Prompts' },
      { to: '/settings', label: 'Settings' },
    ],
  },
];
</script>

<template>
  <nav class="sidebar">
    <div class="sidebar-brand">
      <router-link to="/" class="nav-link" style="border:none;padding:0;font-size:13px;font-weight:600">
        marketing-admin
      </router-link>
    </div>
    <template v-for="section in sections" :key="section.title">
      <div class="nav-section">{{ section.icon }} {{ section.title }}</div>
      <router-link
        v-for="link in section.links"
        :key="link.to"
        :to="link.to"
        class="nav-link"
      >
        {{ link.label }}
      </router-link>
    </template>
  </nav>
</template>
