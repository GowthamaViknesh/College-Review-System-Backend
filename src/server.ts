import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app';

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/college_reviews';

async function start() {
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected');

  const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  const shutdown = () => {
    server.close(() => {
      mongoose.connection.close().then(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
