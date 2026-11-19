import DonationPackage from "../models/DonationPackage.js";
import deleteFromCloudinary from "../utils/deleteFromCloudinary.js";

const packageFields = new Set([
  "name", "description", "category", "allowCustomAmount", "minAmt","maxAmt","benefits","amounts","rules","startDate","endDate","active",
]);
const amountFields = new Set(["amount", "label"]);
const jsonArrayFields = new Set(["benefits", "rules", "amounts"]);
const booleanFields = new Set(["allowCustomAmount", "active"]);
const numberFields = new Set(["minAmt", "maxAmt"]);

function pickPackageFields(data) {
  const packageData = {};

  // multipart/form-data (used when a package image is uploaded) delivers
  // every field as a string, so arrays/booleans/numbers need to be coerced.
  for (const [field, value] of Object.entries(data)) {
    if (!packageFields.has(field)) continue;

    if (jsonArrayFields.has(field) && typeof value === "string") {
      try {
        packageData[field] = JSON.parse(value);
      } catch {
        packageData[field] = value;
      }
      continue;
    }

    if (booleanFields.has(field)) {
      packageData[field] = value === true || value === "true" || value === "1" || value === 1;
      continue;
    }

    if (numberFields.has(field)) {
      if (value === "" || value == null) continue;
      packageData[field] = Number(value);
      continue;
    }

    packageData[field] = value;
  }

  if (Array.isArray(packageData.amounts)) {
    packageData.amounts = packageData.amounts.map((option) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) return option;
      return Object.fromEntries(
        Object.entries(option).filter(([field]) => amountFields.has(field))
      );
    });
  }

  return packageData;
}

export async function listPackages(req, res) {
  const now = new Date();
  const filter = req.user?.role === "admin" ? {} : {
    active: true,
    $or: [
      { category: "static" },
      { category: "dynamic", startDate: { $lte: now }, endDate: { $gte: now } }
    ]
  };
  const packages = await DonationPackage.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, packages });
}

export async function listAllPackages(req, res) {
  const now = new Date();
  const filter = req.user?.role === "admin" ? {} : {
    active: true,
    // $or: [
    //   { category: "static" },
    //   { category: "dynamic", startDate: { $lte: now }, endDate: { $gte: now } }
    // ]
  };
  const packages = await DonationPackage.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, count: packages.length, packages });
}


export async function getPackage(req, res) {
  const item = await DonationPackage.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Package not found"});
  if (req.user?.role !== "admin" && (!item.active || (item.category === "dynamic" && (new Date() < item.startDate || new Date() > item.endDate)))) {
    return res.status(404).json({ success: false, message: "Package not available", count: 0, packages: [] });
  }
  res.json({ success: true, package: item });
}
export async function createPackage(req, res) {
  const packageData = pickPackageFields(req.body);
  if (req.file) {
    packageData.packageImg = { url: req.file.path, publicId: req.file.filename };
  }
  if (packageData.category === "static") {
    delete packageData.startDate;
    delete packageData.endDate;
  }
  const item = await DonationPackage.create(packageData);
  res.status(201).json({ success: true, package: item });
}
export async function updatePackage(req, res) {
  const item = await DonationPackage.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Package not found" });
  const previousImagePublicId = item.packageImg?.publicId;
  item.set(pickPackageFields(req.body));
  if (req.file) {
    item.packageImg = { url: req.file.path, publicId: req.file.filename };
  }
  if (item.category === "static") {
    item.startDate = undefined;
    item.endDate = undefined;
  }
  await item.save();
  if (req.file && previousImagePublicId) {
    await deleteFromCloudinary(previousImagePublicId);
  }
  res.json({ success: true, package: item });
}
export async function deletePackage(req, res) {
  const item = await DonationPackage.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Package not found" });
  await item.deleteOne();
  if (item.packageImg?.publicId) {
    await deleteFromCloudinary(item.packageImg.publicId);
  }
  res.json({ success: true, message: "Package deleted" });
}
