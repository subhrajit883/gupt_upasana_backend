import { Router } from "express";
import { adminOnly, protectAdmin } from "../middleware/authMiddleware.js";
import {
  createServiceSubCategory,
  deleteServiceSubCategory,
  getAllServiceSubCategory,
  updateServiceSubCategory,
} from "../controllers/serviceSubCategoryController.js";

const router = Router();

router.use(protectAdmin, adminOnly);
router.get("/", getAllServiceSubCategory);
router.post("/", createServiceSubCategory);
router.patch("/:id", updateServiceSubCategory);
router.delete("/:id", deleteServiceSubCategory);

export default router;
