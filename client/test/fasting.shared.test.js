// Coverage for the shared fasting time-math util.
// Locks in the state machine the banner depends on:
//   - disabled when settings.fasting.enabled = false
//   - active when an event has actualStartAt set + actualEndAt null
//   - past_goal when active and now >= plannedEndAt
//   - active when scheduled rule covers `now` (no event yet)
//   - eating with countdown when next scheduled fast is upcoming
//   - eating_no_next when nothing is scheduled
//   - one-off events take precedence over the recurring schedule when sooner
//
// Also smoke-tests the duration formatter — tabular display in the banner
// uses it directly.

import { describe, it, expect } from 'vitest';
import {
  computeFastingStatus,
  computeFastingNotifications,
  formatDuration,
  protocolDurationMinutes,
  stageForElapsedMinutes,
} from '../../shared/fasting.js';

const FASTING_ENABLED = {
  enabled: true,
  showOnLog: true,
  showOnDashboard: true,
  kind: 'daily',
  protocol: '16:8',
  fastDurationMinutes: 16 * 60,
  dailyStartTime: '20:00',
  weeklyRules: [],
  ianaTz: 'UTC',
};

describe('computeFastingStatus', () => {
  it('returns disabled when fasting is off', () => {
    const status = computeFastingStatus({ ...FASTING_ENABLED, enabled: false }, [], new Date());
    expect(status.state).toBe('disabled');
  });

  it('reports active when an event is in progress', () => {
    const now = new Date('2026-05-02T22:00:00Z');
    const startAt = new Date('2026-05-02T20:00:00Z'); // 2h elapsed
    const plannedEnd = new Date('2026-05-03T12:00:00Z'); // 14h after start
    const events = [{
      _id: 'e1',
      source: 'manual_start',
      actualStartAt: startAt,
      actualEndAt: null,
      plannedStartAt: startAt,
      plannedEndAt: plannedEnd,
    }];
    const status = computeFastingStatus(FASTING_ENABLED, events, now);
    expect(status.state).toBe('active');
    expect(status.elapsedMinutes).toBe(120);
    expect(status.remainingMinutes).toBe(14 * 60); // plannedEnd - now
    expect(status.stage).toBe('Fed'); // 2h < 4h
  });

  it('reports past_goal when active and goal time has passed', () => {
    const now = new Date('2026-05-03T13:00:00Z'); // 1h past goal
    const startAt = new Date('2026-05-02T20:00:00Z');
    const plannedEnd = new Date('2026-05-03T12:00:00Z');
    const events = [{
      _id: 'e1',
      source: 'manual_start',
      actualStartAt: startAt,
      actualEndAt: null,
      plannedStartAt: startAt,
      plannedEndAt: plannedEnd,
    }];
    const status = computeFastingStatus(FASTING_ENABLED, events, now);
    expect(status.state).toBe('past_goal');
    expect(status.elapsedMinutes).toBe(17 * 60);
  });

  it('reports active when current time falls inside the scheduled rule (no event yet)', () => {
    // Pick `now` so the daily 20:00 → 12:00-next-day fast is in progress.
    // computeFastingStatus uses *device local time* via setHours. Use 22:00
    // local on day X — that puts us 2 hours past the 20:00 start.
    const now = new Date();
    now.setHours(22, 0, 0, 0);
    const status = computeFastingStatus(FASTING_ENABLED, [], now);
    expect(status.state).toBe('active');
    expect(status.elapsedMinutes).toBeGreaterThanOrEqual(60 * 2 - 1);
  });

  it('reports eating with countdown when between fasts', () => {
    // 12:00 local — outside the 20:00→12:00 fast window — eating window.
    const now = new Date();
    now.setHours(13, 0, 0, 0);
    const status = computeFastingStatus(FASTING_ENABLED, [], now);
    expect(status.state).toBe('eating');
    expect(status.minutesUntilNext).toBeGreaterThan(0);
  });

  it('reports eating_no_next when schedule is set to none', () => {
    const now = new Date();
    const status = computeFastingStatus(
      { ...FASTING_ENABLED, kind: 'none' },
      [],
      now,
    );
    expect(status.state).toBe('eating_no_next');
  });

  it('one-off scheduled event preempts the recurring rule when sooner', () => {
    const now = new Date();
    now.setHours(13, 0, 0, 0); // eating window
    const oneOffStart = new Date(now.getTime() + 30 * 60 * 1000); // 30 min from now
    const oneOffEnd = new Date(oneOffStart.getTime() + 18 * 60 * 60 * 1000);
    const events = [{
      _id: 'o1',
      source: 'one_off',
      actualStartAt: null,
      actualEndAt: null,
      plannedStartAt: oneOffStart,
      plannedEndAt: oneOffEnd,
    }];
    const status = computeFastingStatus(FASTING_ENABLED, events, now);
    expect(status.state).toBe('eating');
    expect(status.source).toBe('one_off');
    expect(status.minutesUntilNext).toBeLessThan(60);
  });

  it('weekly mode only fasts on selected weekdays', () => {
    // Set up: weekly with only Wednesday (weekday=3) selected.
    // Find a Wednesday at 22:00 local.
    const now = new Date();
    while (now.getDay() !== 3) {
      now.setDate(now.getDate() + 1);
    }
    now.setHours(22, 0, 0, 0);
    const schedule = {
      ...FASTING_ENABLED,
      kind: 'weekly',
      weeklyRules: [
        { weekday: 3, startTime: '20:00', durationMinutes: 16 * 60 },
      ],
    };
    const status = computeFastingStatus(schedule, [], now);
    expect(status.state).toBe('active');

    // On Friday at 22:00 → no rule, eating window (next Wed coming up).
    const fri = new Date(now);
    while (fri.getDay() !== 5) fri.setDate(fri.getDate() + 1);
    fri.setHours(22, 0, 0, 0);
    const friStatus = computeFastingStatus(schedule, [], fri);
    expect(friStatus.state).toBe('eating');
  });
});

describe('formatDuration', () => {
  it('formats hours + minutes', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(125)).toBe('2h 5m');
    expect(formatDuration(-30)).toBe('0m');
  });
});

describe('protocolDurationMinutes', () => {
  it('returns minutes for known protocols', () => {
    expect(protocolDurationMinutes('16:8')).toBe(16 * 60);
    expect(protocolDurationMinutes('OMAD')).toBe(23 * 60);
    expect(protocolDurationMinutes('custom')).toBeNull();
    expect(protocolDurationMinutes('???')).toBeNull();
  });
});

describe('computeFastingNotifications', () => {
  const SCHEDULE = {
    ...FASTING_ENABLED,
    notifications: {
      enabled: true,
      fastStart: { enabled: true },
      fastEnd: { enabled: true },
    },
  };

  it('returns empty when fasting disabled', () => {
    const out = computeFastingNotifications({
      schedule: { ...SCHEDULE, enabled: false },
      events: [],
      now: new Date('2026-05-02T20:00:00Z'),
      userHhmm: '20:00',
      userWeekday: 6,
    });
    expect(out).toEqual([]);
  });

  it('returns empty when notifications disabled', () => {
    const out = computeFastingNotifications({
      schedule: { ...SCHEDULE, notifications: { enabled: false, fastStart: { enabled: true }, fastEnd: { enabled: true } } },
      events: [],
      now: new Date('2026-05-02T20:00:00Z'),
      userHhmm: '20:00',
      userWeekday: 6,
    });
    expect(out).toEqual([]);
  });

  it('fires fastStart when daily rule start matches user-tz hhmm', () => {
    const out = computeFastingNotifications({
      schedule: SCHEDULE,
      events: [],
      now: new Date('2026-05-02T20:00:00Z'),
      userHhmm: '20:00',
      userWeekday: 6,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('fastStart');
  });

  it('fires fastEnd when daily rule end (start + duration) matches', () => {
    // Start 20:00 + 16h = 12:00 next day.
    const out = computeFastingNotifications({
      schedule: SCHEDULE,
      events: [],
      now: new Date('2026-05-03T12:00:00Z'),
      userHhmm: '12:00',
      userWeekday: 0,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('fastEnd');
  });

  it('skips fastStart when toggle is off', () => {
    const out = computeFastingNotifications({
      schedule: { ...SCHEDULE, notifications: { enabled: true, fastStart: { enabled: false }, fastEnd: { enabled: true } } },
      events: [],
      now: new Date('2026-05-02T20:00:00Z'),
      userHhmm: '20:00',
      userWeekday: 6,
    });
    expect(out).toEqual([]);
  });

  it('fires fastStart for a manual_start event in the current minute', () => {
    const startAt = new Date('2026-05-02T15:00:00Z');
    const events = [{
      _id: 'm1',
      source: 'manual_start',
      actualStartAt: startAt,
      actualEndAt: null,
      plannedStartAt: startAt,
      plannedEndAt: new Date('2026-05-03T07:00:00Z'),
    }];
    const out = computeFastingNotifications({
      schedule: SCHEDULE,
      events,
      now: startAt,
      userHhmm: '15:00',
      userWeekday: 6,
    });
    expect(out.some((t) => t.kind === 'fastStart')).toBe(true);
  });

  it('fires fastEnd for an active event whose plannedEnd matches now', () => {
    const startAt = new Date('2026-05-02T20:00:00Z');
    const plannedEnd = new Date('2026-05-03T12:00:00Z');
    const events = [{
      _id: 'a1',
      source: 'manual_start',
      actualStartAt: startAt,
      actualEndAt: null,
      plannedStartAt: startAt,
      plannedEndAt: plannedEnd,
    }];
    const out = computeFastingNotifications({
      schedule: SCHEDULE,
      events,
      now: plannedEnd,
      userHhmm: '12:00',
      userWeekday: 0,
    });
    expect(out.some((t) => t.kind === 'fastEnd')).toBe(true);
  });

  it('dedupes recurring + event hits at the same instant', () => {
    // Daily rule starts 20:00; an event already exists with actualStartAt
    // = 20:00. Helper should still emit one fastStart total.
    const startAt = new Date('2026-05-02T20:00:00Z');
    const out = computeFastingNotifications({
      schedule: SCHEDULE,
      events: [{
        _id: 'e1',
        source: 'scheduled',
        actualStartAt: startAt,
        actualEndAt: null,
        plannedStartAt: startAt,
        plannedEndAt: new Date('2026-05-03T12:00:00Z'),
      }],
      now: startAt,
      userHhmm: '20:00',
      userWeekday: 6,
    });
    const starts = out.filter((t) => t.kind === 'fastStart');
    expect(starts).toHaveLength(1);
  });

  it('lead-time fires fastStart 30 min before recurring rule start', () => {
    const schedule = {
      ...FASTING_ENABLED,
      notifications: {
        enabled: true,
        fastStart: { enabled: true, minutesBefore: 30 },
        fastEnd: { enabled: true, minutesBefore: 0 },
      },
    };
    // Fast starts at 20:00 → trigger at 19:30.
    const out = computeFastingNotifications({
      schedule,
      events: [],
      now: new Date('2026-05-02T19:30:00Z'),
      userHhmm: '19:30',
      userWeekday: 6,
    });
    const start = out.find((t) => t.kind === 'fastStart');
    expect(start).toBeDefined();
    expect(start.title).toBe('Fast starting soon');
    expect(start.body).toContain('30 min');
    // No notification at the actual start instant when lead-time > 0.
    const at = computeFastingNotifications({
      schedule,
      events: [],
      now: new Date('2026-05-02T20:00:00Z'),
      userHhmm: '20:00',
      userWeekday: 6,
    });
    expect(at.find((t) => t.kind === 'fastStart')).toBeUndefined();
  });

  it('lead-time fires fastEnd 1h before goal', () => {
    const schedule = {
      ...FASTING_ENABLED,
      notifications: {
        enabled: true,
        fastStart: { enabled: false, minutesBefore: 0 },
        fastEnd: { enabled: true, minutesBefore: 60 },
      },
    };
    // 20:00 + 16h = 12:00. Trigger 60 min earlier = 11:00.
    const out = computeFastingNotifications({
      schedule,
      events: [],
      now: new Date('2026-05-03T11:00:00Z'),
      userHhmm: '11:00',
      userWeekday: 0,
    });
    const end = out.find((t) => t.kind === 'fastEnd');
    expect(end).toBeDefined();
    expect(end.title).toBe('Fast ending soon');
  });

  it('lead-time wraps across midnight in HH:MM math', () => {
    // 60 min before 00:30 wraps to 23:30 the previous day.
    const schedule = {
      ...FASTING_ENABLED,
      dailyStartTime: '00:30',
      notifications: {
        enabled: true,
        fastStart: { enabled: true, minutesBefore: 60 },
        fastEnd: { enabled: false, minutesBefore: 0 },
      },
    };
    const out = computeFastingNotifications({
      schedule,
      events: [],
      now: new Date('2026-05-02T23:30:00Z'),
      userHhmm: '23:30',
      userWeekday: 6,
    });
    expect(out.find((t) => t.kind === 'fastStart')).toBeDefined();
  });

  it('lead-time on event-driven planned-end fires before goal', () => {
    const schedule = {
      ...FASTING_ENABLED,
      notifications: {
        enabled: true,
        fastStart: { enabled: false, minutesBefore: 0 },
        fastEnd: { enabled: true, minutesBefore: 30 },
      },
    };
    const startAt = new Date('2026-05-02T15:00:00Z');
    const plannedEnd = new Date('2026-05-03T07:00:00Z'); // 16h fast
    const events = [{
      _id: 'a1',
      source: 'manual_start',
      actualStartAt: startAt,
      actualEndAt: null,
      plannedStartAt: startAt,
      plannedEndAt: plannedEnd,
    }];
    // Trigger 30 min before 07:00 = 06:30.
    const out = computeFastingNotifications({
      schedule,
      events,
      now: new Date('2026-05-03T06:30:00Z'),
      userHhmm: '06:30',
      userWeekday: 0,
    });
    expect(out.find((t) => t.kind === 'fastEnd')).toBeDefined();
  });

  it('lead-time on a manual_start fastStart is suppressed (already started)', () => {
    // A manual-start event represents "the user tapped Start now" — there's
    // no future start instant to give a heads-up about. Skip pre-fast lead.
    const schedule = {
      ...FASTING_ENABLED,
      kind: 'none',
      notifications: {
        enabled: true,
        fastStart: { enabled: true, minutesBefore: 30 },
        fastEnd: { enabled: false, minutesBefore: 0 },
      },
    };
    const startAt = new Date('2026-05-02T15:00:00Z');
    const events = [{
      _id: 'm1',
      source: 'manual_start',
      actualStartAt: startAt,
      actualEndAt: null,
      plannedStartAt: startAt,
      plannedEndAt: new Date('2026-05-03T07:00:00Z'),
    }];
    // 30 min before startAt = 14:30.
    const out = computeFastingNotifications({
      schedule,
      events,
      now: new Date('2026-05-02T14:30:00Z'),
      userHhmm: '14:30',
      userWeekday: 6,
    });
    expect(out.find((t) => t.kind === 'fastStart')).toBeUndefined();
  });

  it('weekly rule only fires on selected weekday', () => {
    const schedule = {
      ...SCHEDULE,
      kind: 'weekly',
      weeklyRules: [{ weekday: 3, startTime: '20:00', durationMinutes: 16 * 60 }],
    };
    // Wednesday → fires.
    const wed = computeFastingNotifications({
      schedule,
      events: [],
      now: new Date('2026-05-06T20:00:00Z'),
      userHhmm: '20:00',
      userWeekday: 3,
    });
    expect(wed.some((t) => t.kind === 'fastStart')).toBe(true);

    // Friday → silent.
    const fri = computeFastingNotifications({
      schedule,
      events: [],
      now: new Date('2026-05-08T20:00:00Z'),
      userHhmm: '20:00',
      userWeekday: 5,
    });
    expect(fri).toEqual([]);
  });
});

describe('stageForElapsedMinutes', () => {
  it('walks through the fasting stages', () => {
    expect(stageForElapsedMinutes(0)).toBe('Fed');
    expect(stageForElapsedMinutes(5 * 60)).toBe('Catabolic');
    expect(stageForElapsedMinutes(13 * 60)).toBe('Fat-burning');
    expect(stageForElapsedMinutes(20 * 60)).toBe('Ketosis');
    expect(stageForElapsedMinutes(60 * 60)).toBe('Deep ketosis');
  });
});
