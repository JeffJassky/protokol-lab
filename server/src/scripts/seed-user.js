import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User.js';

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node src/scripts/seed-user.js <email> <password>');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const passwordHash = await bcrypt.hash(password, 10);
const user = await User.findOneAndUpdate(
  { email: email.toLowerCase().trim() },
  { passwordHash },
  { upsert: true, new: true },
);

console.log(`User seeded: ${user.email} (${user._id})`);
await mongoose.disconnect();
