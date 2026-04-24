import { Router } from 'express';
import Photo from '../models/Photo.js';
import {
  buildPhotoKey,
  presignPut,
  presignGet,
  deleteObject,
} from '../services/s3.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('photos');
const router = Router();

const ANGLES = ['front', 'side', 'back', 'other'];

router.post('/upload-url', async (req, res) => {
  const rlog = req.log || log;
  const { date, angle = 'other', contentType = 'image/jpeg', ext = 'jpg' } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    rlog.warn({ date }, 'photos upload-url: invalid date');
    return res.status(400).json({ error: 'valid date (YYYY-MM-DD) required' });
  }
  if (!ANGLES.includes(angle)) {
    rlog.warn({ angle }, 'photos upload-url: invalid angle');
    return res.status(400).json({ error: `angle must be one of ${ANGLES.join(', ')}` });
  }
  const safeExt = String(ext).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const s3Key = buildPhotoKey(req.userId, date, safeExt, 'full');
  const thumbKey = buildPhotoKey(req.userId, date, 'webp', 'thumb');
  try {
    const [uploadUrl, thumbUploadUrl] = await Promise.all([
      presignPut(s3Key, contentType),
      presignPut(thumbKey, 'image/webp'),
    ]);
    rlog.info({ date, angle, s3Key, thumbKey, contentType }, 'photos: presigned upload URLs');
    res.json({ uploadUrl, thumbUploadUrl, s3Key, thumbKey });
  } catch (err) {
    rlog.error({ ...errContext(err), date, angle }, 'photos upload-url: presign failed');
    throw err;
  }
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const {
    date, angle = 'other', s3Key, thumbKey, contentType,
    width, height, bytes, takenAt, notes,
  } = req.body || {};
  if (!date || !s3Key || !thumbKey) {
    rlog.warn({ date, hasS3Key: Boolean(s3Key), hasThumb: Boolean(thumbKey) }, 'photos create: missing fields');
    return res.status(400).json({ error: 'date, s3Key, thumbKey required' });
  }
  if (!ANGLES.includes(angle)) {
    rlog.warn({ angle }, 'photos create: invalid angle');
    return res.status(400).json({ error: `angle must be one of ${ANGLES.join(', ')}` });
  }
  const prefix = `photos/${req.userId}/`;
  if (!s3Key.startsWith(prefix) || !thumbKey.startsWith(prefix)) {
    rlog.warn({ s3Key, thumbKey, prefix }, 'photos create: key does not belong to user');
    return res.status(400).json({ error: 'key does not belong to user' });
  }
  const entry = await Photo.create({
    userId: req.userId,
    date, angle, s3Key, thumbKey, contentType,
    width, height, bytes,
    takenAt: takenAt ? new Date(takenAt) : undefined,
    notes,
  });
  rlog.info(
    { photoId: String(entry._id), date, angle, bytes, width, height },
    'photos: recorded',
  );
  const [url, thumbUrl] = await Promise.all([
    presignGet(entry.s3Key),
    presignGet(entry.thumbKey),
  ]);
  res.status(201).json({ entry: { ...entry.toObject(), url, thumbUrl } });
});

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
  const t0 = Date.now();
  const signed = await Promise.all(
    entries.map(async (e) => ({
      ...e,
      url: await presignGet(e.s3Key),
      thumbUrl: await presignGet(e.thumbKey),
    })),
  );
  (req.log || log).debug(
    { from, to, angle, count: entries.length, presignMs: Date.now() - t0 },
    'photos: listed',
  );
  res.json({ entries: signed });
});

router.delete('/:id', async (req, res) => {
  const rlog = req.log || log;
  const entry = await Photo.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) {
    rlog.warn({ photoId: req.params.id }, 'photos delete: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  await Promise.all([deleteObject(entry.s3Key), deleteObject(entry.thumbKey)]);
  rlog.info(
    { photoId: req.params.id, s3Key: entry.s3Key, thumbKey: entry.thumbKey },
    'photos: deleted (DB + S3)',
  );
  res.status(204).send();
});

export default router;
