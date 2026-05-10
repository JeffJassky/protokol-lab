import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import BrandWordmark from './BrandWordmark.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  // Override the nav-bar title with the app's actual wordmark. The
  // before-slot lands inside the existing anchor → home, so the
  // wordmark inherits the home link without us re-wrapping.
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'nav-bar-title-before': () => h(BrandWordmark),
    }),
};
