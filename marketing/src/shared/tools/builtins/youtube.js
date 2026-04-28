import { z } from 'zod';

// YouTube Data API v3 tools. Free quota: 10,000 units/day per key.
// channels.list = 1 unit, search.list = 100 units, so be sparing.
//
// youtube_transcript uses the youtube-transcript npm pkg — no API key
// needed (scrapes the public transcript endpoint).

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

export function buildYoutubeTools({ apiKey, logger }) {
  if (!apiKey) return [transcriptTool];

  async function api(path, params) {
    const q = new URLSearchParams({ ...params, key: apiKey });
    const res = await fetch(`${YT_BASE}${path}?${q.toString()}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`youtube ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  function summarizeChannel(c) {
    return {
      id: c.id,
      title: c.snippet?.title,
      handle: c.snippet?.customUrl,
      description: c.snippet?.description,
      country: c.snippet?.country,
      publishedAt: c.snippet?.publishedAt,
      subscriberCount: Number(c.statistics?.subscriberCount || 0),
      videoCount: Number(c.statistics?.videoCount || 0),
      viewCount: Number(c.statistics?.viewCount || 0),
      businessEmail: c.brandingSettings?.channel?.businessEmail || null,
      keywords: c.brandingSettings?.channel?.keywords,
    };
  }

  const channelInfo = {
    name: 'youtube_channel_info',
    description:
      'Look up a YouTube channel by handle, custom URL, or channel ID. Returns title, description, subscriber count, and the public business email if the channel exposes one.',
    schemaZod: {
      identifier: z.string().describe('Channel handle ("@user"), custom URL, or channel ID (UC...).'),
    },
    async execute({ identifier }) {
      try {
        const id = String(identifier).trim();
        let channelId = null;
        if (id.startsWith('UC')) {
          channelId = id;
        } else if (id.startsWith('@')) {
          const data = await api('/channels', { part: 'snippet,statistics,brandingSettings', forHandle: id });
          channelId = data.items?.[0]?.id || null;
          if (channelId) return summarizeChannel(data.items[0]);
        } else {
          const search = await api('/search', { part: 'snippet', q: id, type: 'channel', maxResults: 1 });
          channelId = search.items?.[0]?.snippet?.channelId || search.items?.[0]?.id?.channelId;
        }
        if (!channelId) return { error: 'channel_not_found', identifier };
        const data = await api('/channels', {
          part: 'snippet,statistics,brandingSettings',
          id: channelId,
        });
        const c = data.items?.[0];
        if (!c) return { error: 'channel_not_found', identifier };
        return summarizeChannel(c);
      } catch (err) {
        return { error: err.message, identifier };
      }
    },
  };

  const recentVideos = {
    name: 'youtube_recent_videos',
    description:
      "List a channel's most recent uploads (titles, descriptions, publishedAt). Costs 100 units per call — use sparingly.",
    schemaZod: {
      channelId: z.string().describe('YouTube channel ID (UC...)'),
      limit: z.number().optional().describe('Max videos (default 8, max 25)'),
    },
    async execute({ channelId, limit = 8 }) {
      try {
        const data = await api('/search', {
          part: 'snippet',
          channelId,
          order: 'date',
          type: 'video',
          maxResults: Math.min(limit, 25),
        });
        const videos = (data.items || []).map((v) => ({
          id: v.id?.videoId,
          title: v.snippet?.title,
          description: (v.snippet?.description || '').slice(0, 300),
          publishedAt: v.snippet?.publishedAt,
          url: `https://www.youtube.com/watch?v=${v.id?.videoId}`,
        }));
        return { channelId, count: videos.length, videos };
      } catch (err) {
        return { error: err.message, channelId };
      }
    },
  };

  return [channelInfo, recentVideos, transcriptTool];
}

export const transcriptTool = {
  name: 'youtube_transcript',
  description:
    "Fetch the auto-generated or manual transcript for a YouTube video. Use to find specific quotes / distinctive points to reference in outreach.",
  schemaZod: {
    videoId: z.string().describe('YouTube video id (the v= part of the URL).'),
    maxChars: z.number().optional().describe('Max characters (default 8000).'),
  },
  async execute({ videoId, maxChars = 8000 }) {
    try {
      const mod = await import('youtube-transcript').catch((err) => {
        throw new Error(`youtube-transcript not installed: ${err.message}`);
      });
      const segments = await mod.YoutubeTranscript.fetchTranscript(videoId);
      const text = segments.map((s) => s.text).join(' ');
      return {
        videoId,
        chars: text.length,
        truncated: text.length > maxChars,
        text: text.slice(0, maxChars),
      };
    } catch (err) {
      return { error: err.message, videoId };
    }
  },
};
