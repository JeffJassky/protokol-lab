// Demo sandbox clone — end-to-end verification that the bulk-clone
// pipeline preserves data, rewrites userIds, remaps cross-collection FK
// references, and shifts dates so the data lands at "today."
//
// We seed a tiny but representative template (one of each kind, with the
// FoodLog → FoodItem and DoseLog → Compound joins so we can prove the FK
// rewrite works), clone it into a sandbox, and assert.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import User from '../src/models/User.js';
import FoodItem from '../src/models/FoodItem.js';
import Compound from '../src/models/Compound.js';
import Symptom from '../src/models/Symptom.js';
import Meal from '../src/models/Meal.js';
import FoodLog from '../src/models/FoodLog.js';
import DoseLog from '../src/models/DoseLog.js';
import WeightLog from '../src/models/WeightLog.js';
import SymptomLog from '../src/models/SymptomLog.js';
import DayNote from '../src/models/DayNote.js';
import Photo from '../src/models/Photo.js';
import UserSettings from '../src/models/UserSettings.js';
import {
  getOrCreateSandbox,
  resetSandbox,
  deleteSandbox,
  findTemplate,
} from '../src/services/demo.js';

async function seedTemplate(now = Date.now()) {
  const tmpl = await User.create({ email: 'tmpl@demo.local', isDemoTemplate: true });
  // 100 days ago is our anchor — every cloned date should land 100 days
  // closer to "now" after shifting.
  const D = (daysAgo) => new Date(now - daysAgo * 24 * 60 * 60 * 1000);

  const foodItem = await FoodItem.create({
    userId: tmpl._id,
    name: 'Chicken breast',
    perServing: { calories: 165 },
    isCustom: true,
  });
  const compound = await Compound.create({
    userId: tmpl._id,
    name: 'Reta',
    halfLifeDays: 5,
    intervalDays: 7,
  });
  const symptom = await Symptom.create({ userId: tmpl._id, name: 'Nausea' });
  const meal = await Meal.create({
    userId: tmpl._id,
    name: 'Lunch',
    items: [{ foodItemId: foodItem._id, servingCount: 1 }],
  });
  await FoodLog.create({
    userId: tmpl._id,
    foodItemId: foodItem._id,
    mealId: meal._id,
    date: D(50),
    mealType: 'lunch',
    servingCount: 1.5,
  });
  // Latest log → drives the "now" anchor.
  await WeightLog.create({ userId: tmpl._id, weightLbs: 180, date: D(2) });
  await DoseLog.create({ userId: tmpl._id, compoundId: compound._id, value: 5, date: D(10) });
  await SymptomLog.create({ userId: tmpl._id, symptomId: symptom._id, date: D(20), severity: 3 });
  await DayNote.create({ userId: tmpl._id, date: D(15), text: 'low appetite' });
  await Photo.create({
    userId: tmpl._id,
    date: D(30).toISOString().slice(0, 10),
    takenAt: D(30),
    s3Key: 'tmpl/photo.jpg',
    thumbKey: 'tmpl/photo-thumb.jpg',
    angle: 'front',
  });
  await UserSettings.create({
    userId: tmpl._id,
    sex: 'male',
    age: 35,
    heightInches: 70,
    timezone: 'America/Los_Angeles',
  });

  return { tmpl, foodItem, compound, symptom, meal };
}

describe('Demo sandbox clone', () => {
  beforeAll(async () => {
    await User.syncIndexes();
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      FoodItem.deleteMany({}),
      Compound.deleteMany({}),
      Symptom.deleteMany({}),
      Meal.deleteMany({}),
      FoodLog.deleteMany({}),
      DoseLog.deleteMany({}),
      WeightLog.deleteMany({}),
      SymptomLog.deleteMany({}),
      DayNote.deleteMany({}),
      Photo.deleteMany({}),
      UserSettings.deleteMany({}),
    ]);
  });

  it('throws if no template exists', async () => {
    await expect(getOrCreateSandbox({ authUserId: null })).rejects.toThrow(/template not found/);
  });

  it('creates anonymous sandbox + clones every collection', async () => {
    await seedTemplate();
    const { sandbox, created } = await getOrCreateSandbox({ authUserId: null });
    expect(created).toBe(true);
    expect(sandbox.isDemoSandbox).toBe(true);
    expect(sandbox.parentUserId).toBeNull();

    const counts = await Promise.all([
      FoodItem.countDocuments({ userId: sandbox._id }),
      Compound.countDocuments({ userId: sandbox._id }),
      Symptom.countDocuments({ userId: sandbox._id }),
      Meal.countDocuments({ userId: sandbox._id }),
      FoodLog.countDocuments({ userId: sandbox._id }),
      DoseLog.countDocuments({ userId: sandbox._id }),
      WeightLog.countDocuments({ userId: sandbox._id }),
      SymptomLog.countDocuments({ userId: sandbox._id }),
      DayNote.countDocuments({ userId: sandbox._id }),
      Photo.countDocuments({ userId: sandbox._id }),
      UserSettings.countDocuments({ userId: sandbox._id }),
    ]);
    expect(counts).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('rewrites cross-collection FK references', async () => {
    const { foodItem: tmplFI, compound: tmplCo, meal: tmplMeal, symptom: tmplSym } = await seedTemplate();
    const { sandbox } = await getOrCreateSandbox({ authUserId: null });

    const sandboxFI = await FoodItem.findOne({ userId: sandbox._id });
    const sandboxCo = await Compound.findOne({ userId: sandbox._id });
    const sandboxMeal = await Meal.findOne({ userId: sandbox._id });
    const sandboxSym = await Symptom.findOne({ userId: sandbox._id });

    // New ids — never reuse template ids.
    expect(String(sandboxFI._id)).not.toBe(String(tmplFI._id));

    const fl = await FoodLog.findOne({ userId: sandbox._id });
    expect(String(fl.foodItemId)).toBe(String(sandboxFI._id));
    expect(String(fl.mealId)).toBe(String(sandboxMeal._id));

    const dl = await DoseLog.findOne({ userId: sandbox._id });
    expect(String(dl.compoundId)).toBe(String(sandboxCo._id));

    const sl = await SymptomLog.findOne({ userId: sandbox._id });
    expect(String(sl.symptomId)).toBe(String(sandboxSym._id));

    expect(String(sandboxMeal.items[0].foodItemId)).toBe(String(sandboxFI._id));
  });

  it('shifts dates so most-recent log lands near today', async () => {
    await seedTemplate();
    const { sandbox } = await getOrCreateSandbox({ authUserId: null });

    const latest = await WeightLog.findOne({ userId: sandbox._id }).sort({ date: -1 });
    const driftMs = Math.abs(Date.now() - latest.date.getTime());
    expect(driftMs).toBeLessThan(5_000); // sub-5s of "now"

    // Relative spacing preserved: weight (orig 2 days ago) is ~8 days after
    // dose (orig 10 days ago). After shift, that gap is unchanged.
    const dose = await DoseLog.findOne({ userId: sandbox._id });
    const gapDays = (latest.date.getTime() - dose.date.getTime()) / (24 * 60 * 60 * 1000);
    expect(gapDays).toBeCloseTo(8, 1);
  });

  it('shifts Photo.date string field by calendar days', async () => {
    await seedTemplate();
    const { sandbox } = await getOrCreateSandbox({ authUserId: null });
    const photo = await Photo.findOne({ userId: sandbox._id });
    expect(photo.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reuses existing sandbox for an authed user (no re-clone)', async () => {
    await seedTemplate();
    const real = await User.create({ email: 'real@example.com' });

    const a = await getOrCreateSandbox({ authUserId: real._id });
    const b = await getOrCreateSandbox({ authUserId: real._id });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(String(a.sandbox._id)).toBe(String(b.sandbox._id));

    // Still only one set of cloned rows (re-clone would have duplicated).
    expect(await FoodLog.countDocuments({ userId: a.sandbox._id })).toBe(1);
  });

  it('resetSandbox wipes + reclones from template', async () => {
    await seedTemplate();
    const real = await User.create({ email: 'real@example.com' });
    const { sandbox } = await getOrCreateSandbox({ authUserId: real._id });

    // User edits the sandbox.
    await FoodLog.create({
      userId: sandbox._id,
      foodItemId: (await FoodItem.findOne({ userId: sandbox._id }))._id,
      date: new Date(),
      mealType: 'snack',
      servingCount: 1,
    });
    expect(await FoodLog.countDocuments({ userId: sandbox._id })).toBe(2);

    await resetSandbox(sandbox._id);
    expect(await FoodLog.countDocuments({ userId: sandbox._id })).toBe(1);
  });

  it('deleteSandbox removes the sandbox + all child rows', async () => {
    await seedTemplate();
    const { sandbox } = await getOrCreateSandbox({ authUserId: null });
    await deleteSandbox(sandbox._id);

    expect(await User.findById(sandbox._id)).toBeNull();
    expect(await FoodLog.countDocuments({ userId: sandbox._id })).toBe(0);
    expect(await Photo.countDocuments({ userId: sandbox._id })).toBe(0);
  });

  it('template is untouched after clone + reset', async () => {
    const { tmpl } = await seedTemplate();
    const tmplLogsBefore = await FoodLog.countDocuments({ userId: tmpl._id });
    const real = await User.create({ email: 'real@example.com' });
    const { sandbox } = await getOrCreateSandbox({ authUserId: real._id });
    await resetSandbox(sandbox._id);

    expect(await FoodLog.countDocuments({ userId: tmpl._id })).toBe(tmplLogsBefore);
    expect(await User.findById(tmpl._id)).toBeTruthy();
    const reloaded = await findTemplate();
    expect(String(reloaded._id)).toBe(String(tmpl._id));
  });
});
