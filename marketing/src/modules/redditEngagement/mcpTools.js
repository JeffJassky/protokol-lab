// MCP tools the claude subprocess uses while drafting Reddit replies.
// Registered in-process via createSdkMcpServer — claude calls back into
// this Node app over the SDK's stdio MCP transport without spawning
// extra processes.
//
// Tools are scoped to one opportunity at a time. The opportunityId is
// captured in the closure when buildDraftMcpServer({ ctx, opportunityId })
// is called from a route handler — claude doesn't need to pass it.

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { getCachedRecentComments, setCachedRecentComments } from '../../shared/claude/recentCommentsCache.js';

const SERVER_NAME = 'redditDraft';

// Tool name prefix the SDK uses for in-process MCP tools:
//   mcp__<serverName>__<toolName>
// Routes pass these to allowedTools so the model can call them without prompts.
export const TOOL_NAMES = {
  fetchMyRecentComments: `mcp__${SERVER_NAME}__fetch_my_recent_comments`,
  fetchPostThread: `mcp__${SERVER_NAME}__fetch_post_thread`,
  setDraft: `mcp__${SERVER_NAME}__set_draft`,
};
export const ALL_TOOL_NAMES = Object.values(TOOL_NAMES);

function textResult(payload) {
  return {
    content: [{
      type: 'text',
      text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
    }],
  };
}
function errorResult(msg) {
  return { content: [{ type: 'text', text: `error: ${msg}` }], isError: true };
}

export function buildDraftMcpServer({ ctx, opportunityId }) {
  const { Contact, EngagementOpportunity } = ctx.models;

  const fetchMyRecentComments = tool(
    'fetch_my_recent_comments',
    "Fetch the operator's own recent Reddit comments. Use these as the canonical voice signal — match phrasing, length, hedging, technical depth. The handle comes from the Contact marked relationship='self'.",
    {
      limit: z.number().int().min(1).max(100).optional()
        .describe('How many recent comments to return. Default 20, max 100.'),
    },
    async ({ limit = 20 }) => {
      try {
        if (!ctx.redditClient) return errorResult('reddit client not configured');
        const self = await Contact.findOne({ relationship: 'self' }).lean();
        if (!self) return errorResult("no Contact with relationship='self'");
        const presence = (self.presences || []).find((p) => p.platform === 'reddit' && p.handle);
        if (!presence) return errorResult('self contact has no reddit presence');
        const handle = String(presence.handle).replace(/^u\//, '').replace(/^[@/]/, '');

        // Cache hit: serve up to `limit` from the day's cached fetch (we
        // always cache the broadest pull of the day so smaller `limit`
        // requests slice the same data).
        let comments = getCachedRecentComments(handle);
        if (!comments) {
          const data = await ctx.redditClient.api(`/user/${encodeURIComponent(handle)}/comments`, {
            sort: 'new',
            limit: 100, // pull the day's max, slice per-request below
          });
          comments = (data?.data?.children || []).map((c) => ({
            subreddit: c.data.subreddit,
            score: c.data.score,
            createdAt: new Date((c.data.created_utc || 0) * 1000).toISOString(),
            linkTitle: c.data.link_title,
            permalink: `https://reddit.com${c.data.permalink}`,
            body: c.data.body || '',
          }));
          setCachedRecentComments(handle, comments);
          ctx.logger?.info?.({ handle, count: comments.length }, '[mcp] reddit comments fetched + cached');
        } else {
          ctx.logger?.info?.({ handle, count: comments.length }, '[mcp] reddit comments served from cache');
        }
        const sliced = comments.slice(0, limit);
        return textResult({ handle, count: sliced.length, cached: comments !== null, comments: sliced });
      } catch (err) {
        ctx.logger?.warn?.({ err: err.message }, '[mcp] fetch_my_recent_comments failed');
        return errorResult(err.message);
      }
    }
  );

  const fetchPostThread = tool(
    'fetch_post_thread',
    'Fetch the full Reddit post being replied to: title, body, subreddit, author, score, and any cached thread metadata. Call this once at the start of a drafting session.',
    {},
    async () => {
      try {
        const opp = await EngagementOpportunity.findById(opportunityId).lean();
        if (!opp) return errorResult(`opportunity ${opportunityId} not found`);
        return textResult({
          subreddit: opp.subreddit,
          title: opp.title,
          author: opp.authorUsername,
          score: opp.postScore,
          commentCount: opp.postCommentCount,
          postedAt: opp.postedAt,
          url: opp.postUrl,
          body: opp.postExcerpt || '',
          triage: opp.triage || null,
          matchedKeywords: opp.matchedKeywords || [],
          existingDraft: opp.draft?.body || null,
        });
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  const setDraft = tool(
    'set_draft',
    'Save the current draft reply for this opportunity. Call once you have a candidate the operator can review. Replaces any prior draft body.',
    {
      body: z.string().min(1).describe('The full draft reply, plain markdown.'),
    },
    async ({ body }) => {
      try {
        const opp = await EngagementOpportunity.findByIdAndUpdate(
          opportunityId,
          {
            'draft.body': body,
            'draft.generatedAt': new Date(),
            status: 'drafted',
          },
          { returnDocument: 'after' }
        );
        if (!opp) return errorResult(`opportunity ${opportunityId} not found`);
        ctx.logger?.info?.({ oppId: opportunityId, len: body.length }, '[mcp] draft saved');
        return textResult({ ok: true, length: body.length });
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  return createSdkMcpServer({
    name: SERVER_NAME,
    version: '0.1.0',
    tools: [fetchMyRecentComments, fetchPostThread, setDraft],
  });
}
