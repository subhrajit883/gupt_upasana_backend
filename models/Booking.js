import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  bookingNo: { type: String, unique: true, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  pujaName: { type: String, trim: true, default: "" },
  pujaDate: { type: Date, default: null },
  slot: { type: String, trim: true, default: "" },
  devotees: { type: [{ name: String, gotra: String, rashi: String }], default: [] },
  sankalp: { type: String, default: "" },
  sankalpPurpose: { type: String, default: "" },
  specialRequest: { type: String, default: "" },
  preferredPujaLocation: { type: String, default: "" },
  status: { type: String, enum: ["pending", "confirmed", "cancelled", "completed"], default: "pending" },
  donation: { type: mongoose.Schema.Types.ObjectId, ref: "Donation" },
  adminNote: { type: String, default: "" }
}, { timestamps: true });

export default mongoose.model("Booking", bookingSchema);
