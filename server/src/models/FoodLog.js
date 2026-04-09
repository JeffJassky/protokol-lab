import mongoose from 'mongoose';

const foodLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  foodItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true },
  date: { type: Date, required: true },
  mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'], required: true },
  servingCount: { type: Number, required: true, default: 1 },
  createdAt: { type: Date, default: Date.now },
});

foodLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('FoodLog', foodLogSchema);
