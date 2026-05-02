// Template seeding from a real user — verifies seedTemplateFromUser
// preserves data, rewrites refs, replaces a prior template, and supports
// the per-doc sanitize hook.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import User from '../src/models/User.js';
import FoodItem from '../src/models/FoodItem.js';
import FoodLog from '../src/models/FoodLog.js';
import DayNote from '../src/models/DayNote.js';
import { seedTemplateFromUser, findTemplate } from '../src/services/demo.js';

async function seedSourceUser() {
  const u = await User.create({ email: 'jeff@example.com', displayName: 'Jeff' });
  const fi = await FoodItem.create({ userId: u._id, name: 'Eggs', perServing: { calories: 80 } });
  await FoodLog.create({
    userId: u._id,
    foodItemId: fi._id,
    date: new Date(),
    mealType: 'breakfast',
    servingCount: 2,
  });
  await DayNote.create({ userId: u._id, date: new Date(), text: 'private personal note' });
  return u;
}

describe('seedTemplateFromUser', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => {
    await User.deleteMany({});
    await FoodItem.deleteMany({});
    await FoodLog.deleteMany({});
    await DayNote.deleteMany({});
  });

  it('creates an isDemoTemplate=true user with cloned data', async () => {
    const source = await seedSourceUser();
    const { template, totalDocs } = await seedTemplateFromUser(source._id);

    expect(template.isDemoTemplate).toBe(true);
    expect(totalDocs).toBeGreaterThan(0);

    const tpl = await findTemplate();
    expect(String(tpl._id)).toBe(String(template._id));

    expect(await FoodLog.countDocuments({ userId: template._id })).toBe(1);
    expect(await DayNote.countDocuments({ userId: template._id })).toBe(1);
  });

  it('rewrites foodItemId on cloned FoodLog', async () => {
    const source = await seedSourceUser();
    const { template } = await seedTemplateFromUser(source._id);
    const tplFI = await FoodItem.findOne({ userId: template._id });
    const tplLog = await FoodLog.findOne({ userId: template._id });
    expect(String(tplLog.foodItemId)).toBe(String(tplFI._id));
  });

  it('replaces existing template on re-seed', async () => {
    const source = await seedSourceUser();
    const first = await seedTemplateFromUser(source._id);
    const second = await seedTemplateFromUser(source._id);

    expect(String(second.template._id)).not.toBe(String(first.template._id));
    expect(await User.findById(first.template._id)).toBeNull();
    // Old template's child rows are gone.
    expect(await FoodLog.countDocuments({ userId: first.template._id })).toBe(0);
  });

  it('sanitize hook can scrub day notes', async () => {
    const source = await seedSourceUser();
    const { template } = await seedTemplateFromUser(source._id, {
      sanitize: (collection, doc) => {
        if (collection === 'DayNote') return { ...doc, text: 'PLACEHOLDER' };
        return doc;
      },
    });
    const note = await DayNote.findOne({ userId: template._id });
    expect(note.text).toBe('PLACEHOLDER');
    // Source untouched.
    const srcNote = await DayNote.findOne({ userId: source._id });
    expect(srcNote.text).toBe('private personal note');
  });

  it('sanitize returning null filters the doc out', async () => {
    const source = await seedSourceUser();
    const { template } = await seedTemplateFromUser(source._id, {
      sanitize: (collection, doc) => (collection === 'DayNote' ? null : doc),
    });
    expect(await DayNote.countDocuments({ userId: template._id })).toBe(0);
  });

  it('throws on missing source', async () => {
    const fakeId = '650000000000000000000000';
    await expect(seedTemplateFromUser(fakeId)).rejects.toThrow(/source user not found/);
  });
});
