// Thin wrapper around @anthropic-ai/claude-agent-sdk that runs a one-shot
// prompt against the locally-installed `claude` CLI. Auth is inherited
// from ~/.claude/ — no API key needed (uses the user's Max subscription).
//
// This module is local-only; the marketing workspace doesn't run on
// Heroku. See ~/.claude/projects/.../memory/project_marketing_local_only.md.
//
// Phase 1: one-shot only — no MCP tools, no streaming, no session
// resume. Just prove the subprocess + Max-auth path end-to-end.

import { query } from '@anthropic-ai/claude-agent-sdk';

// SDK exposes in-process MCP tools as `mcp__<server>__<tool>`. The
// route handler + UI care about the bare tool name, so strip the prefix
// once at the agent boundary.
function stripMcpPrefix(name) {
  if (typeof name !== 'string') return name;
  const m = name.match(/^mcp__[^_]+(?:__|_)/);
  if (!m) return name;
  // Match the canonical mcp__<server>__<tool> shape strictly.
  const parts = name.split('__');
  if (parts.length >= 3 && parts[0] === 'mcp') return parts.slice(2).join('__');
  return name;
}

/**
 * Run a single prompt through the claude subprocess and return the
 * accumulated text + session metadata. Built-in Claude Code tools are
 * disabled — this is for plain text generation, not codebase work.
 *
 * @param {object} params
 * @param {string} params.userMessage  - The user-turn content.
 * @param {string} [params.systemPrompt] - System prompt prepended to the conversation.
 * @param {string} [params.model='claude-opus-4-7']
 * @param {string} [params.resumeSessionId] - Resume an existing claude session.
 * @param {string} [params.cwd=process.cwd()]
 * @param {object} [params.logger]
 * @param {object} [params.mcpServers] - MCP server configs keyed by name (e.g. SDK-type from createSdkMcpServer).
 * @param {string[]} [params.allowedTools] - Tool names auto-allowed without prompting (use mcp__<server>__<tool> form).
 * @returns {Promise<{ text: string, sessionId: string, durationMs: number, costUsd: number }>}
 */
export async function runOnce({
  userMessage,
  systemPrompt,
  model = 'claude-opus-4-7',
  resumeSessionId,
  cwd = process.cwd(),
  logger,
  mcpServers,
  allowedTools,
} = {}) {
  if (!userMessage || typeof userMessage !== 'string') {
    throw new Error('runOnce: userMessage is required');
  }

  const options = {
    model,
    cwd,
    // Disable all built-in Claude Code tools. The agent only sees the
    // MCP tools we register explicitly below.
    tools: [],
  };
  if (systemPrompt) {
    options.systemPrompt = systemPrompt;
  }
  if (resumeSessionId) {
    options.resume = resumeSessionId;
  }
  if (mcpServers) {
    options.mcpServers = mcpServers;
  }
  if (allowedTools && allowedTools.length) {
    options.allowedTools = allowedTools;
  }

  const q = query({ prompt: userMessage, options });

  let text = '';
  let sessionId = resumeSessionId || '';
  let result = null;

  for await (const msg of q) {
    if (msg.type === 'assistant') {
      sessionId = msg.session_id;
      const content = msg.message?.content || [];
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          text += block.text;
        }
      }
      if (msg.error) {
        logger?.warn?.({ err: msg.error, sessionId }, '[claude] assistant message error');
      }
    } else if (msg.type === 'result') {
      result = msg;
      sessionId = msg.session_id || sessionId;
      if (msg.subtype === 'success') {
        // result.result is the canonical final text. Prefer it over our
        // accumulated text — handles cases where the SDK delivered text
        // only in the final event.
        if (typeof msg.result === 'string' && msg.result.length > 0) {
          text = msg.result;
        }
      } else {
        const errMsg = `claude result ${msg.subtype}: ${msg.api_error_status ?? ''}`;
        throw new Error(errMsg);
      }
    }
  }

  return {
    text,
    sessionId,
    durationMs: result?.duration_ms ?? 0,
    costUsd: result?.total_cost_usd ?? 0,
  };
}

/**
 * Streaming variant: invokes onEvent for every meaningful SDK event so
 * a route handler can fan out to SSE / persist / etc. Returns a summary
 * once the run completes.
 *
 * Events emitted:
 *   { type: 'assistant-text', text, full }
 *   { type: 'tool-use', toolUseId, name, input }
 *   { type: 'tool-result', toolUseId, name, content, isError }
 *   { type: 'assistant-message', blocks }   // emitted once per assistant turn, full content array
 *   { type: 'done', sessionId, durationMs, costUsd, finalText }
 *   { type: 'error', message }
 */
export async function runStreaming({
  userMessage,
  systemPrompt,
  model = 'claude-opus-4-7',
  resumeSessionId,
  cwd = process.cwd(),
  logger,
  mcpServers,
  allowedTools,
  onEvent,
} = {}) {
  if (!userMessage || typeof userMessage !== 'string') {
    throw new Error('runStreaming: userMessage is required');
  }
  if (typeof onEvent !== 'function') onEvent = () => {};

  const options = { model, cwd, tools: [] };
  if (systemPrompt) options.systemPrompt = systemPrompt;
  if (resumeSessionId) options.resume = resumeSessionId;
  if (mcpServers) options.mcpServers = mcpServers;
  if (allowedTools && allowedTools.length) options.allowedTools = allowedTools;

  const q = query({ prompt: userMessage, options });

  let fullText = '';
  let sessionId = resumeSessionId || '';
  let result = null;

  try {
    for await (const msg of q) {
      if (msg.type === 'assistant') {
        sessionId = msg.session_id || sessionId;
        const blocks = msg.message?.content || [];
        for (const block of blocks) {
          if (block.type === 'text' && typeof block.text === 'string') {
            fullText += block.text;
            onEvent({ type: 'assistant-text', text: block.text, full: fullText });
          } else if (block.type === 'tool_use') {
            onEvent({
              type: 'tool-use',
              toolUseId: block.id,
              name: stripMcpPrefix(block.name),
              rawName: block.name,
              input: block.input,
            });
          }
        }
        onEvent({ type: 'assistant-message', blocks });
        if (msg.error) {
          logger?.warn?.({ err: msg.error, sessionId }, '[claude] assistant message error');
        }
      } else if (msg.type === 'user') {
        // Tool results come back as user-message replays.
        const blocks = msg.message?.content || [];
        for (const block of blocks) {
          if (block.type === 'tool_result') {
            onEvent({
              type: 'tool-result',
              toolUseId: block.tool_use_id,
              name: stripMcpPrefix(block.name),
              rawName: block.name,
              content: block.content,
              isError: !!block.is_error,
            });
          }
        }
      } else if (msg.type === 'result') {
        result = msg;
        sessionId = msg.session_id || sessionId;
        if (msg.subtype === 'success' && typeof msg.result === 'string' && msg.result.length > 0) {
          fullText = msg.result;
        } else if (msg.subtype !== 'success') {
          throw new Error(`claude result ${msg.subtype}: ${msg.api_error_status ?? ''}`);
        }
      }
    }
  } catch (err) {
    onEvent({ type: 'error', message: err.message });
    throw err;
  }

  const summary = {
    sessionId,
    durationMs: result?.duration_ms ?? 0,
    costUsd: result?.total_cost_usd ?? 0,
    finalText: fullText,
  };
  onEvent({ type: 'done', ...summary });
  return summary;
}
