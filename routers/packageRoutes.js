import { Router } from "express";
import { protect, protectAdmin, adminOnly } from "../middleware/authMiddleware.js";
import { listPackages, getPackage, createPackage, updatePackage, deletePackage, listAllPackages } from "../controllers/packageController.js";
import upload from "../middleware/uploadMiddleware.js";

const router = Router();

router.get("/", (req, res, next) => {
  // Optional auth: admin sees inactive packages; public visitors see active packages.
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : req.cookies?.token;
  if (!token) return listPackages(req, res).catch(next);
  protect(req, res, () => listPackages(req, res).catch(next));
});

router.get("/all", listAllPackages); // Public route to list all packages, including inactive ones


router.get("/:id", (req, res, next) => {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : req.cookies?.token;
  if (!token) return getPackage(req, res).catch(next);
  protect(req, res, () => getPackage(req, res).catch(next));
});

router.post("/", protectAdmin, adminOnly, upload.single("packageImg"), createPackage);
router.patch("/:id", protectAdmin, adminOnly, upload.single("packageImg"), updatePackage);
router.delete("/:id", protectAdmin, adminOnly, deletePackage);
export default router;
