// Claude Agent SDK adapter. Wraps `query()` and exposes a uniform async
// generator that yields normalized events the runner consumes.
//
// Auth: relies on Claude Code login on the host machine
// (~/.claude/credentials), so this works without an ANTHROPIC_API_KEY
// when run on a dev machine where the user has Claude Code installed.
// Costs are reported by the SDK in the `result` message.
//
// Custom tools are exposed as an in-process MCP server. Each tool we
// register becomes available to the agent as `mcp__marketing__<name>`.
// The host's allowedTools list combines Claude Code built-ins (WebSearch,
// WebFetch, etc.) with these MCP tool names.

import { query, createSdkMcpServer, tool as createTool } from '@anthropic-ai/claude-agent-sdk';

const MCP_SERVER_NAME = 'marketing';

// Map our config model slot (research/draft/triage/classify) to the
// alias the Agent SDK accepts. The SDK takes 'opus' | 'sonnet' | 'haiku'
// or full IDs. We default to the user's config.models[slot] which the
// caller supplies — but at the SDK level we typically want the alias.
function pickModelAlias(modelString) {
  if (!modelString) return undefined;
  if (/opus/i.test(modelString)) return 'opus';
  if (/sonnet/i.test(modelString)) return 'sonnet';
  if (/haiku/i.test(modelString)) return 'haiku';
  return modelString; // pass through full IDs
}

export function buildClaudeAgentAdapter({ logger, cwd }) {
  return {
    name: 'claude-agent-sdk',

    async *run({
      systemPrompt,
      userPrompt,
      allowedBuiltins = [],
      mcpTools = [],
      toolCtx = {},
      model,
      maxTurns,
      abortSignal,
    }) {
      // Build (or skip) the in-process MCP server based on which custom
      // tools were passed in. Each tool becomes mcp__marketing__<name>.
      let mcpServers;
      let mcpToolNames = [];
      if (mcpTools.length > 0) {
        const sdkTools = mcpTools.map((t) =>
          createTool(t.name, t.description, t.schemaZod, async (input) => {
            try {
              const result = await t.execute(input, toolCtx);
              const text = typeof result === 'string' ? result : JSON.stringify(result);
              return { content: [{ type: 'text', text }] };
            } catch (err) {
              return {
                content: [{ type: 'text', text: JSON.stringify({ error: err?.message || String(err) }) }],
                isError: true,
              };
            }
          })
        );
        const server = createSdkMcpServer({ name: MCP_SERVER_NAME, tools: sdkTools });
        mcpServers = { [MCP_SERVER_NAME]: server };
        mcpToolNames = mcpTools.map((t) => `mcp__${MCP_SERVER_NAME}__${t.name}`);
      }

      const allowedTools = [...allowedBuiltins, ...mcpToolNames];

      const opts = {
        prompt: userPrompt,
        options: {
          systemPrompt,
          allowedTools,
          permissionMode: 'bypassPermissions',
          ...(cwd && { cwd }),
          ...(maxTurns && { maxTurns }),
          ...(mcpServers && { mcpServers }),
          ...(model && { model: pickModelAlias(model) }),
          ...(abortSignal && { abortController: { signal: abortSignal } }),
        },
      };

      // Track tool_use blocks emitted by the assistant so we can pair
      // them with the matching tool_result block in the next user
      // message. The SDK streams each turn — assistant blocks first,
      // then user blocks containing tool_results.
      const toolUseBuffer = new Map();

      let costUsd = 0;
      let tokensIn = 0;
      let tokensOut = 0;
      let lastText = '';

      try {
        for await (const message of query(opts)) {
          if (message.type === 'assistant') {
            const blocks = message.message?.content || [];
            for (const b of blocks) {
              if (b.type === 'text') {
                lastText = b.text;
                yield { type: 'text', text: b.text };
              } else if (b.type === 'tool_use') {
                toolUseBuffer.set(b.id, { name: b.name, input: b.input });
              }
            }
          } else if (message.type === 'user') {
            const blocks = message.message?.content || [];
            for (const b of blocks) {
              if (b.type === 'tool_result') {
                const orig = toolUseBuffer.get(b.tool_use_id);
                let outText;
                if (Array.isArray(b.content)) {
                  outText = b.content.map((c) => c.text || '').join('');
                } else if (typeof b.content === 'string') {
                  outText = b.content;
                } else {
                  outText = JSON.stringify(b.content);
                }
                let parsedOutput;
                try { parsedOutput = JSON.parse(outText); } catch { parsedOutput = outText; }
                yield {
                  type: 'tool_call',
                  name: orig?.name || '(unknown)',
                  input: orig?.input,
                  output: parsedOutput,
                  isError: !!b.is_error,
                };
                if (orig) toolUseBuffer.delete(b.tool_use_id);
              }
            }
          } else if (message.type === 'result') {
            costUsd = message.total_cost_usd ?? message.totalCostUsd ?? 0;
            tokensIn = message.usage?.input_tokens ?? 0;
            tokensOut = message.usage?.output_tokens ?? 0;
            yield {
              type: 'done',
              costUsd,
              tokensIn,
              tokensOut,
              stoppedReason: message.subtype || message.stop_reason || 'end_turn',
              numTurns: message.num_turns ?? null,
              durationMs: message.duration_ms ?? null,
              lastText,
            };
          } else if (message.type === 'system' && message.subtype === 'init') {
            // Optional: surface session id for debugging
            logger?.debug?.({ sessionId: message.session_id }, '[marketing-admin] agent session started');
          }
        }
      } catch (err) {
        yield { type: 'error', error: err?.message || String(err) };
      }
    },
  };
}
