import { Router } from 'express';
import ChatThread from '../models/ChatThread.js';
import { chatStream } from '../services/agent.js';

const router = Router();

// POST /api/chat — SSE streaming chat
router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  try {
    for await (const event of chatStream(req.userId, messages)) {
      res.write(`data:${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    console.error('[Chat] Stream error:', err);
    res.write(`data:${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
  }

  res.end();
});

// GET /api/chat-threads — list threads for user
router.get('/threads', async (req, res) => {
  const includeMessages = req.query.includeMessages === '1';
  const projection = includeMessages ? {} : { messages: 0 };
  const threads = await ChatThread.find({ userId: req.userId }, projection)
    .sort({ updatedAt: -1 })
    .lean();

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

// POST /api/chat-threads — create thread
router.post('/threads', async (req, res) => {
  const { title } = req.body;
  const thread = await ChatThread.create({
    userId: req.userId,
    title: title || 'New conversation',
  });

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

// PATCH /api/chat-threads/:id — update thread (title, messages)
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

  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  res.json({ ok: true });
});

// DELETE /api/chat-threads/:id
router.delete('/threads/:id', async (req, res) => {
  const result = await ChatThread.deleteOne({ _id: req.params.id, userId: req.userId });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Thread not found' });
  res.json({ ok: true });
});

// POST /api/chat/title — generate a thread title from first exchange
router.post('/title', async (req, res) => {
  const { userMessage } = req.body;
  if (!userMessage) return res.status(400).json({ error: 'userMessage required' });

  // Simple title: first ~50 chars of user message, cleaned up
  const cleaned = userMessage.replace(/\s+/g, ' ').trim();
  const title = cleaned.length > 50 ? cleaned.slice(0, 47) + '...' : cleaned;
  res.json({ title });
});

export default router;
