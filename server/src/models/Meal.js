import mongoose from 'mongoose';

const mealItemSchema = new mongoose.Schema(
  {
    foodItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true },
    servingCount: { type: Number, required: true, default: 1 },
  },
  { _id: true },
);

const mealSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    emoji: { type: String, default: '' },
    items: { type: [mealItemSchema], default: [] },
    lastLoggedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

mealSchema.index({ userId: 1, name: 1 });

export default mongoose.model('Meal', mealSchema);
