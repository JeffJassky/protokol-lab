import { Router } from 'express';
import PhotoType from '../models/PhotoType.js';
import Photo from '../models/Photo.js';
import { childLogger, errContext } from '../lib/logger.js';
import { PHOTO_TYPE_PRESETS } from '../../../shared/photoTypePresets.js';

const log = childLogger('photo-types');
const router = Router();

// Seed every preset for this user. Idempotent: existing presets keep their
// `enabled`/`order` state; only newly-shipped presets get inserted.
async function ensurePresets(userId) {
  const existing = await PhotoType.find({ userId, isPreset: true }).select('key').lean();
  const haveKeys = new Set(existing.map((p) => p.key));
  const missing = PHOTO_TYPE_PRESETS.filter((p) => !haveKeys.has(p.key));
  if (missing.length === 0) return;
  const docs = missing.map((p) => ({
    userId,
    key: p.key,
    name: p.name,
    isPreset: true,
    // Seeded enabled — front/side/back are the default behavior people
    // expect when they enable the photos feature, no opt-in friction.
    enabled: true,
    order: p.defaultOrder ?? 0,
  }));
  try {
    await PhotoType.insertMany(docs, { ordered: false });
    log.info({ userId: String(userId), count: docs.length }, 'photo-types: seeded presets');
  } catch (err) {
    if (err.code !== 11000) {
      log.error({ ...errContext(err), userId: String(userId) }, 'photo-types: seed failed');
      throw err;
    }
  }
}

router.get('/', async (req, res) => {
  await ensurePresets(req.userId);
  const types = await PhotoType.find({ userId: req.userId }).sort({ order: 1, createdAt: 1 });
  res.json({ photoTypes: types });
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

  const trimmed = name.trim();
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!slug) return res.status(400).json({ error: 'name must contain alphanumeric characters' });

  const last = await PhotoType.findOne({ userId: req.userId }).sort({ order: -1 });
  const order = last ? last.order + 1 : 0;

  try {
    const photoType = await PhotoType.create({
      userId: req.userId,
      key: `custom_${slug}`,
      name: trimmed,
      isPreset: false,
      enabled: true,
      order,
    });
    rlog.info({ photoTypeId: String(photoType._id), name: photoType.name }, 'photo-types: created');
    res.status(201).json({ photoType });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Photo type already exists' });
    }
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const photoType = await PhotoType.findOne({ _id: req.params.id, userId: req.userId });
  if (!photoType) return res.status(404).json({ error: 'Not found' });

  const { name, enabled, order } = req.body || {};
  // Presets can be re-ordered + toggled but their identity (name) is locked.
  if (name !== undefined && !photoType.isPreset) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
    photoType.name = name.trim();
  }
  if (enabled !== undefined) photoType.enabled = Boolean(enabled);
  if (order !== undefined) photoType.order = Number(order);
  await photoType.save();
  res.json({ photoType });
});

router.delete('/:id', async (req, res) => {
  const photoType = await PhotoType.findOne({ _id: req.params.id, userId: req.userId });
  if (!photoType) return res.status(404).json({ error: 'Not found' });
  if (photoType.isPreset) {
    return res.status(400).json({ error: 'Preset photo types cannot be deleted, only disabled' });
  }
  await photoType.deleteOne();
  // Cascade to photos. Same destructive contract as deleting a custom metric:
  // history goes with the type. Users who want to keep the photos should
  // disable the type instead.
  const { deletedCount } = await Photo.deleteMany({ userId: req.userId, photoTypeId: photoType._id });
  (req.log || log).info(
    { photoTypeId: req.params.id, cascadedPhotos: deletedCount },
    'photo-types: deleted + cascaded photos',
  );
  res.status(204).send();
});

router.put('/reorder', async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const found = await PhotoType.find({ userId: req.userId, _id: { $in: ids } }).select('_id');
  if (found.length !== ids.length) {
    return res.status(400).json({ error: 'unknown photo type id in list' });
  }
  await Promise.all(
    ids.map((id, i) => PhotoType.updateOne({ _id: id, userId: req.userId }, { order: i })),
  );
  res.json({ updated: ids.length });
});

export default router;
