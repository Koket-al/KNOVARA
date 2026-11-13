import mongoose from "mongoose";

const subscriptionProjectionSchema = new mongoose.Schema(
  {
    subscription_id: {
      type: String,
      required: true,
      unique: true,
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
    subscriber_id: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    api_product_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    openapi_spec_hash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
    accepted_terms_hash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
    price_yocto: {
      type: String,
      required: true,
      validate: {
        validator: (v) => /^\d+$/.test(v),
        message: "price_yocto must be an exact unsigned decimal integer string",
      },
    },
    activated_at: {
      type: Date,
      required: true,
      index: true,
    },
    expires_at: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["Active", "Expired"],
      default: "Active",
      index: true,
    },
    block_height: {
      type: Number,
      required: true,
      index: true,
    },
    block_hash: {
      type: String,
      default: "",
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

export const SubscriptionProjection = mongoose.model("SubscriptionProjection", subscriptionProjectionSchema);

