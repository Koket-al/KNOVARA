import mongoose from "mongoose";

const providerConfigSchema = new mongoose.Schema(
  {
    api_product_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    base_url: {
      type: String,
      required: true,
      trim: true,
    },
    auth_type: {
      type: String,
      required: true,
      enum: ["bearer", "api_key", "none"],
      default: "api_key",
    },
    encrypted_secret: {
      type: String,
      required: true,
    },
    iv: {
      type: String,
      required: true,
    },
    auth_tag: {
      type: String,
      required: true,
    },
    header_name: {
      type: String,
      default: "x-provider-api-key",
      trim: true,
    },
    timeout_ms: {
      type: Number,
      default: 30000,
      min: 1000,
      max: 60000,
    },
    allowed_paths: {
      type: [String],
      default: [],
    },
    health_url: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "unverified"],
      default: "active",
      index: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

export const ProviderConfig = mongoose.model("ProviderConfig", providerConfigSchema);

