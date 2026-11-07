import mongoose from "mongoose";

let isConnecting = false;

/**
 * Connect to MongoDB Atlas or local database instance.
 * @param {string} uri - MongoDB connection string.
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDatabase(uri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (isConnecting) {
    return new Promise((resolve) => {
      mongoose.connection.once("open", () => resolve(mongoose));
    });
  }

  isConnecting = true;
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true, // Ensure TTL and unique indexes are created
    });
    isConnecting = false;
    return mongoose;
  } catch (err) {
    isConnecting = false;
    throw err;
  }
}

/**
 * Disconnect from MongoDB gracefully.
 * @returns {Promise<void>}
 */
export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

