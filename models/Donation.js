import mongoose from "mongoose";

const donorSnapshotSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  address: String,
  city: String,
  state: String,
  type: { type: String }
}, { _id: false });

const donationSchema = new mongoose.Schema({
  receiptNo: { type: String, unique: true, sparse: true },
  receiptGenerated: { type: Boolean, default: false },
  receiptUrl: { type: String },
  thankYouEmailSentAt: Date,
  thankYouEmailClaimedAt: Date,
  donor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  donorSnapshot: donorSnapshotSchema,
  donationPackage: { type: mongoose.Schema.Types.ObjectId, ref: "DonationPackage" },
  packageNameSnapshot: String,
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, default: "INR" },
  paymentStatus: { type: String, enum: ["created", "pending", "paid", "failed", "refunded"], default: "created", index: true },
  paymentMethod: { type: String, default: "razorpay" },
  razorpayOrderId: { type: String, unique: true, sparse: true, index: true },
  razorpayPaymentId: { type: String, unique: true, sparse: true, index: true },
  razorpaySignature: String,
  razorpayRefundId: String,
  paymentCapturedAt: Date,
  failureReason: String,
  purpose: String,
  donorMessage: String,
  anonymous: { type: Boolean, default: false },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export default mongoose.model("Donation", donationSchema);
