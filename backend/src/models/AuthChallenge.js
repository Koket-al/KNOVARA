import mongoose from "mongoose";

const authChallengeSchema = new mongoose.Schema(
  {
    nonce: {
      type: String,
      required: true,
      unique: true,
      index: true,
      length: 64, // 32 bytes represented as 64 lowercase hex characters
    },
    account_id: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    state: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
      default: "Authenticate with KNOVARA",
    },
    recipient: {
      type: String,
      required: true,
    },
    callback_url: {
      type: String,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
    expires_at: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL automatic background eviction index
    },
    consumed: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

export const AuthChallenge = mongoose.model("AuthChallenge", authChallengeSchema);

