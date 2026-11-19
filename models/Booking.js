import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  bookingNo: { type: String, unique: true, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  pujaName: { type: String, required: true, trim: true },
  pujaDate: { type: Date, required: true },
  slot: { type: String, trim: true },
  devotees: [{ name: String, gotra: String, rashi: String }],
  sankalp: { type: String },
  specialRequest: { type: String },
  status: { type: String, enum: ["pending", "confirmed", "cancelled", "completed"], default: "pending" },
  donation: { type: mongoose.Schema.Types.ObjectId, ref: "Donation" },
  adminNote: String
}, { timestamps: true });

export default mongoose.model("Booking", bookingSchema);
