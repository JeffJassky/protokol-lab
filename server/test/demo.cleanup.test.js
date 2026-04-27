// Demo cleanup job — verifies anon/authed TTLs and that the template is
// untouched. We invoke runDemoCleanup() directly rather than booting Agenda;
// the scheduler wiring is straightforward and adds no behavior we'd test.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import User from '../src/models/User.js';
import FoodLog from '../src/models/FoodLog.js';
import FoodItem from '../src/models/FoodItem.js';
import { runDemoCleanup } from '../src/services/scheduler.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function mkSandbox({ parentUserId = null, lastActiveAt }) {
  const sb = await User.create({
    email: `sb-${Math.random()}@demo.local`,
    isDemoSandbox: true,
    parentUserId,
    lastActiveAt,
  });
  // Add one child row so we can assert cascade.
  const fi = await FoodItem.create({ userId: sb._id, name: 'X', caloriesPer: 100 });
  await FoodLog.create({
    userId: sb._id,
    foodItemId: fi._id,
    date: new Date(),
    mealType: 'snack',
    servingCount: 1,
  });
  return sb;
}

describe('runDemoCleanup', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => {
    await User.deleteMany({});
    await FoodLog.deleteMany({});
    await FoodItem.deleteMany({});
  });

  it('deletes anon sandboxes idle > 24h, keeps fresh ones', async () => {
    const stale = await mkSandbox({ lastActiveAt: new Date(Date.now() - 25 * HOUR) });
    const fresh = await mkSandbox({ lastActiveAt: new Date(Date.now() - 5 * HOUR) });

    const r = await runDemoCleanup();
    expect(r.anonDeleted).toBe(1);

    expect(await User.findById(stale._id)).toBeNull();
    expect(await User.findById(fresh._id)).toBeTruthy();
    expect(await FoodLog.countDocuments({ userId: stale._id })).toBe(0);
    expect(await FoodLog.countDocuments({ userId: fresh._id })).toBe(1);
  });

  it('deletes authed sandboxes idle > 30d, keeps fresh ones', async () => {
    const owner = await User.create({ email: 'real@example.com' });
    const stale = await mkSandbox({
      parentUserId: owner._id,
      lastActiveAt: new Date(Date.now() - 31 * DAY),
    });
    await User.updateOne({ _id: owner._id }, { $set: { activeProfileId: stale._id } });
    const fresh = await mkSandbox({
      parentUserId: owner._id,
      lastActiveAt: new Date(Date.now() - 5 * DAY),
    });

    const r = await runDemoCleanup();
    expect(r.authedDeleted).toBe(1);

    expect(await User.findById(stale._id)).toBeNull();
    expect(await User.findById(fresh._id)).toBeTruthy();

    // Parent's activeProfileId is cleared so the next request doesn't deref a dead pointer.
    const reloaded = await User.findById(owner._id);
    expect(reloaded.activeProfileId).toBeNull();
  });

  it('does not touch real users or templates', async () => {
    const realUser = await User.create({ email: 'r@example.com' });
    const template = await User.create({ email: 't@demo.local', isDemoTemplate: true });

    await runDemoCleanup();

    expect(await User.findById(realUser._id)).toBeTruthy();
    expect(await User.findById(template._id)).toBeTruthy();
  });

  it('reaps lastActiveAt=null sandboxes older than the anon TTL', async () => {
    // Sandbox created and abandoned mid-clone (no lastActiveAt ever set).
    const orphan = await User.create({
      email: 'orphan@demo.local',
      isDemoSandbox: true,
      lastActiveAt: null,
      createdAt: new Date(Date.now() - 25 * HOUR),
    });
    await runDemoCleanup();
    expect(await User.findById(orphan._id)).toBeNull();
  });
});
