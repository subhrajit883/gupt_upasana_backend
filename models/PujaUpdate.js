import mongoose from "mongoose";

const pujaUpdateSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true },
  // imageUrl: String,
  pujaName: String,
  scheduledAt: Date,
  published: { type: Boolean, default: false },
  publishedAt: Date,
  // Store delivery results for push provider integration/auditing.
  pushStatus: { type: String, enum: ["not_sent", "queued", "sent", "failed"], default: "not_sent" },
  pushProvider: String,
  pushPayload: mongoose.Schema.Types.Mixed,
  pushError: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

export default mongoose.model("PujaUpdate", pujaUpdateSchema);
