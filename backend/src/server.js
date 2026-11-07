import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";

async function startServer() {
  console.log("==================================================");
  console.log("Starting KNOVARA Backend Service...");
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`NEAR Network: ${config.NEAR_NETWORK}`);
  console.log(`KNOVARA Contract: ${config.NEAR_CONTRACT_ID}`);
  console.log("==================================================");

  try {
    console.log("Connecting to MongoDB Atlas...");
    await connectDatabase(config.MONGODB_URI);
    console.log("MongoDB connection established successfully.");
  } catch (dbErr) {
    console.error("FATAL: Failed to connect to MongoDB:", dbErr.message);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    console.log(`KNOVARA API Server listening on port ${config.PORT}`);
    console.log(`Health endpoint: http://localhost:${config.PORT}/health`);
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Initiating graceful shutdown...`);
    server.close(async () => {
      console.log("HTTP server closed.");
      try {
        await disconnectDatabase();
        console.log("MongoDB connection closed.");
        process.exit(0);
      } catch (err) {
        console.error("Error during database disconnection:", err);
        process.exit(1);
      }
    });

    // Force shutdown after timeout if pending connections hang
    setTimeout(() => {
      console.error("Forcefully terminating after shutdown timeout.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("Failed to start KNOVARA server:", err);
  process.exit(1);
});

