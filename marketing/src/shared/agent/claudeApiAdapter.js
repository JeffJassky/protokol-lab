// Claude API adapter — uses @anthropic-ai/sdk directly with ANTHROPIC_API_KEY.
// Replaces the @anthropic-ai/claude-agent-sdk path which depended on a local
// Claude Code CLI binary that doesn't exist in deployed environments.
//
// Same event-stream interface as buildClaudeAgentAdapter so the runner
// doesn't need to change:
//   yield { type: 'text', text }
//   yield { type: 'tool_call', name, input, output, isError }
//   yield { type: 'done', costUsd, tokensIn, tokensOut, stoppedReason, lastText }
//   yield { type: 'error', error }
//
// Prompt caching: the runner today renders the entire system prompt with
// per-call interpolation, so the prefix differs every call and caching
// can't kick in. Adding `cache_control` here would be a no-op until we
// restructure the prompt templates to keep voice/instructions stable
// across calls. Skipped for now — TODO follow-up.

import Anthropic from '@anthropic-ai/sdk';

// Pricing per million tokens. Used to compute costUsd post-hoc since the
// Messages API doesn't return cost directly. Rates from platform.claude.com
// docs as of 2026-04. Update when new models ship or pricing changes.
const PRICING = {
  // Opus 4.7 (1M context, no long-context premium)
  'claude-opus-4-7':   { input: 5,  output: 25, cacheRead: 0.5,  cacheWrite: 6.25 },
  'claude-opus-4-6':   { input: 5,  output: 25, cacheRead: 0.5,  cacheWrite: 6.25 },
  // Sonnet 4.6
  'claude-sonnet-4-6': { input: 3,  output: 15, cacheRead: 0.3,  cacheWrite: 3.75 },
  // Haiku 4.5
  'claude-haiku-4-5':  { input: 1,  output: 5,  cacheRead: 0.1,  cacheWrite: 1.25 },
  // Legacy date-suffixed haiku ID (config still references it)
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

function calcCost(model, usage) {
  const p = PRICING[model] || PRICING['claude-sonnet-4-6']; // safe-ish default
  const inUsd = (usage.input_tokens || 0) * p.input / 1e6;
  const outUsd = (usage.output_tokens || 0) * p.output / 1e6;
  const crUsd = (usage.cache_read_input_tokens || 0) * p.cacheRead / 1e6;
  const cwUsd = (usage.cache_creation_input_tokens || 0) * p.cacheWrite / 1e6;
  return inUsd + outUsd + crUsd + cwUsd;
}

// Convert a record of zod schemas (the shape MCP tools in this codebase
// use, e.g. {url: z.string().describe('...'), limit: z.number().optional()})
// into a JSON-schema object the Anthropic API accepts.
function zodRecordToJsonSchema(zodRecord) {
  if (!zodRecord || typeof zodRecord !== 'object') {
    return { type: 'object', properties: {}, additionalProperties: false };
  }
  const properties = {};
  const required = [];
  for (const [key, zodType] of Object.entries(zodRecord)) {
    const def = zodType?._def;
    if (!def) continue;
    const isOptional = def.typeName === 'ZodOptional';
    const inner = isOptional ? def.innerType : zodType;
    const innerDef = inner?._def;
    let type = 'string';
    if (innerDef?.typeName === 'ZodNumber') type = 'number';
    else if (innerDef?.typeName === 'ZodBoolean') type = 'boolean';
    else if (innerDef?.typeName === 'ZodArray') type = 'array';
    else if (innerDef?.typeName === 'ZodObject') type = 'object';

    const prop = { type };
    const desc = def.description ?? innerDef?.description;
    if (desc) prop.description = desc;
    if (type === 'array') prop.items = { type: 'string' }; // best-effort default
    properties[key] = prop;
    if (!isOptional) required.push(key);
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

// Built-in WebFetch tool replacement. Pure node — no Claude Code binary
// needed. Returns the page text clipped to ~5K chars; agents that need
// more can fetch sub-pages or ask for specific selectors. Good enough for
// reddit / blog grounding which is what we use it for.
async function nodeWebFetch({ url }) {
  if (!url || typeof url !== 'string') {
    return { error: 'WebFetch requires a string `url` argument' };
  }
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });
    if (!res.ok) return { error: `WebFetch ${res.status} for ${url}` };
    const text = await res.text();
    // Cheap text extraction: strip scripts/styles, collapse whitespace.
    const stripped = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    return { url, contentLength: text.length, content: stripped.slice(0, 5000) };
  } catch (err) {
    return { error: `WebFetch failed: ${err?.message || String(err)}` };
  }
}

// Map "model slot alias" passed in to a real model ID. The Claude Agent
// SDK accepted aliases like 'opus' / 'sonnet' / 'haiku' — for the raw API
// we need full IDs. If the caller passes a full ID through, use it.
function normalizeModel(model) {
  if (!model) return 'claude-sonnet-4-6';
  const m = String(model).toLowerCase();
  if (m === 'opus') return 'claude-opus-4-7';
  if (m === 'sonnet') return 'claude-sonnet-4-6';
  if (m === 'haiku') return 'claude-haiku-4-5';
  return model;
}

export function buildClaudeApiAdapter({ logger } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // caller falls back to agent SDK adapter

  const client = new Anthropic({ apiKey });

  return {
    name: 'claude-api',

    async *run({
      systemPrompt,
      userPrompt,
      allowedBuiltins = [],
      mcpTools = [],
      toolCtx = {},
      model,
      maxTurns = 12,
      abortSignal,
    }) {
      const modelId = normalizeModel(model);

      // Build tool definitions from MCP tools + WebFetch built-in.
      const toolDefs = mcpTools.map((t) => ({
        name: t.name,
        description: t.description || '',
        input_schema: zodRecordToJsonSchema(t.schemaZod),
      }));
      if (allowedBuiltins.includes('WebFetch')) {
        toolDefs.push({
          name: 'WebFetch',
          description: 'Fetch a URL and return the page content as text (HTML stripped, max ~5KB). Use for grounding citations or checking already-said context.',
          input_schema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to fetch' },
              prompt: { type: 'string', description: 'What to look for in the page (advisory; not enforced).' },
            },
            required: ['url'],
          },
        });
      }
      // WebSearch is a hosted Anthropic tool (server-side) — declared in
      // tools[] with a versioned type literal. Skipping for now since
      // nothing in this repo currently relies on web_search; can be added
      // later by appending {type: 'web_search_20260209', name: 'web_search'}
      // to toolDefs. Note: server-side tools aren't user-defined, so the
      // input_schema/run-handler treatment below doesn't apply.

      const messages = [{ role: 'user', content: userPrompt || 'Begin.' }];
      let totalCostUsd = 0;
      let totalTokensIn = 0;
      let totalTokensOut = 0;
      let lastText = '';
      let stoppedReason = null;

      try {
        for (let turn = 0; turn < maxTurns; turn++) {
          const requestBody = {
            model: modelId,
            max_tokens: 4096,
            system: systemPrompt,
            messages,
          };
          if (toolDefs.length > 0) requestBody.tools = toolDefs;

          let response;
          try {
            response = await client.messages.create(requestBody, abortSignal ? { signal: abortSignal } : undefined);
          } catch (err) {
            // Typed SDK exceptions — surface meaningful messages.
            if (err instanceof Anthropic.APIError) {
              yield { type: 'error', error: `Claude API ${err.status || ''}: ${err.message}` };
            } else {
              yield { type: 'error', error: err?.message || String(err) };
            }
            return;
          }

          totalCostUsd += calcCost(modelId, response.usage || {});
          totalTokensIn += response.usage?.input_tokens || 0;
          totalTokensOut += response.usage?.output_tokens || 0;
          stoppedReason = response.stop_reason || null;

          // Yield text blocks, collect tool_use blocks for execution.
          const toolUses = [];
          for (const block of response.content || []) {
            if (block.type === 'text') {
              lastText = block.text;
              yield { type: 'text', text: block.text };
            } else if (block.type === 'tool_use') {
              toolUses.push(block);
            }
          }

          // No tools called → we're done with this turn cycle.
          if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
            break;
          }

          // Append the assistant turn (full content, including tool_use blocks)
          // and then the tool_result user turn.
          messages.push({ role: 'assistant', content: response.content });

          const toolResults = [];
          for (const toolUse of toolUses) {
            let resultText;
            let isError = false;
            let parsedOutput;

            try {
              if (toolUse.name === 'WebFetch') {
                parsedOutput = await nodeWebFetch(toolUse.input || {});
              } else {
                const tool = mcpTools.find((t) => t.name === toolUse.name);
                if (!tool) {
                  parsedOutput = { error: `unknown tool: ${toolUse.name}` };
                  isError = true;
                } else {
                  parsedOutput = await tool.execute(toolUse.input, toolCtx);
                }
              }
              resultText = typeof parsedOutput === 'string' ? parsedOutput : JSON.stringify(parsedOutput);
              if (parsedOutput && typeof parsedOutput === 'object' && parsedOutput.error) {
                isError = true;
              }
            } catch (err) {
              parsedOutput = { error: err?.message || String(err) };
              resultText = JSON.stringify(parsedOutput);
              isError = true;
            }

            yield {
              type: 'tool_call',
              name: toolUse.name,
              input: toolUse.input,
              output: parsedOutput,
              isError,
            };

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: resultText,
              ...(isError ? { is_error: true } : {}),
            });
          }

          messages.push({ role: 'user', content: toolResults });
        }

        yield {
          type: 'done',
          costUsd: totalCostUsd,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          stoppedReason: stoppedReason || 'end_turn',
          numTurns: null,
          durationMs: null,
          lastText,
        };
      } catch (err) {
        logger?.error?.({ err: err?.message || String(err) }, '[claude-api adapter] unexpected error');
        yield { type: 'error', error: err?.message || String(err) };
      }
    },
  };
}
