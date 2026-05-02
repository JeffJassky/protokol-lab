import mongoose from 'mongoose';

// One value per (user, metric, date). Setting the same combo twice updates
// the value rather than creating a duplicate; unsetting routes through a
// DELETE that removes the row entirely.
const metricLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metricId: { type: mongoose.Schema.Types.ObjectId, ref: 'Metric', required: true },
    date: { type: Date, required: true },
    // Always in the dimension's canonical unit. Conversion happens at the
    // display/input boundary so server-side math (trends, exports) stays unit-
    // free.
    value: { type: Number, required: true },
  },
  { timestamps: true },
);

metricLogSchema.index({ userId: 1, metricId: 1, date: 1 }, { unique: true });
metricLogSchema.index({ userId: 1, date: 1 });

export default mongoose.model('MetricLog', metricLogSchema);
