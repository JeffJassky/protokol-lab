import mongoose from 'mongoose';

const foodItemSchema = new mongoose.Schema({
  // Owning user. Every FoodItem is scoped to a user — there are no globally
  // shared foods. Barcode imports from OpenFoodFacts are still attributed
  // to the user who scanned them. Set isCustom=true for manually-entered
  // foods (those count toward the customFoodItems plan cap); OFF barcode
  // imports leave isCustom=false so they don't burn the cap.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  isCustom: { type: Boolean, default: false },
  offBarcode: { type: String, default: null },
  name: { type: String, required: true },
  emoji: { type: String, default: '' },
  brand: { type: String, default: '' },
  servingSize: { type: String, default: '' },
  servingGrams: { type: Number, default: 100 },
  caloriesPer: { type: Number, required: true },
  proteinPer: { type: Number, default: 0 },
  fatPer: { type: Number, default: 0 },
  carbsPer: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Per-user dedup of OFF barcode imports — same barcode can exist for many
// users, but only once per user.
foodItemSchema.index({ userId: 1, offBarcode: 1 }, { sparse: true });
foodItemSchema.index({ userId: 1, name: 'text', brand: 'text' });
foodItemSchema.index({ userId: 1, isCustom: 1 });

export default mongoose.model('FoodItem', foodItemSchema);
