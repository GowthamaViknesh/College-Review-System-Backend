// Runs before every test file (jest setupFiles) so tests never depend on a local .env
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PORT = '5000';
process.env.MONGODB_URI = 'mongodb://unused-tests-use-memory-server';
// Set (to nothing) rather than left out, so values in a local .env are not picked up
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
