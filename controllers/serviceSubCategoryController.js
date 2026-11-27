import mongoose from "mongoose";
import ServicePackage, { serviceCategories } from "../models/ServicePackage.js";
import ServiceSubCategory from "../models/ServiceSubCategory.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validServiceCategory(value) {
  return typeof value === "string" && serviceCategories.includes(value);
}

function categoryConflict(res) {
  return res.status(409).json({
    success: false,
    message: "Cannot change or delete a subcategory that is used by a service package",
  });
}

export async function createServiceSubCategory(req, res) {
  const { name, serviceCategory } = req.body || {};
  if (typeof name !== "string" || !name.trim()) {
    throw badRequest("name is required");
  }
  if (!validServiceCategory(serviceCategory)) {
    throw badRequest(`serviceCategory must be one of: ${serviceCategories.join(", ")}`);
  }

  const existing = await ServiceSubCategory.findOne({ name: name.trim(), serviceCategory });
  if (existing) {
    return res.status(409).json({ success: false, message: "Subcategory already exists for this service category" });
  }
  const serviceSubCategory = await ServiceSubCategory.create({ name: name.trim(), serviceCategory });
  res.status(201).json({ success: true, serviceSubCategory });
}

export async function updateServiceSubCategory(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid service subcategory ID" });
  }
  const serviceSubCategory = await ServiceSubCategory.findById(req.params.id);
  if (!serviceSubCategory) {
    return res.status(404).json({ success: false, message: "Service subcategory not found" });
  }

  const { name, serviceCategory } = req.body || {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) throw badRequest("name must be a non-empty string");
    serviceSubCategory.name = name.trim();
  }
  if (serviceCategory !== undefined) {
    if (!validServiceCategory(serviceCategory)) {
      throw badRequest(`serviceCategory must be one of: ${serviceCategories.join(", ")}`);
    }
    if (serviceCategory !== serviceSubCategory.serviceCategory) {
      const inUse = await ServicePackage.exists({ "serviceAmounts.serviceSubCategory": serviceSubCategory._id });
      if (inUse) return categoryConflict(res);
      serviceSubCategory.serviceCategory = serviceCategory;
    }
  }

  const duplicate = await ServiceSubCategory.exists({
    _id: { $ne: serviceSubCategory._id },
    name: serviceSubCategory.name,
    serviceCategory: serviceSubCategory.serviceCategory,
  });
  if (duplicate) {
    return res.status(409).json({ success: false, message: "Subcategory already exists for this service category" });
  }

  await serviceSubCategory.save();
  res.json({ success: true, serviceSubCategory });
}

export async function getAllServiceSubCategory(req, res) {
  const filter = {};
  if (req.query.serviceCategory !== undefined) {
    if (!validServiceCategory(req.query.serviceCategory)) {
      throw badRequest(`serviceCategory must be one of: ${serviceCategories.join(", ")}`);
    }
    filter.serviceCategory = req.query.serviceCategory;
  }
  const serviceSubCategories = await ServiceSubCategory.find(filter)
    .sort({ serviceCategory: 1, name: 1 });
  res.json({ success: true, count: serviceSubCategories.length, serviceSubCategories });
}

export async function deleteServiceSubCategory(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid service subcategory ID" });
  }
  const serviceSubCategory = await ServiceSubCategory.findById(req.params.id);
  if (!serviceSubCategory) {
    return res.status(404).json({ success: false, message: "Service subcategory not found" });
  }
  const inUse = await ServicePackage.exists({ "serviceAmounts.serviceSubCategory": serviceSubCategory._id });
  if (inUse) return categoryConflict(res);

  await serviceSubCategory.deleteOne();
  res.json({ success: true, message: "Service subcategory deleted" });
}
