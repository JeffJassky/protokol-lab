import mongoose from 'mongoose';

// One dose entry. As of the canonical-compound migration, the dose can
// reference EITHER:
//   - a custom user-defined compound via `compoundId` (existing path), OR
//   - a canonical GLP-1 in core's PEPTIDE_CATALOG via `coreInterventionKey`.
//
// Exactly one of those two fields is set per row. The pre-save validator
// enforces the invariant so a stray write can't create an ambiguous row.
//
// `value` is in the compound's doseUnit. Custom rows derive that from
// the Compound row; canonical rows pull from core's catalog. We don't
// normalize across compounds — mg vs mcg vs iu are kept native so PK
// math stays sane.
const doseLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  compoundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Compound', default: null },
  // Canonical reference — see core's PEPTIDE_CATALOG. Examples:
  // 'tirzepatide', 'semaglutide', 'liraglutide', 'dulaglutide',
  // 'semaglutide_oral', 'retatrutide'.
  coreInterventionKey: { type: String, default: null, trim: true },
  value: { type: Number, required: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Exactly-one constraint. Mongoose runs this on save() and on
// findOneAndUpdate when runValidators is set; routes that bulk-insert
// must call this manually before insertMany. Throwing-style pre-hook
// (no `next` arg) is the supported pattern in current Mongoose; the
// callback-style signature triggers "next is not a function" in v9.
doseLogSchema.pre('validate', function () {
  const hasCustom = !!this.compoundId;
  const hasCanonical = !!(this.coreInterventionKey && this.coreInterventionKey.length);
  if (hasCustom === hasCanonical) {
    throw new Error(
      'DoseLog must reference exactly one of compoundId or coreInterventionKey',
    );
  }
});

doseLogSchema.index({ userId: 1, compoundId: 1, date: -1 });
doseLogSchema.index({ userId: 1, coreInterventionKey: 1, date: -1 });
doseLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('DoseLog', doseLogSchema);
