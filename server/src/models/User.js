import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  passwordResetTokenHash: { type: String, default: null },
  passwordResetExpiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ passwordResetTokenHash: 1 });

export default mongoose.model('User', userSchema);
