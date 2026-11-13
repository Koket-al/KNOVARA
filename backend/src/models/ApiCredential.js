import mongoose from "mongoose";

const apiCredentialSchema = new mongoose.Schema(
  {
    credential_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    token_hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      match: /^[a-f0-9]{64}$/,
    },
    token_prefix: {
      type: String,
      required: true,
      trim: true,
    },
    agent_id: {
      type: String,
      required: true,
      index: true,
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
      lowercase: true,
      trim: true,
      index: true,
    },
    discovery_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    api_product_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    subscription_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    scopes: {
      type: [String],
      default: ["read", "execute"],
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expires_at: {
      type: Date,
      required: true,
      index: true,
    },
    revoked_at: {
      type: Date,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "revoked", "expired"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

export const ApiCredential = mongoose.model("ApiCredential", apiCredentialSchema);

