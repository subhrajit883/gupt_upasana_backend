import mongoose from "mongoose";

const amountOptionSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 1 },
  label: { type: String, trim: true },
}, { _id: true });

const donationPackageSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, trim: true },
  packageImg: {
    url: {
        type: String,
        trim: true,
    },
    publicId: {
        type: String,
        trim: true,
    },
  },
  category: { type: String, enum: ["static", "dynamic"], default: "static", required: true },
  allowCustomAmount: { type: Boolean, default: false },
  minAmt: { type: Number, min: 1 },
  maxAmt: { type: Number, min: 1 },
  benefits: [{ type: String, trim: true }],
  amounts: [amountOptionSchema],
  rules: [{ type: String, trim: true }],
  startDate: { type: Date },
  endDate: { type: Date },
  active: { type: Boolean, default: true }
}, { timestamps: true });

donationPackageSchema.pre("validate", function () {
  if (this.category === "static") {
    if (this.allowCustomAmount) {
      if (this.minAmt == null || this.maxAmt == null || this.minAmt > this.maxAmt) {
        this.invalidate("minAmt", "Custom amount packages require valid minAmt and maxAmt");
      }
    } else if (!this.amounts?.length) {
      this.invalidate("amounts", "Fixed amount packages require at least one amount option");
    }
  }
  if (this.category === "dynamic") {
    if (!this.startDate || !this.endDate || this.startDate >= this.endDate) {
      this.invalidate("startDate", "Dynamic package requires startDate before endDate");
    }
  }
});

export default mongoose.model("DonationPackage", donationPackageSchema);
