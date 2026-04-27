import { Router } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import SupportTicket, { TICKET_STATUSES } from '../models/SupportTicket.js';
import FeatureRequest, { FEATURE_STATUSES } from '../models/FeatureRequest.js';
import { presignPut, presignGet, S3_CONFIGURED } from '../services/s3.js';
import {
  sendTicketCreatedUserEmail,
  sendTicketAdminNotifyEmail,
} from '../services/email.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('support');
const router = Router();

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS = 5;
const ALLOWED_CONTENT_TYPE = /^(image\/(png|jpeg|jpg|gif|webp|heic)|application\/pdf|text\/plain)$/i;

function displayNameFor(user) {
  if (user?.displayName) return user.displayName;
  const email = user?.email || '';
  return email.split('@')[0] || 'User';
}

function sanitizeFilename(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

function buildTicketAttachmentKey(ticketId, filename) {
  const rand = crypto.randomBytes(6).toString('hex');
  return `support/tickets/${ticketId}/${rand}-${sanitizeFilename(filename)}`;
}

async function withSignedAttachments(ticket) {
  const obj = ticket.toObject ? ticket.toObject() : ticket;
  const sign = async (arr) =>
    Promise.all(
      (arr || []).map(async (a) => ({
        ...a,
        url: S3_CONFIGURED ? await presignGet(a.s3Key).catch(() => null) : null,
      })),
    );
  obj.attachments = await sign(obj.attachments);
  obj.messages = await Promise.all(
    (obj.messages || []).map(async (m) => ({ ...m, attachments: await sign(m.attachments) })),
  );
  return obj;
}

// ---------------------------------------------------------------------------
// TICKETS
// ---------------------------------------------------------------------------

router.post('/tickets', async (req, res) => {
  const rlog = req.log || log;
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';

  if (!subject || subject.length > 200) {
    return res.status(400).json({ error: 'Subject required (max 200)' });
  }
  if (!description || description.length > 10000) {
    return res.status(400).json({ error: 'Description required (max 10000)' });
  }

  const ticket = await SupportTicket.create({
    userId: req.authUserId,
    userEmail: req.user.email,
    subject,
    description,
  });
  rlog.info({ ticketId: String(ticket._id), subject }, 'support: ticket created');

  // Best-effort — mail failures should not fail the request.
  sendTicketCreatedUserEmail(req.user.email, ticket).catch((err) => {
    rlog.error({ ...errContext(err), ticketId: String(ticket._id) }, 'support: user ack email failed');
  });
  sendTicketAdminNotifyEmail(ticket).catch((err) => {
    rlog.error({ ...errContext(err), ticketId: String(ticket._id) }, 'support: admin notify email failed');
  });

  res.status(201).json({ ticket: await withSignedAttachments(ticket) });
});

router.get('/tickets', async (req, res) => {
  const tickets = await SupportTicket.find({ userId: req.authUserId })
    .sort({ updatedAt: -1 })
    .lean();
  res.json({
    tickets: tickets.map((t) => ({
      id: String(t._id),
      subject: t.subject,
      status: t.status,
      messageCount: (t.messages || []).length,
      attachmentCount: (t.attachments || []).length,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      closedAt: t.closedAt,
    })),
  });
});

router.get('/tickets/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.authUserId });
  if (!ticket) return res.status(404).json({ error: 'not_found' });
  res.json({ ticket: await withSignedAttachments(ticket) });
});

router.post('/tickets/:id/messages', async (req, res) => {
  const rlog = req.log || log;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  if (!body || body.length > 10000) {
    return res.status(400).json({ error: 'Message required (max 10000)' });
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    return res.status(400).json({ error: `Too many attachments (max ${MAX_ATTACHMENTS})` });
  }

  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.authUserId });
  if (!ticket) return res.status(404).json({ error: 'not_found' });
  if (ticket.status === 'closed') {
    return res.status(400).json({ error: 'ticket_closed' });
  }

  ticket.messages.push({
    authorId: req.authUserId,
    authorRole: 'user',
    authorEmail: req.user.email,
    authorDisplayName: displayNameFor(req.user),
    body,
    attachments: attachments.map((a) => ({
      s3Key: a.s3Key,
      filename: a.filename,
      contentType: a.contentType,
      bytes: a.bytes,
    })),
  });
  ticket.updatedAt = new Date();
  await ticket.save();
  rlog.info({ ticketId: String(ticket._id) }, 'support: user reply added');
  res.status(201).json({ ticket: await withSignedAttachments(ticket) });
});

// Two-step attachment flow — presign returns an S3 PUT URL + the key the
// client should send back on `POST .../attachments` (for ticket-level) or in
// the message payload (for per-message attachments).
router.post('/tickets/:id/attachments/presign', async (req, res) => {
  const rlog = req.log || log;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  if (!S3_CONFIGURED) return res.status(503).json({ error: 's3_not_configured' });

  const filename = typeof req.body?.filename === 'string' ? req.body.filename : '';
  const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType : '';
  const bytes = Number(req.body?.bytes);

  if (!filename) return res.status(400).json({ error: 'filename required' });
  if (!ALLOWED_CONTENT_TYPE.test(contentType)) {
    return res.status(400).json({ error: 'contentType not allowed' });
  }
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_ATTACHMENT_BYTES) {
    return res.status(400).json({ error: `bytes must be 1..${MAX_ATTACHMENT_BYTES}` });
  }

  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.authUserId })
    .select('_id');
  if (!ticket) return res.status(404).json({ error: 'not_found' });

  const s3Key = buildTicketAttachmentKey(ticket._id, filename);
  const uploadUrl = await presignPut(s3Key, contentType);
  rlog.debug({ ticketId: String(ticket._id), s3Key, bytes }, 'support: attachment presign');
  res.json({ uploadUrl, s3Key });
});

// Attach an already-uploaded S3 object to the ticket itself (v. per-message).
router.post('/tickets/:id/attachments', async (req, res) => {
  const rlog = req.log || log;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const { s3Key, filename, contentType, bytes } = req.body || {};
  const prefix = `support/tickets/${req.params.id}/`;
  if (!s3Key || !String(s3Key).startsWith(prefix)) {
    return res.status(400).json({ error: 'invalid key' });
  }
  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.authUserId });
  if (!ticket) return res.status(404).json({ error: 'not_found' });
  if (ticket.attachments.length >= MAX_ATTACHMENTS) {
    return res.status(400).json({ error: `Too many attachments (max ${MAX_ATTACHMENTS})` });
  }
  ticket.attachments.push({ s3Key, filename, contentType, bytes });
  ticket.updatedAt = new Date();
  await ticket.save();
  rlog.info({ ticketId: String(ticket._id), s3Key }, 'support: attachment added');
  res.status(201).json({ ticket: await withSignedAttachments(ticket) });
});

// ---------------------------------------------------------------------------
// FEATURE REQUESTS
// ---------------------------------------------------------------------------

function serializeFeature(doc, currentUserId) {
  const o = doc.toObject ? doc.toObject() : doc;
  const uid = String(currentUserId);
  return {
    id: String(o._id),
    title: o.title,
    description: o.description,
    status: o.status,
    upvoteCount: o.upvoteCount,
    upvotedByMe: (o.upvotedBy || []).some((id) => String(id) === uid),
    authorEmail: o.authorEmail,
    authorDisplayName: o.authorDisplayName,
    commentCount: (o.comments || []).length,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

router.get('/features', async (req, res) => {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const sort = req.query.sort === 'new' ? 'new' : 'top';

  const filter = {};
  if (statusFilter && FEATURE_STATUSES.includes(statusFilter)) filter.status = statusFilter;
  if (q) filter.$text = { $search: q };

  const sortSpec = sort === 'new'
    ? { createdAt: -1 }
    : { upvoteCount: -1, createdAt: -1 };

  const features = await FeatureRequest.find(filter).sort(sortSpec).limit(200).lean();
  res.json({ features: features.map((f) => serializeFeature(f, req.authUserId)) });
});

router.post('/features', async (req, res) => {
  const rlog = req.log || log;
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!title || title.length > 160) return res.status(400).json({ error: 'Title required (max 160)' });
  if (!description || description.length > 6000) {
    return res.status(400).json({ error: 'Description required (max 6000)' });
  }
  const feature = await FeatureRequest.create({
    userId: req.authUserId,
    authorEmail: req.user.email,
    authorDisplayName: displayNameFor(req.user),
    title,
    description,
    // Author's own upvote is implicit.
    upvotedBy: [req.authUserId],
    upvoteCount: 1,
  });
  rlog.info({ featureId: String(feature._id) }, 'support: feature request created');
  res.status(201).json({ feature: serializeFeature(feature, req.authUserId) });
});

router.get('/features/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const feature = await FeatureRequest.findById(req.params.id).lean();
  if (!feature) return res.status(404).json({ error: 'not_found' });
  res.json({
    feature: {
      ...serializeFeature(feature, req.authUserId),
      comments: (feature.comments || []).map((c) => ({
        id: String(c._id),
        authorEmail: c.authorEmail,
        authorDisplayName: c.authorDisplayName,
        authorIsAdmin: Boolean(c.authorIsAdmin),
        body: c.body,
        createdAt: c.createdAt,
      })),
    },
  });
});

router.post('/features/:id/upvote', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const uid = req.authUserId;
  // $addToSet makes the vote idempotent. Only recompute count when we
  // actually modified the array.
  const result = await FeatureRequest.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { upvotedBy: uid } },
    { new: true },
  );
  if (!result) return res.status(404).json({ error: 'not_found' });
  const nextCount = result.upvotedBy.length;
  if (result.upvoteCount !== nextCount) {
    result.upvoteCount = nextCount;
    await result.save();
  }
  res.json({ feature: serializeFeature(result, uid) });
});

router.delete('/features/:id/upvote', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const uid = req.authUserId;
  const result = await FeatureRequest.findByIdAndUpdate(
    req.params.id,
    { $pull: { upvotedBy: uid } },
    { new: true },
  );
  if (!result) return res.status(404).json({ error: 'not_found' });
  const nextCount = result.upvotedBy.length;
  if (result.upvoteCount !== nextCount) {
    result.upvoteCount = nextCount;
    await result.save();
  }
  res.json({ feature: serializeFeature(result, uid) });
});

router.post('/features/:id/comments', async (req, res) => {
  const rlog = req.log || log;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 4000) return res.status(400).json({ error: 'Comment required (max 4000)' });

  const feature = await FeatureRequest.findById(req.params.id);
  if (!feature) return res.status(404).json({ error: 'not_found' });

  feature.comments.push({
    authorId: req.authUserId,
    authorEmail: req.user.email,
    authorDisplayName: displayNameFor(req.user),
    authorIsAdmin: Boolean(req.user.isAdmin),
    body,
  });
  feature.updatedAt = new Date();
  await feature.save();
  rlog.info({ featureId: String(feature._id) }, 'support: comment added');
  const doc = feature.toObject();
  res.status(201).json({
    feature: {
      ...serializeFeature(doc, req.authUserId),
      comments: doc.comments.map((c) => ({
        id: String(c._id),
        authorEmail: c.authorEmail,
        authorDisplayName: c.authorDisplayName,
        authorIsAdmin: Boolean(c.authorIsAdmin),
        body: c.body,
        createdAt: c.createdAt,
      })),
    },
  });
});

export default router;
export { TICKET_STATUSES, FEATURE_STATUSES };
