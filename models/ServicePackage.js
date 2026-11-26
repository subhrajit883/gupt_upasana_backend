import mongoose from "mongoose";

export const regularPujaFrequencies = ["daily", "weekly", "monthly", "half_yearly", "yearly"];

const serviceAmountSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 1 },
  label: { type: String, trim: true },
  frequency: { type: String, enum: regularPujaFrequencies },
});

const servicePackageSchema = new mongoose.Schema({
  serviceName: { type: String, required: true, unique: true, trim: true },
  serviceCategory: {
    type: String,
    required: true,
    enum: ["regular_puja", "havan", "seva", "special_puja"],
  },
  serviceDescription: { type: String, trim: true },
  serviceImg: {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
  },
  status: { type: String, enum: ["draft", "published", "archived"], default: "published" },
  serviceAmounts: { type: [serviceAmountSchema], validate: [items => items.length > 0, "Add at least one service amount"] },
  serviceBenefits: [{ type: String, trim: true }],
  serviceRules: [{ type: String, trim: true }],
  active: { type: Boolean, default: true },
}, { timestamps: true });

servicePackageSchema.pre("validate", function () {
  if (this.serviceCategory !== "regular_puja") return;

  const frequencies = this.serviceAmounts.map(option => option.frequency);
  if (frequencies.some(frequency => !frequency)) {
    this.invalidate("serviceAmounts", "Every regular puja amount must specify a frequency");
  }
  if (new Set(frequencies).size !== frequencies.length) {
    this.invalidate("serviceAmounts", "Regular puja frequencies must be unique");
  }
});

export default mongoose.model("ServicePackage", servicePackageSchema);
