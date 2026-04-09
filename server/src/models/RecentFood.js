import mongoose from 'mongoose';

const recentFoodSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  foodItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true },
  lastServingCount: { type: Number, default: 1 },
  lastMealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
  lastUsedAt: { type: Date, default: Date.now },
});

recentFoodSchema.index({ userId: 1, foodItemId: 1 }, { unique: true });
recentFoodSchema.index({ userId: 1, lastUsedAt: -1 });

export default mongoose.model('RecentFood', recentFoodSchema);
