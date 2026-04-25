import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
import mongoose from 'mongoose';
import User from '../models/User.js';

const [email, flag] = process.argv.slice(2);
const isAdmin = flag === 'false' ? false : true;

if (!email) {
  console.error('Usage: node src/scripts/grant-admin.js <email> [false]');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const user = await User.findOneAndUpdate(
  { email: email.toLowerCase().trim() },
  { isAdmin },
  { returnDocument: 'after' },
);

if (!user) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}

console.log(`${user.email} isAdmin=${user.isAdmin}`);
await mongoose.disconnect();
