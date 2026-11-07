import mongoose from "mongoose";

const evidenceManifestSchema = new mongoose.Schema(
  {
    manifest_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    owner_account_id: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    discovery_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    manifest_schema_version: {
      type: String,
      default: "1.0.0",
    },
    evidence_item_ids: {
      type: [String],
      required: true,
      validate: [(val) => Array.isArray(val) && val.length > 0, "At least one evidence item is required"],
    },
    canonical_manifest_json: {
      type: String,
      required: true,
    },
    evidence_manifest_hash: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[a-f0-9]{64}$/,
      index: true,
    },
    r2_manifest_object_key: {
      type: String,
      required: true,
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

export const EvidenceManifest = mongoose.model("EvidenceManifest", evidenceManifestSchema);

