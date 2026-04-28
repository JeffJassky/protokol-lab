import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Protokol Lab Docs',
  description: 'Internal documentation for Protokol Lab.',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Customer Journey', link: '/customer-journey' },
      { text: 'Market Landscape', link: '/market-landscape' },
      {
        text: 'Engineering',
        items: [
          { text: 'Testing', link: '/testing' },
          { text: 'Observability', link: '/observability' },
          { text: 'Funnel Analytics', link: '/funnel-analytics' },
          { text: 'Prerendering', link: '/prerendering' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Product',
        items: [
          { text: 'Customer Journey & CTA Map', link: '/customer-journey' },
        ],
      },
      {
        text: 'Strategy',
        items: [
          { text: 'Market Landscape', link: '/market-landscape' },
        ],
      },
      {
        text: 'Engineering',
        items: [
          { text: 'Testing Strategy', link: '/testing' },
          { text: 'Observability', link: '/observability' },
          { text: 'Funnel Analytics', link: '/funnel-analytics' },
          { text: 'Marketing Prerendering', link: '/prerendering' },
        ],
      },
    ],

    search: { provider: 'local' },

    socialLinks: [],
  },
})
