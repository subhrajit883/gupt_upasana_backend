import mongoose from "mongoose";
import { regularPujaFrequencies } from "./ServicePackage.js";

const imageSchema = new mongoose.Schema({
  url: { type: String, trim: true },
  publicId: { type: String, trim: true },
}, { _id: false });

const employeeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  photo: {
    type: imageSchema,
    required: true,
    validate: { validator: photo => Boolean(photo?.url), message: "Employee photo is required" },
  },
}, { _id: false });

const familyMemberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  relation: { type: String, required: true, trim: true },
  photo: {
    type: imageSchema,
    required: true,
    validate: { validator: photo => Boolean(photo?.url), message: "Family member photo is required" },
  },
}, { _id: false });

const serviceBookingSchema = new mongoose.Schema({
  bookingNo: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  servicePackage: { type: mongoose.Schema.Types.ObjectId, ref: "ServicePackage", required: true },
  serviceNameSnapshot: { type: String, required: true },
  serviceCategorySnapshot: { type: String, required: true },
  serviceAmountId: { type: mongoose.Schema.Types.ObjectId, required: true },
  serviceAmountLabelSnapshot: { type: String, trim: true },
  regularPujaFrequency: { type: String, enum: regularPujaFrequencies },
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, default: "INR" },
  paymentStatus: {
    type: String,
    enum: ["created", "pending", "paid", "failed", "refunded"],
    default: "created",
    index: true,
  },
  paymentMethod: { type: String, default: "razorpay" },
  razorpayOrderId: { type: String, unique: true, sparse: true, index: true },
  razorpayPaymentId: { type: String, unique: true, sparse: true, index: true },
  razorpaySignature: String,
  razorpayRefundId: String,
  paymentCapturedAt: Date,
  failureReason: String,
  devoteeName: { type: String, required: true, trim: true },
  devoteePhoto: imageSchema,
  devoteeType: { type: String, required: true, enum: ["individual", "organization"] },
  devoteeCompanyName: { type: String, trim: true },
  devoteeDesignation: { type: String, trim: true },
  employees: { type: [employeeSchema], default: [] },
  familyMembers: { type: [familyMemberSchema], default: [] },
  traditionalIntention: { type: String, trim: true },
  gotra: { type: String, trim: true },
  sankalp: { type: String, trim: true },
  preferredDate: Date,
  preferredLocation: { type: String, trim: true },
  bookingStatus: {
    type: String,
    enum: ["pending", "confirmed", "cancelled", "completed"],
    default: "pending",
  },
  adminNote: { type: String, trim: true, default: "" },
}, { timestamps: true });

serviceBookingSchema.pre("validate", function () {
  if (this.devoteeType === "organization" && !this.devoteeCompanyName?.trim()) {
    this.invalidate("devoteeCompanyName", "Company name is required for organization bookings");
  }
  if (this.devoteeType === "organization" && this.familyMembers.length) {
    this.invalidate("familyMembers", "Organization bookings cannot include family members");
  }
  if (this.devoteeType === "individual" && this.employees.length) {
    this.invalidate("employees", "Individual bookings cannot include employees");
  }
});

export default mongoose.model("ServiceBooking", serviceBookingSchema);
