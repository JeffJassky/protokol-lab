import mongoose from 'mongoose';

const photoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  takenAt: { type: Date, default: Date.now },
  // Reference to a user-defined PhotoType. New photos always populate this;
  // legacy rows backfill via scripts/migrate-photo-angle-to-photo-type.js.
  photoTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhotoType', default: null },
  // DEPRECATED: legacy free-text pose. Retained only so the migration script
  // can read pre-cutover rows. Any new write goes through photoTypeId. Once
  // the migration has been run in every environment, drop this field along
  // with the script.
  angle: { type: String, enum: ['front', 'side', 'back', 'other'], default: 'other' },
  s3Key: { type: String, required: true },
  thumbKey: { type: String, required: true },
  contentType: { type: String, default: 'image/jpeg' },
  width: { type: Number },
  height: { type: Number },
  bytes: { type: Number },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

photoSchema.index({ userId: 1, date: -1 });
photoSchema.index({ userId: 1, takenAt: -1 });
photoSchema.index({ userId: 1, photoTypeId: 1 });

export default mongoose.model('Photo', photoSchema);
