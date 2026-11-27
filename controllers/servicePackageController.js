import mongoose from "mongoose";
import ServicePackage, { serviceCategories } from "../models/ServicePackage.js";
import ServiceSubCategory from "../models/ServiceSubCategory.js";
import deleteFromCloudinary from "../utils/deleteFromCloudinary.js";

const packageStatuses = ["draft", "published", "archived"];
const packageFields = new Set([
  "serviceName",
  "serviceCategory",
  "serviceDescription",
  "serviceImg",
  "status",
  "serviceAmounts",
  "serviceBenefits",
  "serviceRules",
  "active",
]);
const jsonArrayFields = new Set(["serviceAmounts", "serviceBenefits", "serviceRules"]);

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function pickServicePackageFields(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw badRequest("Request body must be an object");
  }
  const packageData = {};

  for (const [field, value] of Object.entries(data)) {
    if (!packageFields.has(field)) continue;

    if (jsonArrayFields.has(field) && typeof value === "string") {
      try {
        packageData[field] = JSON.parse(value);
      } catch {
        throw badRequest(`${field} must be valid JSON`);
      }
      continue;
    }

    if (field === "active") {
      if (![true, false, "true", "false", "1", "0", 1, 0].includes(value)) {
        throw badRequest("active must be a boolean");
      }
      packageData[field] = value === true || value === "true" || value === "1" || value === 1;
      continue;
    }

    if (field === "serviceCategory" && !serviceCategories.includes(value)) {
      throw badRequest(`serviceCategory must be one of: ${serviceCategories.join(", ")}`);
    }

    if (field === "status" && !packageStatuses.includes(value)) {
      throw badRequest(`status must be one of: ${packageStatuses.join(", ")}`);
    }

    if (field === "serviceImg" && typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        packageData[field] = parsed && typeof parsed === "object" ? parsed : { url: value };
      } catch {
        packageData[field] = { url: value };
      }
      continue;
    }

    packageData[field] = value;
  }

  if (packageData.serviceAmounts !== undefined) {
    if (!Array.isArray(packageData.serviceAmounts)) {
      throw badRequest("serviceAmounts must be an array");
    }
    packageData.serviceAmounts = packageData.serviceAmounts.map(option => {
      if (!option || typeof option !== "object" || Array.isArray(option)) {
        throw badRequest("Each service amount must be an object");
      }
      const { amount, label, frequency, serviceSubCategory } = option;
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount < 1) {
        throw badRequest("Each service amount must be a number greater than or equal to 1");
      }
      if (!mongoose.isValidObjectId(serviceSubCategory)) {
        throw badRequest("Each service amount must include a valid serviceSubCategory ID");
      }
      return {
        amount: numericAmount,
        ...(label !== undefined && { label }),
        ...(frequency !== undefined && { frequency }),
        serviceSubCategory,
      };
    });
  }

  for (const field of ["serviceBenefits", "serviceRules"]) {
    if (packageData[field] !== undefined && !Array.isArray(packageData[field])) {
      throw badRequest(`${field} must be an array`);
    }
  }

  return packageData;
}

async function validateServiceAmountSubCategories(serviceCategory, serviceAmounts) {
  if (!Array.isArray(serviceAmounts) || !serviceAmounts.length) {
    throw badRequest("Add at least one service amount");
  }
  const subCategoryIds = serviceAmounts.map(option => {
    if (!option?.serviceSubCategory) {
      throw badRequest("Each service amount must include a serviceSubCategory ID");
    }
    return option.serviceSubCategory.toString();
  });
  const uniqueIds = [...new Set(subCategoryIds)];
  const subCategories = await ServiceSubCategory.find({
    _id: { $in: uniqueIds },
    serviceCategory,
  }).select("_id");

  if (subCategories.length !== uniqueIds.length) {
    throw badRequest("Each service amount must use a subcategory from its service category");
  }
}

export async function listServicePackages(req, res) {
  const filter = req.user?.role === "admin"
    ? {}
    : { active: true, status: "published" };
  const packages = await ServicePackage.find(filter)
    .populate("serviceAmounts.serviceSubCategory", "name serviceCategory")
    .sort({ createdAt: -1 });
  res.json({ success: true, packages });
}

export async function listAllServicePackages(_req, res) {
  const packages = await ServicePackage.find()
    .populate("serviceAmounts.serviceSubCategory", "name serviceCategory")
    .sort({ createdAt: -1 });
  res.json({ success: true, count: packages.length, packages });
}

export async function getServicePackage(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid service package ID" });
  }
  const item = await ServicePackage.findById(req.params.id)
    .populate("serviceAmounts.serviceSubCategory", "name serviceCategory");
  if (!item) return res.status(404).json({ success: false, message: "Service package not found" });
  if (!req.admin && req.user?.role !== "admin" && (!item.active || item.status !== "published")) {
    return res.status(404).json({ success: false, message: "Service package not available" });
  }
  res.json({ success: true, servicePackage: item });
}

export async function createServicePackage(req, res) {
  const packageData = pickServicePackageFields(req.body);
  await validateServiceAmountSubCategories(packageData.serviceCategory, packageData.serviceAmounts);
  if (req.file) {
    packageData.serviceImg = { url: req.file.path, publicId: req.file.filename };
  }
  const item = await ServicePackage.create(packageData);
  res.status(201).json({ success: true, servicePackage: item });
}

export async function updateServicePackage(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid service package ID" });
  }
  const item = await ServicePackage.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Service package not found" });

  const packageData = pickServicePackageFields(req.body);
  if (packageData.serviceAmounts !== undefined || packageData.serviceCategory !== undefined) {
    await validateServiceAmountSubCategories(
      packageData.serviceCategory || item.serviceCategory,
      packageData.serviceAmounts || item.serviceAmounts,
    );
  }
  const previousImagePublicId = item.serviceImg?.publicId;
  item.set(packageData);
  if (req.file) {
    item.serviceImg = { url: req.file.path, publicId: req.file.filename };
  }
  await item.save();

  if (req.file && previousImagePublicId) {
    await deleteFromCloudinary(previousImagePublicId);
  }
  res.json({ success: true, servicePackage: item });
}

export async function deleteServicePackage(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid service package ID" });
  }
  const item = await ServicePackage.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Service package not found" });
  await item.deleteOne();
  if (item.serviceImg?.publicId) await deleteFromCloudinary(item.serviceImg.publicId);
  res.json({ success: true, message: "Service package deleted" });
}
