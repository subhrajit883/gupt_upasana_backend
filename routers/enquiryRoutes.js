import { Router } from "express";
import { protect, protectAdmin, adminOnly } from "../middleware/authMiddleware.js";
import {
  createEnquiry,
  myEnquiries,
  allEnquiries,
  getEnquiry,
  updateEnquiry,
  deleteEnquiry,
} from "../controllers/enquiryController.js";

const router = Router();

router.post("/", protect, createEnquiry);
router.get("/my", protect, myEnquiries);
router.get("/admin/all", protectAdmin, adminOnly, allEnquiries);
router.get("/:id", protectAdmin, adminOnly, getEnquiry);
router.patch("/:id", protectAdmin, adminOnly, updateEnquiry);
router.delete("/:id", protectAdmin, adminOnly, deleteEnquiry);

export default router;
