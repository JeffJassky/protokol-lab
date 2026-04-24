import { Router } from 'express';
import ChatThread from '../models/ChatThread.js';
import ChatUsage from '../models/ChatUsage.js';
import { chatStream } from '../services/agent.js';
import { calculateCost } from '../lib/pricing.js';
import { requireChatQuota } from '../middleware/requireChatQuota.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('chat');
const router = Router();

router.post('/', requireChatQuota, async (req, res) => {
  const rlog = req.log || log;
  const { messages, threadId } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    rlog.warn('chat stream: missing messages');
    return res.status(400).json({ error: 'messages required' });
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
    for await (const event of chatStream(req.userId, messages)) {
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
    userId: req.userId,
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
    durationMs: usageEvent?.durationMs ?? fallbackDurationMs,
    status,
    errorMessage: streamError?.message || null,
  });
}

router.get('/threads', async (req, res) => {
  const includeMessages = req.query.includeMessages === '1';
  const projection = includeMessages ? {} : { messages: 0 };
  const threads = await ChatThread.find({ userId: req.userId }, projection)
    .sort({ updatedAt: -1 })
    .lean();

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
    userId: req.userId,
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
    { _id: req.params.id, userId: req.userId },
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
  const result = await ChatThread.deleteOne({ _id: req.params.id, userId: req.userId });
  if (result.deletedCount === 0) {
    (req.log || log).warn({ threadId: req.params.id }, 'chat: thread delete not found');
    return res.status(404).json({ error: 'Thread not found' });
  }
  (req.log || log).info({ threadId: req.params.id }, 'chat: thread deleted');
  res.json({ ok: true });
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
