// Agent runner — uniform interface over the underlying LLM adapter.
// The adapter contract is a single async generator method `run(...)`
// that yields normalized events:
//   { type: 'text', text }
//   { type: 'tool_call', name, input, output, isError }
//   { type: 'done', costUsd, tokensIn, tokensOut, stoppedReason, lastText }
//   { type: 'error', error }
//
// This file orchestrates two entry points:
//   run(...)            single-shot — collects final text, optionally
//                       parses JSON when the prompt declares an output
//                       schema. No tools, no built-ins.
//   runWithTools(...)   multi-turn — exposes built-in WebSearch/WebFetch
//                       and any custom MCP tools the caller passes.
//                       Streams events to onEvent + an SSE channel.

import { renderTemplate } from './templating.js';
import { buildClaudeAgentAdapter } from './claudeAgent.js';

export function buildAgentRunner({ config, models, prompts, usage, logger, llm, sse }) {
  const adapter = llm || buildClaudeAgentAdapter({ logger });

  function getModelForSlot(slot) {
    return config.models[slot] || config.models.research;
  }

  async function run({
    promptKey,
    context,
    slot,
    jobId,
    contactId,
    opportunityId,
    budgetCapUsd,
    maxTokens = 1500,
  }) {
    const promptDecl = prompts.listDeclarations().find((d) => d.key === promptKey);
    const promptRecord = await prompts.getActive(promptKey);
    const promptBody = promptRecord?.body || promptDecl?.defaultBody;
    if (!promptBody) throw new Error(`prompt not found: ${promptKey}`);

    const rendered = renderTemplate(promptBody, context);
    const model = getModelForSlot(slot || promptDecl?.modelSlot || 'classify');

    const start = Date.now();
    let lastText = '';
    let costUsd = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let stoppedReason = null;
    let errorMsg = null;

    for await (const event of adapter.run({
      systemPrompt: rendered,
      userPrompt: JSON.stringify(context),
      model,
      maxTurns: 1,
      // If the prompt declares a JSON output schema, hand it to the
      // adapter so the underlying API constrains output. Cuts the
      // entire "regex-hunt for JSON in freeform text" failure mode.
      jsonSchema: promptDecl?.outputSchema,
    })) {
      if (event.type === 'text') lastText = event.text;
      if (event.type === 'done') {
        costUsd = event.costUsd;
        tokensIn = event.tokensIn;
        tokensOut = event.tokensOut;
        stoppedReason = event.stoppedReason;
        if (event.lastText) lastText = event.lastText;
      }
      if (event.type === 'error') errorMsg = event.error;
    }

    await usage.log({
      jobId,
      contactId,
      opportunityId,
      module: promptDecl?.module || 'shared',
      kind: 'claude-agent-sdk',
      model,
      tokensIn,
      tokensOut,
      costUsd,
      ts: new Date(),
    });

    if (errorMsg) throw new Error(errorMsg);

    let parsed = null;
    if (promptDecl?.outputSchema) parsed = extractJson(lastText);

    return {
      promptKey,
      model,
      content: lastText,
      parsed,
      tokensIn,
      tokensOut,
      costUsd,
      stoppedReason,
      durationMs: Date.now() - start,
    };
  }

  async function runWithTools({
    promptKey,
    context,
    initialUser = 'Begin now.',
    tools = [],         // [{ name, description, schemaZod, execute(input, ctx) }]
    toolCtx = {},
    allowedBuiltins = ['WebSearch', 'WebFetch'],
    slot,
    jobId,
    contactId,
    opportunityId,
    budgetCapUsd,
    onEvent,
    sseChannel,
    maxTurns = 12,
  }) {
    const promptDecl = prompts.listDeclarations().find((d) => d.key === promptKey);
    const promptRecord = await prompts.getActive(promptKey);
    const promptBody = promptRecord?.body || promptDecl?.defaultBody;
    if (!promptBody) throw new Error(`prompt not found: ${promptKey}`);

    const system = renderTemplate(promptBody, context);
    const model = getModelForSlot(slot || promptDecl?.modelSlot || 'research');

    function emit(event) {
      onEvent?.(event);
      if (sseChannel && sse) sse.emit(sseChannel, event);
    }

    let lastText = '';
    let costUsd = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let iterations = 0;
    let stoppedReason = null;
    let errorMsg = null;

    for await (const event of adapter.run({
      systemPrompt: system,
      userPrompt: initialUser,
      allowedBuiltins,
      mcpTools: tools,
      toolCtx,
      model,
      maxTurns,
    })) {
      if (event.type === 'text') {
        lastText = event.text;
        iterations++;
        emit({ type: 'message', text: event.text, iteration: iterations });
      } else if (event.type === 'tool_call') {
        emit({
          type: 'tool_call',
          name: event.name,
          input: event.input,
          output: event.output,
          isError: event.isError,
          costSoFar: costUsd,
          iteration: iterations,
        });
      } else if (event.type === 'done') {
        costUsd = event.costUsd;
        tokensIn = event.tokensIn;
        tokensOut = event.tokensOut;
        stoppedReason = event.stoppedReason;
        if (event.lastText) lastText = event.lastText;
        emit({
          type: 'done',
          iterations,
          costUsd,
          stoppedReason,
          lastText,
        });
      } else if (event.type === 'error') {
        errorMsg = event.error;
        emit({ type: 'error', error: errorMsg });
      }

      if (
        Number.isFinite(budgetCapUsd) &&
        costUsd >= budgetCapUsd &&
        event.type !== 'done'
      ) {
        emit({ type: 'budget_exceeded', costSoFar: costUsd, capUsd: budgetCapUsd });
        // Note: we can't actually halt the SDK loop mid-stream from here
        // (no abort token surfaced through events). Phase 9 wires
        // AbortController through. For now, we just emit the warning.
      }
    }

    await usage.log({
      jobId,
      contactId,
      opportunityId,
      module: promptDecl?.module || 'shared',
      kind: 'claude-agent-sdk',
      model,
      tokensIn,
      tokensOut,
      costUsd,
      ts: new Date(),
    });

    if (errorMsg) throw new Error(errorMsg);

    return {
      text: lastText,
      iterations,
      tokensIn,
      tokensOut,
      costUsd,
      stoppedReason,
    };
  }

  async function testPrompt({ key, context }) {
    const result = await run({ promptKey: key, context, slot: 'classify' });
    return { output: result.content, model: result.model, costUsd: result.costUsd };
  }

  return { run, runWithTools, testPrompt, hasAdapter: !!adapter };
}

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }
  return null;
}
