import { z } from 'zod';
import RssParser from 'rss-parser';

const parser = new RssParser({
  timeout: 15_000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; marketing-admin/0.1)' },
});

export const rssFeedTool = {
  name: 'rss_fetch',
  description:
    'Fetch an RSS/Atom feed (podcasts, Substack, blogs) and return the most recent items. Use to find recent content from a creator.',
  schemaZod: {
    url: z.string().describe('Feed URL'),
    limit: z.number().optional().describe('Max items to return (default 10, max 25)'),
  },
  async execute({ url, limit = 10 }) {
    try {
      const feed = await parser.parseURL(url);
      const items = (feed.items || []).slice(0, Math.min(limit, 25)).map((it) => ({
        title: it.title,
        link: it.link,
        pubDate: it.pubDate || it.isoDate,
        contentSnippet: it.contentSnippet?.slice(0, 500),
        creator: it.creator || it['dc:creator'],
      }));
      return {
        title: feed.title,
        description: feed.description,
        link: feed.link,
        itemCount: items.length,
        items,
      };
    } catch (err) {
      return { error: err.message, url };
    }
  },
};
