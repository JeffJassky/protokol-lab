import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('auth');

export async function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    (req.log || log).warn({ path: req.path }, 'auth: no cookie token');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).select('-passwordHash');
    if (!user) {
      (req.log || log).warn({ userId: String(payload.userId), path: req.path }, 'auth: token valid but user missing');
      return res.status(401).json({ error: 'User not found' });
    }
    req.userId = user._id;
    req.user = user;
    // Attach userId to the request logger so every downstream log line is
    // correlated to this user automatically.
    if (req.log) req.log = req.log.child({ userId: String(user._id) });
    next();
  } catch (err) {
    (req.log || log).warn({ ...errContext(err), path: req.path }, 'auth: jwt verify failed');
    return res.status(401).json({ error: 'Invalid token' });
  }
}
