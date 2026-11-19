import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true, unique: true },
  expirationTime: { type: Number, default: null },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  userAgent: { type: String },
  active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("PushSubscription", pushSubscriptionSchema);
