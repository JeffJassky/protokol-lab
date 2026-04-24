import mongoose from 'mongoose';

export const TICKET_STATUSES = ['open', 'in_progress', 'closed'];

const attachmentSchema = new mongoose.Schema(
  {
    s3Key: { type: String, required: true },
    filename: { type: String, required: true, trim: true, maxlength: 200 },
    contentType: { type: String, default: 'application/octet-stream' },
    bytes: { type: Number, default: 0 },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['user', 'admin'], required: true },
  authorEmail: { type: String, required: true },
  authorDisplayName: { type: String, default: null },
  body: { type: String, required: true, maxlength: 10000 },
  attachments: { type: [attachmentSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userEmail: { type: String, required: true },
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 10000 },
  status: { type: String, enum: TICKET_STATUSES, default: 'open', index: true },
  attachments: { type: [attachmentSchema], default: [] },
  messages: { type: [messageSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
});

ticketSchema.index({ status: 1, updatedAt: -1 });
ticketSchema.index({ subject: 'text', description: 'text', userEmail: 'text' });

export default mongoose.model('SupportTicket', ticketSchema);
