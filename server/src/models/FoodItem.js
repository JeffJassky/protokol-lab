import mongoose from 'mongoose';
import { NUTRIENT_KEYS } from '../../../shared/logging/nutrients.js';

// perServing nutrient subdoc — every field optional Number. We only set
// keys that the source provided so daily totals can distinguish "0 calcium"
// from "calcium unknown".
const perServingSchema = new mongoose.Schema(
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, { type: Number }])),
  { _id: false },
);

const foodItemSchema = new mongoose.Schema({
  // Owning user. Every FoodItem is scoped to a user — there are no globally
  // shared foods. Barcode imports from OpenFoodFacts are still attributed
  // to the user who scanned them. Set isCustom=true for manually-entered
  // foods (those count toward the customFoodItems plan cap); OFF barcode
  // imports leave isCustom=false so they don't burn the cap.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  isCustom: { type: Boolean, default: false },
  offBarcode: { type: String, default: null },
  usdaFdcId: { type: String, default: null },

  name: { type: String, required: true },
  emoji: { type: String, default: '' },
  brand: { type: String, default: '' },

  // Serving size — three representations because each has a use:
  //   servingSize     human label shown in UI ("1 can (330 ml)")
  //   servingAmount   numeric value (330)
  //   servingUnit     'g' or 'ml'
  //   servingKnown    false when source had no serving info; UI prompts user to set portion
  servingSize: { type: String, default: '' },
  servingAmount: { type: Number, default: null },
  servingUnit: { type: String, enum: ['g', 'ml', null], default: null },
  servingKnown: { type: Boolean, default: false },

  // All nutrient values are per one serving (not per 100g). Multiply by
  // FoodLog.servingCount when aggregating.
  perServing: { type: perServingSchema, default: () => ({}) },

  // Provenance — drives "data quality" badges in the UI.
  //   nutrientSource    where macros/micros came from
  //   nutrientCoverage  how complete the source was
  nutrientSource: {
    type: String,
    enum: ['manual', 'openfoodfacts', 'usda_branded', 'usda_foundation', 'usda_sr', 'usda_fndds', 'agent', null],
    default: null,
  },
  nutrientCoverage: {
    type: String,
    enum: ['label_only', 'lab_analyzed', 'partial', 'macros_only', null],
    default: null,
  },

  createdAt: { type: Date, default: Date.now },
});

// Per-user dedup of OFF barcode imports — same barcode can exist for many
// users, but only once per user.
foodItemSchema.index({ userId: 1, offBarcode: 1 }, { sparse: true });
foodItemSchema.index({ userId: 1, usdaFdcId: 1 }, { sparse: true });
foodItemSchema.index({ userId: 1, name: 'text', brand: 'text' });
foodItemSchema.index({ userId: 1, isCustom: 1 });

export default mongoose.model('FoodItem', foodItemSchema);
