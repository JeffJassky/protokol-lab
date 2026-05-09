import crypto from 'crypto';
import { Router } from 'express';
import ChatThread from '../models/ChatThread.js';
import ChatUsage from '../models/ChatUsage.js';
import MealProposal from '../models/MealProposal.js';
import BloodworkProposal from '../models/BloodworkProposal.js';
import UserSettings from '../models/UserSettings.js';
import { BLOODWORK_FIELD_INDEX, sanitizeBloodworkValue, expandBloodworkFlat, flattenBloodworkNested } from '../../../shared/bloodworkPanels.js';
import FoodItem from '../models/FoodItem.js';
import FoodLog from '../models/FoodLog.js';
import User from '../models/User.js';
import { chatStream } from '../services/agent.js';
import { touchRecent } from '../services/recentFood.js';
import { calculateCost } from '../lib/pricing.js';
import { requireChatQuota } from '../middleware/requireChatQuota.js';
import { chatUpload, parseChatPayload } from '../middleware/chatUpload.js';
import {
  S3_CONFIGURED,
  buildMealPhotoKey,
  putObject,
  presignGet,
  deleteObject,
} from '../services/s3.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('chat');
const router = Router();

router.post('/', chatUpload, parseChatPayload, requireChatQuota, async (req, res) => {
  const rlog = req.log || log;
  const { messages, threadId, timezone } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    rlog.warn('chat stream: missing messages');
    return res.status(400).json({ error: 'messages required' });
  }

  // Attach any uploaded images to the last user message so the agent sees
  // them as inlineData parts on this turn. History-persisted image URLs on
  // previous messages are handled separately during content build.
  const imageFiles = Array.isArray(req.files) ? req.files : [];
  // Stable id we'll use to correlate uploaded photo keys with the message
  // they belong to in ChatThread.messages. The client also receives this id
  // so it can attach the file URLs to its local message record before PATCH.
  const messageId = crypto.randomBytes(8).toString('hex');
  if (imageFiles.length) {
    const last = messages[messages.length - 1];
    if (last && last.role !== 'ai' && last.role !== 'model') {
      last.images = imageFiles.map((f) => ({
        data: f.buffer,
        mimeType: f.mimetype,
        originalName: f.originalname,
        size: f.size,
      }));
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const t0 = Date.now();
  let events = 0;
  let toolCalls = 0;
  let usageEvent = null;
  rlog.info({ messageCount: messages.length }, 'chat: stream started');

  let streamStatus = 'ok';
  let streamError = null;
  try {
    // Mock-agent scenario hint, e2e only. The mock service in agent.mock.js
    // ignores this in production builds (AGENT_PROVIDER must be 'mock' for
    // the mock path to fire), so reading the header here is safe.
    const scenario = req.get('x-mock-scenario') || undefined;
    for await (const event of chatStream(req.authUserId, messages, { threadId, timezone, scenario })) {
      if (event.type === 'usage') {
        // Captured server-side only; not forwarded to the client stream.
        usageEvent = event;
        continue;
      }
      if (event.type === 'tool_call') toolCalls++;
      events++;
      res.write(`data:${JSON.stringify(event)}\n\n`);
    }
    rlog.info(
      { events, toolCalls, durationMs: Date.now() - t0 },
      'chat: stream finished',
    );
  } catch (err) {
    streamStatus = 'error';
    streamError = err;
    rlog.error({ ...errContext(err), events, toolCalls }, 'chat: stream error');
    res.write(`data:${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
  }

  // Persist meal photos now that we know the turn ran. If the stream errored
  // we skip — no point holding image bytes for a failed exchange (cheapens
  // unit economics for Free-tier teaser users retrying after a transient
  // failure). On success we forward the signed URLs + s3 keys so the client
  // can attach them to the persisted user message.
  if (streamStatus === 'ok' && imageFiles.length && S3_CONFIGURED) {
    try {
      const persisted = await Promise.all(
        imageFiles.map(async (file, idx) => {
          const ext = (file.mimetype.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
          const s3Key = buildMealPhotoKey(
            String(req.authUserId),
            threadId ? String(threadId) : null,
            messageId,
            idx,
            ext || 'jpg',
          );
          await putObject(s3Key, file.buffer, file.mimetype);
          const url = await presignGet(s3Key);
          return {
            s3Key,
            url,
            mimeType: file.mimetype,
            bytes: file.size,
            originalName: file.originalname,
          };
        }),
      );
      res.write(
        `data:${JSON.stringify({ type: 'message_files', messageId, files: persisted })}\n\n`,
      );
      rlog.info(
        { messageId, count: persisted.length, bytes: persisted.reduce((n, f) => n + (f.bytes || 0), 0) },
        'chat: meal photos persisted',
      );
    } catch (err) {
      rlog.error({ ...errContext(err), messageId }, 'chat: meal photo persist failed');
    }
  }

  res.end();

  // Persist usage record after the stream closes so the client isn't blocked
  // on the DB write. Never throw out of this block — telemetry failure must
  // not mask a successful chat response.
  try {
    await recordChatUsage({
      req,
      threadId,
      usageEvent,
      streamStatus,
      streamError,
      fallbackDurationMs: Date.now() - t0,
    });
  } catch (err) {
    rlog.error({ ...errContext(err) }, 'chat: usage record failed');
  }

  // Bump the lifetime image-recognition counter on the user document when the
  // stream actually completed with images attached. Done here (not in the
  // middleware) so we only charge the user for turns that ran; if the agent
  // errored before consuming the image, the free tier isn't penalized.
  if (streamStatus === 'ok' && imageFiles.length) {
    try {
      await User.updateOne(
        { _id: req.authUserId },
        { $inc: { imageRecognitionCount: imageFiles.length } },
      );
    } catch (err) {
      rlog.error({ ...errContext(err) }, 'chat: imageRecognitionCount inc failed');
    }
  }
});

async function recordChatUsage({
  req,
  threadId,
  usageEvent,
  streamStatus,
  streamError,
  fallbackDurationMs,
}) {
  const model = usageEvent?.model || 'unknown';
  const inputTokens = usageEvent?.inputTokens || 0;
  const outputTokens = usageEvent?.outputTokens || 0;
  const cachedInputTokens = usageEvent?.cachedInputTokens || 0;
  const searchCalls = usageEvent?.searchCalls || 0;

  const cost = calculateCost({
    model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    searchCalls,
  });

  const status = usageEvent?.status || streamStatus;

  await ChatUsage.create({
    userId: req.authUserId,
    threadId: threadId || null,
    model,
    planAtTime: req.user?.plan || null,
    inputTokens,
    outputTokens,
    thoughtTokens: usageEvent?.thoughtTokens || 0,
    toolTokens: usageEvent?.toolTokens || 0,
    cachedInputTokens,
    totalTokens: usageEvent?.totalTokens || 0,
    inputCostUsd: cost.inputCostUsd,
    outputCostUsd: cost.outputCostUsd,
    searchCostUsd: cost.searchCostUsd,
    totalCostUsd: cost.totalCostUsd,
    iterations: usageEvent?.iterations || 0,
    toolCalls: usageEvent?.toolCalls || 0,
    searchCalls,
    imageCount: req.imageCount || 0,
    durationMs: usageEvent?.durationMs ?? fallbackDurationMs,
    status,
    errorMessage: streamError?.message || null,
  });
}

// Presigned URLs expire after ~30min, so any file reference stored on a
// message gets rehydrated with a fresh URL each time the thread is fetched.
// Leaves non-file-bearing messages untouched.
async function rehydrateFileUrls(messages) {
  if (!Array.isArray(messages) || !S3_CONFIGURED) return messages;
  for (const m of messages) {
    if (!Array.isArray(m?.files) || !m.files.length) continue;
    for (const f of m.files) {
      if (f?.s3Key) {
        try {
          f.url = await presignGet(f.s3Key);
        } catch {
          // Leave url stale; client will show a broken image rather than
          // the whole thread failing to load.
        }
      }
    }
  }
  return messages;
}

router.get('/threads', async (req, res) => {
  const includeMessages = req.query.includeMessages === '1';
  const projection = includeMessages ? {} : { messages: 0 };
  const threads = await ChatThread.find({ userId: req.authUserId }, projection)
    .sort({ updatedAt: -1 })
    .lean();

  if (includeMessages) {
    await Promise.all(threads.map((t) => rehydrateFileUrls(t.messages)));
  }

  (req.log || log).debug({ count: threads.length, includeMessages }, 'chat: threads listed');
  res.json({
    threads: threads.map((t) => ({
      id: t._id,
      title: t.title,
      createdAt: new Date(t.createdAt).getTime(),
      updatedAt: new Date(t.updatedAt).getTime(),
      messages: includeMessages ? t.messages || [] : undefined,
    })),
  });
});

router.post('/threads', async (req, res) => {
  const { title } = req.body;
  const thread = await ChatThread.create({
    userId: req.authUserId,
    title: title || 'New conversation',
  });

  (req.log || log).info({ threadId: String(thread._id), title: thread.title }, 'chat: thread created');
  res.json({
    thread: {
      id: thread._id,
      title: thread.title,
      createdAt: thread.createdAt.getTime(),
      updatedAt: thread.updatedAt.getTime(),
      messages: [],
    },
  });
});

router.patch('/threads/:id', async (req, res) => {
  const { title, messages } = req.body;
  const update = {};
  if (title !== undefined) update.title = title;
  if (messages !== undefined) update.messages = messages;

  const thread = await ChatThread.findOneAndUpdate(
    { _id: req.params.id, userId: req.authUserId },
    { $set: update },
    { new: true },
  );

  if (!thread) {
    (req.log || log).warn({ threadId: req.params.id }, 'chat: thread patch not found');
    return res.status(404).json({ error: 'Thread not found' });
  }
  (req.log || log).debug(
    { threadId: req.params.id, fields: Object.keys(update), messageCount: messages?.length },
    'chat: thread patched',
  );
  res.json({ ok: true });
});

router.delete('/threads/:id', async (req, res) => {
  const thread = await ChatThread.findOneAndDelete({ _id: req.params.id, userId: req.authUserId });
  if (!thread) {
    (req.log || log).warn({ threadId: req.params.id }, 'chat: thread delete not found');
    return res.status(404).json({ error: 'Thread not found' });
  }

  // Fire-and-forget cleanup of any meal photos attached to this thread so
  // they don't orphan in Spaces. Never blocks the response.
  const keys = [];
  for (const m of thread.messages || []) {
    for (const f of m?.files || []) if (f?.s3Key) keys.push(f.s3Key);
  }
  if (keys.length && S3_CONFIGURED) {
    Promise.all(keys.map((k) => deleteObject(k))).catch(() => {});
  }

  (req.log || log).info(
    { threadId: req.params.id, orphanPhotoKeys: keys.length },
    'chat: thread deleted',
  );
  res.json({ ok: true });
});

// ── Proposal confirm / cancel ────────────────────────────────────────────────
// A meal proposal is a set of AI-identified food items awaiting user review.
// Confirming writes all items to FoodLog in one shot, creating catalog entries
// for any items the agent couldn't match against an existing FoodItem.

router.post('/proposals/:id/confirm', async (req, res) => {
  const rlog = req.log || log;
  const { id } = req.params;
  const overrides = req.body?.items || null; // optional edited items
  const overrideDate = req.body?.date || null;
  const overrideMeal = req.body?.mealType || null;

  const proposal = await MealProposal.findOne({ _id: id, userId: req.authUserId });
  if (!proposal) {
    rlog.warn({ proposalId: id }, 'proposal confirm: not found');
    return res.status(404).json({ error: 'Proposal not found' });
  }
  if (proposal.status !== 'pending') {
    rlog.warn({ proposalId: id, status: proposal.status }, 'proposal confirm: not pending');
    return res.status(409).json({ error: `Proposal already ${proposal.status}` });
  }

  const itemsToLog = Array.isArray(overrides) && overrides.length ? overrides : proposal.items;
  const date = overrideDate || proposal.date;
  const mealType = overrideMeal || proposal.mealType;
  const validMeals = ['breakfast', 'lunch', 'dinner', 'snack'];
  if (!validMeals.includes(mealType)) {
    return res.status(400).json({ error: `mealType must be one of: ${validMeals.join(', ')}` });
  }

  // Build or reuse FoodItem per proposal item, then insert one FoodLog per.
  const logDocs = [];
  for (const item of itemsToLog) {
    let foodItemId = item.foodItemId;
    if (!foodItemId) {
      const grams = item.grams != null ? Number(item.grams) : null;
      const created = await FoodItem.create({
        userId: req.authUserId,
        // AI-proposed foods come from a meal-photo or text proposal flow.
        // They're as user-attributed as any manual entry, but we don't mark
        // them isCustom — they shouldn't burn the customFoodItems cap since
        // the user just confirmed the AI's suggestion rather than authoring it.
        isCustom: false,
        name: item.name || 'AI-identified food',
        brand: item.brand || '',
        emoji: item.emoji || '',
        servingSize: item.portion || '',
        servingAmount: grams,
        servingUnit: grams != null ? 'g' : null,
        servingKnown: grams != null,
        perServing: {
          calories: Math.max(0, Math.round(Number(item.calories) || 0)),
          protein: Math.max(0, Math.round(Number(item.protein) || 0)),
          fat: Math.max(0, Math.round(Number(item.fat) || 0)),
          carbs: Math.max(0, Math.round(Number(item.carbs) || 0)),
        },
        nutrientSource: 'agent',
        nutrientCoverage: 'macros_only',
      });
      foodItemId = created._id;
    }
    logDocs.push({
      userId: req.authUserId,
      foodItemId,
      date: new Date(date + 'T12:00:00.000Z'),
      mealType,
      servingCount: 1,
    });
  }

  const created = await FoodLog.insertMany(logDocs);
  for (const doc of logDocs) {
    await touchRecent(req.authUserId, doc.foodItemId, doc.servingCount, doc.mealType);
  }
  proposal.status = 'confirmed';
  await proposal.save();

  const totals = itemsToLog.reduce(
    (acc, i) => {
      acc.calories += Number(i.calories) || 0;
      acc.protein += Number(i.protein) || 0;
      acc.fat += Number(i.fat) || 0;
      acc.carbs += Number(i.carbs) || 0;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );

  rlog.info(
    { proposalId: id, itemCount: itemsToLog.length, mealType, date, entries: created.length },
    'proposal: confirmed',
  );
  res.json({
    ok: true,
    proposalId: id,
    entryCount: created.length,
    items: itemsToLog,
    totals: {
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      fat: Math.round(totals.fat),
      carbs: Math.round(totals.carbs),
    },
    date,
    mealType,
  });
});

router.post('/proposals/:id/cancel', async (req, res) => {
  const rlog = req.log || log;
  const proposal = await MealProposal.findOne({ _id: req.params.id, userId: req.authUserId });
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status !== 'pending') {
    return res.status(409).json({ error: `Proposal already ${proposal.status}` });
  }
  proposal.status = 'cancelled';
  await proposal.save();
  rlog.info({ proposalId: req.params.id }, 'proposal: cancelled');
  res.json({
    ok: true,
    proposalId: req.params.id,
    items: proposal.items,
    date: proposal.date,
    mealType: proposal.mealType,
  });
});

// ── Bloodwork proposal confirm / cancel ─────────────────────────────────────
// A bloodwork proposal is a set of AI-suggested lab-value updates awaiting
// user review. Confirming merges every change into UserSettings.bloodwork
// (the same shape Subject.bloodwork uses), so the next simulation run picks
// them up automatically. Cancel just flips status — values stay untouched.

router.post('/bloodwork-proposals/:id/confirm', async (req, res) => {
  const rlog = req.log || log;
  const { id } = req.params;
  const overrides = Array.isArray(req.body?.changes) ? req.body.changes : null;

  const proposal = await BloodworkProposal.findOne({ _id: id, userId: req.authUserId });
  if (!proposal) {
    rlog.warn({ proposalId: id }, 'bloodwork-proposal confirm: not found');
    return res.status(404).json({ error: 'Proposal not found' });
  }
  if (proposal.status !== 'pending') {
    return res.status(409).json({ error: `Proposal already ${proposal.status}` });
  }

  const source = overrides && overrides.length ? overrides : proposal.changes;

  // Re-validate every change at confirm time. Even though propose_bloodwork_update
  // already validated, the user's edits in the inline card are user input and
  // need the same gauntlet (clamp + drop unknowns).
  const cleanedFlat = {};
  const dropped = [];
  for (const c of source) {
    const key = String(c?.key || '');
    if (!BLOODWORK_FIELD_INDEX.has(key)) {
      dropped.push({ key, reason: 'unknown field' });
      continue;
    }
    const v = sanitizeBloodworkValue(key, c?.value);
    if (v == null) {
      dropped.push({ key, reason: 'invalid value' });
      continue;
    }
    cleanedFlat[key] = v;
  }
  if (!Object.keys(cleanedFlat).length) {
    return res.status(400).json({ error: 'No valid changes to apply', dropped });
  }

  // Merge into existing bloodwork. Keep prior values for fields we're not
  // touching; overwrite the ones in the proposal.
  const settings = await UserSettings.findOne({ userId: req.authUserId }).select('bloodwork');
  const existingFlat = flattenBloodworkNested(settings?.bloodwork);
  const mergedFlat = { ...existingFlat, ...cleanedFlat };
  const nested = expandBloodworkFlat(mergedFlat);

  await UserSettings.findOneAndUpdate(
    { userId: req.authUserId },
    { $set: { bloodwork: nested, updatedAt: new Date() }, $setOnInsert: { userId: req.authUserId } },
    { upsert: true, runValidators: true },
  );

  proposal.status = 'confirmed';
  await proposal.save();

  rlog.info(
    { proposalId: id, applied: Object.keys(cleanedFlat).length, dropped: dropped.length },
    'bloodwork-proposal: confirmed',
  );
  res.json({
    ok: true,
    proposalId: id,
    applied: Object.keys(cleanedFlat).length,
    changes: proposal.changes,
    dropped,
  });
});

router.post('/bloodwork-proposals/:id/cancel', async (req, res) => {
  const rlog = req.log || log;
  const proposal = await BloodworkProposal.findOne({ _id: req.params.id, userId: req.authUserId });
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status !== 'pending') {
    return res.status(409).json({ error: `Proposal already ${proposal.status}` });
  }
  proposal.status = 'cancelled';
  await proposal.save();
  rlog.info({ proposalId: req.params.id }, 'bloodwork-proposal: cancelled');
  res.json({ ok: true, proposalId: req.params.id, changes: proposal.changes });
});

router.post('/title', async (req, res) => {
  const { userMessage } = req.body;
  if (!userMessage) {
    (req.log || log).warn('chat title: missing userMessage');
    return res.status(400).json({ error: 'userMessage required' });
  }

  const cleaned = userMessage.replace(/\s+/g, ' ').trim();
  const title = cleaned.length > 50 ? cleaned.slice(0, 47) + '...' : cleaned;
  (req.log || log).debug({ titleLength: title.length }, 'chat: title generated');
  res.json({ title });
});

export default router;
