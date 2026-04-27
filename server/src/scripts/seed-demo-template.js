// Seed (or re-seed) the canonical demo template from a real user account.
//
// Usage:
//   node src/scripts/seed-demo-template.js <email> [--commit] [--scrub-notes]
//
//   <email>          source account (default: jeff@jeffjassky.com)
//   --commit         actually write; without this it's a dry-run preview
//   --scrub-notes    blank every DayNote.text to placeholder copy. Without
//                    this flag the original notes are preserved verbatim
//                    (so you can review the printed list and decide).
//
// PRD §8 calls for reviewing every day note for PII. This script prints
// every note's date + text so you can audit them in one shot, then either
// runs --scrub-notes for a clean wipe or you go edit specific entries
// manually in the source account before re-running.

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

import mongoose from 'mongoose';
import User from '../models/User.js';
import DayNote from '../models/DayNote.js';
import FoodItem from '../models/FoodItem.js';
import Compound from '../models/Compound.js';
import Symptom from '../models/Symptom.js';
import Meal from '../models/Meal.js';
import FoodLog from '../models/FoodLog.js';
import DoseLog from '../models/DoseLog.js';
import WeightLog from '../models/WeightLog.js';
import WaistLog from '../models/WaistLog.js';
import SymptomLog from '../models/SymptomLog.js';
import Photo from '../models/Photo.js';
import UserSettings from '../models/UserSettings.js';
import { seedTemplateFromUser } from '../services/demo.js';

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith('--')) || 'jeff@jeffjassky.com').toLowerCase().trim();
const commit = args.includes('--commit');
const scrubNotes = args.includes('--scrub-notes');

const PLACEHOLDER_NOTES = [
  'low appetite all day',
  'PR on squat',
  'shake upset stomach',
  'slept poorly, energy low',
  'long walk after dinner',
  'felt strong in gym',
  'stuck at the same weight, bouncy week',
];
function pickPlaceholder(seed) {
  return PLACEHOLDER_NOTES[seed % PLACEHOLDER_NOTES.length];
}

await mongoose.connect(process.env.MONGODB_URI);

const source = await User.findOne({ email });
if (!source) {
  console.error(`No user with email ${email}`);
  await mongoose.disconnect();
  process.exit(1);
}

console.log(`Source: ${source.email} (${source._id})\n`);

// Counts preview
const counts = {
  FoodItem: await FoodItem.countDocuments({ userId: source._id }),
  Compound: await Compound.countDocuments({ userId: source._id }),
  Symptom: await Symptom.countDocuments({ userId: source._id }),
  Meal: await Meal.countDocuments({ userId: source._id }),
  FoodLog: await FoodLog.countDocuments({ userId: source._id }),
  DoseLog: await DoseLog.countDocuments({ userId: source._id }),
  WeightLog: await WeightLog.countDocuments({ userId: source._id }),
  WaistLog: await WaistLog.countDocuments({ userId: source._id }),
  SymptomLog: await SymptomLog.countDocuments({ userId: source._id }),
  DayNote: await DayNote.countDocuments({ userId: source._id }),
  Photo: await Photo.countDocuments({ userId: source._id }),
  UserSettings: await UserSettings.countDocuments({ userId: source._id }),
};
console.log('Per-collection counts to be cloned:');
for (const [name, n] of Object.entries(counts)) {
  console.log(`  ${name.padEnd(14)} ${n}`);
}

// Day note review printout — even in --commit mode, show what's about to land.
const notes = await DayNote.find({ userId: source._id }).sort({ date: 1 }).lean();
if (notes.length) {
  console.log(`\nDay notes (${notes.length}):`);
  for (const n of notes) {
    const day = new Date(n.date).toISOString().slice(0, 10);
    const text = (n.text || '').replace(/\s+/g, ' ').trim();
    console.log(`  ${day}  ${text || '(empty)'}`);
  }
  if (!scrubNotes) {
    console.log('\n(notes will be cloned verbatim; pass --scrub-notes to replace with placeholders)');
  } else {
    console.log('\n(notes will be replaced with bland placeholders)');
  }
}

const existingTemplate = await User.findOne({ isDemoTemplate: true });
if (existingTemplate) {
  console.log(`\nExisting template (${existingTemplate._id}) will be deleted and replaced.`);
}

if (!commit) {
  console.log('\nDry run. Re-run with --commit to apply.');
  await mongoose.disconnect();
  process.exit(0);
}

const sanitize = scrubNotes
  ? (collection, doc, idx) => {
      if (collection === 'DayNote') {
        return { ...doc, text: pickPlaceholder(idx || 0) };
      }
      return doc;
    }
  : null;

// seedTemplateFromUser doesn't pass an index to sanitize — wrap to inject one.
let dayNoteIdx = 0;
const wrappedSanitize = sanitize
  ? (collection, doc) => sanitize(collection, doc, collection === 'DayNote' ? dayNoteIdx++ : 0)
  : undefined;

const { template, totalDocs } = await seedTemplateFromUser(source._id, {
  sanitize: wrappedSanitize,
});

console.log(`\nTemplate ${template._id} written. ${totalDocs} child docs cloned.`);
await mongoose.disconnect();
