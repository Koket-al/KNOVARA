import mongoose from "mongoose";

const agentProfileSchema = new mongoose.Schema(
  {
    agent_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    owner_account_id: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    agent_account_id: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    public_key: {
      type: String,
      trim: true,
      default: null,
    },
    verification_status: {
      type: String,
      enum: ["pending", "verified", "revoked"],
      default: "verified",
      index: true,
    },
    verified_at: {
      type: Date,
      default: Date.now,
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

export const AgentProfile = mongoose.model("AgentProfile", agentProfileSchema);

