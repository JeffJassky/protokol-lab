// Single entry point for user deletion. Loads the User doc and calls
// doc.deleteOne(), which fires the cascade hook in models/User.js.
//
// Use this anywhere production code needs to delete a user. Direct
// User.deleteOne({ _id }) / User.deleteMany() / User.findByIdAndDelete()
// either skip the cascade (query-level deleteOne/deleteMany) or are slower
// (findByIdAndDelete is hooked but does an extra round-trip). Centralizing
// here also keeps the call sites greppable for audits.
//
// Idempotent: deleting a user that doesn't exist is a no-op.

import User from '../models/User.js';

export async function deleteUser(userId) {
  const user = await User.findById(userId);
  if (!user) return { deleted: false };
  await user.deleteOne();
  return { deleted: true };
}
