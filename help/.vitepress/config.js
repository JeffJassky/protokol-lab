import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Protokol Lab Help',
  description: 'How to use Protokol Lab — tracking, science, settings, and account.',
  cleanUrls: true,
  lastUpdated: true,

  // Auto-generates sitemap.xml at build time. Submitted to Google Search
  // Console; referenced from robots.txt and llms.txt.
  sitemap: {
    hostname: 'https://help.protokollab.com',
  },

  head: [
    ['meta', { name: 'theme-color', content: '#0f172a' }],
    ['meta', { name: 'robots', content: 'index,follow' }],
  ],

  themeConfig: {
    // BrandWordmark component renders the title via the nav-bar-title-before
    // slot in theme/index.js. Hide the default text title to avoid duplication.
    siteTitle: false,

    nav: [
      {
        text: 'Getting started',
        items: [
          { text: 'Welcome', link: '/getting-started/' },
          { text: 'Your first week', link: '/getting-started/first-week' },
          { text: 'Install the app', link: '/getting-started/install' },
          { text: 'Migrating from MyFitnessPal', link: '/getting-started/migrate-myfitnesspal' },
        ],
      },
      {
        text: 'Tracking',
        items: [
          { text: 'Food & meals', link: '/tracking/log-a-meal' },
          { text: 'Compounds & doses', link: '/tracking/log-a-dose' },
          { text: 'Body measurements', link: '/tracking/log-a-weigh-in' },
          { text: 'Symptoms', link: '/tracking/log-a-symptom' },
          { text: 'Exercise', link: '/tracking/exercise' },
          { text: 'More…', link: '/tracking/' },
        ],
      },
      {
        text: 'Understanding your data',
        items: [
          { text: 'How half-life curves work', link: '/understanding/half-life' },
          { text: 'Endogenous biomarker simulation', link: '/understanding/endogenous-simulation' },
          { text: 'Rolling 7-day budget', link: '/understanding/rolling-7-day' },
          { text: 'Pattern insights', link: '/understanding/pattern-insights' },
          { text: 'Trend line & ETA', link: '/understanding/trend-and-eta' },
          { text: 'More…', link: '/understanding/' },
        ],
      },
      {
        text: 'AI assistant',
        items: [
          { text: 'What it can do', link: '/ai/capabilities' },
          { text: 'Tool calls explained', link: '/ai/tool-calls' },
          { text: 'Privacy & what AI sees', link: '/ai/privacy' },
          { text: 'Limits & context', link: '/ai/limits' },
        ],
      },
      {
        text: 'Account',
        items: [
          { text: 'Plans & billing', link: '/account/plans' },
          { text: 'Export your data', link: '/account/export' },
          { text: 'Delete your account', link: '/account/delete' },
          { text: 'Sign in & sign up', link: '/account/sign-in' },
          { text: 'Security & data handling', link: '/account/security' },
        ],
      },
      {
        text: 'Support',
        items: [
          { text: 'Submit a ticket', link: 'https://protokollab.com/support' },
          { text: 'Suggest a feature', link: 'https://protokollab.com/support?tab=features' },
        ],
      },
      { text: 'App', link: 'https://protokollab.com', target: '_blank' },
    ],

    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Welcome', link: '/getting-started/' },
            { text: 'Your first week', link: '/getting-started/first-week' },
            { text: 'Install the app', link: '/getting-started/install' },
            { text: 'Migrating from MyFitnessPal', link: '/getting-started/migrate-myfitnesspal' },
          ],
        },
      ],

      '/tracking/': [
        {
          text: 'Tracking',
          items: [
            { text: 'Overview', link: '/tracking/' },
          ],
        },
        {
          text: 'Food & meals',
          items: [
            { text: 'Log a meal', link: '/tracking/log-a-meal' },
            { text: 'Saved meals', link: '/tracking/saved-meals' },
            { text: 'Custom foods', link: '/tracking/custom-foods' },
            { text: 'Where food data comes from', link: '/tracking/food-data-sources' },
          ],
        },
        {
          text: 'Compounds & doses',
          items: [
            { text: 'Log a dose', link: '/tracking/log-a-dose' },
            { text: 'Custom compounds', link: '/tracking/custom-compounds' },
            { text: 'Kinetics shapes', link: '/tracking/kinetics-shapes' },
          ],
        },
        {
          text: 'Body & symptoms',
          items: [
            { text: 'Log a weigh-in', link: '/tracking/log-a-weigh-in' },
            { text: 'Custom measurements', link: '/tracking/custom-measurements' },
            { text: 'Log a symptom', link: '/tracking/log-a-symptom' },
            { text: 'Progress photos', link: '/tracking/photos' },
          ],
        },
        {
          text: 'Daily systems',
          items: [
            { text: 'Water', link: '/tracking/water' },
            { text: 'Fasting', link: '/tracking/fasting' },
            { text: 'Exercise', link: '/tracking/exercise' },
            { text: 'Menstruation', link: '/tracking/cycle' },
            { text: 'Day notes', link: '/tracking/journal' },
          ],
        },
        {
          text: 'Clinical context',
          items: [
            { text: 'Bloodwork', link: '/tracking/bloodwork' },
            { text: 'Genetics', link: '/tracking/genetics' },
            { text: 'Conditions', link: '/tracking/conditions' },
          ],
        },
      ],

      '/understanding/': [
        {
          text: 'Understanding your data',
          items: [
            { text: 'Overview', link: '/understanding/' },
          ],
        },
        {
          text: 'The science',
          items: [
            { text: 'How half-life curves work', link: '/understanding/half-life' },
            { text: 'How stacked doses combine', link: '/understanding/stacked-doses' },
            { text: 'Endogenous biomarker simulation', link: '/understanding/endogenous-simulation' },
          ],
        },
        {
          text: 'The math',
          items: [
            { text: 'Rolling 7-day budget', link: '/understanding/rolling-7-day' },
            { text: 'Tracked vs untracked days', link: '/understanding/honest-streaks' },
            { text: 'Nutrition score', link: '/understanding/nutrition-score' },
            { text: 'Trend line & ETA', link: '/understanding/trend-and-eta' },
            { text: 'Pattern insights', link: '/understanding/pattern-insights' },
          ],
        },
      ],

      '/ai/': [
        {
          text: 'AI assistant',
          items: [
            { text: 'Overview', link: '/ai/' },
            { text: 'What it can do', link: '/ai/capabilities' },
            { text: 'Tool calls explained', link: '/ai/tool-calls' },
            { text: 'Privacy & what AI sees', link: '/ai/privacy' },
            { text: 'Limits & context length', link: '/ai/limits' },
          ],
        },
      ],

      '/account/': [
        {
          text: 'Account',
          items: [
            { text: 'Overview', link: '/account/' },
            { text: 'Sign in & sign up', link: '/account/sign-in' },
            { text: 'Plans & billing', link: '/account/plans' },
            { text: 'Export your data', link: '/account/export' },
            { text: 'Delete your account', link: '/account/delete' },
            { text: 'Security & data handling', link: '/account/security' },
          ],
        },
      ],

      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'Glossary', link: '/reference/glossary' },
            { text: 'Compounds settings', link: '/reference/compounds-settings' },
            { text: 'Tracking settings', link: '/reference/tracking-settings' },
          ],
        },
      ],
    },

    footer: {
      message: 'Help docs for Protokol Lab.',
      copyright: '© Protokol Lab',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/anthropics/protokol-lab/edit/main/help/:path',
      text: 'Edit this page',
    },

    outline: {
      level: [2, 3],
    },
  },
});
