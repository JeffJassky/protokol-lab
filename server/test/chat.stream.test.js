// /api/chat coverage. P0 #6 (AI streaming) + #7 (meal proposal confirm/cancel).
//
// We force the mock agent (AGENT_PROVIDER=mock + scenario header) so the
// stream is deterministic and never touches Gemini. The route still wires
// the real SSE response, real ChatUsage persistence, and real meal-proposal
// confirm/cancel logic — only the LLM is swapped out.
//
// Asserting against an SSE response with supertest: read the raw body, split
// on the SSE delimiter, parse each `data:...` line as JSON.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import '../src/models/index.js';
import { createApp } from '../src/app.js';
import MealProposal from '../src/models/MealProposal.js';
import FoodLog from '../src/models/FoodLog.js';
import ChatUsage from '../src/models/ChatUsage.js';

let savedProvider;
beforeAll(() => {
  savedProvider = process.env.AGENT_PROVIDER;
  process.env.AGENT_PROVIDER = 'mock';
});
afterAll(() => {
  process.env.AGENT_PROVIDER = savedProvider;
});

// Re-import the agent after AGENT_PROVIDER is set so MOCK_AGENT_ENABLED
// captures the right value. createApp doesn't cache the agent — services
// resolve lazily — but the mock detector reads the env at module load time.
// We import dynamically below to ensure the order.
let app;
beforeAll(async () => {
  // Bust any cached imports by importing through a fresh path. Vitest gives
  // each test file its own module scope so simply importing here is enough.
  app = createApp({ serveClient: false });
});

async function registerAndLogin(email = 'chat@example.com') {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email, password: 'chat-pw-1' });
  const me = await agent.get('/api/auth/me');
  return { agent, userId: me.body.user.id };
}

function parseSseBody(raw) {
  return raw
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('data:'))
    .map((chunk) => JSON.parse(chunk.slice('data:'.length).trim()));
}

// recordChatUsage runs after res.end() in the chat route, so a direct
// findOne immediately after the supertest call can race ahead of the write
// on slow CI. Poll up to 1s for the row to land.
async function pollFor(query, { timeoutMs = 1000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await query();
    if (last) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

describe('POST /api/chat (streaming)', () => {
  let agent;
  let userId;

  beforeEach(async () => {
    ({ agent, userId } = await registerAndLogin());
  });

  it('default mock scenario streams status → final and persists ChatUsage', async () => {
    const res = await agent
      .post('/api/chat')
      .send({ messages: [{ role: 'user', parts: [{ text: 'hello world' }] }] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseSseBody(res.text);
    expect(events.map((e) => e.type)).toEqual(['status', 'status', 'thought', 'final']);
    expect(events.at(-1).html).toContain('hello world');

    // recordChatUsage fires after res.end(), so poll for the row instead of
    // a single read that could race the post-end write on a slow worker.
    const usage = await pollFor(() => ChatUsage.findOne({ userId }));
    expect(usage).not.toBeNull();
    expect(usage.status).toBe('ok');
  });

  it('meal-proposal scenario emits tool_proposal and writes a MealProposal row', async () => {
    const res = await agent
      .post('/api/chat')
      .set('x-mock-scenario', 'meal-proposal')
      .send({ messages: [{ role: 'user', parts: [{ text: 'log my lunch' }] }] });

    expect(res.status).toBe(200);
    const events = parseSseBody(res.text);
    const proposalEvent = events.find((e) => e.type === 'tool_proposal');
    expect(proposalEvent).toBeDefined();

    const proposal = await MealProposal.findById(proposalEvent.proposalId);
    expect(proposal).not.toBeNull();
    expect(String(proposal.userId)).toBe(String(userId));
    expect(proposal.status).toBe('pending');
  });

  it('error scenario surfaces an error event in the stream', async () => {
    const res = await agent
      .post('/api/chat')
      .set('x-mock-scenario', 'error')
      .send({ messages: [{ role: 'user', parts: [{ text: 'go' }] }] });

    expect(res.status).toBe(200);
    const events = parseSseBody(res.text);
    expect(events.find((e) => e.type === 'error')).toBeDefined();
  });

  it('400s when messages array is missing', async () => {
    const res = await agent.post('/api/chat').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/chat/proposals/:id/confirm', () => {
  let agent;
  let userId;

  beforeEach(async () => {
    ({ agent, userId } = await registerAndLogin());
  });

  it('confirms a pending proposal and writes one FoodLog per item', async () => {
    // Drive the meal-proposal scenario to create a real proposal.
    const stream = await agent
      .post('/api/chat')
      .set('x-mock-scenario', 'meal-proposal')
      .send({ messages: [{ role: 'user', parts: [{ text: 'log my lunch' }] }] });
    const proposalId = parseSseBody(stream.text)
      .find((e) => e.type === 'tool_proposal').proposalId;

    const confirm = await agent.post(`/api/chat/proposals/${proposalId}/confirm`).send({});
    expect(confirm.status).toBe(200);
    expect(confirm.body.entryCount).toBe(2);
    expect(confirm.body.totals.calories).toBe(420);

    const logs = await FoodLog.find({ userId });
    expect(logs).toHaveLength(2);

    const after = await MealProposal.findById(proposalId);
    expect(after.status).toBe('confirmed');
  });

  it('returns 409 when confirming a proposal that\'s already been confirmed', async () => {
    const stream = await agent
      .post('/api/chat')
      .set('x-mock-scenario', 'meal-proposal')
      .send({ messages: [{ role: 'user', parts: [{ text: 'log it' }] }] });
    const proposalId = parseSseBody(stream.text)
      .find((e) => e.type === 'tool_proposal').proposalId;

    await agent.post(`/api/chat/proposals/${proposalId}/confirm`).send({});
    const second = await agent.post(`/api/chat/proposals/${proposalId}/confirm`).send({});
    expect(second.status).toBe(409);
  });

  it('returns 404 when confirming another user\'s proposal', async () => {
    const stream = await agent
      .post('/api/chat')
      .set('x-mock-scenario', 'meal-proposal')
      .send({ messages: [{ role: 'user', parts: [{ text: 'mine' }] }] });
    const proposalId = parseSseBody(stream.text)
      .find((e) => e.type === 'tool_proposal').proposalId;

    const { agent: other } = await registerAndLogin('attacker@example.com');
    const res = await other.post(`/api/chat/proposals/${proposalId}/confirm`).send({});
    expect(res.status).toBe(404);
  });
});

describe('POST /api/chat/proposals/:id/cancel', () => {
  let agent;

  beforeEach(async () => {
    ({ agent } = await registerAndLogin());
  });

  it('cancels a pending proposal', async () => {
    const stream = await agent
      .post('/api/chat')
      .set('x-mock-scenario', 'meal-proposal')
      .send({ messages: [{ role: 'user', parts: [{ text: 'never mind' }] }] });
    const proposalId = parseSseBody(stream.text)
      .find((e) => e.type === 'tool_proposal').proposalId;

    const cancel = await agent.post(`/api/chat/proposals/${proposalId}/cancel`).send({});
    expect(cancel.status).toBe(200);

    const after = await MealProposal.findById(proposalId);
    expect(after.status).toBe('cancelled');
  });
});
