import { Router } from 'express';
import mongoose from 'mongoose';
import SupportTicket, { TICKET_STATUSES } from '../models/SupportTicket.js';
import FeatureRequest, { FEATURE_STATUSES } from '../models/FeatureRequest.js';
import { presignGet, deleteObject, S3_CONFIGURED } from '../services/s3.js';
import {
  sendTicketStatusChangedEmail,
  sendTicketReplyEmail,
} from '../services/email.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('admin-support');
const router = Router();

function displayNameFor(user) {
  if (user?.displayName) return user.displayName;
  const email = user?.email || '';
  return email.split('@')[0] || 'Admin';
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
// Ticket queue
// ---------------------------------------------------------------------------

router.get('/tickets', async (req, res) => {
  const rlog = req.log || log;
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const filter = {};
  if (status && TICKET_STATUSES.includes(status)) filter.status = status;
  if (userId && mongoose.Types.ObjectId.isValid(userId)) filter.userId = userId;
  if (q) filter.$text = { $search: q };

  try {
    const [tickets, total, counts] = await Promise.all([
      SupportTicket.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      SupportTicket.countDocuments(filter),
      SupportTicket.aggregate([
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
    ]);

    const countsByStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));
    res.json({
      tickets: tickets.map((t) => ({
        id: String(t._id),
        userId: String(t.userId),
        userEmail: t.userEmail,
        subject: t.subject,
        status: t.status,
        messageCount: (t.messages || []).length,
        attachmentCount: (t.attachments || []).length,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        closedAt: t.closedAt,
      })),
      page,
      limit,
      total,
      hasMore: skip + tickets.length < total,
      countsByStatus,
    });
  } catch (err) {
    rlog.error({ ...errContext(err) }, 'admin-support: list tickets failed');
    res.status(500).json({ error: 'query_failed' });
  }
});

router.get('/tickets/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not_found' });
  res.json({ ticket: await withSignedAttachments(ticket) });
});

router.patch('/tickets/:id', async (req, res) => {
  const rlog = req.log || log;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const nextStatus = req.body?.status;
  if (nextStatus && !TICKET_STATUSES.includes(nextStatus)) {
    return res.status(400).json({ error: 'invalid_status' });
  }

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not_found' });

  const prevStatus = ticket.status;
  let statusChanged = false;
  if (nextStatus && nextStatus !== prevStatus) {
    ticket.status = nextStatus;
    ticket.closedAt = nextStatus === 'closed' ? new Date() : null;
    statusChanged = true;
  }
  ticket.updatedAt = new Date();
  await ticket.save();
  rlog.info(
    { ticketId: String(ticket._id), prevStatus, newStatus: ticket.status },
    'admin-support: ticket updated',
  );

  if (statusChanged) {
    sendTicketStatusChangedEmail(ticket.userEmail, ticket, prevStatus).catch((err) => {
      rlog.error({ ...errContext(err), ticketId: String(ticket._id) }, 'admin-support: status email failed');
    });
  }

  res.json({ ticket: await withSignedAttachments(ticket) });
});

router.post('/tickets/:id/messages', async (req, res) => {
  const rlog = req.log || log;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 10000) return res.status(400).json({ error: 'Message required (max 10000)' });

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not_found' });

  const msg = {
    authorId: req.userId,
    authorRole: 'admin',
    authorEmail: req.user.email,
    authorDisplayName: displayNameFor(req.user),
    body,
  };
  ticket.messages.push(msg);
  // Admin reply moves "open" → "in_progress" automatically; closed stays closed.
  if (ticket.status === 'open') ticket.status = 'in_progress';
  ticket.updatedAt = new Date();
  await ticket.save();
  rlog.info({ ticketId: String(ticket._id) }, 'admin-support: admin reply added');

  const pushed = ticket.messages[ticket.messages.length - 1];
  sendTicketReplyEmail(ticket.userEmail, ticket, pushed).catch((err) => {
    rlog.error({ ...errContext(err), ticketId: String(ticket._id) }, 'admin-support: reply email failed');
  });

  res.status(201).json({ ticket: await withSignedAttachments(ticket) });
});

// Hard delete — use sparingly for spam. Cleans up S3 attachments best-effort.
router.delete('/tickets/:id', async (req, res) => {
  const rlog = req.log || log;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const ticket = await SupportTicket.findByIdAndDelete(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not_found' });

  const keys = [
    ...(ticket.attachments || []).map((a) => a.s3Key),
    ...(ticket.messages || []).flatMap((m) => (m.attachments || []).map((a) => a.s3Key)),
  ];
  await Promise.all(keys.map((k) => deleteObject(k).catch(() => null)));
  rlog.info(
    { ticketId: String(ticket._id), keys: keys.length },
    'admin-support: ticket deleted',
  );
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Feature requests
// ---------------------------------------------------------------------------

function serializeFeature(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id),
    userId: String(o.userId),
    title: o.title,
    description: o.description,
    status: o.status,
    upvoteCount: o.upvoteCount,
    authorEmail: o.authorEmail,
    authorDisplayName: o.authorDisplayName,
    commentCount: (o.comments || []).length,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

router.get('/features', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const filter = {};
  if (status && FEATURE_STATUSES.includes(status)) filter.status = status;
  if (q) filter.$text = { $search: q };
  const [features, counts] = await Promise.all([
    FeatureRequest.find(filter).sort({ upvoteCount: -1, createdAt: -1 }).limit(500).lean(),
    FeatureRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({
    features: features.map(serializeFeature),
    countsByStatus: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
});

router.get('/features/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const feature = await FeatureRequest.findById(req.params.id).lean();
  if (!feature) return res.status(404).json({ error: 'not_found' });
  res.json({
    feature: {
      ...serializeFeature(feature),
      comments: (feature.comments || []).map((c) => ({
        id: String(c._id),
        authorId: String(c.authorId),
        authorEmail: c.authorEmail,
        authorDisplayName: c.authorDisplayName,
        authorIsAdmin: Boolean(c.authorIsAdmin),
        body: c.body,
        createdAt: c.createdAt,
      })),
      upvotedBy: (feature.upvotedBy || []).map(String),
    },
  });
});

router.patch('/features/:id', async (req, res) => {
  const rlog = req.log || log;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const update = {};
  if (req.body?.status !== undefined) {
    if (!FEATURE_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    update.status = req.body.status;
  }
  if (req.body?.title !== undefined) {
    const t = String(req.body.title).trim();
    if (!t || t.length > 160) return res.status(400).json({ error: 'Title required (max 160)' });
    update.title = t;
  }
  if (req.body?.description !== undefined) {
    const d = String(req.body.description).trim();
    if (!d || d.length > 6000) return res.status(400).json({ error: 'Description required (max 6000)' });
    update.description = d;
  }
  if (!Object.keys(update).length) return res.status(400).json({ error: 'nothing_to_update' });
  update.updatedAt = new Date();

  const feature = await FeatureRequest.findByIdAndUpdate(
    req.params.id,
    { $set: update },
    { new: true },
  );
  if (!feature) return res.status(404).json({ error: 'not_found' });
  rlog.info({ featureId: String(feature._id), fields: Object.keys(update) }, 'admin-support: feature updated');
  res.json({ feature: serializeFeature(feature) });
});

router.delete('/features/:id', async (req, res) => {
  const rlog = req.log || log;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const feature = await FeatureRequest.findByIdAndDelete(req.params.id);
  if (!feature) return res.status(404).json({ error: 'not_found' });
  rlog.info({ featureId: String(feature._id) }, 'admin-support: feature deleted');
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Admin support sidebar badge — open-ticket count.
// ---------------------------------------------------------------------------

router.get('/summary', async (req, res) => {
  const [openTickets, openFeatures] = await Promise.all([
    SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    FeatureRequest.countDocuments({ status: 'open' }),
  ]);
  res.json({ openTickets, openFeatures });
});

export default router;
