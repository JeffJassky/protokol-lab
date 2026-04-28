// Locks the mock agent's event sequence so future changes to scenarios are
// deliberate. The real chatStream branches on AGENT_PROVIDER=mock and
// delegates to mockChatStream — see services/agent.js / services/agent.mock.js.

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import '../src/models/index.js';
import User from '../src/models/User.js';
import MealProposal from '../src/models/MealProposal.js';
import { mockChatStream } from '../src/services/agent.mock.js';

async function collect(gen) {
  const events = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe('mockChatStream', () => {
  let userId;
  beforeEach(async () => {
    const u = await User.create({ email: 'mock@example.com' });
    userId = u._id;
  });

  it('default scenario echoes the last user message and emits a final', async () => {
    const events = await collect(mockChatStream(
      userId,
      [{ role: 'user', parts: [{ text: 'hello mock' }] }],
    ));
    const types = events.map((e) => e.type);
    expect(types).toEqual(['status', 'status', 'thought', 'usage', 'final']);
    const final = events.at(-1);
    expect(final.html).toContain('hello mock');
  });

  it('meal-proposal scenario persists a MealProposal and emits tool_proposal', async () => {
    const events = await collect(mockChatStream(
      userId,
      [{ role: 'user', parts: [{ text: 'log my lunch' }] }],
      { scenario: 'meal-proposal' },
    ));
    const proposalEvent = events.find((e) => e.type === 'tool_proposal');
    expect(proposalEvent).toBeDefined();
    expect(proposalEvent.items).toHaveLength(2);
    expect(proposalEvent.totals.calories).toBe(420);

    const persisted = await MealProposal.findById(proposalEvent.proposalId);
    expect(persisted).not.toBeNull();
    expect(String(persisted.userId)).toBe(String(userId));
    expect(persisted.status).toBe('pending');
  });

  it('error scenario emits an error event and halts', async () => {
    const events = await collect(mockChatStream(
      userId,
      [{ role: 'user', parts: [{ text: 'go' }] }],
      { scenario: 'error' },
    ));
    expect(events.map((e) => e.type)).toEqual(['status', 'error']);
    expect(events.at(-1).message).toMatch(/simulated/i);
  });

  it('slow scenario yields gradually but still completes', async () => {
    const t0 = Date.now();
    const events = await collect(mockChatStream(
      userId,
      [{ role: 'user', parts: [{ text: 'slow plz' }] }],
      { scenario: 'slow' },
    ));
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(120);
    expect(events.at(-1).type).toBe('final');
  });
});
