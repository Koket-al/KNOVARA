import mongoose from "mongoose";

const publicMetadataDescriptorSchema = new mongoose.Schema(
  {
    discovery_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    version: {
      type: String,
      default: "1.0.0",
      trim: true,
    },
    canonical_descriptor_json: {
      type: String,
      required: true,
    },
    sha256_digest: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[a-f0-9]{64}$/,
    },
    reference_hash: {
      type: String,
      required: true,
      trim: true,
      // Standard Base64 encoded 32 bytes (44 characters with padding)
      match: /^[A-Za-z0-9+/]{43}=$/,
    },
    reference: {
      type: String,
      required: true,
      trim: true,
    },
    r2_descriptor_object_key: {
      type: String,
      trim: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    is_immutable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Compound unique index ensuring immutable descriptor versions cannot be overwritten
publicMetadataDescriptorSchema.index({ discovery_id: 1, version: 1 }, { unique: true });

export const PublicMetadataDescriptor = mongoose.model(
  "PublicMetadataDescriptor",
  publicMetadataDescriptorSchema
);

