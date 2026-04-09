import mongoose from 'mongoose';

const userSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  sex: { type: String, enum: ['male', 'female'], required: true },
  heightInches: { type: Number, required: true },
  currentWeightLbs: { type: Number, required: true },
  goalWeightLbs: { type: Number },
  targets: {
    calories: { type: Number, required: true },
    proteinGrams: { type: Number, required: true },
    fatGrams: { type: Number, required: true },
    carbsGrams: { type: Number, required: true },
  },
  updatedAt: { type: Date, default: Date.now },
});

userSettingsSchema.pre('save', function () {
  this.updatedAt = new Date();
});

export default mongoose.model('UserSettings', userSettingsSchema);
