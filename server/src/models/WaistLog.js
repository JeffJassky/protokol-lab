// DEPRECATED: WaistLog has been replaced by the unified Metric/MetricLog
// system (see shared/metricPresets.js → key 'waist'). This file is retained
// only so the migration script (`scripts/migrate-waist-to-metrics.js`) can
// still read legacy rows. Do not import from app code or routes — none
// remain. Once every environment has been migrated, delete this file along
// with the migration script.

import mongoose from 'mongoose';

const waistLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  waistInches: { type: Number, required: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

waistLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('WaistLog', waistLogSchema);
