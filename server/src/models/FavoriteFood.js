import mongoose from 'mongoose';

const favoriteFoodSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  foodItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true },
  defaultServingCount: { type: Number, default: 1 },
  defaultMealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'], default: null },
  createdAt: { type: Date, default: Date.now },
});

favoriteFoodSchema.index({ userId: 1, foodItemId: 1 }, { unique: true });

export default mongoose.model('FavoriteFood', favoriteFoodSchema);
