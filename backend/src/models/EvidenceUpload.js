import mongoose from "mongoose";

const evidenceUploadSchema = new mongoose.Schema(
  {
    upload_id: {
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
    original_filename: {
      type: String,
      required: true,
      trim: true,
    },
    declared_content_type: {
      type: String,
      required: true,
      trim: true,
    },
    verified_content_type: {
      type: String,
      trim: true,
    },
    expected_size: {
      type: Number,
      required: true,
      min: 1,
    },
    actual_size: {
      type: Number,
      min: 0,
    },
    r2_object_key: {
      type: String,
      required: true,
      trim: true,
    },
    sha256_digest: {
      type: String,
      lowercase: true,
      trim: true,
      match: /^[a-f0-9]{64}$/,
    },
    classification: {
      type: String,
      enum: [
        "TECHNICAL_DOCUMENTATION",
        "EVALUATION_SAMPLE",
        "FULL_DATASET",
        "CAD_SCHEMATICS",
        "OTHER",
      ],
      default: "TECHNICAL_DOCUMENTATION",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "PENDING_UPLOAD",
        "UPLOADED",
        "VERIFIED",
        "ATTACHED",
        "DELETED",
        "EXPIRED",
      ],
      default: "PENDING_UPLOAD",
      index: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expires_at: {
      type: Date,
      required: true,
    },
    verified_at: {
      type: Date,
    },
    attached_discovery_id: {
      type: String,
      trim: true,
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Compound index for querying active verified uploads by owner
evidenceUploadSchema.index({ owner_account_id: 1, status: 1 });

export const EvidenceUpload = mongoose.model("EvidenceUpload", evidenceUploadSchema);

