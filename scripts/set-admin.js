import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI missing');
}

const userEmail = 'mafla7441@gmail.com';
const newRole = 'admin';

const run = async () => {
  await mongoose.connect(uri, {});
  const res = await mongoose.connection.db
    .collection('users')
    .updateOne({ email: userEmail }, { $set: { role: newRole } });
  console.log('matchedCount=', res.matchedCount, 'modifiedCount=', res.modifiedCount);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
