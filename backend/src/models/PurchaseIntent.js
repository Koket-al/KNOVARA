import mongoose from "mongoose";

const purchaseIntentSchema = new mongoose.Schema(
  {
    intent_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
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
    offer_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    price_yocto: {
      type: String,
      required: true,
    },
    price_near: {
      type: Number,
      required: true,
    },
    terms_hash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
    duration_days: {
      type: Number,
      default: 30,
    },
    transaction_payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["prepared", "approved", "submitted", "confirmed", "rejected", "expired"],
      default: "prepared",
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
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

export const PurchaseIntent = mongoose.model("PurchaseIntent", purchaseIntentSchema);

