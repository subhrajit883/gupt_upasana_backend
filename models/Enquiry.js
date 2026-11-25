import mongoose from "mongoose";

const EnquirySchema = new mongoose.Schema({
  message: { type: String, trim: true },
  visitDate: { type: Date },
  type: { type: String, enum: ["individual", "organisation"], default: "individual" },
  companyName: { type: String, trim: true },
  authorisedContact: { type: String, trim: true },
  designation: { type: String, trim: true },
  sankalp: { type: String, trim: true },
  reasonForVisit: { type: String, trim: true },
  visitStatus: { type: String, enum: ["pending", "visited", "not_visited"], default: "pending" },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export default mongoose.model("Enquiry", EnquirySchema);
