import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import weightRoutes from './routes/weight.js';
import foodRoutes from './routes/food.js';
import foodlogRoutes from './routes/foodlog.js';
import mealsRoutes from './routes/meals.js';
import symptomsRoutes from './routes/symptoms.js';
import waistRoutes from './routes/waist.js';
import doseRoutes from './routes/doses.js';
import chatRoutes from './routes/chat.js';
import notesRoutes from './routes/notes.js';
import { requireAuth } from './middleware/requireAuth.js';
import { runStartupBackup } from './services/backup.js';

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Trust the first proxy in front of us so req.ip / rate limit keys reflect the
// real client. Set TRUST_PROXY to a different hop count if chained further.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

app.use(helmet());

const corsOrigin = isProd
  ? (process.env.APP_URL || false)
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));

app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);

app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/weight', requireAuth, weightRoutes);
app.use('/api/food', requireAuth, foodRoutes);
app.use('/api/foodlog', requireAuth, foodlogRoutes);
app.use('/api/meals', requireAuth, mealsRoutes);
app.use('/api/symptoms', requireAuth, symptomsRoutes);
app.use('/api/waist', requireAuth, waistRoutes);
app.use('/api/doses', requireAuth, doseRoutes);
app.use('/api/chat', requireAuth, chatRoutes);
app.use('/api/notes', requireAuth, notesRoutes);

// Swallow errors surfaced by async route handlers so stack traces don't leak
// to clients. Express 5 forwards rejected promises here automatically.
app.use((err, req, res, _next) => {
  console.error('[error]', req.method, req.path, err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

// Exit on uncaught errors — without this, the process zombies while still
// holding the port, and `node --watch` can spawn a second copy that collides
// with the first on restart.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

let server;
let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down...`);
  // Force-exit if clean shutdown stalls (e.g. hung connections).
  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 3000).unref();
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error during shutdown:', err);
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  runStartupBackup();
  server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  server.on('error', (err) => {
    console.error('Server listen error:', err.message);
    process.exit(1);
  });
} catch (err) {
  console.error('Failed to start:', err);
  process.exit(1);
}
