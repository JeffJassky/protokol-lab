import { Router } from 'express';
import Photo from '../models/Photo.js';
import {
  buildPhotoKey,
  presignPut,
  presignGet,
  deleteObject,
} from '../services/s3.js';

const router = Router();

const ANGLES = ['front', 'side', 'back', 'other'];

// Presign a pair of PUT URLs (full + thumb) so the client uploads directly to
// Spaces without the image ever touching the Node server.
router.post('/upload-url', async (req, res) => {
  const { date, angle = 'other', contentType = 'image/jpeg', ext = 'jpg' } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'valid date (YYYY-MM-DD) required' });
  }
  if (!ANGLES.includes(angle)) {
    return res.status(400).json({ error: `angle must be one of ${ANGLES.join(', ')}` });
  }
  const safeExt = String(ext).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const s3Key = buildPhotoKey(req.userId, date, safeExt, 'full');
  const thumbKey = buildPhotoKey(req.userId, date, 'webp', 'thumb');
  const [uploadUrl, thumbUploadUrl] = await Promise.all([
    presignPut(s3Key, contentType),
    presignPut(thumbKey, 'image/webp'),
  ]);
  res.json({ uploadUrl, thumbUploadUrl, s3Key, thumbKey });
});

// Record the photo after the client confirms S3 uploads succeeded. We don't
// verify the object exists on Spaces — the client owns that contract, and a
// follow-up list/signed-get will 404 naturally if anything went wrong.
router.post('/', async (req, res) => {
  const {
    date,
    angle = 'other',
    s3Key,
    thumbKey,
    contentType,
    width,
    height,
    bytes,
    takenAt,
    notes,
  } = req.body || {};
  if (!date || !s3Key || !thumbKey) {
    return res.status(400).json({ error: 'date, s3Key, thumbKey required' });
  }
  if (!ANGLES.includes(angle)) {
    return res.status(400).json({ error: `angle must be one of ${ANGLES.join(', ')}` });
  }
  // Keys we handed out via /upload-url are prefixed with `photos/<userId>/`.
  // Reject anything that doesn't match so a client can't attach arbitrary
  // bucket objects to their account.
  const prefix = `photos/${req.userId}/`;
  if (!s3Key.startsWith(prefix) || !thumbKey.startsWith(prefix)) {
    return res.status(400).json({ error: 'key does not belong to user' });
  }
  const entry = await Photo.create({
    userId: req.userId,
    date,
    angle,
    s3Key,
    thumbKey,
    contentType,
    width,
    height,
    bytes,
    takenAt: takenAt ? new Date(takenAt) : undefined,
    notes,
  });
  const [url, thumbUrl] = await Promise.all([
    presignGet(entry.s3Key),
    presignGet(entry.thumbKey),
  ]);
  res.status(201).json({ entry: { ...entry.toObject(), url, thumbUrl } });
});

// List photos in a date range. Each entry includes freshly signed GET URLs.
// Clients should re-fetch when a URL approaches expiry (TTL ~30 min by default).
router.get('/', async (req, res) => {
  const { from, to, angle } = req.query;
  const filter = { userId: req.userId };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = String(from);
    if (to) filter.date.$lte = String(to);
  }
  if (angle && ANGLES.includes(angle)) filter.angle = angle;

  const entries = await Photo.find(filter).sort({ date: -1, takenAt: -1 }).lean();
  const signed = await Promise.all(
    entries.map(async (e) => ({
      ...e,
      url: await presignGet(e.s3Key),
      thumbUrl: await presignGet(e.thumbKey),
    })),
  );
  res.json({ entries: signed });
});

router.delete('/:id', async (req, res) => {
  const entry = await Photo.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  await Promise.all([deleteObject(entry.s3Key), deleteObject(entry.thumbKey)]);
  res.status(204).send();
});

export default router;
