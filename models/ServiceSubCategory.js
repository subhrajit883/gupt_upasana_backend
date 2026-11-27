import mongoose from "mongoose";
import { serviceCategories } from "./ServicePackage.js";

const serviceSubCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  serviceCategory: { type: String, required: true, enum: serviceCategories },
}, { timestamps: true });

serviceSubCategorySchema.index({ serviceCategory: 1, name: 1 }, { unique: true });

export default mongoose.model("ServiceSubCategory", serviceSubCategorySchema);
