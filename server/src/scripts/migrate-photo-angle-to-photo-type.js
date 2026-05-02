// Migrate every Photo's legacy `angle` string into a Photo.photoTypeId
// reference, seeding PhotoType rows for each user along the way.
//
// Per user that has Photos:
//   1. Ensure preset PhotoTypes (front, side, back) exist + enabled.
//   2. Ensure a "Other" PhotoType exists for any photo whose angle was
//      'other' or non-preset. Marked isPreset=false so the user can rename
//      or delete it later.
//   3. For each Photo missing photoTypeId: set it to the matching PhotoType
//      based on the angle string. Photos already migrated are skipped.
//
// Idempotent: re-running only updates Photos that still lack photoTypeId.
//
// Run:
//   node src/scripts/migrate-photo-angle-to-photo-type.js           # apply
//   node src/scripts/migrate-photo-angle-to-photo-type.js --dry-run # report

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
import mongoose from 'mongoose';
import Photo from '../models/Photo.js';
import PhotoType from '../models/PhotoType.js';
import {
  PHOTO_TYPE_PRESETS,
  LEGACY_OTHER_KEY,
  LEGACY_OTHER_NAME,
} from '../../../shared/photoTypePresets.js';

const DRY = process.argv.includes('--dry-run');

await mongoose.connect(process.env.MONGODB_URI);
console.log(`[migrate-photo-types] ${DRY ? 'DRY RUN' : 'APPLYING'}`);

const userIds = await Photo.distinct('userId');
console.log(`[migrate-photo-types] ${userIds.length} user(s) with photos`);

let typesCreated = 0;
let photosBackfilled = 0;
let photosSkipped = 0;

for (const userId of userIds) {
  // 1. Seed presets (front/side/back) — idempotent.
  const existingTypes = await PhotoType.find({ userId }).lean();
  const byKey = new Map(existingTypes.map((t) => [t.key, t]));

  for (const preset of PHOTO_TYPE_PRESETS) {
    if (byKey.has(preset.key)) continue;
    if (DRY) {
      typesCreated += 1;
      console.log(`  [user ${userId}] would create preset ${preset.key}`);
      continue;
    }
    try {
      const created = await PhotoType.create({
        userId,
        key: preset.key,
        name: preset.name,
        isPreset: true,
        enabled: true,
        order: preset.defaultOrder ?? 0,
      });
      byKey.set(preset.key, created.toObject());
      typesCreated += 1;
    } catch (err) {
      if (err.code !== 11000) throw err;
      // Race lost; refresh map.
      const refreshed = await PhotoType.findOne({ userId, key: preset.key }).lean();
      if (refreshed) byKey.set(preset.key, refreshed);
    }
  }

  // 2. Ensure an "Other" bucket if any photos used the legacy 'other' angle.
  const hasOtherPhotos = await Photo.exists({
    userId,
    photoTypeId: null,
    angle: { $nin: ['front', 'side', 'back'] },
  });
  if (hasOtherPhotos && !byKey.has(LEGACY_OTHER_KEY)) {
    if (DRY) {
      typesCreated += 1;
      console.log(`  [user ${userId}] would create Other bucket`);
    } else {
      try {
        const last = await PhotoType.findOne({ userId }).sort({ order: -1 }).lean();
        const nextOrder = last ? last.order + 1 : PHOTO_TYPE_PRESETS.length;
        const created = await PhotoType.create({
          userId,
          key: LEGACY_OTHER_KEY,
          name: LEGACY_OTHER_NAME,
          isPreset: false, // user can rename/delete; not a "shipped" preset
          enabled: true,
          order: nextOrder,
        });
        byKey.set(LEGACY_OTHER_KEY, created.toObject());
        typesCreated += 1;
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
  }

  // 3. Backfill photoTypeId on every Photo for this user that's missing it.
  const photos = await Photo.find({ userId, photoTypeId: null }).select('_id angle');
  for (const photo of photos) {
    const angle = photo.angle || 'other';
    const targetKey = ['front', 'side', 'back'].includes(angle) ? angle : LEGACY_OTHER_KEY;
    const target = byKey.get(targetKey);
    if (!target) {
      // Could happen in dry-run when the Other bucket didn't exist and we
      // didn't create it in-memory. Treat as skipped.
      photosSkipped += 1;
      continue;
    }
    if (DRY) {
      photosBackfilled += 1;
      continue;
    }
    await Photo.updateOne(
      { _id: photo._id },
      { $set: { photoTypeId: target._id } },
    );
    photosBackfilled += 1;
  }
}

console.log(
  `[migrate-photo-types] done: ${typesCreated} type(s) created, ${photosBackfilled} photo(s) backfilled, ${photosSkipped} skipped`,
);

await mongoose.disconnect();
