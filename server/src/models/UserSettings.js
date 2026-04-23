import mongoose from 'mongoose';

const userSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  sex: { type: String, enum: ['male', 'female'], required: true },
  heightInches: { type: Number, required: true },
  currentWeightLbs: { type: Number, required: true },
  goalWeightLbs: { type: Number },
  bmr: { type: Number },
  targets: {
    calories: { type: Number, required: true },
    proteinGrams: { type: Number, required: true },
    fatGrams: { type: Number, required: true },
    carbsGrams: { type: Number, required: true },
  },
  // IANA timezone ("America/Los_Angeles"). Detected from the browser on
  // first save; the reminder scheduler formats HH:mm in this zone so a user
  // who travels still gets their 8am reminder at local 8am.
  timezone: { type: String, default: 'UTC' },
  // Evening (or whenever) "did you track today?" nudge. Skipped when the
  // user already logged a weight / meal / symptom today.
  trackReminder: {
    enabled: { type: Boolean, default: false },
    time: { type: String, default: '20:00' },
  },
  updatedAt: { type: Date, default: Date.now },
});

userSettingsSchema.pre('save', function () {
  this.updatedAt = new Date();
});

export default mongoose.model('UserSettings', userSettingsSchema);
