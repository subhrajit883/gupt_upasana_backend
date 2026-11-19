import { Router } from "express";
import { protect, adminOnly, protectAdmin } from "../middleware/authMiddleware.js";
import { getProfile, updateProfile, listUsers, getUserDonations } from "../controllers/userController.js";

const router = Router();
router.get("/profile", protect, getProfile);
router.patch("/profile", protect, updateProfile);
router.get("/", protectAdmin, adminOnly, listUsers);
router.get("/:userId/donations", protect, getUserDonations);
export default router;
