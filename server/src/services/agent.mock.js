// Mock agent for E2E + integration tests. Returns a deterministic event
// sequence shaped exactly like the real `chatStream` in agent.js, so the
// route handler and client renderer don't know the difference.
//
// Activated when AGENT_PROVIDER=mock. The route surface (routes/chat.js)
// reads x-mock-scenario from the incoming request and forwards it via
// opts.scenario. Default scenario echoes the last user message as a final.
//
// Why a mock at all: real Gemini has no test mode, costs per-token, and
// emits non-deterministic content. E2E specs need an SSE stream they can
// assert on; this is the cheapest way to drive every client-side branch
// (loading state, tool-call card, proposal confirm, error recovery, abort)
// without burning quota or chasing flake.

import MealProposal from '../models/MealProposal.js';

const MODEL = 'mock-agent-v1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function* textScenario(history) {
  const lastUser = [...history].reverse().find((m) => m.role !== 'ai' && m.role !== 'model');
  const echo = lastUser?.parts?.map((p) => p.text).filter(Boolean).join(' ')
    || lastUser?.content
    || 'Hello from the mock agent.';

  yield { type: 'status', text: 'Loading your data...' };
  yield { type: 'status', text: 'Thinking...' };
  yield { type: 'thought', text: 'Pretending to think.' };
  yield {
    type: 'usage',
    model: MODEL,
    status: 'ok',
    iterations: 1,
    toolCalls: 0,
    searchCalls: 0,
    durationMs: 1,
    inputTokens: 1,
    outputTokens: 1,
  };
  yield { type: 'final', html: `<p>${escapeHtml(echo)}</p>` };
}

async function* mealProposalScenario(userId) {
  yield { type: 'status', text: 'Loading your data...' };
  yield { type: 'status', text: 'Thinking...' };
  yield { type: 'tool_call', name: 'propose_food_entries', summary: 'Drafting meal proposal' };

  // Persist a real MealProposal so the confirm/cancel routes work end-to-end.
  // Tests that don't care about confirm can ignore the proposalId.
  const today = new Date().toISOString().slice(0, 10);
  const items = [
    { name: 'Mock chicken breast', servingCount: 1, calories: 200, proteinG: 40, carbsG: 0, fatG: 5 },
    { name: 'Mock rice', servingCount: 1, calories: 220, proteinG: 4, carbsG: 45, fatG: 1 },
  ];
  const totals = items.reduce(
    (acc, it) => ({
      calories: acc.calories + it.calories,
      proteinG: acc.proteinG + it.proteinG,
      carbsG: acc.carbsG + it.carbsG,
      fatG: acc.fatG + it.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const proposal = await MealProposal.create({
    userId,
    date: today,
    mealType: 'lunch',
    items,
    totals,
    status: 'pending',
  });

  yield {
    type: 'tool_proposal',
    proposalId: String(proposal._id),
    date: today,
    mealType: 'lunch',
    items,
    totals,
  };
  yield {
    type: 'usage',
    model: MODEL,
    status: 'ok',
    iterations: 1,
    toolCalls: 1,
    searchCalls: 0,
    durationMs: 1,
    inputTokens: 1,
    outputTokens: 1,
  };
  yield { type: 'final', html: '<p>Proposed a meal — confirm or edit above.</p>' };
}

async function* errorScenario() {
  yield { type: 'status', text: 'Loading your data...' };
  yield { type: 'error', message: 'mock: simulated agent error' };
}

async function* slowScenario(history) {
  // Lets abort tests cancel mid-stream. 50ms gaps keep total under ~250ms so
  // the happy path still fits comfortably inside Playwright timeouts.
  yield { type: 'status', text: 'Loading your data...' };
  await sleep(50);
  yield { type: 'status', text: 'Thinking...' };
  await sleep(50);
  yield { type: 'thought', text: 'Slow mock thinking.' };
  await sleep(50);
  yield* textScenario(history);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function* mockChatStream(userId, history, opts = {}) {
  const scenario = opts.scenario || 'text';
  switch (scenario) {
    case 'meal-proposal':
      yield* mealProposalScenario(userId);
      return;
    case 'error':
      yield* errorScenario();
      return;
    case 'slow':
      yield* slowScenario(history);
      return;
    case 'text':
    default:
      yield* textScenario(history);
      return;
  }
}

// Read at call time, not module load — tests flip AGENT_PROVIDER in
// beforeAll() and that has to be honored by the agent that imported this.
export function isMockAgentEnabled() {
  return process.env.AGENT_PROVIDER === 'mock';
}
