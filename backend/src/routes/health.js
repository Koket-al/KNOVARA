import { Router } from "express";
import mongoose from "mongoose";
import { config } from "../config/env.js";

const router = Router();

router.get("/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    network: config.NEAR_NETWORK,
    contract: config.NEAR_CONTRACT_ID,
    database: dbStatus,
  });
});

export default router;

