import { Router } from "express";
import { adminOnly, protect, protectAdmin } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import {
  createServicePackage,
  deleteServicePackage,
  getServicePackage,
  listAllServicePackages,
  listServicePackages,
  updateServicePackage,
} from "../controllers/servicePackageController.js";

const router = Router();

router.get("/", (req, res, next) => {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : req.cookies?.token;
  if (!token) return listServicePackages(req, res).catch(next);
  protect(req, res, () => listServicePackages(req, res).catch(next));
});

router.get("/admin/all", protectAdmin, adminOnly, listAllServicePackages);
router.get("/admin/:id", protectAdmin, adminOnly, getServicePackage);
router.get("/:id", (req, res, next) => {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : req.cookies?.token;
  if (!token) return getServicePackage(req, res).catch(next);
  protect(req, res, () => getServicePackage(req, res).catch(next));
});

router.post("/", protectAdmin, adminOnly, upload.single("serviceImg"), createServicePackage);
router.patch("/:id", protectAdmin, adminOnly, upload.single("serviceImg"), updateServicePackage);
router.delete("/:id", protectAdmin, adminOnly, deleteServicePackage);

export default router;
