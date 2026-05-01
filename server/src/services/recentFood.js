import RecentFood from '../models/RecentFood.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('recentFood');

const RECENTS_CAP = 50;

export async function touchRecent(userId, foodItemId, servingCount, mealType) {
  if (!userId || !foodItemId) return;
  await RecentFood.findOneAndUpdate(
    { userId, foodItemId },
    { lastServingCount: servingCount, lastMealType: mealType, lastUsedAt: new Date() },
    { upsert: true },
  );

  const count = await RecentFood.countDocuments({ userId });
  if (count > RECENTS_CAP) {
    const oldest = await RecentFood.find({ userId })
      .sort({ lastUsedAt: 1 })
      .limit(count - RECENTS_CAP)
      .select('_id');
    await RecentFood.deleteMany({ _id: { $in: oldest.map((r) => r._id) } });
    log.debug({ userId: String(userId), pruned: count - RECENTS_CAP }, 'recents pruned');
  }
}
