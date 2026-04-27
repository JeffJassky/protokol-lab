// Pins the timezone behavior of the chat agent so we don't silently
// regress to UTC server-clock dates.
//
// Why this matters: we shipped a bug where the agent computed "today"
// from server local time (UTC in prod). At 02:00 UTC on April 27th,
// a user in PT was still on April 26th — the agent thought it was the
// next day and the propose_food_entries default date was wrong.
//
// Two surfaces under test:
//   1. getLocalDateInfo(tz) — pure helper, returns the user's local
//      calendar date + clock fields.
//   2. propose_food_entries — when called without an explicit date,
//      must default to the user's local "today", not server "today".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import MealProposal from '../src/models/MealProposal.js';
import { getLocalDateInfo, executeTool } from '../src/services/agent.js';

describe('getLocalDateInfo', () => {
  it('returns YYYY-MM-DD, 24h time, weekday, and the requested zone', () => {
    const info = getLocalDateInfo('America/Los_Angeles');
    expect(info.timeZone).toBe('America/Los_Angeles');
    expect(info.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(info.localTime).toMatch(/^\d{2}:\d{2}$/);
    expect(info.weekday).toMatch(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/);
    expect(info.hour).toBeGreaterThanOrEqual(0);
    expect(info.hour).toBeLessThan(24);
  });

  it('falls back to UTC when given an invalid IANA zone', () => {
    const info = getLocalDateInfo('Not/A/Zone');
    expect(info.timeZone).toBe('UTC');
  });

  it('honors the zone for a fixed instant — same Date, different zones, different days', () => {
    // 06:00 UTC = 23:00 PT prev day = 15:00 JST same day.
    // Freeze time so the calendar boundary is unambiguous.
    const fixed = new Date('2026-04-27T06:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixed);
    try {
      const utc = getLocalDateInfo('UTC');
      const pt = getLocalDateInfo('America/Los_Angeles');
      const jst = getLocalDateInfo('Asia/Tokyo');

      expect(utc.today).toBe('2026-04-27');
      expect(pt.today).toBe('2026-04-26'); // still yesterday in PT
      expect(jst.today).toBe('2026-04-27');
      expect(jst.hour).toBe(15);
      expect(pt.hour).toBe(23);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('propose_food_entries — date default uses ctx.timeZone', () => {
  const userId = new mongoose.Types.ObjectId();
  const baseArgs = {
    mealType: 'snack',
    items: [{
      name: 'Test snack', emoji: '🥨',
      calories: 100, protein: 5, fat: 3, carbs: 12,
    }],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // 06:00 UTC on Apr 27 → still Apr 26 in PT. This is exactly the
    // window the bug triggered in.
    vi.setSystemTime(new Date('2026-04-27T06:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to user-local today when ctx.timeZone is the user TZ', async () => {
    const result = await executeTool(
      'propose_food_entries',
      baseArgs,
      userId,
      { timeZone: 'America/Los_Angeles' },
    );
    expect(result.proposalId).toBeDefined();
    const stored = await MealProposal.findById(result.proposalId).lean();
    // PT is one day behind UTC at 06:00 UTC.
    expect(stored.date).toBe('2026-04-26');
  });

  it('respects an explicit args.date over the tz default', async () => {
    const result = await executeTool(
      'propose_food_entries',
      { ...baseArgs, date: '2026-04-25' },
      userId,
      { timeZone: 'America/Los_Angeles' },
    );
    const stored = await MealProposal.findById(result.proposalId).lean();
    expect(stored.date).toBe('2026-04-25');
  });

  it('falls back to UTC date when ctx.timeZone is missing', async () => {
    const result = await executeTool(
      'propose_food_entries',
      baseArgs,
      userId,
      {},
    );
    const stored = await MealProposal.findById(result.proposalId).lean();
    expect(stored.date).toBe('2026-04-27');
  });
});
