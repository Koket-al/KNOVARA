import mongoose from "mongoose";

const accountRoyaltyProjectionSchema = new mongoose.Schema(
  {
    account_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    claimable_balance_yocto: {
      type: String,
      required: true,
      default: "0",
      trim: true,
      validate: {
        validator: (v) => /^\d+$/.test(v),
        message: "claimable_balance_yocto must be an exact unsigned decimal integer string",
      },
    },
    pending_withdrawals_yocto: {
      type: String,
      default: "0",
      trim: true,
      validate: {
        validator: (v) => /^\d+$/.test(v),
        message: "pending_withdrawals_yocto must be an exact unsigned decimal integer string",
      },
    },
    block_height: {
      type: Number,
      required: true,
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

export const AccountRoyaltyProjection = mongoose.model(
  "AccountRoyaltyProjection",
  accountRoyaltyProjectionSchema
);

