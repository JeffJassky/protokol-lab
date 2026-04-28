// User cascade-delete behaviour (models/User.js pre('deleteOne') hook).
//
// What the cascade promises:
//   - doc.deleteOne() removes every row in every userId-referencing collection
//   - child sandboxes (parentUserId → this user) are recursively deleted with
//     their own owned data
//   - Stripe customer (if linked) is deleted via stripe.customers.del()
//   - findByIdAndDelete / findOneAndDelete also cascade (mirrored hook)
//   - re-running on an already-deleted user is a no-op
//
// We insert raw docs directly via mongoose.connection.collection(name) so the
// test doesn't have to satisfy every model's schema validation. The cascade
// uses deleteMany with a userId filter, which doesn't care about doc shape.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
// Import the barrel so every model is registered before the cascade runs.
import '../src/models/index.js';
import User, { CASCADE_COLLECTIONS } from '../src/models/User.js';
import { deleteUser } from '../src/services/userDeletion.js';
import { stripe } from '../src/services/stripe.js';

function collFor(modelName) {
  // mongoose pluralizes model names for collection names.
  const Model = mongoose.model(modelName);
  return mongoose.connection.collection(Model.collection.collectionName);
}

async function seedAllCollections(userId) {
  for (const name of CASCADE_COLLECTIONS) {
    await collFor(name).insertOne({ userId, _seed: true });
  }
}

async function countAllForUser(userId) {
  const out = {};
  for (const name of CASCADE_COLLECTIONS) {
    out[name] = await collFor(name).countDocuments({ userId });
  }
  return out;
}

describe('User cascade delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes user + every userId-referencing row across all 21 collections', async () => {
    const user = await User.create({ email: 'cascade@example.com' });
    await seedAllCollections(user._id);

    const before = await countAllForUser(user._id);
    expect(Object.values(before).every((n) => n === 1)).toBe(true);

    const res = await deleteUser(user._id);
    expect(res).toEqual({ deleted: true });

    expect(await User.findById(user._id)).toBeNull();
    const after = await countAllForUser(user._id);
    for (const [name, n] of Object.entries(after)) {
      expect(n, `${name} should have 0 rows after cascade`).toBe(0);
    }
  });

  it('does not touch other users\' data', async () => {
    const target = await User.create({ email: 'target@example.com' });
    const other = await User.create({ email: 'other@example.com' });
    await seedAllCollections(target._id);
    await seedAllCollections(other._id);

    await deleteUser(target._id);

    expect(await User.findById(other._id)).not.toBeNull();
    const otherCounts = await countAllForUser(other._id);
    for (const [name, n] of Object.entries(otherCounts)) {
      expect(n, `${name} should still have other user's row`).toBe(1);
    }
  });

  it('recursively deletes child sandboxes (parentUserId chain) and their data', async () => {
    const parent = await User.create({ email: 'parent@example.com' });
    const sandbox = await User.create({
      email: 'sandbox@demo.local',
      isDemoSandbox: true,
      parentUserId: parent._id,
    });
    await seedAllCollections(parent._id);
    await seedAllCollections(sandbox._id);

    await deleteUser(parent._id);

    expect(await User.findById(parent._id)).toBeNull();
    expect(await User.findById(sandbox._id)).toBeNull();

    // Sandbox-owned data should also be gone.
    const sandboxCounts = await countAllForUser(sandbox._id);
    for (const [name, n] of Object.entries(sandboxCounts)) {
      expect(n, `${name} should have 0 rows for deleted sandbox`).toBe(0);
    }
  });

  it('deletes Stripe customer when stripeCustomerId is set', async () => {
    const user = await User.create({
      email: 'paid@example.com',
      stripeCustomerId: 'cus_test_123',
    });

    await deleteUser(user._id);

    expect(stripe.customers.del).toHaveBeenCalledWith('cus_test_123');
  });

  it('skips Stripe call when no stripeCustomerId', async () => {
    const user = await User.create({ email: 'free@example.com' });

    await deleteUser(user._id);

    expect(stripe.customers.del).not.toHaveBeenCalled();
  });

  it('treats Stripe resource_missing as success (idempotent)', async () => {
    stripe.customers.del.mockImplementationOnce(async () => {
      const err = new Error('No such customer');
      err.code = 'resource_missing';
      throw err;
    });
    const user = await User.create({
      email: 'gone@example.com',
      stripeCustomerId: 'cus_already_deleted',
    });

    await expect(deleteUser(user._id)).resolves.toEqual({ deleted: true });
  });

  it('propagates non-recoverable Stripe errors so deletion can be retried', async () => {
    stripe.customers.del.mockImplementationOnce(async () => {
      const err = new Error('rate limited');
      err.code = 'rate_limit';
      throw err;
    });
    const user = await User.create({
      email: 'retry@example.com',
      stripeCustomerId: 'cus_x',
    });

    await expect(deleteUser(user._id)).rejects.toThrow('rate limited');
    // User row stays so a retry is meaningful.
    expect(await User.findById(user._id)).not.toBeNull();
  });

  it('is idempotent — deleting twice is safe', async () => {
    const user = await User.create({ email: 'twice@example.com' });
    await seedAllCollections(user._id);

    const first = await deleteUser(user._id);
    const second = await deleteUser(user._id);

    expect(first).toEqual({ deleted: true });
    expect(second).toEqual({ deleted: false });
  });

  it('cascades when called via findByIdAndDelete (mirrored hook)', async () => {
    const user = await User.create({ email: 'find@example.com' });
    await seedAllCollections(user._id);

    await User.findByIdAndDelete(user._id);

    expect(await User.findById(user._id)).toBeNull();
    const after = await countAllForUser(user._id);
    for (const [name, n] of Object.entries(after)) {
      expect(n, `${name} should be cascaded via findByIdAndDelete`).toBe(0);
    }
  });
});
