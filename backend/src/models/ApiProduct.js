import mongoose from "mongoose";

const apiProductSchema = new mongoose.Schema(
  {
    api_product_id: {
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
    version: {
      type: String,
      required: true,
      default: "1.0.0",
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    openapi_spec: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    canonical_spec_hash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
      index: true,
    },
    endpoints: [
      {
        path: { type: String, required: true },
        method: { type: String, required: true, uppercase: true },
        operation_id: { type: String, required: true },
        summary: { type: String, default: "" },
        description: { type: String, default: "" },
      },
    ],
    monthly_price_near: {
      type: Number,
      required: true,
      min: 0,
    },
    monthly_price_yocto: {
      type: String,
      required: true,
      validate: {
        validator: (v) => /^\d+$/.test(v),
        message: "monthly_price_yocto must be an exact unsigned decimal integer string",
      },
    },
    duration_days: {
      type: Number,
      required: true,
      default: 30,
    },
    offer_id: {
      type: String,
      index: true,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
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

export const ApiProduct = mongoose.model("ApiProduct", apiProductSchema);

