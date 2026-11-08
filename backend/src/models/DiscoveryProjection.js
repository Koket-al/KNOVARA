import mongoose from "mongoose";

const discoveryProjectionSchema = new mongoose.Schema(
  {
    discovery_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    token_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    custodian_id: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    rights_controller_id: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    public_metadata: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      category: { type: String, default: "GENERAL", index: true },
      media: { type: String, default: null },
      attributes: [
        {
          trait_type: { type: String, required: true },
          value: { type: String, required: true },
        },
      ],
    },
    evidence_manifest_hash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
      index: true,
    },
    reference: {
      type: String,
      required: true,
    },
    reference_hash: {
      type: String,
      required: true,
    },
    beneficiary_splits: [
      {
        account_id: { type: String, required: true, lowercase: true, trim: true },
        basis_points: { type: Number, required: true, min: 1, max: 10000 },
      },
    ],
    lineage_parents: [
      {
        type: String,
        trim: true,
      },
    ],
    registered_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    block_height: {
      type: Number,
      required: true,
      index: true,
    },
    block_hash: {
      type: String,
      required: true,
    },
    contract_id: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    sync_status: {
      type: String,
      enum: ["SYNCED", "RECONCILIATION_REQUIRED"],
      default: "SYNCED",
      index: true,
    },
    last_synced_at: {
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

// Search indexes
discoveryProjectionSchema.index({
  "public_metadata.title": "text",
  "public_metadata.description": "text",
});

export const DiscoveryProjection = mongoose.model("DiscoveryProjection", discoveryProjectionSchema);

