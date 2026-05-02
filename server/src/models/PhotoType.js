import mongoose from 'mongoose';

// User-tracked photo categorization. Two flavors:
//   - presets (`isPreset: true`) seeded from shared/photoTypePresets.js on
//     first fetch. Disabling a preset hides its slot in the capture UI but
//     existing photos keep their reference. Deleting a preset is forbidden.
//   - customs created by the user (skin-condition tracking, outfit shots,
//     etc.). Deletable, but cascade-deletes their photos.
//
// Photos reference this model via Photo.photoTypeId. The legacy `angle`
// string field on Photo is retained during the migration window only; once
// the migration script has been run in every environment it can be dropped.
const photoTypeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    isPreset: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

photoTypeSchema.index({ userId: 1, key: 1 }, { unique: true });

export default mongoose.model('PhotoType', photoTypeSchema);
