import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import weightRoutes from './routes/weight.js';
import foodRoutes from './routes/food.js';
import foodlogRoutes from './routes/foodlog.js';
import doseRoutes from './routes/doses.js';
import { requireAuth } from './middleware/requireAuth.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
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
app.use('/api/doses', requireAuth, doseRoutes);

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

try {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  }).on('error', (err) => {
    console.error('Server listen error:', err.message);
  });
} catch (err) {
  console.error('Failed to start:', err);
  process.exit(1);
}
