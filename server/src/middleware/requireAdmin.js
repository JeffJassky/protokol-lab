import { childLogger } from '../lib/logger.js';

const log = childLogger('admin-auth');

// Must run after requireAuth so req.user is populated.
export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    (req.log || log).warn(
      { userId: req.userId ? String(req.userId) : undefined, path: req.path },
      'admin: access denied',
    );
    return res.status(403).json({ error: 'admin_only' });
  }
  next();
}
