import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  UserImg: {
    url: {
      type: String,
      trim: true,
    },
    publicId: {
      type: String,
      trim: true,
    },
  },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  address: { type: String, trim: true },
  // city: { type: String, trim: true },
  // state: { type: String, trim: true },
  type: { type: String, enum: ["individual", "organisation"], default: "individual" },
  companyName: { type: String, trim: true },
  authorisedContact: { type: String, trim: true },
  designation: { type: String, trim: true },
  sankalp: { type: String, trim: true },
  reasonForVisit: { type: String, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.pre("save", async function () {
  if (this.isModified("password")) this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model("User", userSchema);
