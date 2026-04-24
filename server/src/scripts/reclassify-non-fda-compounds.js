// Reclassify formerly-system compounds that are no longer FDA-approved.
//
// The SYSTEM_COMPOUNDS catalog in routes/compounds.js was trimmed to the
// FDA-approved list (Tirzepatide, Semaglutide). Users who previously had
// Retatrutide, Cagrilintide, or BPC-157 auto-seeded as system compounds need
// those rows handled so we don't orphan DoseLogs or silently disable them.
//
// Per user, for each removed name:
//   - If the compound has any DoseLog OR is currently enabled → flip
//     isSystem=false. It becomes the user's custom compound; they can rename,
//     edit, or delete it themselves.
//   - Otherwise → delete the untouched system row.
//
// Idempotent. Supports --dry-run.
//
// Run:
//   node src/scripts/reclassify-non-fda-compounds.js           # apply
//   node src/scripts/reclassify-non-fda-compounds.js --dry-run # report only

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
import mongoose from 'mongoose';
import Compound from '../models/Compound.js';
import DoseLog from '../models/DoseLog.js';

const DRY = process.argv.includes('--dry-run');
const REMOVED_NAMES = ['Retatrutide', 'Cagrilintide', 'BPC-157'];

await mongoose.connect(process.env.MONGODB_URI);
console.log(`[reclassify] ${DRY ? 'DRY RUN' : 'APPLYING'}`);

const rows = await Compound.find({
  isSystem: true,
  name: { $in: REMOVED_NAMES },
});
console.log(`[reclassify] candidates: ${rows.length}`);

let converted = 0;
let deleted = 0;

for (const c of rows) {
  const doseCount = await DoseLog.countDocuments({ userId: c.userId, compoundId: c._id });
  const keep = doseCount > 0 || c.enabled;
  if (keep) {
    console.log(`[reclassify] convert → custom: user=${c.userId} name=${c.name} doses=${doseCount} enabled=${c.enabled}`);
    if (!DRY) {
      c.isSystem = false;
      await c.save();
    }
    converted += 1;
  } else {
    console.log(`[reclassify] delete untouched: user=${c.userId} name=${c.name}`);
    if (!DRY) await c.deleteOne();
    deleted += 1;
  }
}

console.log(`[reclassify] converted to custom: ${converted}`);
console.log(`[reclassify] deleted untouched: ${deleted}`);
if (DRY) console.log('[reclassify] (dry run — nothing written)');

await mongoose.disconnect();
