import mongoose from 'mongoose';

const foodLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  foodItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true },
  date: { type: Date, required: true },
  mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'], required: true },
  servingCount: { type: Number, required: true, default: 1 },
  // When an entry was created by logging a saved Meal template, we stamp its id
  // here so the diary UI can group those entries under a meal header. Weak ref:
  // if the template is later deleted, old log entries keep their data and just
  // lose the grouping.
  mealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meal', default: null },
  consumed: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

foodLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('FoodLog', foodLogSchema);
