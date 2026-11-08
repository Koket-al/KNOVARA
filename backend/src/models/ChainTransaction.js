import mongoose from "mongoose";

const chainTransactionSchema = new mongoose.Schema(
  {
    transaction_hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    signer_account_id: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    receiver_contract_id: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    function_method: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "CONFIRMED", "FAILED", "RECONCILIATION_REQUIRED"],
      default: "PENDING",
      index: true,
    },
    block_height: {
      type: Number,
      default: null,
      index: true,
    },
    block_hash: {
      type: String,
      default: null,
    },
    event_summaries: {
      type: Array,
      default: [],
    },
    execution_outcome: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    receipt_outcomes: {
      type: Array,
      default: [],
    },
    error_message: {
      type: String,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    synced_at: {
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

export const ChainTransaction = mongoose.model("ChainTransaction", chainTransactionSchema);

