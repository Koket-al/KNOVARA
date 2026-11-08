import mongoose from "mongoose";

const licenseRequestProjectionSchema = new mongoose.Schema(
  {
    request_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    license_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    offer_id: {
      type: String,
      required: true,
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
    buyer_id: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    scope: {
      type: String,
      required: true,
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
    duration_days: {
      type: Number,
      required: true,
    },
    license_terms_hash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
    accepted_terms_hash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
    status: {
      type: String,
      required: true,
      enum: ["Requested", "Approved", "Rejected", "Active", "Expired"],
      index: true,
    },
    payment_deadline: {
      type: Date,
      default: null,
    },
    rejection_reason: {
      type: String,
      default: null,
    },
    activated_at: {
      type: Date,
      default: null,
    },
    expires_at: {
      type: Date,
      default: null,
      index: true,
    },
    requested_at: {
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

export const LicenseRequestProjection = mongoose.model("LicenseRequestProjection", licenseRequestProjectionSchema);

