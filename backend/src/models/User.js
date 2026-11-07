import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    account_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
    last_login_at: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

export const User = mongoose.model("User", userSchema);

