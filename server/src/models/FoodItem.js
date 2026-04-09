import mongoose from 'mongoose';

const foodItemSchema = new mongoose.Schema({
  offBarcode: { type: String, default: null },
  name: { type: String, required: true },
  brand: { type: String, default: '' },
  servingSize: { type: String, default: '' },
  servingGrams: { type: Number, default: 100 },
  caloriesPer: { type: Number, required: true },
  proteinPer: { type: Number, default: 0 },
  fatPer: { type: Number, default: 0 },
  carbsPer: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

foodItemSchema.index({ offBarcode: 1 }, { sparse: true });
foodItemSchema.index({ name: 'text', brand: 'text' });

export default mongoose.model('FoodItem', foodItemSchema);
