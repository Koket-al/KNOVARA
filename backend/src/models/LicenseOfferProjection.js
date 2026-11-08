import mongoose from "mongoose";

const licenseOfferProjectionSchema = new mongoose.Schema(
  {
    offer_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    discovery_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    token_id: {
      type: String,
      required: true,
      trim: true,
    },
    rights_controller_id: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    scope: {
      type: String,
      required: true,
      enum: [
        "AcademicResearch",
        "CommercialUse",
        "AiModelTraining",
        "AiModelFineTuning",
        "AiKnowledgeRetrieval",
        "ResearchEvaluation",
        "CustomTerms",
      ],
      index: true,
    },
    price_yocto: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v) => /^\d+$/.test(v),
        message: "price_yocto must be an exact unsigned decimal integer string",
      },
    },
    terms_hash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
    duration_days: {
      type: Number,
      required: true,
      min: 1,
      max: 365,
    },
    is_active: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    created_at: {
      type: Date,
      required: true,
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

export const LicenseOfferProjection = mongoose.model("LicenseOfferProjection", licenseOfferProjectionSchema);

