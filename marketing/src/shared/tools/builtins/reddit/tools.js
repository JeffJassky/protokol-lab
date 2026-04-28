import { z } from 'zod';

// Reddit tools backed by the OAuth client. Each tool returns a
// flattened, model-friendly representation — Reddit's full responses
// are too noisy for an agent to reason about efficiently.

export function buildRedditTools({ client, logger }) {
  if (!client) return [];

  const userHistory = {
    name: 'reddit_user_history',
    description:
      "Fetch a Reddit user's recent comments. Use to understand someone's voice, repeated themes, and the subreddits they frequent.",
    schemaZod: {
      username: z.string().describe('Reddit username, with or without "u/" prefix.'),
      limit: z.number().optional().describe('Max comments (default 25, max 50)'),
    },
    async execute({ username, limit = 25 }) {
      const u = String(username).replace(/^u\//, '').replace(/^[@/]/, '');
      try {
        const data = await client.api(`/user/${encodeURIComponent(u)}/comments`, {
          limit: Math.min(limit, 50),
          sort: 'top',
          t: 'year',
        });
        const comments = (data?.data?.children || []).map((c) => ({
          id: c.data.id,
          subreddit: c.data.subreddit,
          score: c.data.score,
          body: (c.data.body || '').slice(0, 800),
          permalink: `https://reddit.com${c.data.permalink}`,
          createdAt: new Date((c.data.created_utc || 0) * 1000).toISOString(),
          link_title: c.data.link_title,
        }));
        return { username: u, count: comments.length, comments };
      } catch (err) {
        return { error: err.message, username: u };
      }
    },
  };

  const subSearch = {
    name: 'reddit_search',
    description:
      'Search Reddit for posts matching a keyword query. Optionally restricted to a subreddit. Returns top matching posts.',
    schemaZod: {
      query: z.string().describe('Keyword query.'),
      subreddit: z.string().optional().describe('Optional subreddit name (no r/ prefix).'),
      sort: z.string().optional().describe('"relevance" (default) | "top" | "new"'),
      time: z.string().optional().describe('Time window: hour|day|week|month|year|all'),
      limit: z.number().optional().describe('Max results (default 15, max 25)'),
    },
    async execute({ query, subreddit, sort = 'relevance', time = 'year', limit = 15 }) {
      try {
        // Use site-wide /search with `subreddit:NAME` modifier rather than
        // /r/X/search?restrict_sr — the latter silently returns no results
        // when running unauthenticated against the public-JSON endpoint.
        const q = subreddit ? `${query} subreddit:${subreddit}` : query;
        const data = await client.api('/search', {
          q,
          sort,
          t: time,
          limit: Math.min(limit, 25),
        });
        const posts = (data?.data?.children || []).map((p) => ({
          id: p.data.id,
          title: p.data.title,
          subreddit: p.data.subreddit,
          author: p.data.author,
          score: p.data.score,
          numComments: p.data.num_comments,
          permalink: `https://reddit.com${p.data.permalink}`,
          url: p.data.url,
          createdAt: new Date((p.data.created_utc || 0) * 1000).toISOString(),
          selftextExcerpt: (p.data.selftext || '').slice(0, 500),
        }));
        return { query, count: posts.length, posts };
      } catch (err) {
        return { error: err.message, query };
      }
    },
  };

  const subFeed = {
    name: 'reddit_subreddit_feed',
    description:
      "Fetch a subreddit's recent posts. Used by the engagement scanner and ad-hoc by research agents.",
    schemaZod: {
      subreddit: z.string().describe('Subreddit name (no r/ prefix).'),
      sort: z.string().optional().describe('new (default) | hot | top'),
      limit: z.number().optional().describe('Max posts (default 25, max 100)'),
    },
    async execute({ subreddit, sort = 'new', limit = 25 }) {
      try {
        const data = await client.api(`/r/${encodeURIComponent(subreddit)}/${sort}`, {
          limit: Math.min(limit, 100),
        });
        const posts = (data?.data?.children || []).map((p) => ({
          id: p.data.id,
          title: p.data.title,
          author: p.data.author,
          score: p.data.score,
          numComments: p.data.num_comments,
          permalink: `https://reddit.com${p.data.permalink}`,
          url: p.data.url,
          createdAt: new Date((p.data.created_utc || 0) * 1000).toISOString(),
          selftextExcerpt: (p.data.selftext || '').slice(0, 800),
        }));
        return { subreddit, count: posts.length, posts };
      } catch (err) {
        return { error: err.message, subreddit };
      }
    },
  };

  const commentTree = {
    name: 'reddit_comment_tree',
    description:
      'Fetch a Reddit post and its top-level comment tree. Use when triaging an engagement opportunity to see what has already been said.',
    schemaZod: {
      subreddit: z.string(),
      postId: z.string().describe('Reddit post id (e.g. "1abcde2", with or without t3_ prefix).'),
      depth: z.number().optional().describe('Comment depth to fetch (default 2)'),
    },
    async execute({ subreddit, postId, depth = 2 }) {
      try {
        const id = String(postId).replace(/^t3_/, '');
        const data = await client.api(`/r/${encodeURIComponent(subreddit)}/comments/${id}`, {
          depth,
          limit: 50,
        });
        const post = data?.[0]?.data?.children?.[0]?.data;
        const comments = (data?.[1]?.data?.children || [])
          .filter((c) => c.kind === 't1')
          .slice(0, 30)
          .map((c) => ({
            id: c.data.id,
            author: c.data.author,
            score: c.data.score,
            body: (c.data.body || '').slice(0, 600),
            createdAt: new Date((c.data.created_utc || 0) * 1000).toISOString(),
            replies: (c.data.replies?.data?.children || [])
              .filter((r) => r.kind === 't1')
              .slice(0, 5)
              .map((r) => ({
                author: r.data.author,
                score: r.data.score,
                body: (r.data.body || '').slice(0, 300),
              })),
          }));
        return {
          post: post
            ? {
                title: post.title,
                author: post.author,
                score: post.score,
                selftext: (post.selftext || '').slice(0, 1500),
              }
            : null,
          commentCount: comments.length,
          comments,
        };
      } catch (err) {
        return { error: err.message, subreddit, postId };
      }
    },
  };

  return [userHistory, subSearch, subFeed, commentTree];
}
