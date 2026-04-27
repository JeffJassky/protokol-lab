// Demo mode — User model write guard.
//
// The canonical template (isDemoTemplate=true) is the read-only source of
// truth that every demo sandbox is cloned from. Stray writes against it
// would corrupt every future visitor's experience, so the model rejects
// them at the schema layer. The application-layer middleware is the
// primary guard; these hooks are belt-and-suspenders.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import User from '../src/models/User.js';

async function makeTemplate() {
  return User.create({ email: `tmpl-${Date.now()}-${Math.random()}@example.com`, isDemoTemplate: true });
}

describe('User — demo template write guard', () => {
  beforeAll(async () => {
    // Ensure indexes (partial unique on isDemoTemplate) are built before tests
    // run. Mongoose builds asynchronously; tests can race the build.
    await User.syncIndexes();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('allows initial insert of a template row', async () => {
    const tmpl = await makeTemplate();
    expect(tmpl.isDemoTemplate).toBe(true);
  });

  it('rejects .save() on an existing template row', async () => {
    const tmpl = await makeTemplate();
    tmpl.displayName = 'tampered';
    await expect(tmpl.save()).rejects.toThrow(/read-only/);
  });

  it('rejects updateOne targeting a template by filter', async () => {
    await makeTemplate();
    await expect(
      User.updateOne({ isDemoTemplate: true }, { $set: { displayName: 'x' } }),
    ).rejects.toThrow(/read-only/);
  });

  it('rejects findOneAndUpdate that would promote an existing row to template', async () => {
    const u = await User.create({ email: 'real@example.com' });
    await expect(
      User.findOneAndUpdate({ _id: u._id }, { $set: { isDemoTemplate: true } }),
    ).rejects.toThrow(/Cannot promote/);
  });

  it('enforces single-template uniqueness via partial index', async () => {
    await makeTemplate();
    await expect(makeTemplate()).rejects.toThrow(/duplicate key|E11000/);
  });

  it('does not affect normal users', async () => {
    const a = await User.create({ email: 'a@example.com' });
    a.displayName = 'Alice';
    await a.save();
    expect(a.displayName).toBe('Alice');
  });
});
