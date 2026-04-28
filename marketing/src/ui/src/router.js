import { createRouter, createWebHistory } from 'vue-router';
import HomePage from './pages/HomePage.vue';
import PlaceholderPage from './pages/PlaceholderPage.vue';
import PromptsPage from './pages/PromptsPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import ContactsPage from './pages/ContactsPage.vue';
import ContactDetailPage from './pages/ContactDetailPage.vue';
import ListsPage from './pages/ListsPage.vue';
import ListDetailPage from './pages/ListDetailPage.vue';
import SubredditsPage from './pages/SubredditsPage.vue';
import SubredditDetailPage from './pages/SubredditDetailPage.vue';
import FeedPage from './pages/FeedPage.vue';
import OpportunityDetailPage from './pages/OpportunityDetailPage.vue';

// Routes are relative to the suite's basePath (e.g. /admin/marketing).
// We use webHistory rooted at that basePath so vue-router URLs match
// what the server actually serves.
const base =
  (typeof window !== 'undefined' && window.__MARKETING_BASE__) || '/admin/marketing';

export const router = createRouter({
  history: createWebHistory(base),
  routes: [
    { path: '/', component: HomePage, name: 'home' },
    { path: '/contacts', component: ContactsPage, name: 'contacts' },
    { path: '/contacts/:id', component: ContactDetailPage, name: 'contact-detail' },
    { path: '/contact-lists', component: ListsPage, name: 'lists' },
    { path: '/contact-lists/:id', component: ListDetailPage, name: 'list-detail' },
    { path: '/reddit-engagement/feed', component: FeedPage, name: 'reddit-feed' },
    { path: '/reddit-engagement/opportunities/:id', component: OpportunityDetailPage, name: 'opportunity-detail' },
    { path: '/reddit-engagement/subreddits', component: SubredditsPage, name: 'subreddits' },
    { path: '/reddit-engagement/subreddits/:id', component: SubredditDetailPage, name: 'subreddit-detail' },
    { path: '/usage', component: () => import('./pages/UsagePage.vue'), name: 'usage' },
    { path: '/settings/prompts', component: PromptsPage, name: 'prompts' },
    { path: '/settings', component: SettingsPage, name: 'settings' },
  ],
});
